import * as LocalStorage from './localStorageService.js';
import * as API from './apiService.js';
import * as DOM from './domService.js';
import * as AuthService from './authService.js';
import { GitLabService } from './automationService.js';
import { EffectService } from './effectService.js';
import { CURRENT_VERSION } from './modules/changelog/changelog.data.js';
import { extractJiraId } from './utils.js';
import { connectSignalR } from './notificationService.js';
import { isLocalDev, DEMO_MODE, DEMO_USERS, getDemoProject } from './constants/apiConstants.js';
import { initializeTheme } from './themeService.js';
import { initDateRangePicker } from './dateRangePicker.js';
import * as Form from './formService.js';
import { createTenantOperationGuard } from './tenantOperationGuard.js';
import { findDeveloperById, resolveDeveloperId } from './developerSelection.js';

let currentData = { prs: [], batches: [], sprints: [], apps: [] };
let availableUsers = [];
const tenantOperations = createTenantOperationGuard();

// Filtro por app (Épico 3): apps.html manda para index.html?app=<nome>. O nome na URL só
// resolve o app (abaixo, currentAppId); a listagem de PRs/lotes filtra por AppId (FK), não
// pelo texto de Project — PRs com Project divergente do nome atual do app (rename, dado
// legado) não podem sumir da lista enquanto continuam contados no card da tela Apps.
const appFilter = new URLSearchParams(window.location.search).get('app');
// id do app filtrado (resolvido quando a lista de apps carrega) — chave real do filtro de PRs/lotes
let currentAppId = null;

AuthService.markAuthenticationPending();
initializeTheme('themeToggleBtn');

// Épico 5.3: o <select id="project"> não tem mais lista fixa no HTML — vem inteira da
// API (mesmos apps que a Home de Apps do Épico 3 já lista). Também resolve o papel do
// usuário NO APP filtrado (Épico 4.3, reaproveitando o "myRole" que GET /Apps já calcula).
async function loadProjectOptions(expectedRevision = tenantOperations.snapshot()) {
    const projectSelect = document.getElementById('project');
    const previousValue = projectSelect?.value;

    try {
        const apps = await API.fetchApps();
        if (!tenantOperations.isCurrent(expectedRevision)) return false;
        if (!Array.isArray(apps)) return;
        currentData.apps = apps;

        if (projectSelect) {
            projectSelect.innerHTML = '';
            apps
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(app => {
                    const option = document.createElement('option');
                    option.value = app.name;
                    option.textContent = app.name;
                    projectSelect.appendChild(option);
                });
            if (previousValue && apps.some(a => a.name === previousValue)) {
                projectSelect.value = previousValue;
            }
        }

        updateProjectEmptyState(apps);
        popularFiltroDeApp(apps);

        if (appFilter) {
            const app = apps.find(a => a.name === appFilter);
            AuthService.setCurrentAppRole(app?.myRole ?? null);
            currentAppId = app?.id ?? null; // Épico 7.3: config de automação por app

            // Formulário de PR herda o app filtrado (Épico 5.3): trava a escolha em vez de
            // só pré-selecionar — dentro de um app, o projeto não é mais uma decisão do
            // formulário. Só dá pra fazer isso aqui, com a lista real já carregada.
            if (projectSelect && apps.some(a => a.name === appFilter)) {
                projectSelect.value = appFilter;
                projectSelect.disabled = true;
                projectSelect.title = 'Projeto herdado do app selecionado';
            }

            await carregarEsteiraDoApp();
        } else if (filtros.app) {
            await carregarEsteiraDoApp(filtros.app);
        }
        return true;
    } catch (error) {
        if (!tenantOperations.isCurrent(expectedRevision)) return false;
        console.error('Erro ao carregar lista de apps:', error);
        return false;
    }
}

function updateProjectEmptyState(apps) {
    const hasApps = Array.isArray(apps) && apps.length > 0;
    const emptyState = document.getElementById('projectEmptyState');
    const adminLink = document.getElementById('projectEmptyAdminLink');
    const submitButton = document.getElementById('prSubmitBtn');

    if (emptyState) emptyState.style.display = hasApps ? 'none' : 'block';
    if (adminLink) adminLink.style.display = !hasApps && AuthService.isAdminGlobal() ? 'inline' : 'none';
    if (submitButton) {
        submitButton.dataset.permanentDisabled = hasApps ? 'false' : 'true';
        submitButton.disabled = !hasApps;
    }
}

function applyDevMode() {
    if (!isLocalDev()) return;
    const banner = document.getElementById('devModeBanner');
    const tag    = document.getElementById('devModeTag');
    if (banner) banner.style.display = 'block';
    if (tag)    tag.style.display    = 'inline-block';
}

function applyDemoProjectsToSelect() {
    if (!DEMO_MODE) return;
    const projectSelect = document.getElementById('project');
    if (!projectSelect) return;

    Array.from(projectSelect.options).forEach(option => {
        const demoName = getDemoProject(option.value);
        if (demoName !== option.value) {
            option.textContent = demoName;
        }
    });
}

function populateDeveloperSelect() {
    const developerSelect = document.getElementById('dev');
    if (!developerSelect) return;

    const previousValue = developerSelect.value;
    developerSelect.innerHTML = '<option value="">Selecione um desenvolvedor</option>';

    availableUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = String(user.id);
        option.textContent = user.name;
        developerSelect.appendChild(option);
    });

    developerSelect.value = resolveDeveloperId(availableUsers, previousValue);
}

function setPrCreationRequiredState(isCreate) {
    const fields = ['project', 'dev', 'summary'];
    fields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.required = isCreate;
    });
}

function validatePrForm(isCreate) {
    const project = document.getElementById('project');
    const dev = document.getElementById('dev');
    const summary = document.getElementById('summary');
    const rules = [
        { field: project, validate: Form.isRequired, message: 'Selecione uma aplicação.' },
        { field: dev, validate: value => Boolean(findDeveloperById(availableUsers, value)), message: 'Selecione um desenvolvedor válido da lista.' },
        { field: summary, validate: Form.isRequired, message: 'Informe o resumo do PR.' },
    ];

    return Form.validateFields(rules);
}

function getPrErrorMessage(errorMessage) {
    const friendlyMessages = {
        project_required: 'Projeto é obrigatório.',
        summary_required: 'Resumo é obrigatório.',
        dev_required: 'Desenvolvedor é obrigatório.',
    };

    return friendlyMessages[errorMessage] || errorMessage;
}

const prModal = document.getElementById('prModal');
const setupModal = document.getElementById('setupModal');
const shortcutsModal = document.getElementById('shortcutsModal');
const requestVersionModal = document.getElementById('requestVersionModal');
const requestVersionDevSelect = document.getElementById('requestVersionDevSelect');
const requestVersionModalDescription = document.getElementById('requestVersionModalDescription');
const confirmRequestVersionModalBtn = document.getElementById('confirmRequestVersionModalBtn');
const hotfixModal = document.getElementById('hotfixModal');
const hotfixReasonInput = document.getElementById('hotfixReason');
let pendingHotfixBatchId = null;
const newSprintModal = document.getElementById('newSprintModal');
const newSprintNameInput = document.getElementById('newSprintNameInput');
const newSprintNameError = document.getElementById('newSprintNameError');
const newSprintStartDateInput = document.getElementById('newSprintStartDateInput');
const newSprintEndDateInput = document.getElementById('newSprintEndDateInput');
const confirmNewSprintBtn = document.getElementById('confirmNewSprintBtn');
let modalReturnFocus = null;

function openAccessibleModal(modal, preferredElement = null) {
    if (!modal) return;
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
        const target = preferredElement
            || modal.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)');
        target?.focus({ preventScroll: true });
    });
}

const sprintDateRangePicker = initDateRangePicker({
    fieldEl: document.getElementById('sprintDateRangeField'),
    startInput: newSprintStartDateInput,
    endInput: newSprintEndDateInput,
    calendarBtn: document.getElementById('sprintDateRangeCalendarBtn'),
    popoverEl: document.getElementById('sprintDateRangePopover'),
    prevBtn: document.getElementById('sprintDrPrevMonth'),
    nextBtn: document.getElementById('sprintDrNextMonth'),
    monthLabelEl: document.getElementById('sprintDrMonthLabel'),
    daysGridEl: document.getElementById('sprintDrDaysGrid'),
    summaryStartEl: document.getElementById('sprintDrSummaryStart'),
    summaryEndEl: document.getElementById('sprintDrSummaryEnd'),
    applyBtn: document.getElementById('sprintDrApplyBtn'),
    cancelBtn: document.getElementById('sprintDrCancelBtn'),
    errorEl: document.getElementById('newSprintDateRangeError')
});
const prForm = document.getElementById('prForm');
const profileScreen = document.getElementById('profileScreen');
const loginCancelBtn = document.getElementById('loginCancelBtn');
const currentUserDisplay = document.getElementById('currentUserDisplay');
const currentUserDisplayRight = document.getElementById('currentUserDisplayRight');
const godModeContainer = document.getElementById('godModeContainer');
const godModeInput = document.getElementById('godModeInput');
let pendingVersionRequestContext = null;
Form.prepareForm(prForm);

if (currentUserDisplay) currentUserDisplay.addEventListener('click', showProfileSelection);
if (currentUserDisplayRight) currentUserDisplayRight.addEventListener('click', showProfileSelection);

// Gate de login (pr-manager-cloud#36): enquanto ele está visível, o app atrás não pode ser
// alcançado por Tab, por leitor de tela nem pelos atalhos globais. O overlay é opaco, então
// sem `inert` o dashboard continuava navegável "por baixo" da tela de login.
const appShell = document.querySelector('.container');

function isLoginGateVisible() {
    return !!profileScreen && profileScreen.style.display !== 'none';
}

function hideLoginGate() {
    if (!profileScreen) return;
    profileScreen.style.display = 'none';
    document.body.classList.remove('no-scroll');
    if (appShell) appShell.inert = false;
    if (loginCancelBtn) loginCancelBtn.hidden = true;
    if (LocalStorage.getItem('token')) AuthService.applyRoleBasedVisibility();
}

function showLoginGate() {
    if (!profileScreen) return;
    const podeCancelar = Boolean(LocalStorage.getItem('token') && LocalStorage.getItem('appUser'));
    if (loginCancelBtn) loginCancelBtn.hidden = !podeCancelar;
    profileScreen.style.display = 'flex';
    document.body.classList.add('no-scroll');
    if (appShell) appShell.inert = true;
}

loginCancelBtn?.addEventListener('click', hideLoginGate);

// Click outside to close profile selection if user already selected
if (profileScreen) {
    profileScreen.addEventListener('click', (e) => {
        if (e.target === profileScreen && LocalStorage.getItem('appUser')) {
            hideLoginGate();
        }
    });
}

window.addEventListener('keydown', (e) => {
    // Sem token não há o que atalho nenhum faça: `n`, `q`, `r` e `?` abriam modais e
    // chamavam loadData() por trás do login quando o foco não estava num campo.
    if (isLoginGateVisible()) {
        // Esc só dispensa o gate quando já existe sessão (troca de usuário) — no login
        // inicial ele é bloqueante mesmo, não há para onde voltar.
        if (e.key === 'Escape' && LocalStorage.getItem('appUser')) hideLoginGate();
        return;
    }

    if (e.key === 'Escape') {
        e.preventDefault();
        closeAllModals();
        return;
    }

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            prForm.requestSubmit();
        }
        return;
    }

    const key = e.key.toLowerCase();

    if (key === 'n') {
        e.preventDefault();
        openAddModal();
    } else if (key === 'q') {
        e.preventDefault();
        openSetupModal();
    } else if (key === 'r') {
        e.preventDefault();
        loadData();
    } else if (key === '?' || (e.shiftKey && e.key === '?')) {
        e.preventDefault();
        shortcutsModal.style.display = 'flex';
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'k') {
        e.preventDefault();
        
        const currentUser = LocalStorage.getItem('appUser');
        const previousUser = LocalStorage.getItem('previousUser');
        const existingToken = LocalStorage.getItem('token');

        if (AuthService.isAdmin()) {
            if (previousUser && !AuthService.isAdmin()) {
                LocalStorage.setItem('appUser', previousUser);
                updateUserDisplay(previousUser);
                loadData(true);
                return;
            }
        }

        LocalStorage.setItem('previousUser', currentUser);

        // sessão já é de admin (papel no JWT) → ativa direto, sem pedir senha
        if (existingToken && AuthService.isAdmin()) {
            EffectService.triggerGodMode();
            updateUserDisplay(currentUser);
            loadData(true);
            return;
        }

        // senão, pede a senha de um usuário admin (Épico 2.6: papel substitui a senha secreta)
        godModeInput.value = '';
        godModeInput.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'l') {
        e.preventDefault();
        
        EffectService.triggerScanLine();

        LocalStorage.clearSession();
        
        showProfileSelection();
        DOM.showToast('Deslogando usuário!');
    }
});

if (godModeInput) {
    godModeInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            // Formatos aceitos: "email:senha" (loga outro admin) ou só "senha"
            // (usa o usuário logado). O que ativa o modo é o PAPEL Admin do login.
            const raw = godModeInput.value;
            if (!raw) return;

            let identifier;
            let password;
            const sep = raw.indexOf(':');
            if (sep > 0) {
                identifier = raw.slice(0, sep).trim();
                password = raw.slice(sep + 1);
            } else {
                identifier = LocalStorage.getItem('appUser');
                password = raw;
            }
            if (!identifier || !password) return;

            try {
                DOM.showLoading(true);
                const result = await API.adminLogin(identifier, password);

                if (result && result.user && !(result.user.isAdmin || result.user.role === 'Admin')) {
                    godModeInput.value = '';
                    DOM.showLoading(false);
                    DOM.showToast('Acesso negado: o usuário não é administrador.');
                    return;
                }

                if (result && result.user) {
                    LocalStorage.setItem('appUser', result.user.name);
                    LocalStorage.setItem('appUserId', result.user.id);
                    LocalStorage.setItem('token', result.token);

                    const tenantOk = await ensureTenantContext();
                    if (!tenantOk) { DOM.showLoading(false); return; }

                    EffectService.triggerGodMode();
                    updateUserDisplay(result.user.name);
                    await loadData(true);
                    
                    godModeContainer.style.display = 'none';
                    godModeInput.value = '';
                    
                    // Apply role-based visibility
                    AuthService.applyRoleBasedVisibility();

                    // If login successful, close profile screen if open
                    hideLoginGate();
                }
            } catch (error) {
                DOM.showToast('Senha incorreta!', 'error');
            } finally {
                DOM.showLoading(false);
            }
        }
    });
}

// ── Seleção de tenant (Épico 9 §6) ──────────────────────────────────────────
// Busca a identidade fresca (IsPlatformAdmin/tenant atual/tenants do usuário) e garante que
// currentTenantId em localStorage aponta pra um tenant válido antes de carregar dados —
// toda chamada à API depois disso já sai com o header X-Tenant-Id certo.
async function ensureTenantContext() {
    const session = await AuthService.restoreSession();
    if (session.state === 'unavailable') {
        setDashboardLoadError('A API está temporariamente indisponível. Sua sessão e seus filtros foram preservados.');
        DOM.showLoading(false);
        return false;
    }
    if (session.state === 'unauthenticated') {
        showProfileSelection();
        return false;
    }

    let me = session.me;
    const tenants = me.tenants || [];
    if (session.state === 'no-tenant') {
        document.getElementById('noTenantScreen').style.display = 'flex';
        return false;
    }

    if (session.state === 'tenant-selection-required') {
        const chosenId = await showTenantSelector(tenants);
        me = await AuthService.activateTenant(chosenId);
        if (!me) {
            LocalStorage.clearSession();
            showProfileSelection();
            return false;
        }
    }

    document.getElementById('noTenantScreen').style.display = 'none';
    updateTenantSwitcher();
    return true;
}

function setDashboardLoadError(message = '') {
    const state = document.getElementById('dashboardLoadError');
    const text = document.getElementById('dashboardLoadErrorText');
    if (!state || !text) return;
    state.hidden = !message;
    text.textContent = message;
    if (message && window.lucide) window.lucide.createIcons();
}

document.getElementById('dashboardRetryBtn')?.addEventListener('click', () => window.location.reload());

// dismissValue: tenantId a resolver quando o usuário fecha via Esc/clique fora, sem escolher
// nada. Só faz sentido quando já existe um tenant atual válido (troca voluntária pelo
// tenantSwitchBtn) — na seleção obrigatória do primeiro login (ensureTenantContext) não há
// tenant atual pra cair de volta, então o parâmetro fica de fora e o modal não é dispensável.
function showTenantSelector(tenants, dismissValue = null) {
    return new Promise(resolve => {
        const screen = document.getElementById('tenantSelectScreen');
        const list = document.getElementById('tenantSelectList');
        if (!screen || !list) { resolve(tenants[0].tenantId); return; }

        const finish = (tenantId) => {
            screen.style.display = 'none';
            screen.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeydown);
            resolve(tenantId);
        };

        const onOverlayClick = (e) => {
            if (e.target === screen && dismissValue !== null) finish(dismissValue);
        };
        const onKeydown = (e) => {
            if (e.key === 'Escape' && dismissValue !== null) finish(dismissValue);
        };

        list.innerHTML = '';
        tenants.forEach(t => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-outline';
            btn.style.cssText = 'width:100%; justify-content:space-between; margin-bottom:0.5rem;';
            btn.innerHTML = `<span>${t.tenantName}</span><span style="color: var(--text-secondary); font-size: 0.75rem;">${t.role === 'TenantAdmin' ? 'Administrador' : 'Membro'}</span>`;
            btn.addEventListener('click', () => finish(t.tenantId));
            list.appendChild(btn);
        });

        screen.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeydown);
        screen.style.display = 'flex';
    });
}

function updateTenantSwitcher() {
    const me = AuthService.getMe();
    const btn = document.getElementById('tenantSwitchBtn');
    const label = document.getElementById('currentTenantLabel');
    if (!btn || !label) return;

    const tenants = me?.tenants || [];
    const current = tenants.find(t => t.tenantId === me?.currentTenantId);
    label.textContent = current ? current.tenantName : '';
    // Sempre visível com tenant carregado (era só com mais de um — escondia justamente a
    // informação de "onde estou trabalhando" de quem tem um só). Só some antes do primeiro
    // carregamento de dados, quando ainda não há tenant nenhum pra mostrar.
    btn.style.display = tenants.length > 0 ? 'inline-flex' : 'none';
}

document.getElementById('tenantSwitchBtn')?.addEventListener('click', async () => {
    const me = AuthService.getMe();
    if (!me || !(me.tenants || []).length || tenantOperations.isTransitioning()) return;

    const transitionRevision = tenantOperations.beginTransition();
    const addPrButton = document.getElementById('addPrBtn');
    if (addPrButton) addPrButton.disabled = true;
    closeAllModals();
    try {
        const currentTenantId = LocalStorage.getItem('currentTenantId');
        const chosenId = await showTenantSelector(me.tenants, currentTenantId);
        if (chosenId === currentTenantId) return;

        // Nada da tela pode sobreviver à troca. Os botões renderizados carregam o id do PR no
        // onclick, e ids de PR são GLOBAIS, não por tenant: clicar em aprovar num resto de
        // render do tenant anterior manda um id que o backend não enxerga mais, e volta 404.
        // Esvaziar antes de carregar é preferível a mostrar dado do tenant errado, inclusive
        // se a carga abaixo falhar no meio.
        limparDadosDaTela();

        DOM.showLoading(true);
        const activatedMe = await AuthService.activateTenant(chosenId);
        if (!tenantOperations.isCurrent(transitionRevision)) return;
        if (!activatedMe) throw new Error('Não foi possível ativar o tenant selecionado.');
        updateTenantSwitcher();
        AuthService.applyRoleBasedVisibility();
        await loadProjectOptions(transitionRevision);
        if (!tenantOperations.isCurrent(transitionRevision)) return;
        applyDemoProjectsToSelect();
        await loadData(true, transitionRevision);
        if (!tenantOperations.isCurrent(transitionRevision)) return;
        DOM.showToast('Tenant alterado.');
    } catch (error) {
        console.error('Erro ao trocar tenant:', error);
        DOM.showToast('Não foi possível trocar o tenant.', 'error');
    } finally {
        tenantOperations.endTransition(transitionRevision);
        if (addPrButton) addPrButton.disabled = false;
        DOM.showLoading(false);
    }
});

document.getElementById('noTenantLogoutBtn')?.addEventListener('click', async () => {
    const confirmado = await confirmarLogout();

    if (!confirmado) {
        return;
    }

    document.getElementById('noTenantScreen').style.display = 'none';
    LocalStorage.clearSession();
    showProfileSelection();
});

/** Zera o estado e re-renderiza vazio, para não restar botão apontando para o tenant anterior. */
function limparDadosDaTela() {
    currentData.prs = [];
    currentData.batches = [];
    currentData.sprints = [];
    esteirasPorApp.clear();
    refreshOpenPrs();
    refreshApprovedPrs();
    refreshTestingAndHistory();
}

function closeAllModals() {
    prModal.style.display = 'none';
    Form.resetFormState(prForm);
    if (setupModal) setupModal.style.display = 'none';
    if (shortcutsModal) shortcutsModal.style.display = 'none';
    if (requestVersionModal) requestVersionModal.style.display = 'none';
    if (hotfixModal) hotfixModal.style.display = 'none';
    if (newSprintModal) newSprintModal.style.display = 'none';
    pendingVersionRequestContext = null;
    if (modalReturnFocus?.isConnected) modalReturnFocus.focus({ preventScroll: true });
    modalReturnFocus = null;
    
    if (LocalStorage.getItem('appUser')) {
        hideLoginGate();
    }
}

async function init() {
    LocalStorage.init();
    
    const versionEl = document.getElementById('appVersion');
    if (versionEl) {
        //version as dynamic
        versionEl.textContent = CURRENT_VERSION;
    }

    await loadUsers();
    applyDevMode();
    populateDeveloperSelect();

    if (!LocalStorage.getItem('token')) {
        showProfileSelection();
    } else {
        const tenantOk = await ensureTenantContext();
        if (!tenantOk) return;
        const appUser = LocalStorage.getItem('appUser');
        updateUserDisplay(appUser);
        AuthService.applyRoleBasedVisibility();

        await loadProjectOptions();
        applyDemoProjectsToSelect();
        await loadData();
        DOM.loadPendingToasts();
        connectSignalR();

        // React to real-time SignalR events — update PR sections without re-rendering the whole dashboard
        let _signalRDebounce = null;
        document.addEventListener('signalr:notification', () => {
            clearTimeout(_signalRDebounce);
            _signalRDebounce = setTimeout(() => {
                loadPrTablesData(true).catch((error) => {
                    console.error('Erro ao atualizar tabelas de PR via SignalR:', error);
                });
            }, 500);
        });
    }
}

// Botão de mostrar/esconder a senha no login. É um toggle de verdade: `aria-pressed` reflete
// o estado e a posição do cursor é preservada ao alternar o tipo do campo.
const toggleLoginPasswordBtn = document.getElementById('toggleLoginPassword');

// Depois de um logout com a senha revelada, o campo voltava como type="text" com o olho
// ainda marcado — valor limpo, mas estado inconsistente na próxima entrada.
function resetLoginPasswordToggle() {
    const input = document.getElementById('loginPassword');
    if (input) input.type = 'password';
    if (!toggleLoginPasswordBtn) return;

    toggleLoginPasswordBtn.setAttribute('aria-label', 'Mostrar senha');
    toggleLoginPasswordBtn.setAttribute('title', 'Mostrar senha');
    toggleLoginPasswordBtn.setAttribute('aria-pressed', 'false');
    toggleLoginPasswordBtn.innerHTML = '<i data-lucide="eye"></i>';
    if (window.lucide) lucide.createIcons();
}

if (toggleLoginPasswordBtn) {
    toggleLoginPasswordBtn.addEventListener('click', () => {
        const input = document.getElementById('loginPassword');
        const isHidden = input.type === 'password';
        const selectionStart = input.selectionStart;
        const selectionEnd = input.selectionEnd;
        const hadFocus = document.activeElement === input;

        input.type = isHidden ? 'text' : 'password';

        const label = isHidden ? 'Esconder senha' : 'Mostrar senha';
        toggleLoginPasswordBtn.setAttribute('aria-label', label);
        toggleLoginPasswordBtn.setAttribute('title', label);
        toggleLoginPasswordBtn.setAttribute('aria-pressed', String(isHidden));
        toggleLoginPasswordBtn.innerHTML = `<i data-lucide="${isHidden ? 'eye-off' : 'eye'}"></i>`;
        if (window.lucide) lucide.createIcons();

        if (hadFocus) {
            input.focus();
            input.setSelectionRange(selectionStart, selectionEnd);
        }
    });
}

// Login padrão (usuário/email + senha) — substitui a antiga grade de perfis
const loginForm = document.getElementById('loginForm');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');

// Validação inline (preferencias.md §12) pelo formService, o mesmo do prForm — não uma
// segunda implementação só para esta tela.
const loginIdentifierInput = document.getElementById('loginIdentifier');
const loginPasswordInput = document.getElementById('loginPassword');

Form.prepareForm(loginForm);

function validateLoginFields() {
    return Form.validateFields([
        { field: loginIdentifierInput, validate: Form.isRequired, message: 'Informe seu email ou usuário.' },
        { field: loginPasswordInput, validate: Form.isRequired, message: 'Informe sua senha.' }
    ]);
}

function clearLoginErrors() {
    // resetFormState = limpa erros de campo + libera o submit travado por um envio anterior.
    Form.resetFormState(loginForm);
    setLoginFormError('');
}

// Erro do formulário (credencial recusada, servidor fora). `role="alert"` no markup faz o
// leitor de tela anunciar; antes a mensagem só mudava visualmente.
function setLoginFormError(message) {
    const errorEl = document.getElementById('loginError');
    const textEl = document.getElementById('loginErrorText');
    if (!errorEl || !textEl) return;

    // Revela antes de escrever: em `role="alert"` isso é o que faz o leitor de tela
    // reanunciar quando duas tentativas seguidas dão o mesmo erro.
    errorEl.hidden = !message;
    textEl.textContent = message;
    if (message && window.lucide) lucide.createIcons();
}

// O formService já cuida de `disabled` e `aria-busy`; a camada visual do botão ocupado
// (spinner + rótulo) é o que ele não tem — ver .btn.is-loading no catálogo.
function setLoginSubmitting(submitting) {
    if (!loginSubmitBtn) return;
    loginSubmitBtn.classList.toggle('is-loading', submitting);
    loginSubmitBtn.textContent = submitting ? 'Entrando...' : 'Entrar';
    if (!submitting) loginSubmitBtn.disabled = false;
}

// `prepareForm` limpa o erro ao digitar; validar no blur é exigência do 04-forms.md.
[loginIdentifierInput, loginPasswordInput].forEach((input) => {
    input?.addEventListener('blur', () => {
        if (Form.isRequired(input.value)) return;
        Form.setFieldError(input, input === loginPasswordInput
            ? 'Informe sua senha.'
            : 'Informe seu email ou usuário.');
    });
});

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        setLoginFormError('');

        // Revalida tudo no submit, não só no blur — o usuário pode enviar com Enter sem
        // nunca ter saído do campo. `validateFields` já foca o primeiro inválido.
        if (!validateLoginFields()) return;

        // Guarda de duplo envio: retorna false se já há um submit em andamento.
        if (!Form.beginFormSubmission(loginForm)) return;

        const identifier = document.getElementById('loginIdentifier').value.trim();
        const password = document.getElementById('loginPassword').value;

        try {
            setLoginSubmitting(true);
            const result = await API.login(identifier, password);

            LocalStorage.setItem('appUser', result.user.name);
            LocalStorage.setItem('appUserId', result.user.id);
            LocalStorage.setItem('token', result.token);

            const tenantOk = await ensureTenantContext();
            if (!tenantOk) return;

            if (AuthService.isAdmin()) {
                EffectService.triggerGodMode();
            }

            await loadUsers(); // lista completa (autenticada) para selects/avatares
            updateUserDisplay(result.user.name);
            hideLoginGate();

            document.getElementById('loginPassword').value = '';

            await loadProjectOptions();
            applyDemoProjectsToSelect();
            await loadData(true);

            AuthService.applyRoleBasedVisibility();
            connectSignalR();
        } catch (error) {
            console.error('Erro no login:', error);
            // Credencial recusada e servidor indisponível têm causas e saídas diferentes —
            // antes as duas caíam em "Usuário ou senha inválidos". Não dizemos qual dos dois
            // campos errou, para não permitir enumeração de usuários.
            setLoginFormError(error?.status === 401
                ? 'Email/usuário ou senha incorretos. Verifique e tente novamente.'
                : 'Não foi possível conectar ao servidor. Tente novamente em instantes.');
            // `disabled` tirou o botão da árvore de foco no submit, jogando o foco no body.
            // Devolve para onde o usuário vai corrigir, em vez de obrigá-lo a retabular.
            document.getElementById('loginPassword')?.focus();
        } finally {
            // Sem isto o dataset.submitting fica preso e o botão nunca mais reabilita.
            Form.endFormSubmission(loginForm);
            setLoginSubmitting(false);
        }
    });
}

// Confirmação de logout no modal padrão da página (#confirmDialog), compartilhada pelos dois
// pontos de saída: o botão do header e o "Sair" da tela de "sem tenant".
function confirmarLogout() {
    return DOM.confirmDialog(
        'Tem certeza que deseja deslogar?',
        'Deslogar',
        { confirmLabel: 'Deslogar', danger: true }
    );
}

async function handleLogout() {
    const confirmado = await confirmarLogout();

    if (!confirmado) {
        return;
    }

    LocalStorage.clearSession();
    showProfileSelection();
    
    DOM.showToast('Usuário deslogado!');
}

function showProfileSelection() {
    // tela de login padrão: limpa credenciais e erros antes de exibir
    const passwordInput = document.getElementById('loginPassword');
    if (passwordInput) passwordInput.value = '';
    clearLoginErrors();
    setLoginSubmitting(false);
    resetLoginPasswordToggle();
    // Na troca voluntária o dashboard continua autenticado e pode ser restaurado.
    // O estado pendente só é correto no login inicial ou depois de um logout.
    if (!(LocalStorage.getItem('token') && LocalStorage.getItem('appUser'))) {
        AuthService.markAuthenticationPending();
    }

    showLoginGate();
    document.getElementById('loginIdentifier')?.focus();
}

function updateUserDisplay(userName) {
    const imageSrc = (() => {
        if (DEMO_MODE && DEMO_USERS[userName]) return DEMO_USERS[userName].image;
        const user = availableUsers.find(u => u.name === userName);
        return user?.avatarUrl || 'src/assets/profiles/default-profile.png';
    })();
    const isAdmin = AuthService.isAdmin();

    const updateDisplay = (display) => {
        if (!display) return;
        display.innerHTML = '';
        display.style.background = 'transparent';
        display.style.alignItems = 'normal';
        display.style.justifyContent = 'normal';
        
        display.appendChild(Object.assign(document.createElement('img'), {
            src: imageSrc,
            style: "width: 100%; height: 100%; object-fit: cover; border-radius: 50%; display: block;"
        }));
    };

    updateDisplay(currentUserDisplay);
    updateDisplay(currentUserDisplayRight);

    if (isAdmin) {
        document.documentElement.style.setProperty('--admin-display', 'flex');
        document.documentElement.style.setProperty('--dev-display', 'none');
    } else {
        document.documentElement.style.setProperty('--admin-display', 'none');
        document.documentElement.style.setProperty('--dev-display', 'flex');
    }

    const setupBtn = document.getElementById('setupBtn');
    if (setupBtn) {
        setupBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    const usersBtn = document.getElementById('usersBtn');
    if (usersBtn) {
        usersBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    // Épico 8b: mais restritivo que os outros admin-only — só a organização-plataforma.
    const orgsBtn = document.getElementById('orgsBtn');
    if (orgsBtn) {
        orgsBtn.style.display = AuthService.isPlatformAdmin() ? 'inline-flex' : 'none';
    }
}

function getVersionAssignableUsers() {
    return availableUsers.filter(user => (user.role || '').toLowerCase() === 'dev');
}

async function loadUsers(expectedRevision = tenantOperations.snapshot()) {
    // Issue #34: sem token não há lista de usuários — o endpoint anônimo de perfis foi
    // removido (vazava usuários de todos os tenants) e a tela de login já é e-mail + senha.
    if (!LocalStorage.getItem('token')) return;

    try {
        const users = await API.fetchUsers();
        if (!tenantOperations.isCurrent(expectedRevision)) return false;

        availableUsers = Array.isArray(users) ? users : [];
        populateDeveloperSelect();
        return true;
    } catch (error) {
        if (!tenantOperations.isCurrent(expectedRevision)) return false;
        console.error('Erro ao carregar usuários:', error);
        return false;
    }
}

function populateRequestVersionDevSelect(selectedDevId = '') {
    if (!requestVersionDevSelect) return;

    const assignableUsers = getVersionAssignableUsers();
    requestVersionDevSelect.innerHTML = '<option value="">Selecione um dev</option>';

    assignableUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = String(user.id);
        option.textContent = user.name;
        if (String(selectedDevId) === String(user.id)) {
            option.selected = true;
        }
        requestVersionDevSelect.appendChild(option);
    });
}

function openRequestVersionModal(prIds, projectName) {
    pendingVersionRequestContext = {
        prIds,
        projectName: projectName || 'este projeto'
    };

    const currentUserId = LocalStorage.getItem('appUserId');
    populateRequestVersionDevSelect(currentUserId || '');

    if (requestVersionModalDescription) {
        const total = pendingVersionRequestContext.prIds.length;
        requestVersionModalDescription.textContent = `Selecione o dev que vai preencher a versão, número da release, link do pipeline e rollback do lote "${pendingVersionRequestContext.projectName}" (${total} PR${total === 1 ? '' : 's'}).`;
    }

    if (requestVersionModal) {
        openAccessibleModal(requestVersionModal, requestVersionDevSelect);
    }
}

async function confirmRequestVersionSelection() {
    if (!pendingVersionRequestContext) return;

    const selectedDevId = requestVersionDevSelect?.value;
    if (!selectedDevId) {
        DOM.showToast('Selecione um dev para solicitar a versão.', 'warning');
        requestVersionDevSelect?.focus();
        return;
    }

    const selectedDev = getVersionAssignableUsers()
        .find(user => String(user.id) === String(selectedDevId));

    if (!selectedDev) {
        DOM.showToast('Dev selecionado não encontrado.', 'error');
        return;
    }

    const { prIds, projectName } = pendingVersionRequestContext;

    const confirmed = await DOM.confirmDialog(
        `Empacotar ${prIds.length} PRs aprovados de "${projectName}" e direcionar para ${selectedDev.name}?`,
        'Empacotar PRs',
        { confirmLabel: 'Empacotar PRs' },
    );
    if (!confirmed) {
        return;
    }

    try {
        DOM.showLoading(true);

        const resultado = await API.requestVersionBatch(prIds, selectedDev.id, selectedDev.name);

        if (requestVersionModal) {
            requestVersionModal.style.display = 'none';
        }
        pendingVersionRequestContext = null;

        // O backend pula PR que já tem versão ou já está em outro lote. Sem dizer isso na tela,
        // o lote saía menor do que o pedido e ninguém ficava sabendo.
        const pulados = resultado?.skipped ?? [];
        if (pulados.length > 0) {
            DOM.showToast(
                `Versão solicitada para ${selectedDev.name}, mas ${pulados.length} PR(s) ficaram de fora: `
                + pulados.map(pr => pr.externalId || `#${pr.id}`).join(', '),
                'warning',
            );
        } else {
            DOM.showToast(`Versão solicitada para ${selectedDev.name}!`);
        }
        await loadData(true);
    } catch (error) {
        console.error('Erro ao solicitar versão:', error);
        DOM.showToast('Erro ao solicitar versão: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
    }
}

// Épico 2 (D6): "em voo" — integrado e ainda não entregue. É filtro de consulta, então a
// preferência do usuário vira parâmetro da API, não um estado gravado no PR.
const initialQuery = new URLSearchParams(window.location.search);
let showOnlyInFlight = initialQuery.get('inFlight') !== 'false';

// Esteira do app selecionado. Guardada porque a tela precisa dela em dois lugares: o rótulo
// da seção de validação e o filtro por ambiente.
let esteiraDoApp = [];
const esteirasPorApp = new Map();

const KIND_LABELS = { Dev: 'Desenvolvimento', Stg: 'Staging', Prod: 'Produção' };

/**
 * Carrega a esteira do app e ajusta o que dependia de "STG" fixo.
 *
 * O título da seção anunciava "Versões em Teste (STG)" para qualquer app — mentira num app
 * configurado como dev → prod, que não tem staging. O rótulo passa a nomear o ambiente real
 * onde as versões são validadas: o último degrau versionado ANTES do de produção.
 */
async function carregarEsteira(appId) {
    if (!appId) return [];
    if (esteirasPorApp.has(appId)) return esteirasPorApp.get(appId);
    const envs = await API.fetchEnvironments(appId);
    const esteira = Array.isArray(envs) ? [...envs].sort((a, b) => a.order - b.order) : [];
    esteirasPorApp.set(appId, esteira);
    return esteira;
}

async function carregarEsteiraDoApp(appId = currentAppId || filtros.app) {
    if (!appId) {
        esteiraDoApp = [];
        atualizarRotuloValidacao();
        popularFiltroDeAmbiente();
        return;
    }

    try {
        esteiraDoApp = await carregarEsteira(appId);
    } catch (error) {
        console.error('Erro ao carregar a esteira do app:', error);
        esteiraDoApp = [];
    }

    atualizarRotuloValidacao();
    popularFiltroDeAmbiente();
}

function ambienteDeValidacao() {
    return ambienteDeValidacaoDaEsteira(esteiraDoApp);
}

function ambienteDeValidacaoDaEsteira(esteira) {
    const versionados = esteira.filter(e => e.mode === 'Versioned');
    // O último degrau é produção; o anterior é onde a versão fica em validação.
    return versionados.length >= 2 ? versionados[versionados.length - 2] : null;
}

function atualizarRotuloValidacao() {
    const label = document.getElementById('testingSectionLabel');
    if (!label) return;

    const env = ambienteDeValidacao();
    if (env) {
        label.textContent = `Versões em validação (${KIND_LABELS[env.kind] || env.kind})`;
        return;
    }
    // Esteira sem degrau de validação (ex.: dev → prod) ou nenhum app selecionado: rótulo
    // genérico, em vez de prometer um ambiente que não existe.
    label.textContent = 'Versões em validação';
}

async function loadPrTablesData(animate = false, expectedRevision = tenantOperations.snapshot()) {
    // Busca sempre a lista completa e aplica o "em voo" no cliente, usando o pr.inFlight que a
    // própria API calcula. Dois ganhos: os PRs que chegam dentro de um lote continuam tendo de
    // onde herdar a esteira mesmo depois de entregues, e alternar o filtro deixa de ir na rede.
    const prResult = await API.fetchPRs(false);
    if (!tenantOperations.isCurrent(expectedRevision)) return false;
    if (!prResult || !Array.isArray(prResult.prs)) {
        throw new Error('Falha ao carregar PRs');
    }
    const batches = await API.fetchBatches();
    if (!tenantOperations.isCurrent(expectedRevision)) return false;
    if (!Array.isArray(batches)) {
        throw new Error('Falha ao carregar lotes');
    }

    currentData.prs = appFilter
        ? prResult.prs.filter(p => p.appId === currentAppId)
        : prResult.prs;
    currentData.batches = appFilter
        ? batches.filter(b => b.appId === currentAppId)
        : batches;
    const appIds = [...new Set([
        ...currentData.prs.map(pr => pr.appId),
        ...currentData.batches.map(batch => batch.appId),
    ].filter(Boolean))];
    await Promise.all(appIds.map(appId => carregarEsteira(appId).catch(error => {
        console.error(`Erro ao carregar a esteira do app ${appId}:`, error);
        return [];
    })));
    refreshOpenPrs(animate);
    refreshApprovedPrs(animate);
    return true;
}

function refreshTestingAndHistory(animate = false) {
    if (!Array.isArray(currentData.sprints)) return;

    const batchEstaEmValidacao = batch => {
        if (!esteirasPorApp.has(batch.appId)) return batch.status === 'Deployed';
        const validationEnv = ambienteDeValidacaoDaEsteira(esteirasPorApp.get(batch.appId) || []);
        // Cuidado: os dois DTOs usam "batchId" para coisas diferentes. No deployment é a chave
        // numérica (VersionBatch.Id); no lote é o identificador em texto ("batch_638..."). Comparar
        // os dois campos de mesmo nome nunca dá verdadeiro, e a seção ficava sempre vazia.
        return validationEnv?.current?.batchId === batch.id;
    };

    const filtrarSprint = (sprint, isActive) => {
        if (filtros.sprint && filtros.sprint !== '__sem__' && sprint.name !== filtros.sprint) return null;
        if (filtros.sprint === '__sem__') return null;
        const versionBatches = (sprint.versionBatches || []).map(batch => ({
            ...batch,
            pullRequests: aplicarFiltros((batch.pullRequests || []).map(pr => ({
                ...pr,
                sprint: pr.sprint || sprint.name,
            }))),
        })).filter(batch => {
            if (batch.pullRequests.length === 0 && temFiltrosAtivos()) return false;
            if (!isActive) return true;
            return batchEstaEmValidacao(batch);
        });
        return { ...sprint, versionBatches };
    };
    const activeSprints = currentData.sprints.filter(s => s.isActive).map(s => filtrarSprint(s, true)).filter(Boolean);
    const inactiveSprints = currentData.sprints.filter(s => !s.isActive).map(s => filtrarSprint(s, false)).filter(Boolean);
    if (!filtros.sprint || filtros.sprint === '__sem__') {
        const noSprintBatches = currentData.batches
            .filter(batch => !batch.sprintId && batchEstaEmValidacao(batch))
            .map(batch => ({
                ...batch,
                pullRequests: aplicarFiltros((batch.pullRequests || []).map(pr => ({ ...pr, sprint: '' }))),
            }))
            .filter(batch => batch.pullRequests.length > 0);
        if (noSprintBatches.length > 0) {
            activeSprints.push({ id: 'without-sprint', name: 'Sem sprint', canComplete: false, versionBatches: noSprintBatches });
        }
    }
    DOM.renderTestingTable(activeSprints, 'dashboardTesting', openEditModal, animate);
    DOM.renderHistoryTable(inactiveSprints, 'dashboardHistory', openEditModal, animate);
    if (temFiltrosAtivos()) {
        const hasTestingResults = activeSprints.some(sprint =>
            (sprint.versionBatches || []).some(batch => batch.pullRequests.length > 0));
        const hasHistoryResults = inactiveSprints.some(sprint =>
            (sprint.versionBatches || []).some(batch => batch.pullRequests.length > 0));
        if (!hasTestingResults) renderFilteredEmpty('dashboardTesting');
        if (!hasHistoryResults) renderFilteredEmpty('dashboardHistory');
    }
    if (window.lucide) window.lucide.createIcons();
    if (AuthService && AuthService.applyRoleBasedVisibility) AuthService.applyRoleBasedVisibility();
}

async function loadData(skipLoading = false, expectedRevision = tenantOperations.snapshot()) {
    const token = LocalStorage.getItem('token');
    const appUser = LocalStorage.getItem('appUser');
    
    if (!token || !appUser) {
        return;
    }
    
    try {
        await loadUsers(expectedRevision);
        if (!tenantOperations.isCurrent(expectedRevision)) return;

        // Sequential boot: open PRs first, then approved PRs
        await loadPrTablesData(false, expectedRevision);
        if (!tenantOperations.isCurrent(expectedRevision)) return;

        const sprints = await API.fetchSprints();
        if (!tenantOperations.isCurrent(expectedRevision)) return;
        if (!Array.isArray(sprints)) {
            throw new Error('Falha ao carregar sprints');
        }
        currentData.sprints = sprints;
        refreshTestingAndHistory(false);
        setDashboardLoadError('');
    } catch (error) {
        if (!tenantOperations.isCurrent(expectedRevision)) return;
        console.error('Erro ao carregar dados:', error);
        setDashboardLoadError('A API não respondeu. Os dados que já estavam na tela foram mantidos.');
        DOM.showToast('Erro ao carregar dados da API', 'error');
    } finally {
        if (!skipLoading && tenantOperations.isCurrent(expectedRevision)) {
            DOM.showLoading(false);
        }
    }
}

// ── Filtros da esteira (Épico 2, 3.4) ──────────────────────────────────────
// App, status, ambiente e sprint. Aplicados no cliente sobre a lista já carregada; o único
// filtro que vive na API é o "em voo", porque ele depende de presença e de deployment ativo
// no último degrau, que o cliente não tem como calcular.

const filtros = {
    app: initialQuery.get('filterApp') || '',
    status: initialQuery.get('status') || '',
    environment: initialQuery.get('environment') || '',
    sprint: initialQuery.get('sprint') || '',
};

function temFiltrosAtivos() {
    return Object.values(filtros).some(Boolean);
}

function atualizarPainelFiltros() {
    const label = document.getElementById('filterPanelLabel');
    if (!label) return;
    const total = Object.values(filtros).filter(Boolean).length;
    label.textContent = total > 0 ? `Filtros (${total})` : 'Filtros';
}

function persistirFiltrosNaUrl() {
    const query = new URLSearchParams(window.location.search);
    const chaves = { app: 'filterApp', status: 'status', environment: 'environment', sprint: 'sprint' };
    Object.entries(chaves).forEach(([campo, parametro]) => {
        if (filtros[campo]) query.set(parametro, filtros[campo]);
        else query.delete(parametro);
    });
    query.set('inFlight', String(showOnlyInFlight));
    history.replaceState(null, '', `${window.location.pathname}?${query.toString()}`);
    atualizarPainelFiltros();
}

function renderFilteredEmpty(containerId, tableBody = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const content = '<div class="empty-state"><span>Nenhum resultado para os filtros selecionados.</span><button class="btn btn-outline btn-sm clear-inline-filters" type="button">Limpar filtros</button></div>';
    container.innerHTML = tableBody ? `<tr><td colspan="7">${content}</td></tr>` : content;
    container.querySelector('.clear-inline-filters')?.addEventListener('click', limparFiltros);
}

async function limparFiltros() {
    Object.keys(filtros).forEach(chave => { filtros[chave] = ''; });
    ['filterApp', 'filterStatus', 'filterEnvironment', 'filterSprint'].forEach(id => {
        const select = document.getElementById(id);
        if (select) select.value = '';
    });
    await carregarEsteiraDoApp(currentAppId);
    persistirFiltrosNaUrl();
    refreshOpenPrs(true);
    refreshApprovedPrs(true);
    refreshTestingAndHistory(true);
}

function popularFiltroDeApp(apps) {
    const select = document.getElementById('filterApp');
    if (!select) return;

    const anterior = filtros.app || select.value;
    select.innerHTML = '<option value="">Todos</option>';
    apps.forEach(app => {
        const option = document.createElement('option');
        option.value = app.id;
        option.textContent = app.name;
        select.appendChild(option);
    });
    select.value = anterior;

    // Dentro de um app (?app=), a lista já está restrita — o filtro só confundiria.
    const wrapper = select.closest('.esteira-filters__field');
    if (wrapper) wrapper.style.display = appFilter ? 'none' : '';
}

function popularFiltroDeAmbiente() {
    const select = document.getElementById('filterEnvironment');
    if (!select) return;

    const anterior = filtros.environment || select.value;
    select.innerHTML = esteiraDoApp.length > 0
        ? '<option value="">Todos</option>'
        : '<option value="">Selecione um app primeiro</option>';
    select.disabled = esteiraDoApp.length === 0;
    esteiraDoApp.forEach(env => {
        const option = document.createElement('option');
        option.value = env.kind;
        option.textContent = KIND_LABELS[env.kind] || env.kind;
        select.appendChild(option);
    });
    select.value = anterior;

    // Sem app selecionado não há uma esteira única: cada app tem a sua, e um filtro
    // "dev/stg/prod" fixo seria exatamente o acoplamento que o épico removeu.
    const wrapper = select.closest('.esteira-filters__field');
    if (wrapper) wrapper.style.display = '';
}

function popularFiltroDeSprint() {
    const select = document.getElementById('filterSprint');
    if (!select) return;

    const anterior = filtros.sprint || select.value;
    const sprints = [...new Set(currentData.prs.map(p => p.sprint).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Todas</option><option value="__sem__">Sem sprint</option>';
    sprints.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        select.appendChild(option);
    });
    select.value = anterior;
}

function statusDoPr(pr) {
    if (pr.needsCorrection) return 'ajustes';
    if (pr.version || pr.versionBatchRefId) return 'versionado';
    if (pr.approved) return 'aprovado';
    return 'revisao';
}

function aplicarFiltros(prs) {
    return prs.filter(pr => {
        if (filtros.app && pr.appId !== filtros.app) return false;
        if (filtros.status && statusDoPr(pr) !== filtros.status) return false;
        if (filtros.sprint === '__sem__' && pr.sprint) return false;
        if (filtros.sprint && filtros.sprint !== '__sem__' && pr.sprint !== filtros.sprint) return false;
        if (filtros.environment) {
            const slot = (pr.environments || []).find(e => e.kind === filtros.environment);
            if (!slot?.present) return false;
        }
        return true;
    });
}

function proximoAmbienteDoLote(batch) {
    const esteira = esteirasPorApp.get(batch.appId) || [];
    const versionados = esteira.filter(env => env.mode === 'Versioned');
    if (versionados.length === 0) return null;

    // Mesma armadilha de nome descrita em refreshTestingAndHistory: o "batchId" do deployment é
    // a chave numérica (VersionBatch.Id) e o do lote é o texto "batch_638...". Comparar os dois
    // campos homônimos nunca dá verdadeiro, então o índice do último ambiente implantado ficava
    // em -1 e o "próximo" era sempre o primeiro degrau: o botão repetia "Implantar em Staging" e
    // produção ficava inalcançável pelo Dashboard.
    if (batch.isHotfix) {
        const ultimo = versionados[versionados.length - 1];
        if (ultimo.current?.batchId === batch.id) return null;
        return { kind: ultimo.kind, label: KIND_LABELS[ultimo.kind] || ultimo.kind };
    }

    const ultimoIndiceImplantado = versionados.reduce((maior, env, indice) =>
        env.current?.batchId === batch.id ? indice : maior, -1);
    const proximo = versionados[ultimoIndiceImplantado + 1];
    return proximo ? { kind: proximo.kind, label: KIND_LABELS[proximo.kind] || proximo.kind } : null;
}

['filterApp', 'filterStatus', 'filterEnvironment', 'filterSprint'].forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.addEventListener('change', async (event) => {
        filtros[id.replace('filter', '').toLowerCase()] = event.target.value;
        if (id === 'filterApp') {
            filtros.environment = '';
            await carregarEsteiraDoApp(filtros.app);
        }
        persistirFiltrosNaUrl();
        refreshOpenPrs(true);
        refreshApprovedPrs(true);
        refreshTestingAndHistory(true);
    });
});

const initialStatusFilter = document.getElementById('filterStatus');
if (initialStatusFilter) initialStatusFilter.value = filtros.status;
const initialInFlightToggle = document.getElementById('inFlightToggle');
if (initialInFlightToggle) initialInFlightToggle.checked = showOnlyInFlight;
const filterPanel = document.getElementById('filterPanel');
if (filterPanel && window.matchMedia('(max-width: 640px)').matches) filterPanel.removeAttribute('open');
atualizarPainelFiltros();

const filterClearBtn = document.getElementById('filterClearBtn');
if (filterClearBtn) {
    filterClearBtn.addEventListener('click', limparFiltros);
}

// ── Vínculos genéricos do PR (Épico 2, 2.8) ────────────────────────────────
// Substituem, na prática, os três campos fixos (Link PR / Link Task / Post Teams): aqui
// cabe qualquer tipo, sem limite, e cada item é removível. Os campos antigos seguem no
// formulário até a migração de dados que os remove, fora do escopo deste épico.

const LINK_KIND_LABELS = {
    Task: 'Task',
    Pr: 'Pull Request',
    Communication: 'Comunicação',
    Pipeline: 'Pipeline',
    Other: 'Outro',
};

let prLinksPr = null;
let draftPrLinks = [];

function renderPrLinks(links) {
    const lista = document.getElementById('prLinksList');
    if (!lista) return;

    lista.innerHTML = '';
    if (!links || links.length === 0) {
        const vazio = document.createElement('li');
        vazio.className = 'pipeline-empty';
        vazio.textContent = 'Nenhum vínculo.';
        lista.appendChild(vazio);
        return;
    }

    links.forEach(link => {
        const item = document.createElement('li');
        item.className = 'link-item';

        const kind = document.createElement('span');
        kind.className = 'link-item__kind';
        kind.textContent = LINK_KIND_LABELS[link.kind] || link.kind;

        // textContent, nunca innerHTML: a URL vem da API e pode ter sido digitada por qualquer um.
        const anchor = document.createElement('a');
        anchor.className = 'link-item__url';
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = link.label || link.url;
        anchor.title = link.url;

        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'btn btn-outline btn-sm';
        remover.textContent = 'Remover';
        remover.addEventListener('click', async () => {
            if (!prLinksPr) {
                draftPrLinks = draftPrLinks.filter(item => item.clientId !== link.clientId);
                renderPrLinks(draftPrLinks);
                return;
            }

            remover.disabled = true;
            try {
                await API.removePrLink(prLinksPr.appId, prLinksPr.id, link.id);
                prLinksPr.links = (prLinksPr.links || []).filter(l => l.id !== link.id);
                renderPrLinks(prLinksPr.links);
                DOM.showToast('Vínculo removido.', 'success');
            } catch (error) {
                remover.disabled = false;
                DOM.showToast(error?.message || 'Não foi possível remover o vínculo.', 'error');
            }
        });

        item.append(kind, anchor, remover);
        lista.appendChild(item);
    });
}

const prLinkAddBtn = document.getElementById('prLinkAddBtn');
if (prLinkAddBtn) {
    prLinkAddBtn.addEventListener('click', async () => {
        const urlInput = document.getElementById('prLinkUrl');
        const labelInput = document.getElementById('prLinkLabel');
        const erro = document.getElementById('prLinkUrlError');
        const url = urlInput.value.trim();

        const limparErro = () => {
            urlInput.classList.remove('is-invalid');
            erro.textContent = '';
            erro.classList.remove('visible');
        };
        const marcarErro = (mensagem) => {
            urlInput.classList.add('is-invalid');
            erro.textContent = mensagem;
            erro.classList.add('visible'); // .field-error nasce display:none
        };

        if (!url) return marcarErro('Informe o endereço do vínculo.');
        if (url.length > 1000) return marcarErro('O endereço passa de 1000 caracteres.');
        if (!Form.isOptionalUrl(url)) return marcarErro('Informe um endereço HTTP ou HTTPS válido.');
        limparErro();

        const novoVinculo = {
            kind: document.getElementById('prLinkKind').value,
            url,
            label: labelInput.value.trim() || null,
        };

        if (!prLinksPr) {
            draftPrLinks = [...draftPrLinks, { ...novoVinculo, clientId: crypto.randomUUID() }];
            renderPrLinks(draftPrLinks);
            urlInput.value = '';
            labelInput.value = '';
            return;
        }

        try {
            const criado = await API.addPrLink(prLinksPr.appId, prLinksPr.id, novoVinculo);
            prLinksPr.links = [...(prLinksPr.links || []), criado];
            renderPrLinks(prLinksPr.links);
            urlInput.value = '';
            labelInput.value = '';
            DOM.showToast('Vínculo adicionado.', 'success');
        } catch (error) {
            marcarErro(error?.message || 'Não foi possível adicionar o vínculo.');
        }
    });

    document.getElementById('prLinkUrl').addEventListener('input', () => {
        document.getElementById('prLinkUrl').classList.remove('is-invalid');
        const erro = document.getElementById('prLinkUrlError');
        erro.textContent = '';
        erro.classList.remove('visible');
    });
}

const emVoo = pr => !showOnlyInFlight || pr.inFlight !== false;

function refreshOpenPrs(animate = false) {
    popularFiltroDeSprint();
    // "em voo" agora é filtro de cliente sobre o pr.inFlight que a API já devolve.
    const openPrs = aplicarFiltros(currentData.prs.filter(p => !p.approved && emVoo(p)));
    const totalOpenBadge = document.getElementById('totalOpenPrs');
    if (totalOpenBadge) {
        totalOpenBadge.textContent = openPrs.length;
        totalOpenBadge.style.display = openPrs.length > 0 ? 'inline-block' : 'none';
    }
    DOM.renderOpenTable(openPrs, 'openPrTableBody', openEditModal, animate);
    if (temFiltrosAtivos() && openPrs.length === 0) renderFilteredEmpty('openPrTableBody', true);
    if (window.lucide) window.lucide.createIcons();
    if (AuthService && AuthService.applyRoleBasedVisibility) AuthService.applyRoleBasedVisibility();
}

// Espelha a regra do card de backlog em renderApprovedTables: aprovado, ainda não entregue, em
// voo, dentro dos filtros ativos e fora de qualquer lote. Casa por appId, e não pelo nome exibido,
// porque é o appId que o backend usa para montar o lote.
function prsElegiveisParaCorte(appId) {
    const idsEmLote = new Set((currentData.batches || [])
        .flatMap(batch => (batch.pullRequests || []).map(pr => pr.id)));
    return aplicarFiltros((currentData.prs || []).filter(pr =>
        pr.appId === appId && pr.approved && !pr.deployedToStg && emVoo(pr) && !idsEmLote.has(pr.id)));
}

function refreshApprovedPrs(animate = false) {
    if (!Array.isArray(currentData.batches)) return;

    const approvedPending = aplicarFiltros(currentData.prs.filter(p => p.approved && !p.deployedToStg && emVoo(p)));

    // Os PRs que vêm dentro do lote são serializados pelo VersionBatchService e não passam
    // pelo enriquecimento da esteira, então chegam sem `environments` — a coluna Esteira
    // exibia "Sem esteira configurada" para todos. Reaproveita o PR já enriquecido da lista.
    const prsEnriquecidos = new Map(currentData.prs.map(pr => [pr.id, pr]));
    const comEsteira = pr => {
        const enriquecido = prsEnriquecidos.get(pr.id);
        return enriquecido ? { ...pr, environments: enriquecido.environments, links: enriquecido.links } : pr;
    };

    const batches = currentData.batches.map(batch => ({
        ...batch,
        deploymentTarget: proximoAmbienteDoLote(batch),
        pullRequests: aplicarFiltros((batch.pullRequests || []).map(comEsteira)),
    })).filter(batch => batch.pullRequests.length > 0 || !temFiltrosAtivos());
    DOM.renderApprovedTables(approvedPending, batches, 'dashboardApproved', openEditModal, animate);
    if (temFiltrosAtivos() && approvedPending.length === 0 && batches.length === 0) {
        renderFilteredEmpty('dashboardApproved');
    }
    if (window.lucide) window.lucide.createIcons();
    if (AuthService && AuthService.applyRoleBasedVisibility) AuthService.applyRoleBasedVisibility();
}

function openEditModal(pr) {
    Form.resetFormState(prForm);
    document.getElementById('modalTitle').textContent = 'Editar Pull Request';
    setPrCreationRequiredState(false);
    document.getElementById('prId').value = pr.id;
    document.getElementById('project').value = pr.project || '';
    document.getElementById('dev').value = resolveDeveloperId(availableUsers, pr.devId, pr.dev);
    document.getElementById('summary').value = pr.summary || '';

    const noTestingCheckbox = document.getElementById('noTestingRequired');
    if (noTestingCheckbox) {
        noTestingCheckbox.checked = !!pr.noTestingRequired;
    }

    const isApproved = !!pr.approved;

    prLinksPr = pr;
    draftPrLinks = [];
    renderPrLinks(pr.links || []);

    const fieldsToLock = ['project', 'dev', 'summary'];
    fieldsToLock.forEach(id => {
        document.getElementById(id).disabled = isApproved;
    });
    // Épico 5.3: dentro de um app, o campo projeto fica travado mesmo com o PR não aprovado.
    if (appFilter) document.getElementById('project').disabled = true;

    if (noTestingCheckbox) {
        noTestingCheckbox.disabled = isApproved;
    }

    if (isApproved) {
        document.getElementById('modalTitle').innerHTML = 'Editar Pull Request <span class="tag" style="background: color-mix(in srgb, var(--success-color) 16%, transparent); color: var(--success-color); margin-left:10px;">Aprovado</span>';
    } else {
        document.getElementById('modalTitle').textContent = 'Editar Pull Request';
    }

    openAccessibleModal(prModal, prModal.querySelector('select:not(:disabled), input:not([type="hidden"]):not(:disabled), textarea:not(:disabled)'));
}

function openAddModal() {
    if (tenantOperations.isTransitioning()) {
        DOM.showToast('Aguarde a troca de tenant terminar.', 'info');
        return;
    }

    const openingRevision = tenantOperations.snapshot();
    document.getElementById('modalTitle').textContent = 'Novo Pull Request';
    setPrCreationRequiredState(true);
    prForm.reset();
    Form.resetFormState(prForm);
    document.getElementById('prId').value = '';
    
    prLinksPr = null;
    draftPrLinks = [];
    renderPrLinks(draftPrLinks);

    const currentMe = AuthService.getMe();
    document.getElementById('dev').value = resolveDeveloperId(
        availableUsers,
        currentMe?.id || LocalStorage.getItem('appUserId'),
        currentMe?.name || LocalStorage.getItem('appUser')
    );

    const fieldsToLock = ['project', 'dev', 'summary'];
    fieldsToLock.forEach(id => {
        document.getElementById(id).disabled = false;
    });
    // Épico 5.3: dentro de um app, o PR herda o projeto — sem campo de escolha.
    // prForm.reset() (acima) já desfez o value pré-selecionado; refaz antes de travar.
    if (appFilter) {
        const projectField = document.getElementById('project');
        projectField.value = appFilter;
        projectField.disabled = true;
    }

    const noTestingCheckbox = document.getElementById('noTestingRequired');
    if (noTestingCheckbox) {
        noTestingCheckbox.checked = false;
        noTestingCheckbox.disabled = false;
    }

    if (!tenantOperations.isCurrent(openingRevision) || tenantOperations.isTransitioning()) return;
    openAccessibleModal(prModal, prModal.querySelector('select:not(:disabled), input:not([type="hidden"]):not(:disabled), textarea:not(:disabled)'));
}

document.getElementById('addPrBtn').addEventListener('click', openAddModal);

// Alterna entre "em voo" e a lista completa. Recarrega da API porque o filtro é derivado
// lá (presença + versão no último ambiente), não uma propriedade que o cliente possa calcular.
const inFlightToggle = document.getElementById('inFlightToggle');
if (inFlightToggle) {
    inFlightToggle.addEventListener('change', async (event) => {
        showOnlyInFlight = event.target.checked;
        persistirFiltrosNaUrl();
        // A lista completa já está em memória: alternar é só re-renderizar.
        refreshOpenPrs(true);
        refreshApprovedPrs(true);
    });
}

if (document.getElementById('setupBtn')) {
    document.getElementById('setupBtn').addEventListener('click', openSetupModal);
}

// Gestão de Usuários (Épico 2): tela administrativa é ROTA própria, nunca modal.
if (document.getElementById('usersBtn')) {
    document.getElementById('usersBtn').addEventListener('click', () => {
        window.location.href = 'usuarios.html';
    });
}

// Gestão de Tenants (Épico 9): tela administrativa do PlatformAdmin, rota própria.
if (document.getElementById('tenantsBtn')) {
    document.getElementById('tenantsBtn').addEventListener('click', () => {
        window.location.href = 'tenants.html';
    });
}

// Home de Apps (Épico 3): rota própria
if (document.getElementById('appsBtn')) {
    document.getElementById('appsBtn').addEventListener('click', () => {
        window.location.href = 'apps.html';
    });
}

// Chip do filtro por app no título + limpar filtro
if (appFilter) {
    const appTitle = document.getElementById('appTitle');
    if (appTitle) {
        const chip = document.createElement('a');
        chip.href = 'index.html';
        chip.className = 'tag';
        chip.style.cssText = 'margin-left: 10px; background: var(--accent-color); color: white; text-decoration: none; font-size: 0.7rem; vertical-align: middle;';
        chip.title = 'Filtrando por app - clique para limpar';
        chip.textContent = `${appFilter} ✕`;
        appTitle.insertAdjacentElement('afterend', chip);
    }
    // O travamento do campo Projeto acontece em loadProjectOptions() (chamada em init()),
    // depois que a lista real de apps já foi carregada — não dá pra travar aqui em cima
    // porque o <select> ainda está vazio nesse ponto do carregamento da página.
}

// Ajuda do campo Projeto: por que a aplicação pode não estar na lista + atalho pra cadastrar.
const projectHelpBtn = document.getElementById('projectHelpBtn');
const projectHelpTooltip = document.getElementById('projectHelpTooltip');
if (projectHelpBtn && projectHelpTooltip) {
    projectHelpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        projectHelpTooltip.style.display = projectHelpTooltip.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
        if (projectHelpTooltip.style.display !== 'none' && !projectHelpTooltip.contains(e.target) && e.target !== projectHelpBtn) {
            projectHelpTooltip.style.display = 'none';
        }
    });
}

document.getElementById('addRelatedTaskBtn')?.addEventListener('click', () => addRelatedTaskInput());

const taskLinkInput = document.getElementById('taskLink');
if (taskLinkInput) {
    taskLinkInput.addEventListener('input', () => {
        updateSummaryLabel();
    });
}

function updateSummaryLabel() {
    const primaryTagsContainer = document.getElementById('taskIdTagsContainer');
    const relatedTagsContainer = document.getElementById('relatedTaskIdsContainer');
    
    if (!primaryTagsContainer || !relatedTagsContainer) return;

    const mainUrl = document.getElementById('taskLink')?.value || '';
    const primaryId = extractJiraId(mainUrl);

    if (primaryId) {
        primaryTagsContainer.innerHTML = `<span class="tag" style="background: var(--accent-color); color: white; font-size: 0.7rem; padding: 0.2rem 0.6rem;">${primaryId}</span>`;
        primaryTagsContainer.style.display = 'flex';
    } else {
        primaryTagsContainer.style.display = 'none';
    }

    const relatedUrls = Array.from(document.querySelectorAll('.related-task-input-url')).map(i => i.value);
    const relatedIds = [...new Set(relatedUrls.map(url => extractJiraId(url)).filter(id => id !== null && id !== primaryId))];

    if (relatedIds.length > 0) {
        const tags = relatedIds.map(id => `<span class="tag" style="background: color-mix(in srgb, var(--accent-color) 12%, transparent); color: var(--accent-color); font-size: 0.7rem; padding: 0.2rem 0.6rem; border: 1px solid color-mix(in srgb, var(--accent-color) 28%, transparent);">${id}</span>`).join('');
        relatedTagsContainer.innerHTML = tags;
        relatedTagsContainer.style.display = 'flex';
    } else {
        relatedTagsContainer.style.display = 'none';
    }
}

function addRelatedTaskInput(url = '', summary = '') {
    const container = document.getElementById('relatedTasksContainer');
    if (container.children.length >= 5) {
        DOM.showToast('Máximo de 5 links vinculados permitidos.', 'warning');
        return;
    }
    
    const div = document.createElement('div');
    div.className = 'related-task-group form-group';
    div.style.display = 'flex';
    div.style.flexWrap = 'wrap';
    div.style.gap = '10px';
    div.style.alignItems = 'center';
    
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'related-task-input-url';
    urlInput.placeholder = 'Link Jira...';
    urlInput.value = url;
    urlInput.style.flex = '1';
    
    const summaryInput = document.createElement('input');
    summaryInput.type = 'text';
    summaryInput.className = 'related-task-input-summary';
    summaryInput.placeholder = 'Resumo da task...';
    summaryInput.value = summary;
    summaryInput.style.flex = '1.5';
    
    urlInput.classList.add('related-task-input');
    summaryInput.classList.add('related-task-input');
    
    urlInput.addEventListener('input', () => updateSummaryLabel());
    summaryInput.addEventListener('input', () => updateSummaryLabel());
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-outline';
    removeBtn.style.padding = '0.4rem';
    removeBtn.style.minWidth = '34px';
    removeBtn.style.height = '34px';
    removeBtn.style.color = 'var(--danger-color)';
    removeBtn.style.borderColor = 'var(--border-color)';
    removeBtn.style.display = 'flex';
    removeBtn.style.alignItems = 'center';
    removeBtn.style.justifyContent = 'center';
    removeBtn.title = 'Remover link';
    removeBtn.innerHTML = '<i data-lucide="trash-2" style="width: 16px;"></i>';
    removeBtn.onclick = () => {
        div.remove();
        updateSummaryLabel();
    };
    
    div.appendChild(summaryInput);
    div.appendChild(urlInput);
    div.appendChild(removeBtn);
    const errorElement = document.createElement('span');
    errorElement.className = 'field-error';
    div.appendChild(errorElement);
    container.appendChild(div);
    
    if(window.lucide) {
        window.lucide.createIcons();
    }
}

const monitorStatusBtn = document.getElementById('monitorStatusBtn');
if (monitorStatusBtn) {
    monitorStatusBtn.addEventListener('click', () => {
        window.location.href = 'monitor-de-status.html';
    });
}

document.getElementById('logoutBtn').addEventListener('click', handleLogout);


function clearNewSprintValidation() {
    newSprintNameInput?.classList.remove('is-invalid');
    newSprintNameError?.classList.remove('visible');
}

document.getElementById('newSprintBtn').addEventListener('click', () => {
    if (newSprintNameInput) newSprintNameInput.value = '';
    sprintDateRangePicker.reset();
    clearNewSprintValidation();
    openAccessibleModal(newSprintModal, newSprintNameInput);
});

newSprintNameInput?.addEventListener('input', () => {
    if (newSprintNameInput.value.trim()) {
        newSprintNameInput.classList.remove('is-invalid');
        newSprintNameError?.classList.remove('visible');
    }
});

// Esc fecha o modal de Nova Sprint (não usamos o enableEscapeToCloseModals global porque o
// index.html tem modais bloqueantes de propósito — login e seleção de tenant). Quando o
// calendário está aberto, ele consome o Esc primeiro (stopPropagation no dateRangePicker)
// e este handler nem roda: o primeiro Esc fecha o calendário, o segundo fecha o modal.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (newSprintModal?.style.display !== 'flex') return;
    closeAllModals();
});

if (confirmNewSprintBtn) {
    confirmNewSprintBtn.addEventListener('click', async () => {
        clearNewSprintValidation();

        const sprintName = newSprintNameInput?.value.trim();
        if (!sprintName) {
            newSprintNameInput?.classList.add('is-invalid');
            newSprintNameError?.classList.add('visible');
            newSprintNameInput?.focus();
            return;
        }

        if (!sprintDateRangePicker.validate()) {
            return;
        }
        const { start: startDate, end: endDate } = sprintDateRangePicker.getRange();

        try {
            DOM.showLoading(true);
            await API.createSprint({ name: sprintName, startDate, endDate });
            DOM.showToast(`Sprint "${sprintName}" criada com sucesso e definida como ativa!`);
            closeAllModals();
            await loadData(true);
        } catch (error) {
            console.error('Erro ao criar sprint:', error);
            DOM.showToast('Erro ao criar sprint: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    });
}

window.approvePr = async (prId) => {
    if (!prId) return;

    if (!confirm('Tem certeza que deseja aprovar este PR?')) {
        return;
    }
    
    const appUserId = LocalStorage.getItem('appUserId');
    if (!appUserId) {
        DOM.showToast('Erro: Usuário não identificado. Selecione um perfil na tela inicial.', 'error');
        return;
    }

    try {
        const updatedPR = await API.approvePR(prId, parseInt(appUserId));
        
        DOM.showToast('PR Aprovado com sucesso!');
        
        // Local update
        const index = currentData.prs.findIndex(p => p.id == prId);
        if (index !== -1 && updatedPR) {
            currentData.prs[index] = updatedPR;
        } else if (updatedPR) {
            currentData.prs.push(updatedPR);
        }
        refreshOpenPrs();
        refreshApprovedPrs();
        
        const prModal = document.getElementById('prModal');
        if (prModal && prModal.style.display === 'flex') {
            prModal.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao aprovar:', error);
        DOM.showToast(`Não foi possível aprovar. ${error.message}`, 'error');
    }
};

window.requestCorrection = async (prId) => {
    if (!prId) return;

    if (!confirm('Solicitar correção para este PR?')) {
        return;
    }

    try {
        const updatedPR = await API.requestCorrection(prId);
        
        DOM.showToast('Correção solicitada com sucesso!');
        
        const index = currentData.prs.findIndex(p => p.id == prId);
        if (index !== -1 && updatedPR) {
            currentData.prs[index] = updatedPR;
        }
        refreshOpenPrs();

    } catch (error) {
        console.error('Erro ao solicitar correção:', error);
        DOM.showToast('Erro ao solicitar correção: ' + error.message, 'error');
    }
};

window.markPrFixed = async (prId) => {
    if (!prId) return;

    if (!confirm('Marcar este PR como corrigido e reenviar para revisão?')) {
        return;
    }

    try {
        const updatedPR = await API.markPrFixed(prId);
        
        DOM.showToast('PR marcado como corrigido!');
        
        const index = currentData.prs.findIndex(p => p.id == prId);
        if (index !== -1 && updatedPR) {
            currentData.prs[index] = updatedPR;
        }
        refreshOpenPrs();

    } catch (error) {
        console.error('Erro ao marcar corrigido:', error);
        DOM.showToast('Erro: ' + error.message, 'error');
    }
};

// Timeline de auditoria do PR (Épico 5.4) — carrega sob demanda no primeiro clique,
// depois só alterna visibilidade (sem refetch a cada toggle).
const prHistoryLoaded = new Set();
window.togglePrHistory = async (prId) => {
    const row = document.getElementById(`history-${prId}`);
    if (!row) return;

    if (row.style.display !== 'none') {
        row.style.display = 'none';
        return;
    }

    row.style.display = '';
    if (!prHistoryLoaded.has(prId)) {
        try {
            const events = await API.fetchPrEvents(prId);
            DOM.renderPrHistory(prId, events);
            prHistoryLoaded.add(prId);
        } catch (error) {
            console.error('Erro ao carregar histórico do PR:', error);
            DOM.showToast('Erro ao carregar histórico: ' + error.message, 'error');
            row.style.display = 'none';
        }
    }
};

window.archivePr = async (prId) => {
    if (!prId) return;

    const pr = currentData.prs.find(item => String(item.id) === String(prId));
    const taskId = extractJiraId(pr?.taskLink);
    const prDescription = [taskId, pr?.summary].filter(Boolean).join(' - ')
        || pr?.project
        || 'selecionado';
    const confirmed = await DOM.confirmDialog(
        `Arquivar o PR "${prDescription}"? Ele sairá da lista de pendentes.`,
        'Arquivar PR',
        { confirmLabel: 'Arquivar PR', danger: true }
    );

    if (!confirmed) {
        return;
    }

    try {
        await API.archivePR(prId);
        
        DOM.showToast('PR arquivado com sucesso!');
        
        currentData.prs = currentData.prs.filter(p => p.id != prId);
        refreshOpenPrs();

    } catch (error) {
        console.error('Erro ao arquivar:', error);
        DOM.showToast('Erro ao arquivar: ' + error.message, 'error');
    }
};


document.querySelectorAll('.close-btn, .close-modal').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
});

if (confirmRequestVersionModalBtn) {
    confirmRequestVersionModalBtn.addEventListener('click', confirmRequestVersionSelection);
}

function openSetupModal() {
    if (!AuthService.isAdmin()) {
        console.log('Ação restrita a administradores.');
        return;
    }

    // Épico 7.3: dentro de um app, o setup opera a config DAQUELE app (fallback global);
    // sem app selecionado, opera a global.
    const scopeEl = document.getElementById('setupModalScope');
    if (scopeEl) {
        scopeEl.textContent = appFilter
            ? `Config do app: ${appFilter} (sem valores próprios, vale a global)`
            : 'Config global (usada por apps sem config própria)';
    }

    API.getAutomationConfig(currentAppId).then(config => {
        if (config) {
            if (document.getElementById('glTokenInput')) document.getElementById('glTokenInput').value = config.gitlabToken || '';
            if (document.getElementById('jiraEmailInput')) document.getElementById('jiraEmailInput').value = config.jiraUserEmail || '';
            if (document.getElementById('jiraTokenInput')) document.getElementById('jiraTokenInput').value = config.jiraToken || '';
            if (scopeEl && currentAppId && !config.appId) {
                scopeEl.textContent = `Config do app: ${appFilter} — exibindo a GLOBAL (este app ainda não tem config própria; salvar cria uma só dele)`;
            }
        }
    }).catch(err => {
        console.error('Erro ao buscar config:', err);
    }).finally(() => {
        openAccessibleModal(setupModal);
    });
}

const saveConfigBtn = document.getElementById('saveConfigBtn');
if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', async () => {
        const glToken = document.getElementById('glTokenInput') ? document.getElementById('glTokenInput').value.trim() : '';
        const jiraEmail = document.getElementById('jiraEmailInput') ? document.getElementById('jiraEmailInput').value.trim() : '';
        const jiraToken = document.getElementById('jiraTokenInput') ? document.getElementById('jiraTokenInput').value.trim() : '';

        if (!glToken) {
            alert('Por favor, insira o token do GitLab.');
            return;
        }

        if (!confirm('Deseja realmente salvar essas configurações?')) {
            return;
        }

        try {
            DOM.showLoading(true);
            await API.saveAutomationConfig({
                gitlabToken: glToken,
                jiraUserEmail: jiraEmail,
                jiraToken: jiraToken
            }, currentAppId);

            DOM.showToast('Configurações salvas com sucesso!');
            if (setupModal) setupModal.style.display = 'none';
            loadData();
        } catch (error) {
            DOM.showToast('Erro ao salvar configurações: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    });
}

prForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const developerSelect = document.getElementById('dev');
    const prIdInput = document.getElementById('prId').value;

    if (!validatePrForm(!prIdInput)) {
        return;
    }

    const selectedDeveloper = findDeveloperById(availableUsers, developerSelect.value);

    if (!Form.beginFormSubmission(prForm)) return;

    try {
        DOM.showLoading(true);

        const prData = {
            project: document.getElementById('project').value,
            devId: selectedDeveloper.id,
            summary: document.getElementById('summary').value,
            prLink: '',
            taskLink: null,
            teamsLink: null,
            noTestingRequired: document.getElementById('noTestingRequired').checked,
            linksRelatedTask: ''
        };

        const successMessage = prIdInput
            ? 'PR atualizado com sucesso!'
            : 'PR criado com sucesso!';

        let linkFailures = 0;
        if (prIdInput) {
            await API.updatePR(prIdInput, prData);
        } else {
            const createdPr = await API.createPR(prData);
            const linksToCreate = [...draftPrLinks];
            for (const link of linksToCreate) {
                try {
                    await API.addPrLink(createdPr.appId, createdPr.id, {
                        kind: link.kind,
                        url: link.url,
                        label: link.label,
                    });
                } catch (linkError) {
                    linkFailures += 1;
                    console.error('PR criado, mas um vínculo não pôde ser salvo:', linkError);
                }
            }
        }

        prModal.style.display = 'none';
        prForm.reset();
        DOM.showToast(
            linkFailures > 0
                ? `PR criado, mas ${linkFailures} vínculo(s) não puderam ser salvo(s). Adicione-os ao editar o PR.`
                : successMessage,
            linkFailures > 0 ? 'warning' : 'success'
        );

        try {
            await loadPrTablesData(true);
        } catch (refreshError) {
            console.error('PR salvo, mas o Dashboard não pôde ser atualizado:', refreshError);
            DOM.showToast('PR salvo. Atualize a página para recarregar o Dashboard.', 'warning');
        }
    } catch (error) {
        console.error('Erro detalhado ao salvar:', error);
        DOM.showToast('Erro ao salvar: ' + getPrErrorMessage(error.message), 'error');
    } finally {
        DOM.showLoading(false);
        Form.endFormSubmission(prForm);
    }
});

window.saveGroupVersion = async (batchId) => {
    const elVersion = document.getElementById(`v_ver_${batchId}`);
    const elPipeline = document.getElementById(`v_pipe_${batchId}`);
    const elRollback = document.getElementById(`v_roll_${batchId}`);

    if (!elVersion || !elPipeline || !elRollback) {
        DOM.showToast('Erro interno: Campos de formulário não encontrados (ID mismatch).', 'error');
        return;
    }

    const version = elVersion.value.trim();
    const pipeline = elPipeline.value.trim();
    const rollback = elRollback.value.trim();

    [elVersion, elPipeline, elRollback].forEach(el => el.style.border = '1px solid var(--border-color)');

    let hasError = false;

    if (!version) {
        elVersion.style.border = '1px solid var(--danger-color)';
        hasError = true;
    }
    if (!pipeline) {
        elPipeline.style.border = '1px solid var(--danger-color)';
        hasError = true;
    }
    if (!rollback) {
        elRollback.style.border = '1px solid var(--danger-color)';
        hasError = true;
    }

    if (hasError) {
        DOM.showToast('Preencha todos os campos obrigatórios.', 'error');
        return;
    }

    const versionRegex = /^\d+\.\d+\.\d+\.\d+$/;
    
    if (!versionRegex.test(version)) {
        elVersion.style.border = '1px solid var(--danger-color)';
        DOM.showToast('Versão inválida. Use 4 grupos numéricos (ex: 26.01.30.428)', 'error');
        return;
    }

    if (!versionRegex.test(rollback)) {
        elRollback.style.border = '1px solid var(--danger-color)';
        DOM.showToast('Rollback inválido. Use 4 grupos numéricos (ex: 26.01.30.428)', 'error');
        return;
    }

    const confirmado = await DOM.confirmDialog(
        `A versão ${version} será aplicada a todos os PRs deste lote.`,
        `Aplicar a versão ${version}?`,
        { confirmLabel: 'Aplicar versão' },
    );
    if (confirmado) {
        try {
            DOM.showLoading(true);
            
            const batchData = {
                batchId: batchId,
                version: version,
                pipelineLink: pipeline,
                rollback: rollback
            };

            await API.saveVersionBatch(batchData);
            
            DOM.showToast('Versão aplicada com sucesso!');
            await loadData(true);
        } catch (error) {
            DOM.showToast('Erro ao salvar versão: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

// A lista de PRs do corte é resolvida NO CLIQUE, não na renderização, e sobre dados recarregados:
// cortar em cima do retrato antigo da tela deixava PR aprovado de fora do lote sem aviso nenhum.
window.requestVersionBatch = async (appId, projectName) => {
    if (!projectName) projectName = 'este projeto';

    try {
        DOM.showLoading(true);
        await loadPrTablesData(true);
    } catch (error) {
        console.error('Não foi possível atualizar os PRs antes do corte:', error);
        DOM.showToast('Não foi possível atualizar a lista de PRs. Tente de novo.', 'error');
        return;
    } finally {
        DOM.showLoading(false);
    }

    const prIds = prsElegiveisParaCorte(appId).map(pr => pr.id);
    if (prIds.length === 0) {
        DOM.showToast('Nenhum PR aprovado disponível para cortar versão neste app.', 'warning');
        return;
    }

    openRequestVersionModal(prIds, projectName);
};

window.fetchBatches = async () => {
    try {
        DOM.showLoading(true);
        
        const batches = await API.fetchBatches();
        
        DOM.showToast('Batches carregados com sucesso!');
        await loadData(true);
        return batches;
    } catch (error) {
        console.error('Erro ao carregar batches:', error);
        DOM.showToast('Erro ao carregar batches: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
    }
};

window.confirmDeploy = async (batchId, appId, targetKind, targetLabel) => {
    const confirmed = await DOM.confirmDialog(
        `Fazer deploy desta versão em ${targetLabel}? A composição do lote ficará congelada no primeiro deploy.`,
        `Deploy ${targetLabel}`,
        { confirmLabel: 'Deploy' },
    );
    if (confirmed) {
        try {
            DOM.showLoading(true);
            await API.deployToEnvironment(appId, String(targetKind).toLowerCase(), batchId);
            esteirasPorApp.delete(appId);
            if (appId === currentAppId || appId === filtros.app) await carregarEsteiraDoApp(appId);
            DOM.showToast(`Versão implantada em ${targetLabel}.`);
            await loadData(true);
        } catch (error) {
            console.error('Erro ao implantar lote:', error);
            DOM.showToast('Erro ao implantar lote: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

window.markBatchHotfix = (batchId) => {
    pendingHotfixBatchId = batchId;
    hotfixReasonInput.value = '';
    document.getElementById('hotfixReasonError')?.classList.remove('visible');
    openAccessibleModal(hotfixModal, hotfixReasonInput);
};

document.getElementById('hotfixCancelBtn')?.addEventListener('click', () => {
    pendingHotfixBatchId = null;
    closeAllModals();
});

document.getElementById('hotfixConfirmBtn')?.addEventListener('click', async () => {
    const reason = hotfixReasonInput.value.trim();
    const errorElement = document.getElementById('hotfixReasonError');
    if (!reason) {
        errorElement.textContent = 'Informe a justificativa do hotfix.';
        errorElement.classList.add('visible');
        hotfixReasonInput.focus();
        return;
    }

    const button = document.getElementById('hotfixConfirmBtn');
    button.disabled = true;
    try {
        await API.markBatchAsHotfix(pendingHotfixBatchId, reason);
        pendingHotfixBatchId = null;
        hotfixModal.style.display = 'none';
        DOM.showToast('Versão marcada como hotfix. A justificativa foi registrada.');
        await loadData(true);
    } catch (error) {
        errorElement.textContent = error?.message || 'Não foi possível marcar o hotfix.';
        errorElement.classList.add('visible');
    } finally {
        button.disabled = false;
    }
});

window.removeVersionFromBatch = async (batchId) => {
    const confirmado = await DOM.confirmDialog(
        'Os PRs voltarão para o status "Aguardando Versão".',
        'Remover as informações de versão?',
        { confirmLabel: 'Remover versão', danger: true },
    );
    if (confirmado) {
        try {
            DOM.showLoading(true);
            await API.removeVersionFromBatch(batchId);
            DOM.showToast('Versão removida e lote resetado com sucesso!');
            await loadData(true);
        } catch (error) {
            console.error('Erro ao remover versão:', error);
            DOM.showToast('Erro ao remover versão: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

window.removePrFromBatch = async (batchId, prId) => {
    const confirmado = await DOM.confirmDialog(
        'O PR voltará para o status "Aprovado" e sairá desta versão.',
        'Remover este PR do lote?',
        { confirmLabel: 'Remover do lote', danger: true },
    );
    if (confirmado) {
        try {
            DOM.showLoading(true);
            await API.removePrFromBatch(batchId, prId);
            DOM.showToast('PR removido do lote com sucesso!');
            await loadData(true);
        } catch (error) {
            console.error('Erro ao remover PR:', error);
            DOM.showToast('Erro ao remover PR: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

window.cancelVersionRequestByPrIds = async (prIds) => {
    if (!prIds || !prIds.length) return;
    
    const confirmado = await DOM.confirmDialog(
        `Os ${prIds.length} PRs voltarão para a lista de "Aprovados" e o lote será removido.`,
        'Cancelar a solicitação de versão?',
        { confirmLabel: 'Cancelar solicitação', danger: true },
    );
    if (confirmado) {
        try {
            DOM.showLoading(true);
            await API.cancelVersionRequestByPrIds(prIds);
            DOM.showToast('Solicitação cancelada com sucesso!');
            await loadData(true);
        } catch (error) {
            console.error('Erro ao cancelar solicitação por IDs:', error);
            DOM.showToast('Erro ao cancelar solicitação: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

window.cancelVersionRequest = async (batchId) => {
    const confirmado = await DOM.confirmDialog(
        'Os PRs voltarão para a lista de "Aprovados" e o lote será removido.',
        'Cancelar a solicitação de versão?',
        { confirmLabel: 'Cancelar solicitação', danger: true },
    );
    if (confirmado) {
        try {
            DOM.showLoading(true);
            await API.cancelVersionRequest(batchId);
            DOM.showToast('Solicitação cancelada com sucesso!');
            await loadData(true);
        } catch (error) {
            console.error('Erro ao cancelar solicitação:', error);
            DOM.showToast('Erro ao cancelar solicitação: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

window.deleteBatch = async (batchId) => {
    const confirmado = await DOM.confirmDialog(
        'Todos os PRs voltarão para o status "Aprovado" e o lote será removido.',
        'Deletar este lote?',
        { confirmLabel: 'Deletar lote', danger: true },
    );
    if (confirmado) {
        try {
            DOM.showLoading(true);
            await API.deleteBatch(batchId);
            DOM.showToast('Lote deletado com sucesso!');
            await loadData(true);
        } catch (error) {
            console.error('Erro ao deletar lote:', error);
            DOM.showToast('Erro ao deletar lote: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

function showErrorModal(friendlyMsg, error) {
    const modal = document.getElementById('errorModal');
    if (!modal) return;
    
    document.getElementById('errorFriendlyMessage').textContent = friendlyMsg;
    
    const stack = error?.stack || error?.message || 'Detalhes indisponíveis.';
    document.getElementById('errorStack').textContent = stack;
    
    modal.style.display = 'flex';
    
    const closeBtns = modal.querySelectorAll('.close-modal');
    closeBtns.forEach(btn => {
        btn.onclick = () => modal.style.display = 'none';
    });
}

window.createGitLabIssue = async (batchId) => {
    const confirmado = await DOM.confirmDialog(
        'Uma issue de deploy será aberta no GitLab para este lote.',
        'Criar issue no GitLab?',
        { confirmLabel: 'Criar issue' },
    );
    if (confirmado) {
        try {
            DOM.showLoading(true);
            await GitLabService.createIssue(batchId);
            DOM.showToast('Chamado criado com sucesso no GitLab!');
            await loadData(true);
        } catch (error) {
            console.error(error);
            showErrorModal('Ocorreu um erro ao tentar criar o chamado no GitLab. Verifique o token e a conexão.', error);
        } finally {
            DOM.showLoading(false);
        }
    }
};

window.completeSprint = async (sprintId) => {
    if (confirm(`Deseja concluir esta Sprint? \nIsso moverá as versões e PRs vinculados para o Histórico.`)) {
        try {
            DOM.showLoading(true);
            await API.completeSprint(sprintId);
            DOM.showToast(`Sprint concluída e arquivada!`);
            await loadData(true);
        } catch (error) {
            console.error('Erro ao concluir sprint:', error);
            DOM.showToast('Erro ao concluir sprint: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

window.toggleRelated = (prId, btn) => {
    const subRow = document.getElementById(`related-${prId}`);
    if (subRow) {
        const isHidden = subRow.style.display === 'none';
        subRow.style.display = isHidden ? 'table-row' : 'none';
        btn.classList.toggle('active', isHidden);
        
        if (isHidden && window.lucide) {
            window.lucide.createIcons();
        }
    }
};

init();
