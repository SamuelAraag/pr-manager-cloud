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

async function fetchUsers() {
  const url = `${ApiConstants.BASE_URL}/Users`;

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

async function requestVersionBatch(prIds) {
  const url = `${ApiConstants.BASE_URL}/VersionBatches/request-version`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ prIds: prIds }),
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

async function adminLogin(password) {
  const url = `${ApiConstants.BASE_URL}/Auth/admin-login`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(
        `Acesso negado: ${errorBody.message || response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Falha no Admin Login:", error);
    throw error;
  }
}

async function login(username, password) {
  const url = `${ApiConstants.BASE_URL}/Auth/login`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: getBackendHeaders(),
      body: JSON.stringify({ "Name": username, "Password": password }),
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

export {
  fetchPRs,
  fetchSprints,
  fetchUsers,
  createPR,
  updatePR,
  requestCorrection,
  markPrFixed,
  approvePR,
  requestVersionBatch,
  saveVersionBatch,
  fetchBatches,
  fetchBatchById,
  releaseBatchToStaging,
  removeVersionFromBatch,
  removePrFromBatch,
  deleteBatch,
  completeSprint,
  createSprint,
  updateBatch,
  getAutomationConfig,
  saveAutomationConfig,
  adminLogin,
  login,
  archivePR,
};
