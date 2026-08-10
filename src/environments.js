// Ambientes do app — rota ambientes.html?appId=<uuid>.
// Um card por degrau da esteira com a versão atual, histórico expandível, promoção e
// rollback; abaixo, o editor da esteira (Épico 2): ordem, modo, branch e remoção.
import * as API from './apiService.js';
import * as AuthService from './authService.js';
import * as LocalStorage from './localStorageService.js';
import * as DOM from './domService.js';
import { initializeTheme } from './themeService.js';

// Sem isto o conteúdo gated por data-roles pisca antes da sessão resolver.
AuthService.markAuthenticationPending();
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
const envPageState = document.getElementById('envPageState');

let appState = null;       // { id, name, myRole, ... } vindo de GET /Apps
let envsState = [];        // [{ id, kind, url, current, monitorName, monitorStatus }]
let promoteBatch = null;
let promoteTarget = null;

const KIND_LABELS = { Dev: 'Desenvolvimento', Stg: 'Staging', Prod: 'Produção' };

async function carregar() {
    // Identidade fresca (/Users/me, não o JWT): desde o Épico 9 o token não carrega mais claim
    // de Admin, então isPlatformAdmin()/isAdminGlobal() dependem do meCache que restoreSession
    // popula. Sem esta chamada, o editor da esteira — gated por data-roles="Admin" — ficava
    // invisível para um admin que não fosse Gestor deste app, ou seja, quase sempre.
    mostrarEstadoPagina('loading', 'Carregando ambientes...');
    try {
        const session = await AuthService.restoreSession();
        if (session.state === 'unauthenticated') {
            window.location.href = 'index.html';
            return;
        }
        if (session.state !== 'ready') {
            mostrarEstadoPagina('error', 'A sessão não pôde ser validada agora. Ela foi preservada.', carregar);
            return;
        }

        const apps = await API.fetchApps();
        appState = apps.find(a => a.id === appId);
        if (!appState) {
            mostrarEstadoPagina('forbidden', 'App não encontrado ou sem acesso.', () => { window.location.href = 'apps.html'; }, 'Voltar para Apps');
            return;
        }
        document.getElementById('envAppName').textContent =
            appState.myRole ? `${appState.name} - seu papel: ${appState.myRole}` : appState.name;

        AuthService.setCurrentAppRole(appState.myRole);
        envsState = await API.fetchEnvironments(appId);
        esconderEstadoPagina();
        render();
    } catch (error) {
        console.error('Erro ao carregar ambientes:', error);
        const message = error?.status === 403
            ? 'Você não tem acesso aos ambientes deste app.'
            : 'A API não respondeu. Sua sessão foi preservada.';
        mostrarEstadoPagina(error?.status === 403 ? 'forbidden' : 'error', message, carregar);
    }
}

function mostrarEstadoPagina(tipo, mensagem, action = null, actionLabel = 'Tentar novamente') {
    if (!envPageState) return;
    envPageState.className = `page-state page-state--${tipo}`;
    envPageState.innerHTML = '';
    const icon = document.createElement('i');
    icon.dataset.lucide = tipo === 'loading' ? 'loader-circle' : tipo === 'forbidden' ? 'shield-alert' : 'wifi-off';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = mensagem;
    envPageState.append(icon, text);
    if (action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline btn-sm';
        button.textContent = actionLabel;
        button.addEventListener('click', action, { once: true });
        envPageState.appendChild(button);
    }
    envPageState.hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function esconderEstadoPagina() {
    if (envPageState) envPageState.hidden = true;
}

function render() {
    envGrid.innerHTML = '';
    if (envsState.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'module-empty-state';
        const heading = document.createElement('h3');
        heading.textContent = 'Nenhum ambiente configurado';
        const guidance = document.createElement('p');
        guidance.textContent = AuthService.isAdminGlobal() || appState?.myRole === 'Gestor'
            ? 'Monte a esteira abaixo para começar a acompanhar e implantar versões.'
            : 'Peça a um gestor do app para configurar a esteira de entrega.';
        empty.append(heading, guidance);
        envGrid.appendChild(empty);
    } else {
        envsState.forEach(env => envGrid.appendChild(cardDoAmbiente(env)));
    }
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
let pipelineDirty = false;

function marcarEsteiraAlterada() {
    pipelineDirty = true;
    sincronizarValidacaoEsteira();
    atualizarEstadoEditor();
}

function atualizarEstadoEditor() {
    const save = document.getElementById('pipelineSaveBtn');
    const reset = document.getElementById('pipelineResetBtn');
    const erro = validarEsteira();
    if (save) save.disabled = !pipelineDirty || Boolean(erro);
    if (reset) reset.disabled = !pipelineDirty;
}

function sincronizarValidacaoEsteira() {
    const erro = validarEsteira();
    marcarErroEsteira(erro || '');
    return erro;
}

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

        const ordem = document.createElement('div');
        ordem.className = 'pipeline-row__order';
        const orderLabel = document.createElement('span');
        orderLabel.textContent = `${indice + 1}º`;
        const moverCima = document.createElement('button');
        moverCima.type = 'button';
        moverCima.className = 'btn btn-outline btn-sm pipeline-move-btn';
        moverCima.disabled = indice === 0 || pipelineDraft[indice - 1]?.mode === 'Individual';
        moverCima.title = `Mover ${KIND_LABELS[passo.kind] || passo.kind} para cima`;
        moverCima.setAttribute('aria-label', moverCima.title);
        moverCima.innerHTML = '<i data-lucide="arrow-up" aria-hidden="true"></i>';
        moverCima.addEventListener('click', () => moverPasso(indice, indice - 1));
        const moverBaixo = document.createElement('button');
        moverBaixo.type = 'button';
        moverBaixo.className = 'btn btn-outline btn-sm pipeline-move-btn';
        moverBaixo.disabled = indice === pipelineDraft.length - 1 || passo.mode === 'Individual';
        moverBaixo.title = `Mover ${KIND_LABELS[passo.kind] || passo.kind} para baixo`;
        moverBaixo.setAttribute('aria-label', moverBaixo.title);
        moverBaixo.innerHTML = '<i data-lucide="arrow-down" aria-hidden="true"></i>';
        moverBaixo.addEventListener('click', () => moverPasso(indice, indice + 1));
        ordem.append(orderLabel, moverCima, moverBaixo);

        const kind = document.createElement('select');
        kind.className = 'form-select form-select-sm';
        kind.setAttribute('aria-label', 'Ambiente');
        kind.setAttribute('aria-describedby', 'pipelineError');
        TODOS_OS_KINDS.forEach((valor) => {
            const opcao = document.createElement('option');
            opcao.value = valor;
            opcao.textContent = KIND_LABELS[valor] || valor;
            opcao.selected = valor === passo.kind;
            opcao.disabled = valor !== passo.kind
                && pipelineDraft.some((outro, outroIndice) => outroIndice !== indice && outro.kind === valor);
            kind.appendChild(opcao);
        });
        kind.addEventListener('change', () => { passo.kind = kind.value; marcarEsteiraAlterada(); renderPipelineEditor(); });

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
        mode.addEventListener('change', () => { passo.mode = mode.value; marcarEsteiraAlterada(); });

        const branch = document.createElement('input');
        branch.type = 'text';
        branch.className = 'form-control form-control-sm';
        branch.placeholder = 'branch (opcional)';
        branch.maxLength = 200;
        branch.value = passo.branch;
        branch.setAttribute('aria-label', 'Branch');
        branch.addEventListener('input', () => { passo.branch = branch.value; marcarEsteiraAlterada(); });

        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'btn btn-outline btn-sm';
        remover.textContent = 'Remover';
        remover.addEventListener('click', () => {
            pipelineDraft.splice(indice, 1);
            pipelineDraft.forEach((p, i) => { p.order = i + 1; });
            marcarEsteiraAlterada();
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
            marcarEsteiraAlterada();
            renderPipelineEditor();
        });
        editor.appendChild(adicionar);
    }
    sincronizarValidacaoEsteira();
    atualizarEstadoEditor();
    if (window.lucide) window.lucide.createIcons();
}

function moverPasso(origem, destino) {
    if (destino < 0 || destino >= pipelineDraft.length) return;
    const [passo] = pipelineDraft.splice(origem, 1);
    pipelineDraft.splice(destino, 0, passo);
    pipelineDraft.forEach((item, indice) => { item.order = indice + 1; });
    marcarEsteiraAlterada();
    renderPipelineEditor();
    const row = document.querySelectorAll('.pipeline-row')[destino];
    const buttons = row?.querySelectorAll('.pipeline-move-btn');
    const preferred = destino > origem ? buttons?.[1] : buttons?.[0];
    const fallback = destino > origem ? buttons?.[0] : buttons?.[1];
    (preferred?.disabled ? fallback : preferred)?.focus();
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
        pipelineSaveBtn.classList.add('is-loading');
        try {
            envsState = await API.updatePipeline(appId, steps);
            pipelineDraft = null;
            pipelineDirty = false;
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
                kind_duplicated: 'Cada ambiente só pode aparecer uma vez.',
            };
            marcarErroEsteira(mapa[error?.body?.error] || error.message || 'Não foi possível salvar a esteira.');
        } finally {
            pipelineSaveBtn.classList.remove('is-loading');
            atualizarEstadoEditor();
        }
    });
}

const pipelineResetBtn = document.getElementById('pipelineResetBtn');
if (pipelineResetBtn) {
    pipelineResetBtn.addEventListener('click', () => {
        pipelineDraft = null;
        pipelineDirty = false;
        limparErroEsteira();
        renderPipelineEditor();
    });
}

function cardDoAmbiente(env) {
    const card = document.createElement('div');
    card.className = 'module-card';
    card.dataset.kind = env.kind;

    const monitor = env.monitorStatus
        ? `<span class="tag" title="Monitor: ${DOM.escapeHtml(env.monitorName)}"
               style="color: ${env.monitorStatus === 'OK' ? 'var(--success, #2e7d32)' : 'var(--danger, #c62828)'};">
               ${env.monitorStatus === 'OK' ? '● online' : '● ' + DOM.escapeHtml(env.monitorStatus)}
           </span>`
        : '';

    let corpo;
    if (env.mode === 'Individual') {
        // Épico 2: ambiente de integração não recebe versão — o código entra por merge, PR a
        // PR. Mostrar "nenhuma versão implantada" aqui seria descrever o degrau errado.
        const total = env.presentPrCount ?? 0;
        corpo = total > 0
            ? `<p style="margin: 0.3rem 0; font-size: 1.3rem;"><strong>${total}</strong></p>
               <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.2rem 0;">
                   PR${total === 1 ? '' : 's'} integrado${total === 1 ? '' : 's'}${env.branch ? ` na branch <code>${DOM.escapeHtml(env.branch)}</code>` : ''}
               </p>`
            : `<p style="color: var(--text-secondary); font-size: 0.9rem;">
                   Nenhum PR integrado ainda.${env.branch ? ` Branch <code>${DOM.escapeHtml(env.branch)}</code>.` : ''}
               </p>
               <p style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.4rem;">
                   O Gestor registra a entrada de um PR aqui pela tela de entrega.
               </p>`;
    } else if (env.current) {
        const c = env.current;
        corpo = `
            <p style="margin: 0.3rem 0; font-size: 1.3rem;"><strong>${DOM.escapeHtml(c.version || '(sem versão)')}</strong></p>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.2rem 0;">
                ${c.prCount} PR${c.prCount === 1 ? '' : 's'}
                ${c.deployedBy ? ` &middot; por ${DOM.escapeHtml(c.deployedBy)}` : ''}<br>
                ${new Date(c.deployedAt).toLocaleString('pt-BR')}
                ${c.pipelineLink && /^https?:\/\//i.test(c.pipelineLink) ? ` &middot; <a href="${DOM.escapeHtml(c.pipelineLink)}" target="_blank" rel="noopener">pipeline</a>` : ''}
            </p>`;
    } else {
        // Estado vazio com saída: sem isto a tela só dizia "nada aqui" e deixava o usuário
        // sem saber o que fazer a seguir.
        const anterior = envsState
            .filter(e => e.mode === 'Versioned' && e.order < env.order)
            .sort((a, b) => b.order - a.order)[0];
        const orientacao = anterior
            ? `Promova a versão ativa em ${KIND_LABELS[anterior.kind] || anterior.kind}.`
            : 'Corte uma versão a partir dos PRs aprovados para implantar aqui.';
        corpo = `<p style="color: var(--text-secondary); font-size: 0.9rem;">Nenhuma versão implantada.</p>
                 <p style="color: var(--text-secondary); font-size: 0.8rem; margin-top: 0.4rem;">${orientacao}</p>`;
    }

    const anteriorVersionado = envsState
        .filter(item => item.mode === 'Versioned' && item.order < env.order)
        .sort((a, b) => b.order - a.order)[0];
    const acoes = [];
    if (env.mode === 'Versioned' && anteriorVersionado?.current && env.current?.batchId !== anteriorVersionado.current.batchId) {
        acoes.push(`<button class="btn btn-primary env-promote-btn" data-roles="Admin" type="button">
            Promover de ${KIND_LABELS[anteriorVersionado.kind] || anteriorVersionado.kind}</button>`);
    }
    if (env.mode === 'Versioned' && env.current) {
        acoes.push(`<button class="btn btn-outline env-rollback-btn" data-roles="Admin"
            data-kind="${env.kind}" data-deployment="${env.current.id}" type="button">Reverter</button>`);
    }
    if (env.mode === 'Versioned') {
        acoes.push(`<button class="btn btn-outline env-history-btn" data-kind="${env.kind}" type="button"
            aria-expanded="false" aria-controls="envHistory-${env.kind}">
            Histórico</button>`);
    }

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: start; gap: 0.5rem;">
            <h3 style="margin: 0;">${KIND_LABELS[env.kind] || env.kind}</h3>
            ${monitor}
        </div>
        ${corpo}
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.8rem;">${acoes.join('')}</div>
        <div id="envHistory-${env.kind}" class="env-history" data-kind="${env.kind}"
            hidden style="margin-top: 0.8rem;" aria-live="polite"></div>`;

    card.querySelector('.env-promote-btn')?.addEventListener('click', () => abrirPromocao(env));
    card.querySelector('.env-rollback-btn')?.addEventListener('click', (e) =>
        reverter(e.currentTarget.dataset.kind, e.currentTarget.dataset.deployment));
    card.querySelector('.env-history-btn')?.addEventListener('click', (event) =>
        alternarHistorico(card, env.kind, event.currentTarget));
    return card;
}

// ── Histórico (6.3) ──────────────────────────────────────────────────────────

async function alternarHistorico(card, kind, button) {
    const box = card.querySelector('.env-history');
    if (!box.hidden) {
        box.hidden = true;
        button?.setAttribute('aria-expanded', 'false');
        if (button) button.textContent = 'Histórico';
        return;
    }

    box.hidden = false;
    button?.setAttribute('aria-expanded', 'true');
    if (button) button.textContent = 'Ocultar histórico';

    if (!box.dataset.loaded) {
        box.setAttribute('aria-busy', 'true');
        box.innerHTML = '<p class="env-history__status">Carregando histórico...</p>';
        try {
            const historico = await API.fetchEnvironmentHistory(appId, kind.toLowerCase());
            box.innerHTML = historico.length === 0
                ? `<div class="module-empty-state module-empty-state--compact">
                    <h4>Nenhum deploy registrado</h4>
                    <p>O histórico será exibido depois da primeira implantação neste ambiente.</p>
                   </div>`
                : `<table class="pr-table" style="width: 100%; font-size: 0.85rem;">
                <thead><tr><th>Versão</th><th>Quando</th><th>Por</th><th>Status</th></tr></thead>
                <tbody>${historico.map(h => `
                    <tr>
                        <td>${DOM.escapeHtml(h.version || '(sem versão)')}</td>
                        <td>${new Date(h.deployedAt).toLocaleString('pt-BR')}</td>
                        <td>${DOM.escapeHtml(h.deployedBy || '-')}</td>
                        <td>${DOM.escapeHtml(traduzStatus(h.status))}</td>
                    </tr>`).join('')}
                </tbody></table>`;
            box.dataset.loaded = '1';
        } catch (error) {
            console.error(`Erro ao carregar histórico de ${kind}:`, error);
            box.innerHTML = '';
            const mensagem = document.createElement('p');
            mensagem.className = 'env-history__status env-history__status--error';
            mensagem.textContent = 'Não foi possível carregar o histórico.';
            const tentar = document.createElement('button');
            tentar.type = 'button';
            tentar.className = 'btn btn-outline btn-sm';
            tentar.textContent = 'Tentar novamente';
            tentar.addEventListener('click', () => {
                delete box.dataset.loaded;
                box.hidden = true;
                alternarHistorico(card, kind, button);
            }, { once: true });
            box.append(mensagem, tentar);
        } finally {
            box.removeAttribute('aria-busy');
        }
    }
}

function traduzStatus(status) {
    return { Active: 'Ativo', Superseded: 'Substituído', RolledBack: 'Revertido' }[status] || status;
}

// ── Promoção entre degraus configurados (6.4) ───────────────────────────────

function abrirPromocao(targetEnv) {
    const source = envsState
        .filter(env => env.mode === 'Versioned' && env.order < targetEnv.order)
        .sort((a, b) => b.order - a.order)[0];
    if (!source?.current) {
        DOM.showToast('Não há uma versão ativa no ambiente anterior.', 'warning');
        return;
    }
    promoteBatch = source.current;
    promoteTarget = targetEnv;
    document.getElementById('promoteTitle').textContent = `Promover para ${KIND_LABELS[targetEnv.kind] || targetEnv.kind}`;
    document.getElementById('promoteSummary').innerHTML = `
        <p>Vai de <strong>${KIND_LABELS[source.kind] || source.kind}</strong> para <strong>${KIND_LABELS[targetEnv.kind] || targetEnv.kind}</strong>:</p>
        <p style="font-size: 1.2rem; margin: 0.4rem 0;"><strong>${DOM.escapeHtml(promoteBatch.version || '(sem versão)')}</strong></p>
        <p style="color: var(--text-secondary); font-size: 0.85rem;">
            ${promoteBatch.prCount} PR${promoteBatch.prCount === 1 ? '' : 's'} incluído${promoteBatch.prCount === 1 ? '' : 's'}
            &middot; em ${KIND_LABELS[source.kind] || source.kind} desde ${new Date(promoteBatch.deployedAt).toLocaleString('pt-BR')}
        </p>`;
    promoteModal.style.display = 'flex';
}

document.getElementById('promoteConfirmBtn')?.addEventListener('click', async () => {
    if (!promoteBatch || !promoteTarget) return;
    try {
        await API.deployToEnvironment(appId, promoteTarget.kind.toLowerCase(), promoteBatch.batchId);
        promoteModal.style.display = 'none';
        envsState = await API.fetchEnvironments(appId);
        pipelineDraft = null;
        pipelineDirty = false;
        render();
        DOM.showToast(`Versão promovida para ${KIND_LABELS[promoteTarget.kind] || promoteTarget.kind}.`, 'success');
    } catch (error) {
        promoteModal.style.display = 'none';
        await tratarErro(error);
    }
});

// ── Rollback (6.1.3) ─────────────────────────────────────────────────────────

async function reverter(kind, deploymentId) {
    const confirmed = await DOM.confirmDialog(
        `Reverter ${KIND_LABELS[kind] || kind} para a versão anterior?`,
        'Confirmar rollback',
        { confirmLabel: 'Reverter', danger: true },
    );
    if (!confirmed) return;
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
        DOM.showToast('Você não tem papel suficiente neste app para essa ação.', 'error');
    } else if (error.status === 409) {
        DOM.showToast('O estado do ambiente mudou. A tela foi atualizada.', 'warning');
    } else {
        DOM.showToast(error.message || 'Não foi possível concluir a ação.', 'error');
    }
    try {
        envsState = await API.fetchEnvironments(appId);
        pipelineDraft = null;
        pipelineDirty = false;
        render();
    } catch (refreshError) {
        mostrarEstadoPagina('error', 'Não foi possível atualizar os ambientes.', carregar);
    }
}

document.querySelectorAll('.close-btn, .close-modal').forEach(btn =>
    btn.addEventListener('click', () => {
        promoteModal.style.display = 'none';
        promoteBatch = null;
        promoteTarget = null;
    }));

carregar();
