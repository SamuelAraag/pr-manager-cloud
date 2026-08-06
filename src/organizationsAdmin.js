// Gestão de Organizações (Épico 8b) — rota administrativa (organizacoes.html).
// Telas administrativas são sempre rotas, nunca modais no index.
import * as API from './apiService.js';
import * as AuthService from './authService.js';
import * as LocalStorage from './localStorageService.js';
import { initializeTheme } from './themeService.js';

initializeTheme('themeToggleBtn');

// Guarda de acesso: rota é só da organização-plataforma. O backend (policy
// RequirePlatformAdmin) é a fonte de verdade (401/403), isto só evita renderizar a tela
// para quem não deveria vê-la.
LocalStorage.init?.();
if (!LocalStorage.getItem('token') || !AuthService.isPlatformAdmin()) {
    window.location.href = 'index.html';
}

const orgModal = document.getElementById('orgModal');
const orgForm = document.getElementById('orgForm');
const orgsCount = document.getElementById('orgsCount');
const adminFields = document.querySelectorAll('.org-admin-field');

let orgsState = [];

async function renderOrgsTable() {
    const tbody = document.getElementById('orgsTableBody');
    if (!tbody) return;

    orgsState = await API.fetchOrganizations();

    if (orgsCount) orgsCount.textContent = `${orgsState.length} itens`;

    tbody.innerHTML = '';
    orgsState.forEach(org => {
        const tr = document.createElement('tr');
        if (org.isActive === false) tr.style.opacity = '0.5';
        tr.innerHTML = `
            <td>${org.name}${org.isPlatform ? ' <span class="tag">Plataforma</span>' : ''}</td>
            <td>${org.userCount}</td>
            <td>${org.isActive === false ? 'Desativada' : 'Ativa'}</td>
            <td>${new Date(org.createdAt).toLocaleDateString('pt-BR')}</td>
            <td>
                <button class="btn btn-outline org-edit-btn" data-id="${org.id}" title="Editar"><i data-lucide="pencil"></i></button>
                ${org.isPlatform || org.isActive === false ? '' : `<button class="btn btn-outline org-deactivate-btn" data-id="${org.id}" title="Desativar"><i data-lucide="building-2"></i></button>`}
            </td>`;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('.org-edit-btn').forEach(btn =>
        btn.addEventListener('click', () =>
            openOrgForm(orgsState.find(o => String(o.id) === btn.dataset.id))));

    tbody.querySelectorAll('.org-deactivate-btn').forEach(btn =>
        btn.addEventListener('click', async () => {
            const org = orgsState.find(o => String(o.id) === btn.dataset.id);
            if (!confirm(`Desativar ${org.name}? Ninguém vinculado a ela conseguirá logar.`)) return;
            try {
                await API.deactivateOrganization(org.id);
                await renderOrgsTable();
            } catch (error) {
                alert(traduzErro(error));
            }
        }));
}

function openOrgForm(org = null) {
    document.getElementById('orgFormTitle').textContent = org ? `Editar: ${org.name}` : 'Nova organização';
    document.getElementById('orgFormId').value = org ? org.id : '';
    document.getElementById('orgFormName').value = org ? org.name : '';

    // Admin inicial só faz sentido na criação — editar organização não mexe em usuários.
    adminFields.forEach(field => { field.style.display = org ? 'none' : ''; });
    document.getElementById('orgFormAdminName').value = '';
    document.getElementById('orgFormAdminEmail').value = '';
    document.getElementById('orgFormAdminPassword').value = '';

    orgModal.style.display = 'flex';
    document.getElementById('orgFormName').focus();
}

function closeOrgForm() {
    orgModal.style.display = 'none';
}

function traduzErro(error) {
    const friendly = {
        name_required: 'Nome da organização é obrigatório.',
        name_taken: 'Já existe uma organização com esse nome.',
        admin_name_required: 'Nome do admin inicial é obrigatório.',
        admin_password_required: 'Senha do admin inicial é obrigatória.',
        admin_email_invalid: 'Email do admin inicial é inválido.',
        admin_email_taken: 'Este email já está em uso por outro usuário.',
        cannot_deactivate_platform: 'A organização-plataforma não pode ser desativada.',
        not_found: 'Organização não encontrada.'
    };
    return friendly[error.message] || `Erro: ${error.message}`;
}

document.getElementById('orgNewBtn')?.addEventListener('click', () => openOrgForm());
orgModal?.querySelectorAll('.close-btn, .close-modal').forEach(btn =>
    btn.addEventListener('click', closeOrgForm));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && orgModal.style.display === 'flex') closeOrgForm();
});

orgForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('orgFormId').value;
    const name = document.getElementById('orgFormName').value.trim();

    try {
        if (id) {
            await API.updateOrganization(id, { name });
        } else {
            await API.createOrganization({
                name,
                adminName: document.getElementById('orgFormAdminName').value.trim(),
                adminEmail: document.getElementById('orgFormAdminEmail').value.trim(),
                adminPassword: document.getElementById('orgFormAdminPassword').value
            });
        }
        closeOrgForm();
        await renderOrgsTable();
    } catch (error) {
        alert(traduzErro(error));
    }
});

renderOrgsTable();
