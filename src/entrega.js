// Visão de detalhe da entrega (Épico 2, 3.2) — rota entrega.html?appId=<uuid>&prId=<id>.
// Reúne num só lugar o que antes ficava espalhado: onde o PR está em cada degrau da esteira,
// o ciclo dele, os vínculos (agora adicionáveis e removíveis) e a timeline de eventos.
//
// Rota própria, nunca modal — telas de consulta com conteúdo próprio precisam de URL
// compartilhável e botão voltar (preferências §12).
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

const params = new URLSearchParams(window.location.search);
const appId = params.get('appId');
const prId = params.get('prId');

if (!appId || !prId) {
    window.location.href = 'index.html';
}

const loadingEl = document.getElementById('entregaLoading');
const errorEl = document.getElementById('entregaError');
const errorTextEl = document.getElementById('entregaErrorText');
const contentEl = document.getElementById('entregaContent');
const revertModal = document.getElementById('revertModal');

const KIND_LABELS = { Dev: 'Desenvolvimento', Stg: 'Staging', Prod: 'Produção' };
const LINK_KIND_LABELS = {
    Task: 'Task',
    Pr: 'Pull Request',
    Communication: 'Comunicação',
    Pipeline: 'Pipeline',
    Other: 'Outro',
};

let prState = null;
let revertKind = null;

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function showError(message) {
    loadingEl.style.display = 'none';
    contentEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorTextEl.textContent = message;
}

async function carregar() {
    try {
        const apps = await API.fetchApps();
        const app = apps.find(a => a.id === appId);
        if (!app) {
            showError('App não encontrado ou sem acesso.');
            return;
        }
        // "Admin"/"QA" nos data-roles = Gestor/QA DESTE app (mesmo mecanismo do dashboard).
        AuthService.setCurrentAppRole(app.myRole);

        const prs = await API.fetchPRs(false); // false: a entrega pode já ter sido concluída
        prState = (prs?.prs || []).find(p => String(p.id) === String(prId));
        if (!prState) {
            showError('PR não encontrado nesta esteira.');
            return;
        }

        document.getElementById('entregaSummary').textContent =
            `${app.name} - ${prState.summary || `PR #${prState.id}`}`;

        renderMatrix();
        renderCiclo();
        renderPresenceActions(app.myRole);
        await renderLinks();
        await renderTimeline();

        loadingEl.style.display = 'none';
        contentEl.style.display = 'grid';
        AuthService.applyRoleBasedVisibility?.();
        window.lucide?.createIcons();
    } catch (error) {
        console.error('Erro ao carregar a entrega:', error);
        showError('Não foi possível carregar a entrega. Tente novamente.');
    }
}

function renderMatrix() {
    const container = document.getElementById('entregaMatrix');
    const steps = prState.environments || [];

    if (steps.length === 0) {
        container.innerHTML = '<p class="pipeline-empty">Este app ainda não tem esteira configurada.</p>';
        return;
    }

    container.innerHTML = '';
    const dl = document.createElement('dl');
    dl.className = 'entrega-meta';

    steps.forEach((step) => {
        const dt = document.createElement('dt');
        dt.textContent = KIND_LABELS[step.kind] || step.kind;

        const dd = document.createElement('dd');
        if (!step.present) {
            dd.textContent = 'Não presente';
            dd.style.color = 'var(--text-secondary)';
        } else if (step.mode === 'Individual') {
            // Sem versão de propósito: na branch de integração o código entra por merge.
            dd.textContent = `Integrado desde ${formatDate(step.since)}`;
        } else {
            dd.textContent = `Versão ${step.version || '-'} desde ${formatDate(step.since)}`;
        }

        dl.appendChild(dt);
        dl.appendChild(dd);
    });

    container.appendChild(dl);
}

function renderCiclo() {
    const dl = document.getElementById('entregaCiclo');
    const entradas = [
        ['Status', prState.status || '-'],
        ['Aprovado', prState.approved ? `Sim, por ${prState.approvedBy || '-'}` : 'Não'],
        ['Em ajustes', prState.needsCorrection ? (prState.correctionReason || 'Sim') : 'Não'],
        ['Versão', prState.version || 'Sem versão'],
        ['Sprint', prState.sprint || 'Sem sprint'],
        ['Em voo', prState.inFlight ? 'Sim' : 'Não, já entregue'],
        ['Criado em', formatDate(prState.createdAt)],
    ];

    dl.innerHTML = '';
    entradas.forEach(([rotulo, valor]) => {
        const dt = document.createElement('dt');
        dt.textContent = rotulo;
        const dd = document.createElement('dd');
        dd.textContent = valor;
        dl.appendChild(dt);
        dl.appendChild(dd);
    });
}

/** Registrar/reverter presença é ação de Gestor (D7) e só existe em ambiente de integração. */
function renderPresenceActions(myRole) {
    const container = document.getElementById('entregaPresenceActions');
    container.innerHTML = '';

    const integracao = (prState.environments || []).find(e => e.mode === 'Individual');
    if (!integracao) return;

    const podeGerir = myRole === 'Gestor' || AuthService.isAdminGlobal?.();
    if (!podeGerir) return;

    if (integracao.present) {
        const botao = document.createElement('button');
        botao.className = 'btn btn-outline';
        botao.textContent = `Reverter de ${KIND_LABELS[integracao.kind] || integracao.kind}`;
        botao.addEventListener('click', () => abrirRevert(integracao.kind));
        container.appendChild(botao);
        return;
    }

    const botao = document.createElement('button');
    botao.className = 'btn btn-primary';
    botao.textContent = `Registrar em ${KIND_LABELS[integracao.kind] || integracao.kind}`;
    botao.addEventListener('click', async () => {
        botao.disabled = true;
        try {
            await API.registerPrPresence(appId, prId, integracao.kind);
            DOM.showToast('Presença registrada na branch de integração.', 'success');
            window.location.reload();
        } catch (error) {
            botao.disabled = false;
            DOM.showToast(mensagemDeErro(error), 'error');
        }
    });
    container.appendChild(botao);
}

function mensagemDeErro(error) {
    const mapa = {
        already_present: 'Este PR já consta na branch de integração.',
        environment_is_versioned: 'Este ambiente recebe versão, não PR avulso.',
        environment_not_in_pipeline: 'Este ambiente não faz parte da esteira do app.',
        reason_required: 'Informe o motivo do revert.',
    };
    if (error?.status === 403) return 'Você não tem permissão para esta ação.';
    return mapa[error?.body?.error] || error?.message || 'Não foi possível concluir a ação.';
}

function abrirRevert(kind) {
    revertKind = kind;
    limparErro('revertReason');
    document.getElementById('revertReason').value = '';
    revertModal.style.display = 'flex';
}

function fecharRevert() {
    revertModal.style.display = 'none';
    revertKind = null;
}

// Validação inline: borda vermelha no campo + texto junto dele. Toast fica reservado
// para o resultado da chamada à API (preferências §12).
function marcarErro(campoId, mensagem) {
    const campo = document.getElementById(campoId);
    const erro = document.getElementById(`${campoId}Error`);
    campo?.classList.add('is-invalid');
    if (erro) {
        erro.textContent = mensagem;
        erro.classList.add('visible'); // .field-error nasce display:none
    }
}

function limparErro(campoId) {
    const campo = document.getElementById(campoId);
    const erro = document.getElementById(`${campoId}Error`);
    campo?.classList.remove('is-invalid');
    if (erro) {
        erro.textContent = '';
        erro.classList.remove('visible');
    }
}

document.getElementById('revertCancelBtn').addEventListener('click', fecharRevert);
document.getElementById('revertConfirmBtn').addEventListener('click', async () => {
    const reason = document.getElementById('revertReason').value.trim();
    if (!reason) {
        marcarErro('revertReason', 'Explique por que o código saiu da branch.');
        return;
    }
    limparErro('revertReason');

    try {
        await API.revertPrPresence(appId, prId, revertKind, reason);
        DOM.showToast('Revert registrado.', 'success');
        window.location.reload();
    } catch (error) {
        DOM.showToast(mensagemDeErro(error), 'error');
    }
});

document.getElementById('revertReason').addEventListener('input', () => limparErro('revertReason'));

async function renderLinks() {
    const lista = document.getElementById('entregaLinks');
    lista.innerHTML = '';

    let links = [];
    try {
        links = await API.fetchPrLinks(appId, prId) || [];
    } catch (error) {
        console.error('Erro ao carregar vínculos:', error);
    }

    if (links.length === 0) {
        const vazio = document.createElement('li');
        vazio.className = 'pipeline-empty';
        vazio.textContent = 'Nenhum vínculo. Não é obrigatório ter um.';
        lista.appendChild(vazio);
        return;
    }

    links.forEach((link) => {
        const item = document.createElement('li');
        item.className = 'link-item';

        const kind = document.createElement('span');
        kind.className = 'link-item__kind';
        kind.textContent = LINK_KIND_LABELS[link.kind] || link.kind;

        // textContent, não innerHTML: a URL vem da API e pode ter sido digitada por qualquer um.
        const anchor = document.createElement('a');
        anchor.className = 'link-item__url';
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = link.label || link.url;
        anchor.title = link.url;

        const remover = document.createElement('button');
        remover.className = 'btn btn-outline btn-sm';
        remover.textContent = 'Remover';
        remover.addEventListener('click', async () => {
            remover.disabled = true;
            try {
                await API.removePrLink(appId, prId, link.id);
                DOM.showToast('Vínculo removido.', 'success');
                await renderLinks();
            } catch (error) {
                remover.disabled = false;
                DOM.showToast(mensagemDeErro(error), 'error');
            }
        });

        item.append(kind, anchor, remover);
        lista.appendChild(item);
    });
}

document.getElementById('linkForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    // Revalida no submit: validar só em input/blur deixa passar quem clica em salvar
    // sem tirar o foco do campo.
    const url = document.getElementById('linkUrl').value.trim();
    const label = document.getElementById('linkLabel').value.trim();
    limparErro('linkUrl');
    limparErro('linkLabel');

    if (!url) {
        marcarErro('linkUrl', 'Informe o endereço do vínculo.');
        return;
    }
    if (url.length > 1000) {
        marcarErro('linkUrl', 'O endereço passa de 1000 caracteres.');
        return;
    }
    if (label.length > 200) {
        marcarErro('linkLabel', 'O rótulo passa de 200 caracteres.');
        return;
    }

    try {
        await API.addPrLink(appId, prId, {
            kind: document.getElementById('linkKind').value,
            url,
            label: label || null,
        });
        document.getElementById('linkUrl').value = '';
        document.getElementById('linkLabel').value = '';
        DOM.showToast('Vínculo adicionado.', 'success');
        await renderLinks();
    } catch (error) {
        DOM.showToast(mensagemDeErro(error), 'error');
    }
});

document.getElementById('linkUrl').addEventListener('input', () => limparErro('linkUrl'));
document.getElementById('linkLabel').addEventListener('input', () => limparErro('linkLabel'));

const EVENT_LABELS = {
    created: 'PR criado',
    updated: 'PR atualizado',
    approved: 'Aprovado',
    correction_requested: 'Devolvido para ajustes',
    fixed: 'Marcado como corrigido',
    version_requested: 'Versão solicitada',
    deployed_to_staging: 'Implantado em staging',
    deployed_to_environment: 'Versão implantada',
    hotfix_deployed: 'Hotfix implantado',
    merged_to_integration: 'Integrado na branch',
    reverted_from_integration: 'Revertido da branch',
    removed_from_batch: 'Removido da versão',
    link_added: 'Vínculo adicionado',
    link_removed: 'Vínculo removido',
    done: 'Concluído',
    archived: 'Arquivado',
};

async function renderTimeline() {
    const container = document.getElementById('entregaTimeline');
    container.innerHTML = '';

    let eventos = [];
    try {
        eventos = await API.fetchPrEvents(prId) || [];
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        container.innerHTML = '<p class="pipeline-empty">Não foi possível carregar o histórico.</p>';
        return;
    }

    if (eventos.length === 0) {
        container.innerHTML = '<p class="pipeline-empty">Sem eventos registrados.</p>';
        return;
    }

    const dl = document.createElement('dl');
    dl.className = 'entrega-meta';

    eventos.forEach((evento) => {
        const dt = document.createElement('dt');
        dt.textContent = formatDate(evento.createdAt);

        const dd = document.createElement('dd');
        const titulo = EVENT_LABELS[evento.eventType] || evento.eventType;
        dd.textContent = `${titulo} - ${evento.actorName || 'sistema'}`;

        // O motivo do hotfix e da devolução é a parte que interessa auditar.
        const detalhe = extrairDetalhe(evento.detail);
        if (detalhe) {
            const nota = document.createElement('div');
            nota.style.color = 'var(--text-secondary)';
            nota.style.fontSize = '0.8rem';
            nota.textContent = detalhe;
            dd.appendChild(nota);
        }

        dl.appendChild(dt);
        dl.appendChild(dd);
    });

    container.appendChild(dl);
}

function extrairDetalhe(detail) {
    if (!detail) return '';
    try {
        const dados = typeof detail === 'string' ? JSON.parse(detail) : detail;
        const partes = [];
        if (dados.environment) partes.push(`ambiente ${dados.environment}`);
        if (dados.version) partes.push(`versão ${dados.version}`);
        if (dados.reason) partes.push(`motivo: ${dados.reason}`);
        if (dados.url) partes.push(dados.url);
        return partes.join(' - ');
    } catch {
        return '';
    }
}

carregar();
