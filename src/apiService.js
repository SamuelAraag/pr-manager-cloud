import { getItem } from "./localStorageService.js";
import { ApiConstants } from "./constants/apiConstants.js";

function getBackendHeaders() {
  const token = getItem("token");
  // Épico 9 Fase 3: tenant atual não vem mais de claim do JWT — vai por header em
  // toda requisição, validado no backend contra TenantMembership ativo a cada request.
  const tenantId = getItem("currentTenantId");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (tenantId) {
    headers["X-Tenant-Id"] = tenantId;
  }

  return headers;
}

export async function parseResponseBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

/**
 * Lê o corpo de uma resposta de erro sem estourar quando ele vem vazio.
 *
 * O ASP.NET responde 403 (Forbid) e 401 com ZERO bytes. Um `await response.json()` direto
 * lança SyntaxError e o erro real desaparece atrás de "Unexpected end of JSON input" — o
 * chamador perde o status e mostra uma mensagem que não ajuda ninguém a entender o que houve.
 */
async function lerCorpoDeErro(response) {
  try {
    return (await parseResponseBody(response)) || {};
  } catch {
    return {};
  }
}

/** Mensagem legível por status, para quando a API não manda corpo. */
function descricaoDoStatus(response) {
  switch (response.status) {
    case 401: return "Sua sessão expirou. Entre novamente.";
    case 403: return "Você não tem permissão para esta ação.";
    // Ids de PR/lote são globais, não por tenant: pedir um recurso de outro tenant cai aqui.
    case 404: return "Não encontrado neste tenant. Atualize a página e tente de novo.";
    case 409: return "O estado mudou enquanto você olhava a tela. Atualize e tente de novo.";
    default: return response.statusText || `Erro ${response.status}`;
  }
}

// Helper genérico para os endpoints novos do Épico 9 (Tenants, Convites, Memberships,
// Notificações) — mesmo padrão de appsRequest/environmentsRequest, sem repetir por recurso.
async function apiRequest(path, options = {}) {
  const response = await fetch(`${ApiConstants.BASE_URL}${path}`, {
    headers: getBackendHeaders(),
    ...options,
  });
  if (!response.ok) {
    const body = await parseResponseBody(response).catch(() => ({}));
    const error = new Error(body?.error || `Erro na API: ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return parseResponseBody(response);
}

// ── Identidade fresca (Épico 9 Fase 3) ──────────────────────────────────────
const fetchMe = () => apiRequest("/Users/me");

// ── Tenants (Épico 9 — PlatformAdmin) ───────────────────────────────────────
const fetchTenants = () => apiRequest("/Tenants");
const createTenant = (data) => apiRequest("/Tenants", { method: "POST", body: JSON.stringify(data) });
const updateTenant = (id, data) => apiRequest(`/Tenants/${id}`, { method: "PUT", body: JSON.stringify(data) });

// ── Convites (TenantInvitation) ─────────────────────────────────────────────
const fetchTenantInvitations = (tenantId) => apiRequest(`/tenants/${tenantId}/invitations`);
const createTenantInvitation = (tenantId, data) =>
  apiRequest(`/tenants/${tenantId}/invitations`, { method: "POST", body: JSON.stringify(data) });
const fetchPendingInvitations = () => apiRequest("/tenant-invitations/pending");
const approveInvitation = (id, data) =>
  apiRequest(`/tenant-invitations/${id}/approve`, { method: "POST", body: JSON.stringify(data || {}) });
const rejectInvitation = (id) => apiRequest(`/tenant-invitations/${id}/reject`, { method: "POST" });
const removeInvitation = (id) => apiRequest(`/tenant-invitations/${id}/remove`, { method: "POST" });

// ── Memberships (TenantMembership) ──────────────────────────────────────────
const fetchTenantMemberships = (tenantId) => apiRequest(`/tenants/${tenantId}/memberships`);
const updateMembershipRole = (id, data) => apiRequest(`/tenant-memberships/${id}/role`, { method: "PUT", body: JSON.stringify(data) });
const deactivateMembership = (id) => apiRequest(`/tenant-memberships/${id}/deactivate`, { method: "POST" });
const reactivateMembership = (id) => apiRequest(`/tenant-memberships/${id}/reactivate`, { method: "POST" });
// Atalho só de PlatformAdmin: vincula usuário já existente direto ao tenant (sem convite/aprovação).
const addTenantMember = (tenantId, data) => apiRequest(`/tenants/${tenantId}/memberships`, { method: "POST", body: JSON.stringify(data) });

// ── Notificações ─────────────────────────────────────────────────────────────
const fetchNotifications = (onlyUnread) => apiRequest(`/Notifications${onlyUnread ? "?onlyUnread=true" : ""}`);
const markNotificationRead = (id) => apiRequest(`/Notifications/${id}/read`, { method: "PUT" });

/**
 * Épico 2 (D6): a API filtra "em voo" por padrão — integrado e ainda não entregue.
 * Nada é apagado; `inFlight = false` traz também o que já chegou ao último ambiente.
 */
async function fetchPRs(inFlight = true) {
  const url = `${ApiConstants.BASE_URL}/PullRequests?inFlight=${inFlight ? "true" : "false"}`;

  try {
    const response = await fetch(url, {
      headers: getBackendHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { prs: [] };
      }
      throw new Error(`Erro ao buscar dados: ${response.statusText}`);
    }

    const data = await response.json();
    return { prs: data };
  } catch (error) {
    console.error("Falha na requisição GET:", error);
    return null;
  }
}

async function fetchSprints() {
  const url = `${ApiConstants.BASE_URL}/Sprints`;
  try {
    const response = await fetch(url, { headers: getBackendHeaders() });
    if (!response.ok)
      throw new Error(`Falha ao buscar sprints: ${response.statusText}`);

    const data = await response.json();
    console.log("Sprints:", data);

    return data;
  } catch (error) {
    console.error("Erro ao carregar sprints:", error);
    throw error;
  }
}

// Issue #34: fetchProfiles foi removido junto com GET /Users/profiles — era anônimo e
// listava usuários de todos os tenants. A tela pré-login que o usava não existe mais.

async function fetchUsers(includeInactive = false, global = false) {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "true");
  if (global) params.set("global", "true");
  const query = params.toString();
  const url = `${ApiConstants.BASE_URL}/Users${query ? `?${query}` : ""}`;

  try {
    const response = await fetch(url, {
      headers: getBackendHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Erro ao buscar usuários: ${response.statusText}`);
    }

    const users = await response.json();
    console.log("Usuários:", users);
    return users;
  } catch (error) {
    console.error("Falha ao buscar usuários:", error);
    return [];
  }
}

async function createPR(prData) {
  const url = `${ApiConstants.BASE_URL}/PullRequests`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify(prData),
    });

    if (!response.ok) {
      const errorBody = await parseResponseBody(response).catch(() => ({}));
      throw new Error(errorBody?.error || errorBody?.message || `Erro ao criar PR: ${response.statusText}`);
    }

    return await parseResponseBody(response);
  } catch (error) {
    console.error("Falha ao criar PR:", error);
    throw error;
  }
}

async function updatePR(prId, prData) {
  const url = `${ApiConstants.BASE_URL}/PullRequests/${prId}`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: getBackendHeaders(),
      body: JSON.stringify(prData),
    });

    if (!response.ok) {
      const errorBody = await parseResponseBody(response).catch(() => ({}));
      throw new Error(errorBody?.error || errorBody?.message || `Erro ao atualizar PR: ${response.statusText}`);
    }

    return await parseResponseBody(response);
  } catch (error) {
    console.error("Falha ao atualizar PR:", error);
    throw error;
  }
}
async function requestCorrection(prId) {
  const url = `${ApiConstants.BASE_URL}/PullRequests/${prId}/request-correction`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ reason: "Correção solicitada" }),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao solicitar correção: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Falha ao solicitar correção:", error);
    throw error;
  }
}

async function requestVersionBatch(prIds, requestedVersionDevId, requestedVersionDevName) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/request-version`;

  try {
    if (!requestedVersionDevId || !requestedVersionDevName) {
      throw new Error("As informações do desenvolvedor para gerar versão são obrigatórios.");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({
        prIds: prIds,
        requestedVersionDevId,
        requestedVersionDevName,
      }),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao solicitar versão em lote: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Falha ao solicitar versão em lote:", error);
    throw error;
  }
}

async function saveVersionBatch(batchData) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/save-version`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify(batchData),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao salvar versão em lote: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Falha ao salvar versão em lote:", error);
    throw error;
  }
}

async function fetchBatches() {
  const url = `${ApiConstants.BASE_URL}/VersionBatches`;
  try {
    const response = await fetch(url, { headers: getBackendHeaders() });
    return response.ok ? await response.json() : [];
  } catch (error) {
    console.error("Falha ao buscar lotes:", error);
    return [];
  }
}

async function fetchBatchById(batchId) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/by-id/${batchId}`;
  try {
    const response = await fetch(url, { headers: getBackendHeaders() });
    return response.ok ? await response.json() : null;
  } catch (error) {
    console.error("Falha ao buscar lote:", error);
    return null;
  }
}

async function releaseBatchToStaging(batchId) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/release-to-staging/${batchId}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
    });
    if (!response.ok)
      throw new Error(`Falha ao liberar lote: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error("Erro ao liberar lote:", error);
    throw error;
  }
}

async function removeVersionFromBatch(batchId) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/remove-version/${batchId}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
    });
    if (!response.ok)
      throw new Error(`Falha ao remover versão: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error("Erro ao remover versão:", error);
    throw error;
  }
}

async function removePrFromBatch(batchId, prId) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/${batchId}/remove-pr/${prId}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
    });
    if (!response.ok)
      throw new Error(`Falha ao remover PR do lote: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error("Erro ao remover PR do lote:", error);
    throw error;
  }
}

async function deleteBatch(batchId) {
  const batch = await fetchBatchById(batchId);
  if (!batch) throw new Error("Batch not found");

  const url = `${ApiConstants.BASE_URL}/VersionBatches/${batch.id}`;
  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: getBackendHeaders(),
    });
    if (!response.ok)
      throw new Error(`Falha ao deletar lote: ${response.statusText}`);
    return true;
  } catch (error) {
    console.error("Erro ao deletar lote:", error);
    throw error;
  }
}

async function updateBatch(id, batchData) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/${id}`;
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: getBackendHeaders(),
      body: JSON.stringify(batchData),
    });
    return await response.json();
  } catch (error) {
    console.error("Falha ao atualizar lote:", error);
    throw error;
  }
}

async function createSprint(sprintData) {
  const url = `${ApiConstants.BASE_URL}/Sprints`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify(sprintData),
    });
    if (!response.ok) throw new Error("Falha ao criar sprint");
    return await response.json();
  } catch (error) {
    console.error("Erro ao criar sprint:", error);
    throw error;
  }
}

async function completeSprint(sprintId) {
  const url = `${ApiConstants.BASE_URL}/Sprints/${sprintId}/complete`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Falha ao concluir sprint");
    }
    return await response.json();
  } catch (error) {
    console.error("Erro ao concluir sprint:", error);
    throw error;
  }
}

async function approvePR(prId, approverId) {
  const url = `${ApiConstants.BASE_URL}/PullRequests/${prId}/approve`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ approverId: approverId }),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        errorBody.message || errorBody.error || descricaoDoStatus(response),
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Falha ao aprovar PR:", error);
    throw error;
  }
}

async function fetchPrEvents(prId) {
  const url = `${ApiConstants.BASE_URL}/PullRequests/${prId}/events`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: getBackendHeaders(),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao buscar histórico: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Falha ao buscar histórico do PR:", error);
    throw error;
  }
}

async function markPrFixed(prId) {
  const url = `${ApiConstants.BASE_URL}/PullRequests/${prId}/mark-fixed`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao marcar como corrigido: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Falha ao marcar como corrigido:", error);
    throw error;
  }
}

// Épico 7.3: appId opcional — com ele a config é a do app (resolução app ?? global no backend)
async function getAutomationConfig(appId = null) {
  const url = `${ApiConstants.BASE_URL}/AutomationConfig${appId ? `?appId=${appId}` : ""}`;
  try {
    const response = await fetch(url, { headers: getBackendHeaders() });
    return response.ok ? await response.json() : null;
  } catch (error) {
    console.error("Falha ao buscar config:", error);
    return null;
  }
}

async function saveAutomationConfig(configData, appId = null) {
  const url = `${ApiConstants.BASE_URL}/AutomationConfig${appId ? `?appId=${appId}` : ""}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify(configData),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao salvar config: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Falha ao salvar config:", error);
    throw error;
  }
}

// God mode (Épico 2.6): a senha secreta compartilhada saiu; vira login normal e o
// chamador confere se o usuário tem papel Admin antes de ativar o modo.
async function adminLogin(identifier, password) {
  return login(identifier, password);
}

async function login(username, password) {
  const url = `${ApiConstants.BASE_URL}/Auth/login`;
  // login por email (Épico 2); Name continua aceito pelo backend na transição
  const credentials = String(username).includes("@")
    ? { Email: username, Password: password }
    : { Name: username, Password: password };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      // Resposta de erro nem sempre é JSON (proxy/gateway devolve HTML), então o parse
      // não pode derrubar o tratamento. O status vai junto no erro para a tela distinguir
      // credencial recusada de servidor indisponível.
      const errorBody = await lerCorpoDeErro(response);
      const error = new Error(
        `Login falhou: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (error) {
    console.error("Falha no Login:", error);
    throw error;
  }
}

// ── Apps (Épico 3) ──────────────────────────────────────────────────────────

async function appsRequest(path, options = {}) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Apps${path}`, {
    headers: getBackendHeaders(),
    ...options,
  });
  if (!response.ok) {
    const body = await parseResponseBody(response).catch(() => ({}));
    throw new Error(body?.error || `Erro na API de apps: ${response.statusText}`);
  }
  return parseResponseBody(response);
}

const fetchApps = () => appsRequest("");
const createApp = (data) => appsRequest("", { method: "POST", body: JSON.stringify(data) });
const updateApp = (id, data) => appsRequest(`/${id}`, { method: "PUT", body: JSON.stringify(data) });
const deactivateApp = (id) => appsRequest(`/${id}`, { method: "DELETE" });
const fetchAppMembers = (id) => appsRequest(`/${id}/members`);
const addAppMember = (id, data) => appsRequest(`/${id}/members`, { method: "POST", body: JSON.stringify(data) });
const updateAppMember = (id, userId, data) => appsRequest(`/${id}/members/${userId}`, { method: "PUT", body: JSON.stringify(data) });
const removeAppMember = (id, userId) => appsRequest(`/${id}/members/${userId}`, { method: "DELETE" });

// ── Organizações (Épico 8b) — só visível/chamável por admin da organização-plataforma ──

async function organizationsRequest(path, options = {}) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Organizations${path}`, {
    headers: getBackendHeaders(),
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erro na API de organizações: ${response.statusText}`);
  }
  return response.status === 204 ? null : await response.json();
}

const fetchOrganizations = () => organizationsRequest("");
const createOrganization = (data) => organizationsRequest("", { method: "POST", body: JSON.stringify(data) });
const updateOrganization = (id, data) => organizationsRequest(`/${id}`, { method: "PUT", body: JSON.stringify(data) });
const deactivateOrganization = (id) => organizationsRequest(`/${id}`, { method: "PUT", body: JSON.stringify({ isActive: false }) });

// ── Ambientes e esteira (Épico 6 + Épico 2) ─────────────────────────────────
// O erro carrega status e body: o chamador diferencia 403 (sem papel) e 409
// (previous_env_batch_changed / not_active / environment_has_deployments).
// O 501 de dev saiu: a esteira é configurável e o ambiente de integração recebe
// PR avulso por presença, não deploy de versão.

async function environmentsRequest(appId, path, options = {}) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Apps/${appId}/Environments${path}`, {
    headers: getBackendHeaders(),
    cache: "no-store",
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Erro na API de ambientes: ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.status === 204 ? null : await response.json();
}

const fetchEnvironments = (appId) => environmentsRequest(appId, "");
const fetchEnvironmentHistory = (appId, kind) => environmentsRequest(appId, `/${kind}/history`);
const deployToEnvironment = (appId, kind, batchId) =>
  environmentsRequest(appId, `/${kind}/deploy`, { method: "POST", body: JSON.stringify({ batchId }) });
const rollbackDeployment = (appId, kind, deploymentId) =>
  environmentsRequest(appId, `/${kind}/deployments/${deploymentId}/rollback`, { method: "POST" });

// Esteira configurável (Épico 2): substitui a configuração inteira, não faz merge parcial.
const updatePipeline = (appId, steps) =>
  environmentsRequest(appId, "/pipeline", { method: "PUT", body: JSON.stringify({ steps }) });
const removeEnvironment = (appId, kind) =>
  environmentsRequest(appId, `/${kind}`, { method: "DELETE" });

// ── Presença do PR e vínculos (Épico 2) ─────────────────────────────────────

async function appPrRequest(appId, path, options = {}) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Apps/${appId}/PullRequests${path}`, {
    headers: getBackendHeaders(),
    cache: "no-store",
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Erro na API de PRs: ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return response.status === 204 ? null : await response.json();
}

/** Registra que o PR entrou na branch de integração. Só Gestor/Admin. */
const registerPrPresence = (appId, prId, kind) =>
  appPrRequest(appId, `/${prId}/presence/${kind}`, { method: "POST" });

/** Revert: o código saiu da branch. Motivo obrigatório. */
const revertPrPresence = (appId, prId, kind, reason) =>
  appPrRequest(appId, `/${prId}/presence/${kind}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });

const fetchPrLinks = (appId, prId) => appPrRequest(appId, `/${prId}/links`);
const addPrLink = (appId, prId, link) =>
  appPrRequest(appId, `/${prId}/links`, { method: "POST", body: JSON.stringify(link) });
const removePrLink = (appId, prId, linkId) =>
  appPrRequest(appId, `/${prId}/links/${linkId}`, { method: "DELETE" });

/** Marca a versão como hotfix: passa a poder pular a guarda de ordem da esteira. */
async function markBatchAsHotfix(batchId, reason) {
  const response = await fetch(`${ApiConstants.BASE_URL}/VersionBatches/${batchId}/mark-hotfix`, {
    method: "POST",
    headers: getBackendHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Erro ao marcar hotfix: ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return await response.json();
}

// ── Gestão de usuários (Épico 2 — Admin) ────────────────────────────────────

async function createUser(userData) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Users`, {
    method: "POST",
    headers: getBackendHeaders(),
    body: JSON.stringify(userData),
  });
  if (!response.ok) {
    const body = await parseResponseBody(response).catch(() => ({}));
    throw new Error(body?.error || `Erro ao criar usuário: ${response.statusText}`);
  }
  return parseResponseBody(response);
}

async function updateUser(id, userData) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Users/${id}`, {
    method: "PUT",
    headers: getBackendHeaders(),
    body: JSON.stringify(userData),
  });
  if (!response.ok) {
    const body = await parseResponseBody(response).catch(() => ({}));
    throw new Error(body?.error || `Erro ao atualizar usuário: ${response.statusText}`);
  }
  return parseResponseBody(response);
}

async function deactivateUser(id) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Users/${id}`, {
    method: "DELETE",
    headers: getBackendHeaders(),
  });
  if (!response.ok) {
    const body = await parseResponseBody(response).catch(() => ({}));
    throw new Error(body?.error || `Erro ao desativar usuário: ${response.statusText}`);
  }
  return parseResponseBody(response);
}

async function archivePR(prId) {
  const url = `${ApiConstants.BASE_URL}/PullRequests/${prId}/archive`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao arquivar PR: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Falha ao arquivar PR:", error);
    throw error;
  }
}

async function cancelVersionRequest(batchId) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/cancel-request/${batchId}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
    });
    if (!response.ok)
      throw new Error(`Falha ao cancelar solicitação: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error("Erro ao cancelar solicitação:", error);
    throw error;
  }
}

async function cancelVersionRequestByPrIds(prIds) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/cancel-request-by-ids`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify(prIds),
    });
    if (!response.ok)
      throw new Error(`Falha ao cancelar solicitação por IDs: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error("Erro ao cancelar solicitação por IDs:", error);
    throw error;
  }
}

async function fetchMonitorStatusApps() {
  const url = `${ApiConstants.BASE_URL}/MonitorStatusApps`;

  try {
    const response = await fetch(url, {
      headers: getBackendHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Erro ao buscar aplicações: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Falha ao buscar aplicações monitoradas:", error);
    throw error;
  }
}

async function createMonitorStatusApp(appData) {
  const url = `${ApiConstants.BASE_URL}/MonitorStatusApps`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify(appData),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao criar aplicação: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Falha ao criar aplicação monitorada:", error);
    throw error;
  }
}

async function updateMonitorStatusApp(appId, appData) {
  const url = `${ApiConstants.BASE_URL}/MonitorStatusApps/${appId}`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: getBackendHeaders(),
      body: JSON.stringify(appData),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao atualizar aplicação: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Falha ao atualizar aplicação monitorada:", error);
    throw error;
  }
}

async function deleteMonitorStatusApp(appId) {
  const url = `${ApiConstants.BASE_URL}/MonitorStatusApps/${appId}`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: getBackendHeaders(),
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao remover aplicação: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    return true;
  } catch (error) {
    console.error("Falha ao remover aplicação monitorada:", error);
    throw error;
  }
}

async function checkMonitorStatusApp(appId) {
  const url = `${ApiConstants.BASE_URL}/MonitorStatusApps/${appId}/check`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: getBackendHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(
        `Erro ao verificar aplicação: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Falha ao verificar aplicação monitorada:", error);
    throw error;
  }
}

async function getMonitorStatusAppDetails(appId) {
  const url = `${ApiConstants.BASE_URL}/MonitorStatusApps/${appId}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: getBackendHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorBody = await lerCorpoDeErro(response);
      throw new Error(`Erro ao buscar detalhes da aplicação: ${errorBody.message || errorBody.error || descricaoDoStatus(response)}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Falha ao buscar detalhes da aplicação monitorada:", error);
    throw error;
  }
}

export {
  fetchPRs,
  fetchSprints,
  fetchUsers,
  createPR,
  updatePR,
  requestCorrection,
  markPrFixed,
  approvePR,
  fetchPrEvents,
  requestVersionBatch,
  saveVersionBatch,
  fetchBatches,
  fetchBatchById,
  releaseBatchToStaging,
  removeVersionFromBatch,
  removePrFromBatch,
  deleteBatch,
  cancelVersionRequest,
  cancelVersionRequestByPrIds,
  completeSprint,
  createSprint,
  updateBatch,
  getAutomationConfig,
  saveAutomationConfig,
  adminLogin,
  login,
  fetchApps,
  createApp,
  updateApp,
  deactivateApp,
  fetchAppMembers,
  addAppMember,
  updateAppMember,
  removeAppMember,
  fetchEnvironments,
  fetchEnvironmentHistory,
  deployToEnvironment,
  rollbackDeployment,
  updatePipeline,
  removeEnvironment,
  registerPrPresence,
  revertPrPresence,
  fetchPrLinks,
  addPrLink,
  removePrLink,
  markBatchAsHotfix,
  createUser,
  updateUser,
  deactivateUser,
  archivePR,
  fetchMonitorStatusApps,
  createMonitorStatusApp,
  updateMonitorStatusApp,
  deleteMonitorStatusApp,
  checkMonitorStatusApp,
  getMonitorStatusAppDetails,
  fetchMe,
  fetchTenants,
  createTenant,
  updateTenant,
  fetchTenantInvitations,
  createTenantInvitation,
  fetchPendingInvitations,
  approveInvitation,
  rejectInvitation,
  removeInvitation,
  fetchTenantMemberships,
  updateMembershipRole,
  deactivateMembership,
  reactivateMembership,
  addTenantMember,
  fetchNotifications,
  markNotificationRead,
};
