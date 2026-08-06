// Ambientes do app (Épico 6) — rota ambientes.html?appId=<uuid>.
// Coluna por ambiente (dev/stg/prod) com versão atual, histórico expandível,
// promoção stg → prod e rollback. Dev fica fora do fluxo de deploy nesta fase (6.1.1).
import * as API from './apiService.js';
import * as AuthService from './authService.js';
import * as LocalStorage from './localStorageService.js';
import * as DOM from './domService.js';
import { initializeTheme } from './themeService.js';

initializeTheme('themeToggleBtn');
DOM.enableEscapeToCloseModals();

LocalStorage.init?.();
if (!LocalStorage.getItem('token')) {
    window.location.href = 'index.html';
}

const appId = new URLSearchParams(window.location.search).get('appId');
if (!appId) {
    window.location.href = 'apps.html';
}

const envGrid = document.getElementById('envGrid');
const promoteModal = document.getElementById('promoteModal');

let appState = null;       // { id, name, myRole, ... } vindo de GET /Apps
let envsState = [];        // [{ id, kind, url, current, monitorName, monitorStatus }]
let promoteBatch = null;   // o que estava ativo em stg quando o modal abriu (6.4)

const KIND_LABELS = { Dev: 'Desenvolvimento', Stg: 'Staging', Prod: 'Produção' };

async function carregar() {
    const apps = await API.fetchApps();
    appState = apps.find(a => a.id === appId);
    if (!appState) {
        alert('App não encontrado ou sem acesso.');
        window.location.href = 'apps.html';
        return;
    }
    document.getElementById('envAppName').textContent =
        appState.myRole ? `${appState.name} - seu papel: ${appState.myRole}` : appState.name;

    // "Admin"/"QA" nos data-roles = Gestor/QA DESTE app (mesmo mecanismo do dashboard, Épico 4.3)
    AuthService.setCurrentAppRole(appState.myRole);

    envsState = await API.fetchEnvironments(appId);
    render();
}

function render() {
    envGrid.innerHTML = '';
    envsState.forEach(env => envGrid.appendChild(cardDoAmbiente(env)));
    if (window.lucide) lucide.createIcons();
    AuthService.applyRoleBasedVisibility();
}

function cardDoAmbiente(env) {
    const card = document.createElement('div');
    card.className = 'module-card';
    card.dataset.kind = env.kind;

    const monitor = env.monitorStatus
        ? `<span class="tag" title="Monitor: ${env.monitorName}"
               style="color: ${env.monitorStatus === 'OK' ? 'var(--success, #2e7d32)' : 'var(--danger, #c62828)'};">
               ${env.monitorStatus === 'OK' ? '● online' : '● ' + env.monitorStatus}
           </span>`
        : '';

    let corpo;
    if (env.kind === 'Dev') {
        // 6.1.1: dev existe no modelo, mas sem fluxo de deploy nesta fase
        corpo = `<p style="color: var(--text-secondary); font-size: 0.9rem;">Sem deploys registrados.</p>`;
    } else if (env.current) {
        const c = env.current;
        corpo = `
            <p style="margin: 0.3rem 0; font-size: 1.3rem;"><strong>${c.version || '(sem versão)'}</strong></p>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.2rem 0;">
                ${c.prCount} PR${c.prCount === 1 ? '' : 's'}
                ${c.deployedBy ? ` &middot; por ${c.deployedBy}` : ''}<br>
                ${new Date(c.deployedAt).toLocaleString('pt-BR')}
                ${c.pipelineLink ? ` &middot; <a href="${c.pipelineLink}" target="_blank" rel="noopener">pipeline</a>` : ''}
            </p>`;
    } else {
        corpo = `<p style="color: var(--text-secondary); font-size: 0.9rem;">Nenhuma versão implantada.</p>`;
    }

    // visibilidade por papel do app: stg = Gestor/QA ("Admin,QA"), prod = Gestor ("Admin") — 6.3
    const acoes = [];
    if (env.kind === 'Prod') {
        acoes.push(`<button class="btn btn-primary env-promote-btn" data-roles="Admin" type="button">
            Promover o que está em STG</button>`);
    }
    if (env.kind !== 'Dev' && env.current) {
        const roles = env.kind === 'Prod' ? 'Admin' : 'Admin,QA';
        acoes.push(`<button class="btn btn-outline env-rollback-btn" data-roles="${roles}"
            data-kind="${env.kind}" data-deployment="${env.current.id}" type="button">Reverter</button>`);
    }
    if (env.kind !== 'Dev') {
        acoes.push(`<button class="btn btn-outline env-history-btn" data-kind="${env.kind}" type="button">
            Histórico</button>`);
    }

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start; gap: 0.5rem;">
            <h3 style="margin: 0;">${KIND_LABELS[env.kind] || env.kind}</h3>
            ${monitor}
        </div>
        ${corpo}
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.8rem;">${acoes.join('')}</div>
        <div class="env-history" data-kind="${env.kind}" style="display: none; margin-top: 0.8rem;"></div>`;

    card.querySelector('.env-promote-btn')?.addEventListener('click', abrirPromocao);
    card.querySelector('.env-rollback-btn')?.addEventListener('click', (e) =>
        reverter(e.currentTarget.dataset.kind, e.currentTarget.dataset.deployment));
    card.querySelector('.env-history-btn')?.addEventListener('click', () => alternarHistorico(card, env.kind));
    return card;
}

// ── Histórico (6.3) ──────────────────────────────────────────────────────────

async function alternarHistorico(card, kind) {
    const box = card.querySelector('.env-history');
    if (box.style.display !== 'none') {
        box.style.display = 'none';
        return;
    }
    if (!box.dataset.loaded) {
        const historico = await API.fetchEnvironmentHistory(appId, kind.toLowerCase());
        box.innerHTML = historico.length === 0
            ? '<p style="color: var(--text-secondary); font-size: 0.85rem;">Nenhum deploy registrado.</p>'
            : `<table class="pr-table" style="width: 100%; font-size: 0.85rem;">
                <thead><tr><th>Versão</th><th>Quando</th><th>Por</th><th>Status</th></tr></thead>
                <tbody>${historico.map(h => `
                    <tr>
                        <td>${h.version || '(sem versão)'}</td>
                        <td>${new Date(h.deployedAt).toLocaleString('pt-BR')}</td>
                        <td>${h.deployedBy || '-'}</td>
                        <td>${traduzStatus(h.status)}</td>
                    </tr>`).join('')}
                </tbody></table>`;
        box.dataset.loaded = '1';
    }
    box.style.display = 'block';
}

function traduzStatus(status) {
    return { Active: 'Ativo', Superseded: 'Substituído', RolledBack: 'Revertido' }[status] || status;
}

// ── Promoção stg → prod (6.4) ────────────────────────────────────────────────

function abrirPromocao() {
    const stg = envsState.find(e => e.kind === 'Stg');
    if (!stg?.current) {
        alert('Não há nenhuma versão ativa em staging para promover.');
        return;
    }
    promoteBatch = stg.current; // lido na hora de abrir o modal; o servidor revalida (6.1.2)
    document.getElementById('promoteSummary').innerHTML = `
        <p>Vai subir para <strong>produção</strong>:</p>
        <p style="font-size: 1.2rem; margin: 0.4rem 0;"><strong>${promoteBatch.version || '(sem versão)'}</strong></p>
        <p style="color: var(--text-secondary); font-size: 0.85rem;">
            ${promoteBatch.prCount} PR${promoteBatch.prCount === 1 ? '' : 's'} incluído${promoteBatch.prCount === 1 ? '' : 's'}
            &middot; em staging desde ${new Date(promoteBatch.deployedAt).toLocaleString('pt-BR')}
        </p>`;
    promoteModal.style.display = 'flex';
}

document.getElementById('promoteConfirmBtn')?.addEventListener('click', async () => {
    if (!promoteBatch) return;
    try {
        await API.deployToEnvironment(appId, 'prod', promoteBatch.batchId);
        promoteModal.style.display = 'none';
        envsState = await API.fetchEnvironments(appId);
        render();
    } catch (error) {
        promoteModal.style.display = 'none';
        await tratarErro(error);
    }
});

// ── Rollback (6.1.3) ─────────────────────────────────────────────────────────

async function reverter(kind, deploymentId) {
    if (!confirm('Reverter para a versão anterior?')) return;
    try {
        await API.rollbackDeployment(appId, kind.toLowerCase(), deploymentId);
        envsState = await API.fetchEnvironments(appId);
        render();
    } catch (error) {
        await tratarErro(error);
    }
}

// ── Erros (6.3): 403 = papel insuficiente; 409 = estado mudou → recarrega ────

async function tratarErro(error) {
    if (error.status === 403) {
        alert('Você não tem papel suficiente neste app para essa ação.');
    } else if (error.status === 409) {
        alert('O estado do ambiente mudou, atualizando...');
    } else {
        alert(`Erro: ${error.message}`);
    }
    envsState = await API.fetchEnvironments(appId);
    render();
}

document.querySelectorAll('.close-btn, .close-modal').forEach(btn =>
    btn.addEventListener('click', () => {
        promoteModal.style.display = 'none';
    }));

carregar();
