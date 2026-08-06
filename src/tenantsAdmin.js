// Gestão de Tenants (Épico 9 §12.1) — rota administrativa do PlatformAdmin (tenants.html).
// PlatformAdmin/TenantAdmin não são mais claim do JWT: a guarda de rota precisa de uma
// checagem fresca (GET /api/Users/me), diferente do padrão síncrono de usersAdmin.js.
import * as API from './apiService.js';
import * as AuthService from './authService.js';
import * as LocalStorage from './localStorageService.js';
import * as DOM from './domService.js';
import { initializeTheme } from './themeService.js';

initializeTheme('themeToggleBtn');
DOM.enableEscapeToCloseModals();

const tenantModal = document.getElementById('tenantModal');
const tenantForm = document.getElementById('tenantForm');
const approveModal = document.getElementById('approveModal');
const approveForm = document.getElementById('approveForm');

let tenantsState = [];
let invitationsState = [];
let usersState = [];
let usersLoaded = false;
let adminUsuarioEncontrado = null;
let membrosSelecionados = new Set();
let editingTenantId = null;
let editMembersState = [];

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
        tenant_not_found: 'Tenant não encontrado.',
        user_not_found: 'Usuário não encontrado.',
        member_exists: 'Este usuário já é membro ativo deste tenant.',
        role_invalid: 'Papel inválido.',
        last_tenant_admin: 'Não é possível remover/rebaixar o último administrador ativo do tenant.',
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

// Busca por e-mail no formulário de "Novo tenant": se já existir um usuário com esse e-mail,
// vincula ele direto como TenantAdmin (o backend já aceita isso — ver TenantService.CreateAsync)
// em vez de pedir nome/senha pra criar conta duplicada.
async function ensureUsersLoaded() {
    if (usersLoaded) return;
    usersState = await API.fetchUsers(true);
    usersLoaded = true;
    renderMembersList();
}

function findUserByEmail(email) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    return usersState.find(u => u.email.toLowerCase() === normalized) || null;
}

function atualizarCamposConformeEmail() {
    const email = document.getElementById('tenantFormAdminEmail').value;
    adminUsuarioEncontrado = findUserByEmail(email);

    const note = document.getElementById('tenantFormAdminFoundNote');
    const nameField = document.getElementById('tenantFormAdminNameField');
    const passwordField = document.getElementById('tenantFormAdminPasswordField');

    if (adminUsuarioEncontrado) {
        note.style.display = 'block';
        note.textContent = `Usuário existente encontrado: ${adminUsuarioEncontrado.name} — será vinculado como administrador deste tenant, sem criar conta nova.`;
        nameField.style.display = 'none';
        passwordField.style.display = 'none';
    } else {
        note.style.display = 'none';
        nameField.style.display = '';
        passwordField.style.display = '';
    }

    // O usuário escolhido como primeiro admin não faz sentido aparecer de novo na lista
    // de "outros membros" — ele já vai entrar como TenantAdmin.
    renderMembersList();
}

// Lista de seleção de "outros membros" (opcional, §8.1 do plano — os demais são incluídos
// depois via convite, mas dá pra já trazer gente que já existe na plataforma direto aqui).
// PlatformAdmin não aparece: já é vinculado automaticamente em todo tenant novo.
function renderMembersList() {
    const container = document.getElementById('tenantFormMembersList');
    if (!container) return;

    const filtro = (document.getElementById('tenantFormMembersFilter')?.value || '').trim().toLowerCase();
    const excluirId = adminUsuarioEncontrado?.id;

    const candidatos = usersState
        .filter(u => !u.isPlatformAdmin && u.id !== excluirId)
        .filter(u => !filtro || u.name.toLowerCase().includes(filtro) || u.email.toLowerCase().includes(filtro))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (candidatos.length === 0) {
        container.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.4rem;">Nenhum usuário encontrado.</p>`;
        return;
    }

    container.innerHTML = candidatos.map(u => `
        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.4rem; cursor: pointer;">
            <input type="checkbox" class="tenant-member-checkbox" data-id="${u.id}" ${membrosSelecionados.has(u.id) ? 'checked' : ''} style="width: auto;">
            <span>${u.name} <span style="color: var(--text-secondary); font-size: 0.8rem;">(${u.email})</span></span>
        </label>
    `).join('');

    container.querySelectorAll('.tenant-member-checkbox').forEach(cb =>
        cb.addEventListener('change', () => {
            const id = Number(cb.dataset.id);
            if (cb.checked) membrosSelecionados.add(id);
            else membrosSelecionados.delete(id);
        }));
}

document.getElementById('tenantFormMembersFilter')?.addEventListener('input', renderMembersList);

// ── Membros do tenant sendo editado (vínculo direto, atalho só de PlatformAdmin) ───────────

async function loadEditMembers(tenantId) {
    editMembersState = await API.fetchTenantMemberships(tenantId);
    renderEditMembersTable();
    await ensureUsersLoaded();
    renderEditMembersAddList();
}

function renderEditMembersTable() {
    const container = document.getElementById('tenantEditMembersTable');
    if (!container) return;

    if (editMembersState.length === 0) {
        container.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.4rem;">Nenhum membro ainda.</p>`;
        return;
    }

    container.innerHTML = editMembersState.map(m => `
        <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.4rem; ${m.status !== 'Active' ? 'opacity: 0.6;' : ''}">
            <span style="flex: 1;">${m.userName} <span style="color: var(--text-secondary); font-size: 0.8rem;">(${m.userEmail})</span></span>
            <select class="tenant-edit-member-role" data-id="${m.id}" ${m.status !== 'Active' ? 'disabled' : ''} style="width: auto; min-height: 34px; padding: 0.3rem 1.8rem 0.3rem 0.5rem;">
                <option value="Member" ${m.role === 'Member' ? 'selected' : ''}>Membro</option>
                <option value="TenantAdmin" ${m.role === 'TenantAdmin' ? 'selected' : ''}>Administrador</option>
            </select>
            ${m.status === 'Active'
                ? `<button type="button" class="btn btn-outline tenant-edit-member-deactivate" data-id="${m.id}" title="Inativar"><i data-lucide="user-x"></i></button>`
                : `<button type="button" class="btn btn-outline tenant-edit-member-reactivate" data-id="${m.id}" title="Reativar"><i data-lucide="user-check"></i></button>`}
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();

    container.querySelectorAll('.tenant-edit-member-role').forEach(select =>
        select.addEventListener('change', async () => {
            try {
                await API.updateMembershipRole(select.dataset.id, { role: select.value });
                await loadEditMembers(editingTenantId);
                DOM.showToast('Papel atualizado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
                await loadEditMembers(editingTenantId);
            }
        }));

    container.querySelectorAll('.tenant-edit-member-deactivate').forEach(btn =>
        btn.addEventListener('click', async () => {
            const m = editMembersState.find(x => x.id === btn.dataset.id);
            const ok = await DOM.confirmDialog(`Inativar ${m.userName} neste tenant?`, 'Inativar membro');
            if (!ok) return;
            try {
                await API.deactivateMembership(m.id);
                await loadEditMembers(editingTenantId);
                DOM.showToast('Membro inativado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
            }
        }));

    container.querySelectorAll('.tenant-edit-member-reactivate').forEach(btn =>
        btn.addEventListener('click', async () => {
            try {
                await API.reactivateMembership(btn.dataset.id);
                await loadEditMembers(editingTenantId);
                DOM.showToast('Membro reativado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
            }
        }));
}

function renderEditMembersAddList() {
    const container = document.getElementById('tenantEditMembersAddList');
    if (!container) return;

    const filtro = (document.getElementById('tenantEditMembersFilter')?.value || '').trim().toLowerCase();
    const idsJaMembros = new Set(editMembersState.filter(m => m.status === 'Active').map(m => m.userId));

    const candidatos = usersState
        .filter(u => !idsJaMembros.has(u.id))
        .filter(u => !filtro || u.name.toLowerCase().includes(filtro) || u.email.toLowerCase().includes(filtro))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (candidatos.length === 0) {
        container.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0.4rem;">Nenhum usuário encontrado.</p>`;
        return;
    }

    container.innerHTML = candidatos.map(u => `
        <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.4rem;">
            <span style="flex: 1;">${u.name} <span style="color: var(--text-secondary); font-size: 0.8rem;">(${u.email})</span></span>
            <select class="tenant-edit-member-add-role" data-id="${u.id}" style="width: auto; min-height: 34px; padding: 0.3rem 1.8rem 0.3rem 0.5rem;">
                <option value="Member">Membro</option>
                <option value="TenantAdmin">Administrador</option>
            </select>
            <button type="button" class="btn btn-primary tenant-edit-member-add" data-id="${u.id}" title="Adicionar">Adicionar</button>
        </div>
    `).join('');

    container.querySelectorAll('.tenant-edit-member-add').forEach(btn =>
        btn.addEventListener('click', async () => {
            const userId = Number(btn.dataset.id);
            const role = container.querySelector(`.tenant-edit-member-add-role[data-id="${userId}"]`).value;
            try {
                await API.addTenantMember(editingTenantId, { userId, role });
                await loadEditMembers(editingTenantId);
                DOM.showToast('Membro adicionado.');
            } catch (error) {
                DOM.showToast(traduzErro(error), 'error');
            }
        }));
}

document.getElementById('tenantEditMembersFilter')?.addEventListener('input', renderEditMembersAddList);

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
    adminUsuarioEncontrado = null;
    membrosSelecionados = new Set();
    document.getElementById('tenantFormMembersFilter').value = '';
    atualizarCamposConformeEmail();

    document.getElementById('tenantFormStatusField').style.display = tenant ? 'flex' : 'none';
    document.getElementById('tenantFormStatus').value = tenant ? tenant.status : 'Active';

    // Gestão de membros só faz sentido editando um tenant que já existe.
    editingTenantId = tenant ? tenant.id : null;
    document.getElementById('tenantEditMembersSection').style.display = tenant ? 'contents' : 'none';
    document.getElementById('tenantEditMembersFilter').value = '';
    editMembersState = [];

    tenantModal.style.display = 'flex';
    document.getElementById('tenantFormName').focus();

    if (!tenant) {
        ensureUsersLoaded();
    } else {
        loadEditMembers(tenant.id);
    }
}

function closeTenantForm() {
    tenantModal.style.display = 'none';
}

document.getElementById('tenantFormAdminEmail')?.addEventListener('input', atualizarCamposConformeEmail);

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
                adminEmail: document.getElementById('tenantFormAdminEmail').value.trim(),
                // §2.3 do plano: e-mail já existente vincula sem precisar disso — o backend
                // ignora nome/senha quando encontra o usuário pelo e-mail.
                adminName: adminUsuarioEncontrado ? '' : document.getElementById('tenantFormAdminName').value.trim(),
                adminPassword: adminUsuarioEncontrado ? '' : document.getElementById('tenantFormAdminPassword').value,
                memberUserIds: [...membrosSelecionados],
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
