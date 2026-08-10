// Home de Apps (Épico 3) — rota apps.html.
// Grade de cards; Admin cria/edita/desativa apps e gerencia membros
// (formulários pontuais são modais DENTRO da rota — regra do projeto).
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
// isAdmin decide quem edita/desativa apps e gerencia membros — precisa bater exatamente com
// a policy RequireTenantAdmin do backend (PlatformAdmin OU TenantAdmin do tenant atual), não
// com o papel legado global (User.Role) que AuthService.isAdmin() lê do JWT. Um usuário pode
// ser "Admin" nesse campo legado e ainda assim ser só Developer/Member no tenant atual — o
// backend já rejeita (403) esse caso, mas o botão de editar não pode nem aparecer pra ele.
// Setado por init() abaixo, depois de restoreSession() popular o papel no tenant atual.
let isAdmin = false;

const appsGrid = document.getElementById('appsGrid');
const appsCount = document.getElementById('appsCount');
const appFormModal = document.getElementById('appFormModal');
const membersModal = document.getElementById('membersModal');
const appForm = document.getElementById('appForm');
Form.prepareForm(appForm);

let appsState = [];
let membersAppId = null;

async function renderApps() {
    appsState = await API.fetchApps();
    if (appsCount) appsCount.textContent = `${appsState.length} itens`;

    appsGrid.innerHTML = '';
    appsState.forEach(app => {
        const card = document.createElement('div');
        card.className = 'module-card';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 0.5rem;">
                <h3 style="margin: 0;">${app.name}</h3>
                ${app.myRole ? `<span class="tag">${app.myRole}</span>` : ''}
            </div>
            <p style="color: var(--text-secondary); font-size: 0.85rem; min-height: 2.2em; margin: 0.4rem 0;">
                ${app.description || ''}
            </p>
            <div style="display: flex; gap: 1rem; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.8rem;">
                <span title="PRs abertos"><strong>${app.openPrs}</strong> abertos</span>
                <span title="Total de PRs"><strong>${app.totalPrs}</strong> PRs</span>
                <span title="Membros"><strong>${app.memberCount}</strong> membros</span>
                ${app.monitorCount > 0 ? `
                    <span title="Monitores vinculados (Épico 7)"
                          style="color: ${app.monitorsDown > 0 ? 'var(--danger, #c62828)' : 'var(--success, #2e7d32)'};">
                        ● ${app.monitorsDown > 0
                            ? `${app.monitorsDown}/${app.monitorCount} fora`
                            : `${app.monitorCount} online`}
                    </span>` : ''}
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button class="btn btn-primary app-enter-btn" data-name="${app.name}">Entrar</button>
                ${app.repositoryUrl ? `<a class="btn btn-outline" href="${app.repositoryUrl}" target="_blank" rel="noopener" title="Repositório"><i data-lucide="git-branch"></i></a>` : ''}
                <button class="btn btn-outline app-members-btn" data-id="${app.id}" title="Membros"><i data-lucide="users"></i></button>
                <button class="btn btn-outline app-envs-btn" data-id="${app.id}" title="Configurar ambientes e esteira">
                    <i data-lucide="server" aria-hidden="true"></i>
                    Ambientes e esteira
                </button>
                ${isAdmin ? `
                    <button class="btn btn-outline app-edit-btn" data-id="${app.id}" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn btn-outline app-deactivate-btn" data-id="${app.id}" title="Desativar"><i data-lucide="archive"></i></button>` : ''}
            </div>`;
        appsGrid.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();

    appsGrid.querySelectorAll('.app-enter-btn').forEach(btn =>
        btn.addEventListener('click', () => {
            // dashboard filtrado por app (Project == nome até o Épico 5)
            window.location.href = `index.html?app=${encodeURIComponent(btn.dataset.name)}`;
        }));
    appsGrid.querySelectorAll('.app-members-btn').forEach(btn =>
        btn.addEventListener('click', () => openMembers(btn.dataset.id)));
    appsGrid.querySelectorAll('.app-envs-btn').forEach(btn =>
        btn.addEventListener('click', () => {
            // rota própria (Épico 6.3) — regra do projeto: telas administrativas são rotas
            window.location.href = `ambientes.html?appId=${btn.dataset.id}`;
        }));

    if (isAdmin) {
        appsGrid.querySelectorAll('.app-edit-btn').forEach(btn =>
            btn.addEventListener('click', () =>
                openAppForm(appsState.find(a => a.id === btn.dataset.id))));
        appsGrid.querySelectorAll('.app-deactivate-btn').forEach(btn =>
            btn.addEventListener('click', async () => {
                const app = appsState.find(a => a.id === btn.dataset.id);
                if (!confirm(`Desativar o app ${app.name}? PRs e versões existentes são preservados.`)) return;
                try {
                    await API.deactivateApp(app.id);
                    await renderApps();
                } catch (error) {
                    await DOM.alertDialog(traduzErro(error));
                }
            }));
    }
}

// ── Formulário de app (Admin) ────────────────────────────────────────────────

function openAppForm(app = null) {
    Form.resetFormState(appForm);
    document.getElementById('appFormTitle').textContent = app ? `Editar: ${app.name}` : 'Novo App';
    document.getElementById('appFormId').value = app ? app.id : '';
    document.getElementById('appFormName').value = app ? app.name : '';
    document.getElementById('appFormRepo').value = app?.repositoryUrl || '';
    document.getElementById('appFormDescription').value = app?.description || '';
    appFormModal.style.display = 'flex';
    document.getElementById('appFormName').focus();
}

document.getElementById('appForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('appFormId').value;
    const nameField = document.getElementById('appFormName');
    const repositoryField = document.getElementById('appFormRepo');
    if (!Form.validateFields([
        { field: nameField, validate: Form.isRequired, message: 'Informe o nome da aplicação.' },
        { field: repositoryField, validate: Form.isOptionalUrl, message: 'Informe uma URL válida para o repositório.' }
    ])) return;
    if (!Form.beginFormSubmission(appForm)) return;

    const payload = {
        name: nameField.value.trim(),
        repositoryUrl: repositoryField.value.trim(),
        description: document.getElementById('appFormDescription').value.trim() || null
    };

    try {
        if (id) await API.updateApp(id, payload);
        else await API.createApp(payload);
        appFormModal.style.display = 'none';
        await renderApps();
        DOM.showToast('Aplicação salva com sucesso.');
    } catch (error) {
        DOM.showToast(traduzErro(error), 'error');
    } finally {
        Form.endFormSubmission(appForm);
    }
});

// ── Membros ──────────────────────────────────────────────────────────────────

async function openMembers(appId) {
    membersAppId = appId;
    const app = appsState.find(a => a.id === appId);
    document.getElementById('membersTitle').textContent = `Membros - ${app.name}`;

    if (isAdmin) {
        const bar = document.getElementById('membersAdminBar');
        bar.style.display = 'flex';
        const select = document.getElementById('memberUserSelect');
        // Candidatos são os membros ativos do tenant atual (TenantMembership), não
        // API.fetchUsers() — essa lista é filtrada pela coluna legada User.TenantId e não
        // enxerga usuários vinculados a este tenant só via convite/TenantMembership.
        // A sessão já foi revalidada no boot; usa o tenant confirmado pelo /Users/me.
        const tenantId = AuthService.getMe()?.currentTenantId;
        const tenantMembers = tenantId ? await API.fetchTenantMemberships(tenantId) : [];
        select.innerHTML = '<option value="">Selecione um usuário</option>';
        tenantMembers
            .filter(m => m.status === 'Active')
            .forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.userId;
                opt.textContent = m.userName;
                select.appendChild(opt);
            });
    }

    await renderMembers();
    membersModal.style.display = 'flex';
}

async function renderMembers() {
    const tbody = document.getElementById('membersTableBody');
    const members = await API.fetchAppMembers(membersAppId);

    tbody.innerHTML = '';
    members.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${m.userName}</td>
            <td>${isAdmin
                ? `<select class="member-role-select" data-user="${m.userId}">
                        ${[['Developer', 'Dev'], ['Gestor', 'Gestor'], ['QA', 'QA']].map(([value, label]) =>
                            `<option value="${value}" ${m.role === value ? 'selected' : ''}>${label}</option>`).join('')}
                   </select>`
                : m.role}</td>
            <td>${isAdmin ? `<button class="btn btn-outline member-remove-btn" data-user="${m.userId}" title="Remover"><i data-lucide="user-minus"></i></button>` : ''}</td>`;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();

    if (isAdmin) {
        tbody.querySelectorAll('.member-role-select').forEach(sel =>
            sel.addEventListener('change', async () => {
                try {
                    await API.updateAppMember(membersAppId, sel.dataset.user, { role: sel.value });
                } catch (error) {
                    await DOM.alertDialog(traduzErro(error));
                    await renderMembers();
                }
            }));
        tbody.querySelectorAll('.member-remove-btn').forEach(btn =>
            btn.addEventListener('click', async () => {
                if (!confirm('Remover este membro do app?')) return;
                try {
                    await API.removeAppMember(membersAppId, btn.dataset.user);
                    await renderMembers();
                    await renderApps();
                } catch (error) {
                    await DOM.alertDialog(traduzErro(error));
                }
            }));
    }
}

document.getElementById('memberAddBtn')?.addEventListener('click', async () => {
    const userId = document.getElementById('memberUserSelect').value;
    const role = document.getElementById('memberRoleSelect').value;
    if (!userId) return;
    try {
        await API.addAppMember(membersAppId, { userId: Number(userId), role });
        await renderMembers();
        await renderApps();
    } catch (error) {
        await DOM.alertDialog(traduzErro(error));
    }
});

// ── Utilidades ───────────────────────────────────────────────────────────────

function traduzErro(error) {
    const friendly = {
        name_taken: 'Já existe um app com este nome.',
        name_required: 'Nome é obrigatório.',
        member_exists: 'Este usuário já é membro do app.',
        user_invalid: 'Usuário inválido ou desativado.',
        role_invalid: 'Papel inválido.',
        not_found: 'Registro não encontrado.'
    };
    return friendly[error.message] || `Erro: ${error.message}`;
}

document.querySelectorAll('.close-btn, .close-modal').forEach(btn =>
    btn.addEventListener('click', () => {
        appFormModal.style.display = 'none';
        Form.resetFormState(appForm);
        membersModal.style.display = 'none';
    }));

async function init() {
    const session = await AuthService.restoreSession();
    if (session.state !== 'ready') {
        window.location.href = 'index.html';
        return;
    }

    // Identidade fresca (fonte: /Users/me, não o JWT) pra resolver o papel no tenant atual —
    // sem isso getRoleInCurrentTenant()/isPlatformAdmin() ficam nulos nesta página.
    isAdmin = AuthService.isAdminGlobal();
    AuthService.applyRoleBasedVisibility();

    if (isAdmin) {
        const newBtn = document.getElementById('appNewBtn');
        newBtn.style.display = 'inline-flex';
        newBtn.addEventListener('click', () => openAppForm());

        // Acesso rápido a partir do "?" de ajuda no formulário de PR (apps.html?new=1).
        if (new URLSearchParams(window.location.search).get('new') === '1') {
            openAppForm();
        }
    }

    await renderApps();
}

init();
