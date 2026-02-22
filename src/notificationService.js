import { extractJiraId } from './utils.js';
import { ApiConstants, getDemoProject, getDemoName } from './constants/apiConstants.js';

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
                    <span class="notification-item-title">PR - ${getDemoProject(n.project)}</span>
                </div>
                <span class="notification-item-time">${n.time}</span>
            </div>
            ${jiraLine}
            <div class="notification-item-action">
                <span class="notification-item-msg">${n.msg}</span>
            </div>
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
    const rawUserId = localStorage.getItem('appUserId');
    const userId = rawUserId ? JSON.parse(rawUserId) : '';
    const hubUrlWithUser = userId ? `${hubUrl}?userId=${userId}` : hubUrl;

    // Cloudflare free tunnels block WebSocket upgrades (close code 1006).
    // Force LongPolling when not on localhost so SignalR works behind the tunnel.
    const isLocal = hubUrl.includes('localhost') || hubUrl.includes('127.0.0.1');
    const transport = isLocal
        ? signalR.HttpTransportType.WebSockets
        : signalR.HttpTransportType.ServerSentEvents | signalR.HttpTransportType.LongPolling;

    connection = new signalR.HubConnectionBuilder()
        .withUrl(hubUrlWithUser, { transport })
        .withAutomaticReconnect([0, 2000, 10000, 30000])
        .build();

    connection.on("ReceiveNotification", (messageJson) => {
        try {
            const envelope = JSON.parse(messageJson);

            const data = envelope.Pr || envelope;
            const actionType = envelope.ActionType || '';

            const project = data.Project || '';
            const jiraId  = extractJiraId(data.TaskLink);
            const prLink  = data.PrLink || '';
            const dev     = getDemoName(data.Dev || '');
            let msg  = 'Atualizacao recebida';
            let type = 'info';

            switch (actionType) {
                case 'Created':
                    type = 'info';
                    msg  = `${dev}: Novo PR criado`;
                    break;
                case 'Updated':
                    type = 'info';
                    msg  = `${dev}: PR atualizado`;
                    break;
                case 'Approved':
                    type = 'success';
                    msg  = `Aprovado por: ${getDemoName(data.ApprovedBy) || dev}`;
                    break;
                case 'RequestedCorrection':
                    type = 'warning';
                    msg  = data.CorrectionReason
                        ? `Correção solicitada: ${data.CorrectionReason}`
                        : `Correção solicitada`;
                    break;
                case 'MarkedAsFixed':
                    type = 'success';
                    msg  = `${dev}: PR marcado como corrigido`;
                    break;
                case 'DeployedToStaging':
                    type = 'success';
                    msg  = `Deployado em STG${data.Version ? ` - v${data.Version}` : ''}`;
                    break;
                case 'MarkedAsDone':
                    type = 'success';
                    msg  = `PR concluido`;
                    break;
                case 'Archived':
                    type = 'warning';
                    msg  = `PR arquivado`;
                    break;
                default:
                    type = 'info';
                    msg  = `${dev}: PR atualizado`;
            }

            const summary = envelope.Pr.Summary;
            pushNotification({ msg, type, project, jiraId, summary, prLink });

            // Dispatch a CustomEvent so any module can react without tight coupling
            document.dispatchEvent(new CustomEvent('signalr:notification', { detail: { actionType } }));

        } catch (e) {
            console.error("Error parsing notification:", e);
            pushNotification({ msg: 'Atualizacao recebida', type: 'info', project: 'PR Manager', jiraId: '', summary: '', prLink: '' });
            document.dispatchEvent(new CustomEvent('signalr:notification', { detail: { actionType: 'unknown' } }));
        }
    });

    try {
        await connection.start();
        console.log("SignalR Connected to " + hubUrl);
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
    }
}
