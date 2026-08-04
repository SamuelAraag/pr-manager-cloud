// Gestão de Usuários (Épico 2) — rota administrativa (usuarios.html).
// Telas administrativas são sempre rotas, nunca modais no index.
import * as API from './apiService.js';
import * as AuthService from './authService.js';
import * as LocalStorage from './localStorageService.js';
import { initializeTheme } from './themeService.js';

initializeTheme('themeToggleBtn');

// Guarda de acesso: rota é de Admin. O backend é a fonte de verdade (401/403),
// isto só evita renderizar a tela para quem não deveria vê-la.
LocalStorage.init?.();
if (!LocalStorage.getItem('token') || !AuthService.isAdmin()) {
    window.location.href = 'index.html';
}

const userModal = document.getElementById('userModal');
const userForm = document.getElementById('userForm');
const usersCount = document.getElementById('usersCount');

let usersState = [];

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
            if (!confirm(`Desativar ${user.name}? O histórico de PRs permanece, mas o login é bloqueado.`)) return;
            try {
                await API.deactivateUser(user.id);
                await renderUsersTable();
            } catch (error) {
                alert(traduzErro(error));
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
        name_required: 'Nome é obrigatório.'
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
            if (!password) { alert('Senha é obrigatória para criar usuário.'); return; }
            await API.createUser(payload);
        }
        closeUserForm();
        await renderUsersTable();
    } catch (error) {
        alert(traduzErro(error));
    }
});

renderUsersTable();
