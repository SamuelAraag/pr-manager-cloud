import * as API from "./apiService.js";

const CHECK_INTERVAL_MS = 30000;
const SKELETON_MIN_DURATION_MS = 300;

const ENVIRONMENT_LABELS = {
  1: "PROD",
  2: "DEV",
  3: "STG",
};

const ENVIRONMENT_CLASS = {
  1: "module-tag-prod",
  2: "module-tag-dev",
  3: "module-tag-stg",
};

const appModal = document.getElementById("appModal");
const openAppModalBtn = document.getElementById("openAppModalBtn");
const appModalTitle = document.getElementById("appModalTitle");
const appForm = document.getElementById("appForm");
const appIdInput = document.getElementById("appId");
const appNameInput = document.getElementById("appName");
const appUrlInput = document.getElementById("appUrl");
const appEnvironmentInput = document.getElementById("appEnvironment");
const appCards = document.getElementById("appCards");
const appCount = document.getElementById("appCount");

let appsState = [];
let statusIntervalId = null;

function getFallbackStatus(status = "offline", label = "Sem dados", checkedAt = "Sem checagem") {
  return {
    status,
    label,
    checkedAt,
  };
}

function renderSkeletonCards(count = 6) {
  if (!appCards) return;

  appCards.innerHTML = Array.from({ length: count }, () => `
    <article class="data-card module-card module-card-skeleton" aria-hidden="true">
      <div class="module-card-top">
        <div class="module-skeleton-stack">
          <span class="module-skeleton module-skeleton-title"></span>
          <span class="module-skeleton module-skeleton-text"></span>
        </div>
        <span class="module-skeleton module-skeleton-tag"></span>
      </div>

      <div class="module-card-row">
        <span class="module-skeleton module-skeleton-label"></span>
        <span class="module-skeleton module-skeleton-value"></span>
      </div>
      <div class="module-card-row">
        <span class="module-skeleton module-skeleton-label"></span>
        <span class="module-skeleton module-skeleton-value"></span>
      </div>

      <div class="module-card-actions">
        <span class="module-skeleton module-skeleton-button"></span>
        <span class="module-skeleton module-skeleton-button"></span>
        <span class="module-skeleton module-skeleton-button"></span>
      </div>
    </article>
  `).join("");

  if (appCount) {
    appCount.textContent = "...";
  }
}

function normalizeEnvironment(environment) {
  if (typeof environment === "number") return environment;

  const normalized = String(environment || "").toLowerCase();

  if (normalized === "prod") return 1;
  if (normalized === "dev") return 2;
  if (normalized === "stg") return 3;

  return 0;
}

function getEnvironmentLabel(environment) {
  return ENVIRONMENT_LABELS[normalizeEnvironment(environment)] || "N/A";
}

function getEnvironmentClass(environment) {
  return ENVIRONMENT_CLASS[normalizeEnvironment(environment)] || "module-tag-dev";
}

function getStatusMeta(status) {
  if (status === "ok") {
    return { cardClass: "module-card-ok", labelClass: "module-status-ok" };
  }

  if (status === "error") {
    return { cardClass: "module-card-error", labelClass: "module-status-error" };
  }

  return { cardClass: "module-card-offline", labelClass: "module-status-neutral" };
}

function getCheckedAtLabel() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function openModal(mode = "create", app = null) {
  if (!appModal) return;

  if (mode === "edit" && app) {
    appModalTitle.textContent = "Editar Aplicação";
    appIdInput.value = app.id;
    appNameInput.value = app.name;
    appUrlInput.value = app.url;
    appEnvironmentInput.value = String(normalizeEnvironment(app.environment));
  } else {
    appModalTitle.textContent = "Cadastro de Aplicação";
    appForm.reset();
    appIdInput.value = "";
    appEnvironmentInput.value = "1";
  }

  appModal.style.display = "flex";
}

function closeModal() {
  if (!appModal) return;
  appModal.style.display = "none";
  appForm.reset();
  appIdInput.value = "";
  appEnvironmentInput.value = "1";
  appModalTitle.textContent = "Cadastro de Aplicação";
}

function renderCards() {
  if (!appCards) return;

  if (!appsState.length) {
    appCards.innerHTML = `
      <article class="data-card module-empty-state">
        <h3>Nenhuma aplicação cadastrada</h3>
        <p>Use o botão "Nova Aplicação" para criar o primeiro item.</p>
      </article>
    `;
  } else {
    appCards.innerHTML = appsState
      .map((app) => {
        const currentStatus = app.currentStatus || getFallbackStatus();
        const statusMeta = getStatusMeta(currentStatus.status);
        const appEnvironment = normalizeEnvironment(app.environment);

        return `
          <article class="data-card module-card ${statusMeta.cardClass}" data-app-id="${app.id}">
            <div class="module-card-top">
              <div>
                <h3>${app.name}</h3>
                <p>${app.url}</p>
              </div>
              <span class="module-tag ${getEnvironmentClass(appEnvironment)}">${getEnvironmentLabel(appEnvironment)}</span>
            </div>

            <div class="module-card-row">
              <span>Status</span>
              <strong class="module-status-value ${statusMeta.labelClass}" data-role="status-label">${currentStatus.label}</strong>
            </div>
            <div class="module-card-row">
              <span>Última checagem</span>
              <strong data-role="status-checked-at">${currentStatus.checkedAt}</strong>
            </div>

            <div class="module-card-actions">
              <button class="btn btn-outline module-btn-danger" type="button" data-action="delete" data-id="${app.id}">Excluir</button>
              <button class="btn btn-outline" type="button" data-action="edit" data-id="${app.id}">Editar</button>
              <button class="btn btn-outline" type="button" data-action="open" data-url="${app.url}">Acessar</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  if (appCount) {
    appCount.textContent = `${appsState.length} ${appsState.length === 1 ? "item" : "itens"}`;
  }
}

function setCardStatus(appId, result) {
  const card = appCards?.querySelector(`[data-app-id="${appId}"]`);
  if (!card) return;

  const statusLabel = card.querySelector('[data-role="status-label"]');
  const checkedAt = card.querySelector('[data-role="status-checked-at"]');
  const statusMeta = getStatusMeta(result.status);

  card.className = `data-card module-card ${statusMeta.cardClass}`;

  if (statusLabel) {
    statusLabel.textContent = result.label || "Sem dados";
    statusLabel.className = `module-status-value ${statusMeta.labelClass}`;
  }

  if (checkedAt) {
    checkedAt.textContent = result.checkedAt || getCheckedAtLabel();
  }
}

async function checkStatus(app) {
  try {
    const result = await API.checkMonitorStatusApp(app.id);
    return {
      ...result,
      checkedAt: getCheckedAtLabel(),
    };
  } catch (_) {
    return {
      status: "error",
      label: "Falha de conexão local",
      checkedAt: getCheckedAtLabel(),
    };
  }
}

async function resolveStatuses(apps) {
  if (!apps.length) return apps;

  if (!navigator.onLine) {
    return apps.map((app) => ({
      ...app,
      currentStatus: getFallbackStatus("offline", "Sem internet", getCheckedAtLabel()),
    }));
  }

  const results = await Promise.all(
    apps.map(async (app) => ({
      id: app.id,
      currentStatus: await checkStatus(app),
    })),
  );

  return apps.map((app) => {
    const statusResult = results.find((item) => item.id === app.id);
    return {
      ...app,
      currentStatus: statusResult?.currentStatus || getFallbackStatus(),
    };
  });
}

async function checkAllStatuses() {
  if (!appsState.length) return;

  appsState = await resolveStatuses(appsState);
  appsState.forEach((app) => {
    setCardStatus(app.id, app.currentStatus || getFallbackStatus());
  });
}

async function loadApps() {
  renderSkeletonCards();

  try {
    const [apps] = await Promise.all([
      API.fetchMonitorStatusApps(),
      new Promise((resolve) => setTimeout(resolve, SKELETON_MIN_DURATION_MS)),
    ]);

    appsState = await resolveStatuses(apps);
    renderCards();
  } catch (error) {
    appCards.innerHTML = `
      <article class="data-card module-empty-state">
        <h3>Erro ao carregar aplicações</h3>
        <p>${error.message}</p>
      </article>
    `;
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const payload = {
    name: appNameInput.value.trim(),
    url: appUrlInput.value.trim(),
    environment: Number(appEnvironmentInput.value),
  };

  if (!payload.name || !payload.url) {
    alert("Preencha nome e link da aplicação.");
    return;
  }

  try {
    if (appIdInput.value) {
      await API.updateMonitorStatusApp(appIdInput.value, payload);
    } else {
      await API.createMonitorStatusApp(payload);
    }

    closeModal();
    await loadApps();
  } catch (error) {
    alert(error.message);
  }
}

function handleCardsClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  if (action === "open") {
    window.open(button.dataset.url, "_blank", "noopener,noreferrer");
    return;
  }

  const appId = Number(button.dataset.id);
  const app = appsState.find((item) => item.id === appId);
  if (!app) return;

  if (action === "edit") {
    openModal("edit", app);
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(`Deseja remover a aplicação "${app.name}"?`);
    if (!confirmed) return;

    API.deleteMonitorStatusApp(appId)
      .then(loadApps)
      .catch((error) => alert(error.message));
  }
}

if (openAppModalBtn) {
  openAppModalBtn.addEventListener("click", () => openModal());
}

document.querySelectorAll("#appModal .close-btn, #appModal .close-modal").forEach((button) => {
  button.addEventListener("click", closeModal);
});

if (appModal) {
  appModal.addEventListener("click", (event) => {
    if (event.target === appModal) {
      closeModal();
    }
  });
}

if (appForm) {
  appForm.addEventListener("submit", handleSubmit);
}

if (appCards) {
  appCards.addEventListener("click", handleCardsClick);
}

loadApps();

if (statusIntervalId) {
  clearInterval(statusIntervalId);
}

statusIntervalId = setInterval(checkAllStatuses, CHECK_INTERVAL_MS);
