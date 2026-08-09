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
    renderPipelineEditor();
    if (window.lucide) lucide.createIcons();
    AuthService.applyRoleBasedVisibility();
}

// ── Esteira configurável (Épico 2, D4) ──────────────────────────────────────
// Edita a esteira inteira e salva de uma vez: ordem, modo e branch de cada degrau.
// Salvar substitui a configuração completa — o que sair da lista é removido, e o
// backend recusa remover ambiente que já tem deployment ou presença.

const TODOS_OS_KINDS = ['Dev', 'Stg', 'Prod'];
let pipelineDraft = null;

function renderPipelineEditor() {
    const editor = document.getElementById('pipelineEditor');
    if (!editor) return;

    if (pipelineDraft === null) {
        pipelineDraft = envsState.map(env => ({
            kind: env.kind,
            order: env.order,
            mode: env.mode,
            branch: env.branch || '',
        })).sort((a, b) => a.order - b.order);
    }

    editor.innerHTML = '';

    pipelineDraft.forEach((passo, indice) => {
        const linha = document.createElement('div');
        linha.className = 'pipeline-row';

        const ordem = document.createElement('span');
        ordem.className = 'pipeline-row__order';
        ordem.textContent = `${indice + 1}º`;

        const kind = document.createElement('select');
        kind.className = 'form-select form-select-sm';
        kind.setAttribute('aria-label', 'Ambiente');
        TODOS_OS_KINDS.forEach((valor) => {
            const opcao = document.createElement('option');
            opcao.value = valor;
            opcao.textContent = KIND_LABELS[valor] || valor;
            opcao.selected = valor === passo.kind;
            kind.appendChild(opcao);
        });
        kind.addEventListener('change', () => { passo.kind = kind.value; limparErroEsteira(); });

        const mode = document.createElement('select');
        mode.className = 'form-select form-select-sm';
        mode.setAttribute('aria-label', 'Modo');
        [['Individual', 'Integração (PR a PR)'], ['Versioned', 'Versão']].forEach(([valor, rotulo]) => {
            const opcao = document.createElement('option');
            opcao.value = valor;
            opcao.textContent = rotulo;
            opcao.selected = valor === passo.mode;
            mode.appendChild(opcao);
        });
        mode.addEventListener('change', () => { passo.mode = mode.value; limparErroEsteira(); });

        const branch = document.createElement('input');
        branch.type = 'text';
        branch.className = 'form-control form-control-sm';
        branch.placeholder = 'branch (opcional)';
        branch.maxLength = 200;
        branch.value = passo.branch;
        branch.setAttribute('aria-label', 'Branch');
        branch.addEventListener('input', () => { passo.branch = branch.value; limparErroEsteira(); });

        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'btn btn-outline btn-sm';
        remover.textContent = 'Remover';
        remover.addEventListener('click', () => {
            pipelineDraft.splice(indice, 1);
            pipelineDraft.forEach((p, i) => { p.order = i + 1; });
            limparErroEsteira();
            renderPipelineEditor();
        });

        linha.append(ordem, kind, mode, branch, remover);
        editor.appendChild(linha);
    });

    const kindsUsados = pipelineDraft.map(p => p.kind);
    const disponivel = TODOS_OS_KINDS.find(k => !kindsUsados.includes(k));
    if (disponivel) {
        const adicionar = document.createElement('button');
        adicionar.type = 'button';
        adicionar.className = 'btn btn-outline btn-sm';
        adicionar.style.alignSelf = 'flex-start';
        adicionar.textContent = 'Adicionar ambiente';
        adicionar.addEventListener('click', () => {
            pipelineDraft.push({
                kind: disponivel,
                order: pipelineDraft.length + 1,
                mode: 'Versioned',
                branch: '',
            });
            limparErroEsteira();
            renderPipelineEditor();
        });
        editor.appendChild(adicionar);
    }
}

function marcarErroEsteira(mensagem) {
    const erro = document.getElementById('pipelineError');
    if (!erro) return;
    erro.textContent = mensagem;
    erro.classList.toggle('visible', Boolean(mensagem)); // .field-error nasce display:none
}

function limparErroEsteira() {
    marcarErroEsteira('');
}

// As mesmas regras existem no backend — esta validação é feedback imediato, não barreira.
function validarEsteira() {
    if (pipelineDraft.length === 0) return 'A esteira precisa de pelo menos um ambiente.';

    const kinds = pipelineDraft.map(p => p.kind);
    if (new Set(kinds).size !== kinds.length) return 'Cada ambiente só pode aparecer uma vez.';

    const individuais = pipelineDraft.filter(p => p.mode === 'Individual');
    if (individuais.length > 1) return 'Só pode haver um ambiente de integração.';
    if (individuais.length === 1 && pipelineDraft.indexOf(individuais[0]) !== 0) {
        return 'O ambiente de integração precisa ser o primeiro da esteira.';
    }
    return null;
}

const pipelineSaveBtn = document.getElementById('pipelineSaveBtn');
if (pipelineSaveBtn) {
    pipelineSaveBtn.addEventListener('click', async () => {
        const erro = validarEsteira();
        if (erro) {
            marcarErroEsteira(erro);
            return;
        }
        limparErroEsteira();

        const steps = pipelineDraft.map((passo, indice) => ({
            kind: passo.kind,
            order: indice + 1,
            mode: passo.mode,
            branch: passo.branch.trim() || null,
        }));

        pipelineSaveBtn.disabled = true;
        try {
            envsState = await API.updatePipeline(appId, steps);
            pipelineDraft = null;
            render();
            DOM.showToast('Esteira atualizada.', 'success');
        } catch (error) {
            const mapa = {
                environment_has_deployments: 'Não dá para remover um ambiente que já recebeu deploy ou presença.',
                environment_mode_locked: 'Não dá para trocar o modo de um ambiente que já tem histórico.',
                order_must_be_sequential: 'A ordem precisa começar em 1 e não ter buracos.',
                individual_must_be_first: 'O ambiente de integração precisa ser o primeiro.',
                multiple_individual_environments: 'Só pode haver um ambiente de integração.',
                pipeline_cannot_be_empty: 'A esteira precisa de pelo menos um ambiente.',
            };
            marcarErroEsteira(mapa[error?.body?.error] || error.message || 'Não foi possível salvar a esteira.');
        } finally {
            pipelineSaveBtn.disabled = false;
        }
    });
}

const pipelineResetBtn = document.getElementById('pipelineResetBtn');
if (pipelineResetBtn) {
    pipelineResetBtn.addEventListener('click', () => {
        pipelineDraft = null;
        limparErroEsteira();
        renderPipelineEditor();
    });
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
