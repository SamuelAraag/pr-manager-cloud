// Gestão de Tenants (Épico 9 §12.1) — rota administrativa do PlatformAdmin (tenants.html).
// PlatformAdmin/TenantAdmin não são mais claim do JWT: a guarda de rota precisa de uma
// checagem fresca (GET /api/Users/me), diferente do padrão síncrono de usersAdmin.js.
import * as API from './apiService.js';
import * as AuthService from './authService.js';
import * as LocalStorage from './localStorageService.js';
import * as DOM from './domService.js';
import { initializeTheme } from './themeService.js';

initializeTheme('themeToggleBtn');

const tenantModal = document.getElementById('tenantModal');
const tenantForm = document.getElementById('tenantForm');
const approveModal = document.getElementById('approveModal');
const approveForm = document.getElementById('approveForm');

let tenantsState = [];
let invitationsState = [];

function traduzErro(error) {
    const friendly = {
        name_required: 'Nome do tenant é obrigatório.',
        name_taken: 'Já existe um tenant com esse nome.',
        admin_name_required: 'Nome do administrador é obrigatório.',
        admin_password_required: 'Senha inicial do administrador é obrigatória.',
        admin_email_invalid: 'Email do administrador é inválido.',
        admin_email_taken: 'Este email já está em uso por outro usuário.',
        status_invalid: 'Status inválido.',
        tenant_archived: 'Tenant arquivado não pode ser reativado por aqui.',
        not_found: 'Registro não encontrado.',
        invitation_not_pending: 'Este convite já foi revisado.',
        invitation_not_removable: 'Só é possível remover convites pendentes ou rejeitados.',
    };
    return friendly[error.message] || `Erro: ${error.message}`;
}

async function renderTenantsTable() {
    const tbody = document.getElementById('tenantsTableBody');
    if (!tbody) return;

    tenantsState = await API.fetchTenants();
    document.getElementById('tenantsCount').textContent = `${tenantsState.length} itens`;

    tbody.innerHTML = '';
    tenantsState.forEach(tenant => {
        const tr = document.createElement('tr');
        if (tenant.status !== 'Active') tr.style.opacity = '0.7';
        tr.innerHTML = `
            <td>${tenant.name}</td>
            <td>${tenant.slug || '—'}</td>
            <td>${statusBadge(tenant.status)}</td>
            <td>${tenant.userCount}</td>
            <td>
                <div style="display: flex; gap: 6px; flex-wrap: nowrap;">
                    <button class="btn btn-outline tenant-edit-btn" data-id="${tenant.id}" title="Editar"><i data-lucide="pencil"></i></button>
                    ${renderStatusActions(tenant)}
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('.tenant-edit-btn').forEach(btn =>
        btn.addEventListener('click', () => openTenantForm(tenantsState.find(t => t.id === btn.dataset.id))));

    tbody.querySelectorAll('.tenant-status-btn').forEach(btn =>
        btn.addEventListener('click', () => changeTenantStatus(btn.dataset.id, btn.dataset.status)));
}

// .status-badge (ver 11-component-catalog.md) — nunca só cor/texto isolado, sempre com o rótulo.
function statusBadge(status) {
    const config = {
        Active: { label: 'Ativo', bg: 'var(--success-color)' },
        Inactive: { label: 'Inativo', bg: 'var(--warning-color)' },
        Archived: { label: 'Arquivado', bg: 'var(--danger-color)' }
    }[status] || { label: status, bg: 'var(--text-secondary)' };
    return `<span class="status-badge" style="background: ${config.bg}; color: #fff;">${config.label}</span>`;
}

// Archived é definitivo nesta fase (§3.2 do plano) — sem botão de voltar pra Active.
function renderStatusActions(tenant) {
    if (tenant.status === 'Active') {
        return `
            <button class="btn btn-outline tenant-status-btn" data-id="${tenant.id}" data-status="Inactive" title="Inativar"><i data-lucide="pause"></i></button>
            <button class="btn btn-outline tenant-status-btn" data-id="${tenant.id}" data-status="Archived" title="Arquivar"><i data-lucide="archive"></i></button>`;
    }
    if (tenant.status === 'Inactive') {
        return `
            <button class="btn btn-outline tenant-status-btn" data-id="${tenant.id}" data-status="Active" title="Reativar"><i data-lucide="play"></i></button>
            <button class="btn btn-outline tenant-status-btn" data-id="${tenant.id}" data-status="Archived" title="Arquivar"><i data-lucide="archive"></i></button>`;
    }
    return '';
}

async function changeTenantStatus(id, status) {
    const tenant = tenantsState.find(t => t.id === id);
    const label = { Active: 'reativar', Inactive: 'inativar', Archived: 'arquivar (ação definitiva)' }[status];
    const ok = await DOM.confirmDialog(`Deseja ${label} o tenant "${tenant?.name}"?`, 'Alterar status do tenant');
    if (!ok) return;

    try {
        await API.updateTenant(id, { status });
        await renderTenantsTable();
        DOM.showToast('Status do tenant atualizado.');
    } catch (error) {
        DOM.showToast(traduzErro(error), 'error');
    }
}

function openTenantForm(tenant = null) {
    document.getElementById('tenantFormTitle').textContent = tenant ? `Editar: ${tenant.name}` : 'Novo tenant';
    document.getElementById('tenantFormId').value = tenant ? tenant.id : '';
    document.getElementById('tenantFormName').value = tenant ? tenant.name : '';

    // Campos do primeiro admin só fazem sentido na criação (§8.1 do plano). 'contents' (não
    // 'block') pra manter os campos participando do grid de .module-form quando visíveis.
    document.getElementById('tenantFormAdminFields').style.display = tenant ? 'none' : 'contents';
    document.getElementById('tenantFormAdminName').value = '';
    document.getElementById('tenantFormAdminEmail').value = '';
    document.getElementById('tenantFormAdminPassword').value = '';

    document.getElementById('tenantFormStatusField').style.display = tenant ? 'flex' : 'none';
    document.getElementById('tenantFormStatus').value = tenant ? tenant.status : 'Active';

    tenantModal.style.display = 'flex';
    document.getElementById('tenantFormName').focus();
}

function closeTenantForm() {
    tenantModal.style.display = 'none';
}

tenantForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('tenantFormId').value;

    try {
        if (id) {
            await API.updateTenant(id, {
                name: document.getElementById('tenantFormName').value.trim(),
                status: document.getElementById('tenantFormStatus').value,
            });
        } else {
            await API.createTenant({
                name: document.getElementById('tenantFormName').value.trim(),
                adminName: document.getElementById('tenantFormAdminName').value.trim(),
                adminEmail: document.getElementById('tenantFormAdminEmail').value.trim(),
                adminPassword: document.getElementById('tenantFormAdminPassword').value,
            });
        }
        closeTenantForm();
        await renderTenantsTable();
        DOM.showToast('Tenant salvo com sucesso.');
    } catch (error) {
        DOM.showToast(traduzErro(error), 'error');
    }
});

document.getElementById('tenantNewBtn')?.addEventListener('click', () => openTenantForm());
tenantModal?.querySelectorAll('.close-btn, .close-modal').forEach(btn => btn.addEventListener('click', closeTenantForm));

// ── Convites pendentes (§8.3/§8.4 do plano — só PlatformAdmin aprova/rejeita/remove) ──────

async function renderInvitationsTable() {
    const tbody = document.getElementById('invitationsTableBody');
    if (!tbody) return;

    invitationsState = await API.fetchPendingInvitations();
    document.getElementById('invitationsCount').textContent = `${invitationsState.length} itens`;

    tbody.innerHTML = '';
    if (invitationsState.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-secondary); padding: 1.5rem;">Nenhum convite pendente.</td></tr>`;
        return;
    }

    invitationsState.forEach(inv => {
        const tenant = tenantsState.find(t => t.id === inv.tenantId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${tenant?.name || inv.tenantId}</td>
            <td>${inv.email}</td>
            <td>${inv.requestedTenantRole === 'TenantAdmin' ? 'Administrador' : 'Membro'}</td>
            <td>${new Date(inv.createdAt).toLocaleDateString('pt-BR')}</td>
            <td>
                <div style="display: flex; gap: 6px; flex-wrap: nowrap;">
                    <button class="btn btn-primary invitation-approve-btn" data-id="${inv.id}" title="Aprovar">Aprovar</button>
                    <button class="btn btn-outline invitation-reject-btn" data-id="${inv.id}" title="Rejeitar">Rejeitar</button>
                    <button class="btn btn-outline invitation-remove-btn" data-id="${inv.id}" title="Remover"><i data-lucide="trash-2"></i></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
    if (window.lucide) lucide.createIcons();

    tbody.querySelectorAll('.invitation-approve-btn').forEach(btn =>
        btn.addEventListener('click', () => openApproveForm(btn.dataset.id)));

    tbody.querySelectorAll('.invitation-reject-btn').forEach(btn =>
        btn.addEventListener('click', async () => {
            const ok = await DOM.confirmDialog('Rejeitar este convite?', 'Rejeitar convite');
            if (!ok) return;
            try {
                await API.rejectInvitation(btn.dataset.id);
                await renderInvitationsTable();
                DOM.showToast('Convite rejeitado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
            }
        }));

    tbody.querySelectorAll('.invitation-remove-btn').forEach(btn =>
        btn.addEventListener('click', async () => {
            const ok = await DOM.confirmDialog('Remover este convite? Essa ação não pode ser desfeita.', 'Remover convite');
            if (!ok) return;
            try {
                await API.removeInvitation(btn.dataset.id);
                await renderInvitationsTable();
                DOM.showToast('Convite removido.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
            }
        }));
}

function openApproveForm(invitationId) {
    document.getElementById('approveFormId').value = invitationId;
    document.getElementById('approveFormPassword').value = '';
    approveModal.style.display = 'flex';
}

function closeApproveForm() {
    approveModal.style.display = 'none';
}

approveForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('approveFormId').value;
    const password = document.getElementById('approveFormPassword').value;

    try {
        await API.approveInvitation(id, password ? { initialPassword: password } : {});
        closeApproveForm();
        await renderInvitationsTable();
        DOM.showToast('Convite aprovado.');
    } catch (error) {
        DOM.showToast(traduzErro(error), 'error');
    }
});

approveModal?.querySelectorAll('.close-btn, .close-modal').forEach(btn => btn.addEventListener('click', closeApproveForm));

async function boot() {
    LocalStorage.init?.();
    if (!LocalStorage.getItem('token')) {
        window.location.href = 'index.html';
        return;
    }

    // Guarda de acesso: rota é só de PlatformAdmin. O backend (policy RequirePlatformAdmin)
    // é a fonte de verdade — isto só evita renderizar a tela pra quem não deveria vê-la.
    const me = await AuthService.refreshMe();
    if (!me || !me.isPlatformAdmin) {
        window.location.href = 'index.html';
        return;
    }

    await renderTenantsTable();
    await renderInvitationsTable();
}

boot();
