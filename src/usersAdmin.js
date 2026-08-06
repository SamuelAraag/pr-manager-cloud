// Gestão de Usuários (Épico 2) — rota administrativa (usuarios.html).
// Telas administrativas são sempre rotas, nunca modais no index.
import * as API from './apiService.js';
import * as AuthService from './authService.js';
import * as LocalStorage from './localStorageService.js';
import * as DOM from './domService.js';
import { initializeTheme } from './themeService.js';

initializeTheme('themeToggleBtn');

const userModal = document.getElementById('userModal');
const userForm = document.getElementById('userForm');
const usersCount = document.getElementById('usersCount');
const inviteModal = document.getElementById('inviteModal');
const inviteForm = document.getElementById('inviteForm');

let usersState = [];
let membershipsState = [];

async function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    const includeInactive = document.getElementById('usersShowInactive')?.checked || false;
    usersState = await API.fetchUsers(includeInactive);

    if (usersCount) usersCount.textContent = `${usersState.length} itens`;

    tbody.innerHTML = '';
    usersState.forEach(user => {
        const tr = document.createElement('tr');
        if (user.isActive === false) tr.style.opacity = '0.5';
        tr.innerHTML = `
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>${user.isAdmin ? 'Sim' : '—'}</td>
            <td>${user.isActive === false ? 'Desativado' : 'Ativo'}</td>
            <td>
                <button class="btn btn-outline user-edit-btn" data-id="${user.id}" title="Editar"><i data-lucide="pencil"></i></button>
                ${user.isActive === false ? '' : `<button class="btn btn-outline user-deactivate-btn" data-id="${user.id}" title="Desativar"><i data-lucide="user-x"></i></button>`}
            </td>`;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('.user-edit-btn').forEach(btn =>
        btn.addEventListener('click', () =>
            openUserForm(usersState.find(u => String(u.id) === btn.dataset.id))));

    tbody.querySelectorAll('.user-deactivate-btn').forEach(btn =>
        btn.addEventListener('click', async () => {
            const user = usersState.find(u => String(u.id) === btn.dataset.id);
            const ok = await DOM.confirmDialog(
                `Desativar ${user.name}? O histórico de PRs permanece, mas o login é bloqueado.`, 'Desativar usuário');
            if (!ok) return;
            try {
                await API.deactivateUser(user.id);
                await renderUsersTable();
                DOM.showToast('Usuário desativado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
            }
        }));
}

function openUserForm(user = null) {
    document.getElementById('userFormTitle').textContent = user ? `Editar: ${user.name}` : 'Novo usuário';
    document.getElementById('userFormId').value = user ? user.id : '';
    document.getElementById('userFormName').value = user ? user.name : '';
    document.getElementById('userFormEmail').value = user ? user.email : '';
    document.getElementById('userFormPassword').value = '';
    document.getElementById('userFormPasswordHint').textContent = user ? '(deixe em branco para manter)' : '(obrigatória)';
    document.getElementById('userFormRole').value = user ? user.role : 'Dev';
    document.getElementById('userFormAvatar').value = user?.avatarUrl || '';
    document.getElementById('userFormIsAdmin').checked = user ? !!user.isAdmin : false;

    userModal.style.display = 'flex';
    document.getElementById('userFormName').focus();
}

function closeUserForm() {
    userModal.style.display = 'none';
}

function traduzErro(error) {
    const friendly = {
        email_taken: 'Este email já está em uso.',
        email_invalid: 'Email inválido.',
        last_admin: 'Não é possível rebaixar/desativar o último admin.',
        cannot_deactivate_self: 'Você não pode desativar a si mesmo.',
        password_required: 'Senha é obrigatória.',
        name_required: 'Nome é obrigatório.',
        invitation_pending: 'Já existe uma solicitação pendente para este usuário.',
        role_invalid: 'Papel inválido.',
        last_tenant_admin: 'Não é possível remover/rebaixar o último administrador ativo do tenant.',
        not_found: 'Registro não encontrado.'
    };
    return friendly[error.message] || `Erro: ${error.message}`;
}

document.getElementById('userNewBtn')?.addEventListener('click', () => openUserForm());
document.getElementById('usersShowInactive')?.addEventListener('change', renderUsersTable);
userModal?.querySelectorAll('.close-btn, .close-modal').forEach(btn =>
    btn.addEventListener('click', closeUserForm));

userForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('userFormId').value;
    const payload = {
        name: document.getElementById('userFormName').value.trim(),
        email: document.getElementById('userFormEmail').value.trim(),
        role: document.getElementById('userFormRole').value,
        isAdmin: document.getElementById('userFormIsAdmin').checked,
        avatarUrl: document.getElementById('userFormAvatar').value.trim() || null
    };
    const password = document.getElementById('userFormPassword').value;
    if (password) payload.password = password;

    try {
        if (id) {
            await API.updateUser(id, payload);
        } else {
            if (!password) { DOM.showToast('Senha é obrigatória para criar usuário.', 'error'); return; }
            await API.createUser(payload);
        }
        closeUserForm();
        await renderUsersTable();
        DOM.showToast('Usuário salvo com sucesso.');
    } catch (error) {
        DOM.showToast(traduzErro(error), 'error');
    }
});

// ── Membros do tenant atual (Épico 9 §8.2/§8.5-8.7) ────────────────────────────────────────
// Vínculo com o tenant (papel/ativação) é distinto da conta global acima — ver TenantMembership.

async function renderMembershipsTable() {
    const tbody = document.getElementById('membershipsTableBody');
    const tenantId = AuthService.getMe()?.currentTenantId;
    if (!tbody || !tenantId) return;

    membershipsState = await API.fetchTenantMemberships(tenantId);
    document.getElementById('membershipsCount').textContent = `${membershipsState.length} itens`;

    tbody.innerHTML = '';
    membershipsState.forEach(m => {
        const tr = document.createElement('tr');
        if (m.status !== 'Active') tr.style.opacity = '0.5';
        tr.innerHTML = `
            <td>${m.userName}</td>
            <td>${m.userEmail}</td>
            <td>
                <select class="membership-role-select" data-id="${m.id}" ${m.status !== 'Active' ? 'disabled' : ''}>
                    <option value="Member" ${m.role === 'Member' ? 'selected' : ''}>Membro</option>
                    <option value="TenantAdmin" ${m.role === 'TenantAdmin' ? 'selected' : ''}>Administrador</option>
                </select>
            </td>
            <td>${m.status === 'Active' ? 'Ativo' : 'Inativo'}</td>
            <td>
                ${m.status === 'Active'
                    ? `<button class="btn btn-outline membership-deactivate-btn" data-id="${m.id}" title="Inativar"><i data-lucide="user-x"></i></button>`
                    : `<button class="btn btn-outline membership-reactivate-btn" data-id="${m.id}" title="Reativar"><i data-lucide="user-check"></i></button>`}
            </td>`;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('.membership-role-select').forEach(select =>
        select.addEventListener('change', async () => {
            try {
                await API.updateMembershipRole(select.dataset.id, { role: select.value });
                await renderMembershipsTable();
                DOM.showToast('Papel atualizado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
                await renderMembershipsTable();
            }
        }));

    tbody.querySelectorAll('.membership-deactivate-btn').forEach(btn =>
        btn.addEventListener('click', async () => {
            const m = membershipsState.find(x => x.id === btn.dataset.id);
            const ok = await DOM.confirmDialog(
                `Inativar ${m.userName} neste tenant? Os vínculos com apps deste tenant também serão inativados.`, 'Inativar membro');
            if (!ok) return;
            try {
                await API.deactivateMembership(m.id);
                await renderMembershipsTable();
                DOM.showToast('Membro inativado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
            }
        }));

    tbody.querySelectorAll('.membership-reactivate-btn').forEach(btn =>
        btn.addEventListener('click', async () => {
            try {
                await API.reactivateMembership(btn.dataset.id);
                await renderMembershipsTable();
                DOM.showToast('Membro reativado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
            }
        }));
}

function openInviteForm() {
    document.getElementById('inviteFormEmail').value = '';
    document.getElementById('inviteFormRole').value = 'Member';
    inviteModal.style.display = 'flex';
    document.getElementById('inviteFormEmail').focus();
}

function closeInviteForm() {
    inviteModal.style.display = 'none';
}

document.getElementById('membershipInviteBtn')?.addEventListener('click', openInviteForm);
inviteModal?.querySelectorAll('.close-btn, .close-modal').forEach(btn => btn.addEventListener('click', closeInviteForm));

inviteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tenantId = AuthService.getMe()?.currentTenantId;
    if (!tenantId) return;

    try {
        await API.createTenantInvitation(tenantId, {
            email: document.getElementById('inviteFormEmail').value.trim(),
            requestedTenantRole: document.getElementById('inviteFormRole').value
        });
        closeInviteForm();
        DOM.showToast('Convite enviado — aguardando aprovação do administrador da plataforma.');
    } catch (error) {
        DOM.showToast(traduzErro(error), 'error');
    }
});

async function boot() {
    LocalStorage.init?.();
    if (!LocalStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    // Guarda de acesso: rota é de administrador do tenant. PlatformAdmin/TenantAdmin não são
    // mais claim do JWT (Épico 9) — precisa da checagem fresca via /Users/me. O backend
    // (policy RequireTenantAdmin) é a fonte de verdade; isto só evita renderizar a tela.
    const me = await AuthService.refreshMe();
    if (!me || !AuthService.isAdminGlobal()) {
        window.location.href = 'index.html';
        return;
    }

    await renderUsersTable();
    await renderMembershipsTable();
}

boot();
