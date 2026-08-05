import { getItem } from "./localStorageService.js";
import { ApiConstants } from "./constants/apiConstants.js";

function getBackendHeaders() {
  const token = getItem("token");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

async function fetchPRs() {
  const url = `${ApiConstants.BASE_URL}/PullRequests`;

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

// Perfis para a tela pré-login "Quem está editando?" (endpoint anônimo, sem email)
async function fetchProfiles() {
  const url = `${ApiConstants.BASE_URL}/Users/profiles`;
  try {
    const response = await fetch(url, { headers: getBackendHeaders(), cache: "no-store" });
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("Falha ao buscar perfis:", error);
    return [];
  }
}

async function fetchUsers(includeInactive = false) {
  const url = `${ApiConstants.BASE_URL}/Users${includeInactive ? "?includeInactive=true" : ""}`;

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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao criar PR: ${errorBody.message || response.statusText}`,
      );
    }

    const data = await response.json();
    return data;
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao atualizar PR: ${errorBody.message || response.statusText}`,
      );
    }

    const data = await response.json();
    return data;
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao solicitar correção: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao solicitar versão em lote: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao salvar versão em lote: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao aprovar: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao buscar histórico: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao marcar como corrigido: ${errorBody.message || response.statusText}`,
      );
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Falha ao marcar como corrigido:", error);
    throw error;
  }
}

async function getAutomationConfig() {
  const url = `${ApiConstants.BASE_URL}/AutomationConfig`;
  try {
    const response = await fetch(url, { headers: getBackendHeaders() });
    return response.ok ? await response.json() : null;
  } catch (error) {
    console.error("Falha ao buscar config:", error);
    return null;
  }
}

async function saveAutomationConfig(configData) {
  const url = `${ApiConstants.BASE_URL}/AutomationConfig`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify(configData),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(
        `Erro ao salvar config: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json();
      throw new Error(
        `Login falhou: ${errorBody.message || response.statusText}`,
      );
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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erro na API de apps: ${response.statusText}`);
  }
  return response.status === 204 ? null : await response.json();
}

const fetchApps = () => appsRequest("");
const createApp = (data) => appsRequest("", { method: "POST", body: JSON.stringify(data) });
const updateApp = (id, data) => appsRequest(`/${id}`, { method: "PUT", body: JSON.stringify(data) });
const deactivateApp = (id) => appsRequest(`/${id}`, { method: "DELETE" });
const fetchAppMembers = (id) => appsRequest(`/${id}/members`);
const addAppMember = (id, data) => appsRequest(`/${id}/members`, { method: "POST", body: JSON.stringify(data) });
const updateAppMember = (id, userId, data) => appsRequest(`/${id}/members/${userId}`, { method: "PUT", body: JSON.stringify(data) });
const removeAppMember = (id, userId) => appsRequest(`/${id}/members/${userId}`, { method: "DELETE" });

// ── Gestão de usuários (Épico 2 — Admin) ────────────────────────────────────

async function createUser(userData) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Users`, {
    method: "POST",
    headers: getBackendHeaders(),
    body: JSON.stringify(userData),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erro ao criar usuário: ${response.statusText}`);
  }
  return await response.json();
}

async function updateUser(id, userData) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Users/${id}`, {
    method: "PUT",
    headers: getBackendHeaders(),
    body: JSON.stringify(userData),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erro ao atualizar usuário: ${response.statusText}`);
  }
  return await response.json();
}

async function deactivateUser(id) {
  const response = await fetch(`${ApiConstants.BASE_URL}/Users/${id}`, {
    method: "DELETE",
    headers: getBackendHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Erro ao desativar usuário: ${response.statusText}`);
  }
  return await response.json();
}

async function archivePR(prId) {
  const url = `${ApiConstants.BASE_URL}/PullRequests/${prId}/archive`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(
        `Erro ao arquivar PR: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao criar aplicação: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json();
      throw new Error(
        `Erro ao atualizar aplicação: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `Erro ao remover aplicação: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `Erro ao verificar aplicação: ${errorBody.message || response.statusText}`,
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
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(`Erro ao buscar detalhes da aplicação: ${errorBody.message || response.statusText}`);
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
  fetchProfiles,
  fetchApps,
  createApp,
  updateApp,
  deactivateApp,
  fetchAppMembers,
  addAppMember,
  updateAppMember,
  removeAppMember,
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
};
