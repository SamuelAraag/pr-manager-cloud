// Vínculos personalizados por app (Épico 10, 10.4) — rota vinculos.html?appId=<uuid>.
// Tela administrativa: rota própria, nunca modal no index (preferencias §12).
// Task e Pull Request são fixos de todo PR e NÃO entram aqui.
import * as API from './apiService.js';
import * as AuthService from './authService.js';
import * as LocalStorage from './localStorageService.js';
import * as DOM from './domService.js';
import { initializeTheme } from './themeService.js';
import * as Form from './formService.js';

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

const stateBox = document.getElementById('linkFieldsState');
const tableWrap = document.getElementById('linkFieldsTableWrap');
const tableBody = document.getElementById('linkFieldsTableBody');
const countTag = document.getElementById('linkFieldsCount');
const modal = document.getElementById('linkFieldModal');
const form = document.getElementById('linkFieldForm');
const newBtn = document.getElementById('linkFieldNewBtn');

Form.prepareForm(form);

let appState = null;
let fieldsState = [];
let canManage = false;

const ERROS_ROTULO = {
    rotulo_obrigatorio: 'Informe o rótulo do campo.',
    rotulo_muito_longo: 'O rótulo passa de 120 caracteres.',
    rotulo_reservado: '"Task" e "Pull Request" são fixos do PR — escolha outro rótulo.',
    rotulo_duplicado: 'Já existe um campo com esse rótulo neste app.',
};

// ── Estados obrigatórios (06-feedback-states.md) ────────────────────────────

function showLoading() {
    tableWrap.style.display = 'none';
    stateBox.innerHTML = `
        <div class="module-skeleton-stack" aria-hidden="true">
            <span class="module-skeleton module-skeleton-text"></span>
            <span class="module-skeleton module-skeleton-text"></span>
            <span class="module-skeleton module-skeleton-text"></span>
        </div>`;
}

function showEmpty() {
    tableWrap.style.display = 'none';
    stateBox.innerHTML = `
        <article class="data-card module-empty-state">
            <h3>Nenhum campo personalizado</h3>
            <p>O formulário de PR nasce só com os campos fixos.${canManage ? ' Use o botão "+ Novo" para acrescentar um.' : ''}</p>
        </article>`;
}

function showError() {
    tableWrap.style.display = 'none';
    stateBox.innerHTML = `
        <article class="data-card module-empty-state">
            <h3>Não foi possível carregar os campos</h3>
            <p>Verifique a conexão e tente de novo.</p>
            <button id="linkFieldsRetry" class="btn btn-outline" type="button" style="margin-top: 0.6rem;">Tentar de novo</button>
        </article>`;
    document.getElementById('linkFieldsRetry').addEventListener('click', carregar);
}

function showNoPermission() {
    tableWrap.style.display = 'none';
    stateBox.innerHTML = `
        <article class="data-card module-empty-state">
            <h3>Sem permissão</h3>
            <p>Só o Gestor do app (ou um administrador) configura o cadastro de PR deste app.</p>
        </article>`;
}

// ── Carregamento ───────────────────────────────────────────────────────────

async function carregar() {
    showLoading();
    try {
        // Identidade fresca (papel no tenant) antes de decidir permissão — sem isso,
        // isAdminGlobal() responde com o cache vazio e barra Gestor/Admin legítimo.
        const session = await AuthService.restoreSession();
        if (session.state === 'unauthenticated') {
            window.location.href = 'index.html';
            return;
        }

        const apps = await API.fetchApps();
        appState = Array.isArray(apps) ? apps.find(a => a.id === appId) : null;
        if (!appState) {
            await DOM.alertDialog('App não encontrado ou sem acesso.');
            window.location.href = 'apps.html';
            return;
        }
        document.getElementById('linkFieldsAppName').textContent = appState.name;

        AuthService.setCurrentAppRole(appState.myRole);
        canManage = AuthService.isAdminGlobal?.() || appState.myRole === 'Gestor';

        if (!canManage) {
            showNoPermission();
            AuthService.applyRoleBasedVisibility();
            return;
        }

        fieldsState = await API.fetchLinkFields(appId);
        fieldsState = Array.isArray(fieldsState) ? fieldsState : [];
        render();
    } catch (error) {
        console.error('Falha ao carregar vínculos personalizados:', error);
        if (error.status === 403) {
            showNoPermission();
        } else {
            showError();
        }
    }
    AuthService.applyRoleBasedVisibility();
}

function render() {
    if (countTag) countTag.textContent = `${fieldsState.length} ${fieldsState.length === 1 ? 'item' : 'itens'}`;
    newBtn.style.display = '';

    if (fieldsState.length === 0) {
        showEmpty();
        return;
    }

    stateBox.innerHTML = '';
    tableWrap.style.display = 'block';
    tableBody.innerHTML = '';
    fieldsState.forEach(field => {
        const tr = document.createElement('tr');

        const tdLabel = document.createElement('td');
        tdLabel.textContent = field.label;

        const tdRequired = document.createElement('td');
        tdRequired.textContent = field.required ? 'Sim' : 'Não';

        const tdActions = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-outline';
        editBtn.type = 'button';
        editBtn.title = 'Editar';
        editBtn.innerHTML = '<i data-lucide="pencil" style="width: 14px;"></i>';
        editBtn.addEventListener('click', () => abrirModal(field));

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-outline';
        delBtn.type = 'button';
        delBtn.title = 'Excluir';
        delBtn.style.color = 'var(--danger-color)';
        delBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px;"></i>';
        delBtn.addEventListener('click', () => excluir(field));

        tdActions.append(editBtn, delBtn);
        tr.append(tdLabel, tdRequired, tdActions);
        tableBody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();
}

// ── Criar / editar ─────────────────────────────────────────────────────────

function abrirModal(field = null) {
    Form.resetFormState(form);
    document.getElementById('linkFieldModalTitle').textContent = field ? 'Editar campo' : 'Novo campo';
    document.getElementById('linkFieldId').value = field?.id || '';
    document.getElementById('linkFieldLabel').value = field?.label || '';
    document.getElementById('linkFieldRequired').checked = !!field?.required;
    modal.style.display = 'flex';
    document.getElementById('linkFieldLabel').focus();
}

function fecharModal() {
    modal.style.display = 'none';
    Form.resetFormState(form);
}

function validar() {
    const label = document.getElementById('linkFieldLabel');
    return Form.validateFields([
        { field: label, validate: Form.isRequired, message: 'Informe o rótulo do campo.' },
    ]);
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validar()) return;
    if (!Form.beginFormSubmission(form)) return;

    const id = document.getElementById('linkFieldId').value;
    const payload = {
        label: document.getElementById('linkFieldLabel').value.trim(),
        required: document.getElementById('linkFieldRequired').checked,
    };

    try {
        if (id) {
            await API.updateLinkField(appId, id, payload);
        } else {
            await API.createLinkField(appId, payload);
        }
        fecharModal();
        DOM.showToast(id ? 'Campo atualizado.' : 'Campo criado.');
        await carregar();
    } catch (error) {
        const code = error.body?.error || error.message;
        const labelInput = document.getElementById('linkFieldLabel');
        if (ERROS_ROTULO[code]) {
            labelInput.classList.add('is-invalid');
            const err = labelInput.nextElementSibling;
            if (err) { err.textContent = ERROS_ROTULO[code]; err.classList.add('is-invalid'); }
        } else if (error.status === 403) {
            DOM.showToast('Você não tem papel de Gestor neste app.', 'error');
        } else {
            DOM.showToast('Erro ao salvar o campo.', 'error');
        }
    } finally {
        Form.endFormSubmission(form);
    }
});

// ── Excluir (05-dialogs-and-destructive-actions.md) ─────────────────────────

async function excluir(field) {
    let usoTexto = '';
    try {
        const usage = await API.fetchLinkFieldUsage(appId, field.id);
        const n = usage?.count ?? 0;
        usoTexto = n === 0
            ? 'Nenhum PR usou esse campo ainda.'
            : `Os ${n} PR${n === 1 ? '' : 's'} que já preencheram mantêm o link.`;
    } catch {
        usoTexto = 'PRs que já preencheram esse campo mantêm o link.';
    }

    const ok = await DOM.confirmDialog(
        `Excluir "${field.label}"? Novos PRs deste app deixam de ter esse campo. ${usoTexto}`,
        'Excluir campo',
        { confirmLabel: 'Excluir', danger: true }
    );
    if (!ok) return;

    try {
        await API.deleteLinkField(appId, field.id);
        DOM.showToast('Campo excluído.');
        await carregar();
    } catch (error) {
        if (error.status === 403) {
            DOM.showToast('Você não tem papel de Gestor neste app.', 'error');
        } else {
            DOM.showToast('Erro ao excluir o campo.', 'error');
        }
    }
}

// ── Wiring ─────────────────────────────────────────────────────────────────

newBtn.addEventListener('click', () => abrirModal());
document.querySelectorAll('.close-btn, .close-modal').forEach(btn =>
    btn.addEventListener('click', fecharModal));

carregar();
