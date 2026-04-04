import * as API from "./apiService.js";
import { initializeTheme } from "./themeService.js";

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
const detailsModal = document.getElementById("detailsModal");
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

initializeTheme("themeToggleBtn");

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
  if (appModal) appModal.style.display = "none";
  if (detailsModal) detailsModal.style.display = "none";
  if (appForm) {
      appForm.reset();
      appIdInput.value = "";
      appEnvironmentInput.value = "1";
      appModalTitle.textContent = "Cadastro de Aplicação";
  }
}

function formatDuration(minutes) {
    if (!minutes) return "0min";
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = Math.floor(minutes % 60);
    let str = "";
    if (d > 0) str += `${d}d `;
    if (h > 0) str += `${h}h `;
    if (m > 0 || str === "") str += `${m}min`;
    return str.trim();
}

function padZero(num) {
    return num.toString().padStart(2, '0');
}

async function openDetails(appId) {
    if (!detailsModal) return;

    try {
        const details = await API.getMonitorStatusAppDetails(appId);
        
        document.getElementById("detailsModalTitle").textContent = `Disponibilidade: ${details.name}`;
        
        const isOk = details.currentStatus !== "Indisponível";
        const statusEl = document.getElementById("detailsStatus");
        statusEl.textContent = isOk ? "Estável (200 OK)" : "Fora do Ar (Falha)";
        statusEl.style.color = isOk ? "var(--success-color)" : "var(--danger-color)";
        
        const fixZone = (ds) => ds ? (ds.endsWith('Z') ? ds : ds + 'Z') : '';
        const createdDate = details.createdAt ? new Date(fixZone(details.createdAt)) : new Date(0);
        
        const now = new Date();
        let periodStart = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        if (createdDate > periodStart) {
            periodStart = createdDate;
        }

        const monitoredMs = now.getTime() - periodStart.getTime();
        const monitoredMinutes = Math.max(0, monitoredMs / 60000);
        const uptimeMinutes = monitoredMinutes - (details.totalDowntimeMinutes24h || 0);
        
        document.getElementById("detailsUptime").textContent = formatDuration(uptimeMinutes);
        
        const validHistories = (details.recentHistories || [])
            .map(h => {
                return {
                    ...h,
                    startedDate: new Date(fixZone(h.startedAt)),
                    endedDate: h.endedAt ? new Date(fixZone(h.endedAt)) : now
                };
            })
            .filter(h => h.endedDate > periodStart);
            
        document.getElementById("detailsFailures").textContent = validHistories.length;

        renderChart(validHistories, periodStart, now);
        
        detailsModal.style.display = "flex";
    } catch (e) {
        alert(e.message);
    }
}

function renderChart(histories, start, end) {
    const pathsGroup = document.getElementById("chartPaths");
    const pointsGroup = document.getElementById("chartPoints");
    const hoverGroup = document.getElementById("chartHoverZones");
    const xAxis = document.getElementById("chartXAxis");
    const tooltip = document.getElementById("chartTooltip");
    
    if(!pathsGroup) return;

    pathsGroup.innerHTML = "";
    pointsGroup.innerHTML = "";
    hoverGroup.innerHTML = "";
    xAxis.innerHTML = "";
    
    const w = 1000;
    const yStable = 40;
    const yDown = 180;
    const yBase = 240;
    const totalMs = end.getTime() - start.getTime();
    
    for (let i = 0; i <= 6; i++) {
        const t = new Date(start.getTime() + (totalMs * i / 6));
        const span = document.createElement("span");
        span.textContent = `${padZero(t.getHours())}:${padZero(t.getMinutes())}`;
        xAxis.appendChild(span);
    }
    
    let lastX = 0;
    histories.sort((a,b) => a.startedDate - b.startedDate);
    
    const ns = "http://www.w3.org/2000/svg";

    histories.forEach(h => {
        let x1 = ((Math.max(start.getTime(), h.startedDate.getTime()) - start.getTime()) / totalMs) * w;
        let x2 = ((h.endedDate.getTime() - start.getTime()) / totalMs) * w;
        
        if (x1 > lastX) {
            pathsGroup.innerHTML += `
               <polygon points="${lastX},${yBase} ${lastX},${yStable} ${x1},${yStable} ${x1},${yBase}" fill="url(#gradGreen)"></polygon>
               <polyline points="${lastX},${yStable} ${x1},${yStable}" stroke="var(--success-color)" stroke-width="3" fill="none"></polyline>
            `;
            pointsGroup.innerHTML += `
               <circle cx="${x1}" cy="${yStable}" r="3" fill="var(--success-color)"></circle>
               <text x="${x1}" y="${yStable - 10}" fill="var(--success-color)" font-size="12" text-anchor="middle" font-weight="bold">200 OK</text>
            `;
        }
        
        let visX2 = Math.max(x2, x1 + 3);
        if (visX2 > x1) {
            let polyPoints = `${x1},${yBase} ${x1},${yDown} ${visX2},${yDown} ${visX2},${yBase}`;
            let linePoints = `${x1},${yStable} ${x1},${yDown} ${visX2},${yDown}`;
            
            if (x2 < w - 1) { 
                linePoints += ` ${visX2},${yStable}`;
            }
            
            pathsGroup.innerHTML += `
               <polygon points="${polyPoints}" fill="url(#gradRed)"></polygon>
               <polyline points="${linePoints}" stroke="var(--danger-color)" stroke-width="4" fill="none" stroke-linejoin="round"></polyline>
            `;
            
            const rect = document.createElementNS(ns, "rect");
            rect.setAttribute("x", x1);
            rect.setAttribute("y", Math.min(yStable, yDown));
            rect.setAttribute("width", Math.max(2, x2 - x1));
            rect.setAttribute("height", Math.abs(yStable - yDown));
            rect.setAttribute("fill", "transparent");
            rect.style.cursor = "crosshair";
            
            const durationStr = formatDuration(h.durationInMinutes);
            const titleStr = "INDISPONIBILIDADE (" + padZero(h.startedDate.getHours()) + ":" + padZero(h.startedDate.getMinutes()) + " - " + padZero(h.endedDate.getHours()) + ":" + padZero(h.endedDate.getMinutes()) + ")";
            const contentStr = `Total: ${durationStr} (ERRO: ${h.failureLabel || 'Falha'})`;
            
            rect.addEventListener("mousemove", (e) => {
                document.getElementById("tooltipTitle").textContent = titleStr;
                document.getElementById("tooltipContent").textContent = contentStr;
                tooltip.style.display = "block";
                
                const rectBox = document.querySelector('.chart-wrapper').getBoundingClientRect();
                tooltip.style.left = (e.clientX - rectBox.left) + "px";
                tooltip.style.top = (e.clientY - rectBox.top) + "px";
            });
            
            rect.addEventListener("mouseout", () => {
                tooltip.style.display = "none";
            });
            
            hoverGroup.appendChild(rect);
        }
        
        lastX = x2;
    });
    
    if (lastX < w) {
        pathsGroup.innerHTML += `
           <polygon points="${lastX},${yBase} ${lastX},${yStable} ${w},${yStable} ${w},${yBase}" fill="url(#gradGreen)"></polygon>
           <polyline points="${lastX},${yStable} ${w},${yStable}" stroke="#2ea043" stroke-width="3" fill="none"></polyline>
        `;
        pointsGroup.innerHTML += `
           <circle cx="${w}" cy="${yStable}" r="3" fill="#2ea043"></circle>
           <text x="${w}" y="${yStable - 10}" fill="#2ea043" font-size="12" text-anchor="end" font-weight="bold">200 OK</text>
        `;
    }
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
  const card = event.target.closest(".module-card");
  
  if (!button && card) {
    const appId = Number(card.dataset.appId);
    if (!isNaN(appId)) openDetails(appId);
    return;
  }

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

document.querySelectorAll("#appModal .close-btn, #appModal .close-modal, #detailsModal .close-btn").forEach((button) => {
  button.addEventListener("click", closeModal);
});

if (appModal) {
  appModal.addEventListener("click", (event) => {
    if (event.target === appModal) {
      closeModal();
    }
  });
}

if (detailsModal) {
  detailsModal.addEventListener("click", (event) => {
    if (event.target === detailsModal) {
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
