import { extractJiraId } from './utils.js';
import { ApiConstants } from './constants/apiConstants.js';

const STORAGE_KEY = 'pr_notifications';
const UNREAD_KEY  = 'pr_notifications_unread';

let connection   = null;
let panelOpen    = false;
let bellUIReady  = false;

const ICONS = {
    success: 'check-circle',
    error:   'alert-circle',
    warning: 'alert-triangle',
    info:    'info',
};

// State helpers backed by sessionStorage so re-renders don't wipe it
function getNotifications() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveNotifications(list) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function getUnread() {
    return parseInt(sessionStorage.getItem(UNREAD_KEY) || '0', 10);
}

function setUnread(n) {
    sessionStorage.setItem(UNREAD_KEY, String(n));
}

function formatTime(date) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function updateBadge() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    const count = getUnread();
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderNotificationList() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    const notifications = getNotifications();

    if (notifications.length === 0) {
        list.innerHTML = '<p class="notification-empty">Nenhuma notificacao</p>';
        return;
    }

    list.innerHTML = notifications.map(n => {
        const tag = n.prLink
            ? `<a href="${n.prLink}" target="_blank" class="notification-item notification-item--link">`
            : `<div class="notification-item">`;
        const closeTag = n.prLink ? `</a>` : `</div>`;

        const jiraLine = (n.jiraId || n.summary)
            ? `<div class="notification-item-detail">
                ${n.jiraId ? `<span class="notification-jira-tag">${n.jiraId}</span>` : ''}
                ${n.summary ? `<span class="notification-item-summary">${n.summary}</span>` : ''}
               </div>`
            : '';

        return `
        ${tag}
            <div class="notification-item-row-top">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="notification-item-icon ${n.type}">
                        <i data-lucide="${ICONS[n.type] || 'info'}" style="width:13px; height:13px;"></i>
                    </div>
                    <span class="notification-item-title">PR - ${n.project}</span>
                </div>
                <span class="notification-item-time">${n.time}</span>
            </div>
            <div class="notification-item-action">
                <span class="notification-item-msg">${n.msg}</span>
            </div>
            ${jiraLine}
        ${closeTag}`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

function pushNotification({ msg, type, project, jiraId = '', summary = '', prLink = '' }) {
    const notifications = getNotifications();
    notifications.unshift({ msg, type, project, jiraId, summary, prLink, time: formatTime(new Date()) });
    if (notifications.length > 50) notifications.pop();
    saveNotifications(notifications);

    setUnread(getUnread() + 1);
    updateBadge();
    renderNotificationList();

    const btn = document.getElementById('notificationBellBtn');
    if (btn) {
        btn.classList.remove('has-notifications');
        void btn.offsetWidth;
        btn.classList.add('has-notifications');
    }
}

function setupBellUI() {
    const wrapper = document.getElementById('notificationBellWrapper');
    if (wrapper) wrapper.style.display = 'flex';

    updateBadge();
    renderNotificationList();

    if (bellUIReady) return;

    const bellBtn  = document.getElementById('notificationBellBtn');
    const panel    = document.getElementById('notificationPanel');
    const clearBtn = document.getElementById('clearNotificationsBtn');

    if (!bellBtn || !panel) return;

    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panelOpen = !panelOpen;
        panel.style.display = panelOpen ? 'block' : 'none';

        if (panelOpen) {
            setUnread(0);
            updateBadge();
        }
    });

    clearBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        saveNotifications([]);
        setUnread(0);
        updateBadge();
        renderNotificationList();
    });

    document.addEventListener('click', (e) => {
        if (panelOpen && !document.getElementById('notificationBellWrapper')?.contains(e.target)) {
            panelOpen = false;
            panel.style.display = 'none';
        }
    });

    bellUIReady = true;
}

export async function connectSignalR(onMessageReceived) {
    setupBellUI();

    if (connection) return;

    if (typeof signalR === 'undefined') {
        console.warn('SignalR library not loaded.');
        return;
    }

    const hubUrl = ApiConstants.BASE_URL.replace('/api', '/notificationHub');

    connection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl)
        .withAutomaticReconnect([0, 2000, 10000, 30000])
        .build();

    connection.on("ReceiveNotification", (messageJson) => {
        try {
            const data = JSON.parse(messageJson);

            const project = data.Project || '';
            const jiraId  = extractJiraId(data.TaskLink);
            const prLink  = data.PrLink || '';
            let msg  = data.Summary;
            let type = 'info';

            if (data.Status === 'Archived') {
                type = 'warning';
                msg  = `PR arquivado`;
            } else if (data.DeployedToStg) {
                type = 'success';
                msg  = `Deploy em Staging (v${data.Version})`;
            } else if (data.Approved && data.ReqVersion === 'pending') {
                type = 'info';
                msg  = `Versao solicitada por ${data.ApprovedBy}`;
            } else if (data.Approved) {
                type = 'success';
                msg  = `Aprovado por ${data.ApprovedBy}`;
            } else if (data.NeedsCorrection) {
                type = 'warning';
                msg  = `Correcao solicitada`;
            } else if (data.Status === 'Open' && !data.Approved && !data.NeedsCorrection && !data.DeployedToStg) {
                type = 'info';
                msg  = `Novo PR adicionado`;
            } else {
                msg = `Atualizado`;
            }

            const summary = data.Summary || '';
            pushNotification({ msg, type, project, jiraId, summary, prLink });

            if (onMessageReceived) {
                setTimeout(onMessageReceived, 500);
            }

        } catch (e) {
            console.error("Error parsing notification:", e);
            pushNotification("Atualizacao recebida", 'info', 'PR Manager');
            if (onMessageReceived) onMessageReceived();
        }
    });

    try {
        await connection.start();
        console.log("SignalR Connected to " + hubUrl);
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
    }
}
