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

let currentData = { prs: [] };
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

        if (projectSelect) {
            projectSelect.innerHTML = '';
            apps
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach(app => {
                    const option = document.createElement('option');
                    option.value = app.name;
                    option.textContent = app.name;
                    option.dataset.appId = app.id; // Épico 10: LinkFields é rota por appId
                    projectSelect.appendChild(option);
                });
            if (previousValue && apps.some(a => a.name === previousValue)) {
                projectSelect.value = previousValue;
            }
        }

        updateProjectEmptyState(apps);

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
    // Épico 10: no cadastro de PR todo campo fixo é obrigatório, sem exceção.
    const fields = ['project', 'dev', 'summary', 'prTargetBranch', 'prLink', 'taskLink'];
    fields.forEach(id => {
        const field = document.getElementById(id);
        if (field) field.required = isCreate;
    });
}

function validatePrForm(isCreate) {
    const project = document.getElementById('project');
    const dev = document.getElementById('dev');
    const summary = document.getElementById('summary');
    const targetBranch = document.getElementById('prTargetBranch');
    const epicBranchName = document.getElementById('prEpicBranchName');
    const prLink = document.getElementById('prLink');
    const taskLink = document.getElementById('taskLink');
    const rules = [
        { field: project, validate: Form.isRequired, message: 'Selecione uma aplicação.' },
        { field: dev, validate: value => Boolean(findDeveloperById(availableUsers, value)), message: 'Selecione um desenvolvedor válido da lista.' },
        { field: summary, validate: Form.isRequired, message: 'Informe o resumo do PR.' },
        { field: targetBranch, validate: value => !isCreate || Form.isRequired(value), message: 'Selecione a branch de destino do PR.' },
        // Só exige nome quando o destino é "épico" E o dev escolheu "Nova branch" (lista vazia
        // ou "__nova__"). Escolher uma branch existente da lista já é válido.
        { field: epicBranchName, validate: () => targetBranch.value !== 'Epic' || Form.isRequired(currentEpicBranchName()), message: 'Informe o nome da branch de épico.' },
        { field: prLink, validate: value => (!isCreate || Form.isRequired(value)) && Form.isOptionalUrl(value), message: 'Informe uma URL válida para o Pull Request.' },
        { field: taskLink, validate: value => (!isCreate || Form.isRequired(value)) && Form.isOptionalUrl(value), message: 'Informe uma URL válida para a task.' },
    ];

    return Form.validateFields(rules);
}

function getPrErrorMessage(errorMessage) {
    const friendlyMessages = {
        project_required: 'Projeto é obrigatório.',
        summary_required: 'Resumo é obrigatório.',
        dev_required: 'Desenvolvedor é obrigatório.',
        pr_link_required: 'Link PR é obrigatório.',
        task_link_required: 'Link Task (Jira) é obrigatório.',
        teams_link_required: 'Post no Teams é obrigatório.',
        task_obrigatoria_ausente: 'Informe o link da Task — é obrigatório em todo PR.',
        pull_request_obrigatorio_ausente: 'Informe o link do Pull Request — é obrigatório em todo PR.',
        branch_destino_ausente: 'Selecione a branch de destino do PR.',
        branch_destino_invalida: 'Branch de destino inválida.',
        epico_sem_nome: 'Informe o nome do épico.',
        epico_invalido: 'Épico de destino inválido.',
        epico_nome_muito_longo: 'O nome do épico passa de 120 caracteres.',
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
const newSprintModal = document.getElementById('newSprintModal');
const newSprintNameInput = document.getElementById('newSprintNameInput');
const newSprintNameError = document.getElementById('newSprintNameError');
const newSprintStartDateInput = document.getElementById('newSprintStartDateInput');
const newSprintEndDateInput = document.getElementById('newSprintEndDateInput');
const confirmNewSprintBtn = document.getElementById('confirmNewSprintBtn');

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
}

function showLoginGate() {
    if (!profileScreen) return;
    profileScreen.style.display = 'flex';
    document.body.classList.add('no-scroll');
    if (appShell) appShell.inert = true;
}

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
    } else if (e.key === 'Escape') {
        closeAllModals();
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

function closeAllModals() {
    prModal.style.display = 'none';
    Form.resetFormState(prForm);
    if (setupModal) setupModal.style.display = 'none';
    if (shortcutsModal) shortcutsModal.style.display = 'none';
    if (requestVersionModal) requestVersionModal.style.display = 'none';
    if (newSprintModal) newSprintModal.style.display = 'none';
    pendingVersionRequestContext = null;
    
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
    AuthService.markAuthenticationPending();

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
        requestVersionModalDescription.textContent = `Selecione o dev que vai preencher a versão, número da release, link do pipeline e rollback do lote "${pendingVersionRequestContext.projectName}".`;
    }

    if (requestVersionModal) {
        requestVersionModal.style.display = 'flex';
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

    if (!confirm(`Solicitar versão para ${prIds.length} PRs aprovados de "${projectName}" e direcionar para ${selectedDev.name}?`)) {
        return;
    }

    try {
        DOM.showLoading(true);

        await API.requestVersionBatch(prIds, selectedDev.id, selectedDev.name);

        if (requestVersionModal) {
            requestVersionModal.style.display = 'none';
        }
        pendingVersionRequestContext = null;

        DOM.showToast(`Versão solicitada para ${selectedDev.name}!`);
        await loadData(true);
    } catch (error) {
        console.error('Erro ao solicitar versão:', error);
        DOM.showToast('Erro ao solicitar versão: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
    }
}

async function loadPrTablesData(animate = false, expectedRevision = tenantOperations.snapshot()) {
    const prResult = await API.fetchPRs();
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
    refreshOpenPrs(animate);
    refreshApprovedPrs(animate);
    return true;
}

function refreshTestingAndHistory(animate = false) {
    if (!Array.isArray(currentData.sprints)) return;

    const activeSprints = currentData.sprints.filter(s => s.isActive);
    const inactiveSprints = currentData.sprints.filter(s => !s.isActive);
    DOM.renderTestingTable(activeSprints, 'dashboardTesting', openEditModal, animate);
    DOM.renderHistoryTable(inactiveSprints, 'dashboardHistory', openEditModal, animate);
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
    } catch (error) {
        if (!tenantOperations.isCurrent(expectedRevision)) return;
        console.error('Erro ao carregar dados:', error);
        DOM.showToast('Erro ao carregar dados da API', 'error');
    } finally {
        if (!skipLoading && tenantOperations.isCurrent(expectedRevision)) {
            DOM.showLoading(false);
        }
    }
}

function refreshOpenPrs(animate = false) {
    const openPrs = currentData.prs.filter(p => !p.approved);
    const totalOpenBadge = document.getElementById('totalOpenPrs');
    if (totalOpenBadge) {
        totalOpenBadge.textContent = openPrs.length;
        totalOpenBadge.style.display = openPrs.length > 0 ? 'inline-block' : 'none';
    }
    DOM.renderOpenTable(openPrs, 'openPrTableBody', openEditModal, animate);
    if (window.lucide) window.lucide.createIcons();
    if (AuthService && AuthService.applyRoleBasedVisibility) AuthService.applyRoleBasedVisibility();
}

function refreshApprovedPrs(animate = false) {
    if (!Array.isArray(currentData.batches)) return;

    const approvedPending = currentData.prs.filter(p => p.approved && !p.deployedToStg);
    DOM.renderApprovedTables(approvedPending, currentData.batches, 'dashboardApproved', openEditModal, animate);
    if (window.lucide) window.lucide.createIcons();
    if (AuthService && AuthService.applyRoleBasedVisibility) AuthService.applyRoleBasedVisibility();
}

function openEditModal(pr) {
    Form.resetFormState(prForm);
    document.getElementById('modalTitle').textContent = 'Editar Pull Request';
    setPrCreationRequiredState(false);
    // Épico 10 (10.3): campos personalizados são digitados na criação; edição não os mexe.
    resetCustomLinkFields();
    document.getElementById('prId').value = pr.id;
    document.getElementById('project').value = pr.project || '';
    document.getElementById('dev').value = resolveDeveloperId(availableUsers, pr.devId, pr.dev);
    document.getElementById('summary').value = pr.summary || '';
    document.getElementById('prTargetBranch').value = pr.targetBranch || 'Main';
    loadEpicBranches(selectedProjectAppId(), pr.targetBranch === 'Epic' ? pr.epicBranchName : null);
    toggleEpicBranchName();
    document.getElementById('prLink').value = pr.prLink || '';
    document.getElementById('taskLink').value = pr.taskLink || '';

    updateSummaryLabel(pr.taskLink || '');

    const isApproved = !!pr.approved;

    const fieldsToLock = ['project', 'dev', 'summary', 'prTargetBranch', 'prEpicBranchSelect', 'prEpicBranchName', 'prLink', 'taskLink'];
    fieldsToLock.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isApproved;
    });
    // Épico 5.3: dentro de um app, o campo projeto fica travado mesmo com o PR não aprovado.
    if (appFilter) document.getElementById('project').disabled = true;

    if (isApproved) {
        document.getElementById('modalTitle').innerHTML = 'Editar Pull Request <span class="tag" style="background: color-mix(in srgb, var(--success-color) 16%, transparent); color: var(--success-color); margin-left:10px;">Aprovado</span>';
    } else {
        document.getElementById('modalTitle').textContent = 'Editar Pull Request';
    }

    prModal.style.display = 'flex';
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

    updateSummaryLabel();

    const currentMe = AuthService.getMe();
    document.getElementById('dev').value = resolveDeveloperId(
        availableUsers,
        currentMe?.id || LocalStorage.getItem('appUserId'),
        currentMe?.name || LocalStorage.getItem('appUser')
    );

    const fieldsToLock = ['project', 'dev', 'summary', 'prTargetBranch', 'prEpicBranchSelect', 'prEpicBranchName', 'prLink', 'taskLink'];
    fieldsToLock.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
    // Épico 5.3: dentro de um app, o PR herda o projeto — sem campo de escolha.
    // prForm.reset() (acima) já desfez o value pré-selecionado; refaz antes de travar.
    if (appFilter) {
        const projectField = document.getElementById('project');
        projectField.value = appFilter;
        projectField.disabled = true;
    }

    // Épico 10 (10.3): campos personalizados + branches de épico carregam ao abrir/trocar o projeto.
    loadCustomLinkFields(selectedProjectAppId());
    loadEpicBranches(selectedProjectAppId());
    toggleEpicBranchName();

    if (!tenantOperations.isCurrent(openingRevision) || tenantOperations.isTransitioning()) return;
    prModal.style.display = 'flex';
}

document.getElementById('addPrBtn').addEventListener('click', openAddModal);
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

// ── Épico 10 (10.3): campos personalizados do app no formulário de PR ────────
// Só aparecem na CRIAÇÃO. Cada um preenchido vira um PrLink (Kind = Other) depois
// que o PR é criado. O cadastro dos campos fica em "Configurações de cadastro de PR".
let customLinkFieldsState = []; // [{ id, label, required }]
let customLinkFieldsAppId = null;

function resetCustomLinkFields() {
    customLinkFieldsState = [];
    customLinkFieldsAppId = null;
    const box = document.getElementById('customLinkFields');
    if (box) box.innerHTML = '';
    document.getElementById('customLinkFieldsGroup')?.style.setProperty('display', 'none');
}

function renderCustomLinkFields() {
    const box = document.getElementById('customLinkFields');
    const group = document.getElementById('customLinkFieldsGroup');
    if (!box || !group) return;
    box.innerHTML = '';
    if (customLinkFieldsState.length === 0) {
        group.style.display = 'none';
        return;
    }
    customLinkFieldsState.forEach((field, indice) => {
        const wrap = document.createElement('div');
        wrap.className = 'form-group';
        wrap.style.margin = '0';

        const inputId = `customLinkField-${field.id || indice}`;

        const label = document.createElement('label');
        label.htmlFor = inputId;
        label.textContent = field.label;
        if (field.required) {
            const star = document.createElement('span');
            star.setAttribute('aria-hidden', 'true');
            star.style.color = 'var(--danger-color)';
            star.textContent = ' *';
            label.appendChild(star);
        }

        const input = document.createElement('input');
        input.type = 'url';
        input.id = inputId;
        input.className = 'custom-link-field-input';
        input.placeholder = 'https://...';
        input.dataset.label = field.label;
        input.dataset.required = field.required ? '1' : '';
        // Limpar o erro ao digitar já vem do Form.prepareForm(prForm) (listener de 'input').

        // .field-error nasce escondido; Form.setFieldError/clearFieldError é quem alterna
        // .visible. O texto entra na validação, conforme o motivo real da falha.
        const err = document.createElement('span');
        err.className = 'field-error';

        wrap.append(label, input, err);
        box.appendChild(wrap);
    });
    group.style.display = ''; // volta ao display da folha de estilo (.form-group)
}

async function loadCustomLinkFields(appId) {
    resetCustomLinkFields();
    if (!appId) return;
    customLinkFieldsAppId = appId;
    try {
        const fields = await API.fetchLinkFields(appId);
        // corrida: o usuário pode ter trocado de app antes da resposta chegar
        if (customLinkFieldsAppId !== appId) return;
        customLinkFieldsState = Array.isArray(fields) ? fields : [];
        renderCustomLinkFields();
        if (window.lucide) window.lucide.createIcons();
    } catch (error) {
        console.error('Falha ao carregar vínculos personalizados do app:', error);
        customLinkFieldsState = [];
        renderCustomLinkFields();
    }
}

function selectedProjectAppId() {
    const sel = document.getElementById('project');
    return sel?.selectedOptions?.[0]?.dataset?.appId || null;
}

// Valida os campos personalizados do app. Mostra o erro no campo culpado (mesmo mecanismo
// dos campos fixos: is-invalid + .field-error visível) e foca o primeiro. Retorna true se ok.
function validateCustomLinkInputs() {
    let firstInvalid = null;
    document.querySelectorAll('.custom-link-field-input').forEach(input => {
        Form.clearFieldError(input);
        const value = input.value.trim();
        const isRequired = input.dataset.required === '1';

        let message = '';
        if (isRequired && !Form.isRequired(value)) {
            message = 'Este vínculo é obrigatório para PRs deste app.';
        } else if (value && !Form.isOptionalUrl(value)) {
            message = 'Informe uma URL válida.';
        }

        if (message) {
            Form.setFieldError(input, message);
            firstInvalid ||= input;
        }
    });
    firstInvalid?.focus();
    return firstInvalid === null;
}

// Campos personalizados preenchidos, a gravar como PrLink (Kind = Other) após criar o PR.
function collectCustomLinkPayloads() {
    const payloads = [];
    document.querySelectorAll('.custom-link-field-input').forEach(input => {
        const value = input.value.trim();
        if (value) payloads.push({ kind: 'Other', url: value, label: input.dataset.label });
    });
    return payloads;
}

// ── Épico 10: branch de destino "épico" — nome com autocomplete dos já cadastrados ──
// Valor da opção "digitar uma branch de épico nova".
const EPIC_BRANCH_NOVA = '__nova__';

function toggleEpicBranchName() {
    const isEpic = document.getElementById('prTargetBranch')?.value === 'Epic';
    const group = document.getElementById('prEpicBranchNameGroup');
    // '' e não 'block': deixa o .form-group voltar ao display:flex/column da folha de estilo.
    // Com 'block' o input perde o stretch e a coluna fica com largura nativa (~170px).
    if (group) group.style.display = isEpic ? '' : 'none';

    const input = document.getElementById('prEpicBranchName');
    const select = document.getElementById('prEpicBranchSelect');
    if (isEpic) {
        // Reexibe o texto só se "Nova" seguir selecionada da última vez.
        syncEpicBranchNameInput();
    } else {
        if (input) { input.value = ''; Form.clearFieldError(input); }
        if (select) Form.clearFieldError(select);
    }
}

// Preenche o <select> com as branches de épico já cadastradas no app + a opção "Nova".
// preselectName: usado na edição, pra deixar marcada a branch que o PR já aponta.
async function loadEpicBranches(appId, preselectName = null) {
    const select = document.getElementById('prEpicBranchSelect');
    if (!select) return;
    select.innerHTML = '';

    let branches = [];
    if (appId) {
        try {
            branches = await API.fetchEpicBranches(appId);
        } catch (error) {
            console.error('Falha ao carregar branches de épico do app:', error);
        }
    }
    // corrida: o usuário pode ter trocado de app antes da resposta chegar
    if (selectedProjectAppId() !== appId) return;
    branches = Array.isArray(branches) ? branches : [];

    branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        select.appendChild(opt);
    });
    const nova = document.createElement('option');
    nova.value = EPIC_BRANCH_NOVA;
    nova.textContent = branches.length ? '+ Nova branch de épico…' : 'Nova branch de épico…';
    select.appendChild(nova);

    const input = document.getElementById('prEpicBranchName');
    if (preselectName && branches.some(b => b.name === preselectName)) {
        select.value = preselectName;
        syncEpicBranchNameInput();
    } else if (preselectName) {
        select.value = EPIC_BRANCH_NOVA;
        syncEpicBranchNameInput();
        if (input) input.value = preselectName;
    } else {
        // Pré-seleciona a primeira branch existente pra evitar digitação. Sem nenhuma, "Nova".
        select.value = branches.length ? branches[0].name : EPIC_BRANCH_NOVA;
        syncEpicBranchNameInput();
    }
}

// Mostra o campo de texto só quando "Nova branch de épico…" está selecionada.
function syncEpicBranchNameInput() {
    const select = document.getElementById('prEpicBranchSelect');
    const input = document.getElementById('prEpicBranchName');
    if (!select || !input) return;
    const nova = select.value === EPIC_BRANCH_NOVA;
    input.style.display = nova ? '' : 'none';
    if (nova) {
        input.focus();
    } else {
        input.value = '';
        Form.clearFieldError(input);
    }
}

// A branch de épico efetiva: a escolhida na lista, ou o texto digitado no caso "Nova".
function currentEpicBranchName() {
    const select = document.getElementById('prEpicBranchSelect');
    if (select && select.value && select.value !== EPIC_BRANCH_NOVA) return select.value;
    return document.getElementById('prEpicBranchName')?.value.trim() || '';
}

document.getElementById('prTargetBranch')?.addEventListener('change', toggleEpicBranchName);
document.getElementById('prEpicBranchSelect')?.addEventListener('change', syncEpicBranchNameInput);
// Limpar o erro do texto ao digitar já vem do Form.prepareForm(prForm).

document.getElementById('project')?.addEventListener('change', () => {
    const appId = selectedProjectAppId();
    loadCustomLinkFields(appId);
    loadEpicBranches(appId);
});

const taskLinkInput = document.getElementById('taskLink');
if (taskLinkInput) {
    taskLinkInput.addEventListener('input', () => {
        updateSummaryLabel();
    });
}

// Tag com o ID do Jira extraído do link da Task, no cabeçalho do modal.
function updateSummaryLabel() {
    const primaryTagsContainer = document.getElementById('taskIdTagsContainer');
    if (!primaryTagsContainer) return;

    const primaryId = extractJiraId(document.getElementById('taskLink')?.value || '');
    if (primaryId) {
        primaryTagsContainer.innerHTML = `<span class="tag" style="background: var(--accent-color); color: white; font-size: 0.7rem; padding: 0.2rem 0.6rem;">${primaryId}</span>`;
        primaryTagsContainer.style.display = 'flex';
    } else {
        primaryTagsContainer.style.display = 'none';
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
    if (newSprintModal) newSprintModal.style.display = 'flex';
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
        DOM.showToast('Erro ao aprovar: ' + error.message, 'error');
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
        if (setupModal) setupModal.style.display = 'flex';
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

    const isCreate = !prIdInput;
    if (!validatePrForm(isCreate)) {
        return;
    }
    if (isCreate && !validateCustomLinkInputs()) {
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
            targetBranch: document.getElementById('prTargetBranch').value,
            prLink: document.getElementById('prLink').value || '',
            taskLink: document.getElementById('taskLink').value || '',
        };
        if (prData.targetBranch === 'Epic') {
            // Branch de épico: escolhida da lista (existente) ou digitada em "Nova". Se é nova,
            // o backend cadastra na hora; se já existe, acha pelo nome exato.
            prData.epicBranchName = currentEpicBranchName();
        }

        const successMessage = prIdInput
            ? 'PR atualizado com sucesso!'
            : 'PR criado com sucesso!';

        if (prIdInput) {
            await API.updatePR(prIdInput, prData);
        } else {
            const createdPr = await API.createPR(prData);
            // Épico 10 (10.3): cada campo personalizado preenchido vira um PrLink (Kind = Other).
            const linkPayloads = collectCustomLinkPayloads();
            const linkAppId = createdPr.appId || selectedProjectAppId();
            const vinculosFalhos = [];
            for (const payload of linkPayloads) {
                try {
                    await API.addPrLink(linkAppId, createdPr.id, payload);
                } catch (linkError) {
                    console.error('PR criado, mas um vínculo não pôde ser salvo:', payload, linkError);
                    vinculosFalhos.push(payload.label);
                }
            }
            if (vinculosFalhos.length > 0) {
                // Um aviso só, não um por vínculo.
                DOM.showToast(
                    `PR criado. ${vinculosFalhos.length === 1 ? 'O vínculo' : 'Os vínculos'} ` +
                    `${vinculosFalhos.map(l => `"${l}"`).join(', ')} não ` +
                    `${vinculosFalhos.length === 1 ? 'foi salvo' : 'foram salvos'} — adicione pelo PR.`,
                    'warning'
                );
            }
        }

        prModal.style.display = 'none';
        prForm.reset();
        resetCustomLinkFields();
        DOM.showToast(successMessage);

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

    if (confirm(`Aplicar versão ${version} para este lote?`)) {
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

window.requestVersionBatch = async (prIds, projectName) => {
    if (!projectName) projectName = 'este projeto';
    
    console.log('Solicitando versão para IDs:', prIds);
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

window.confirmDeploy = async (batchId) => {
    const hasActiveSprint = currentData.sprints && currentData.sprints.some(s => s.isActive);
    if (!hasActiveSprint) {
        DOM.showToast('Não há uma Sprint ativa. Crie uma Sprint antes de liberar para STG.', 'warning');
        return;
    }

    if (confirm(`Confirmar liberação deste lote para ambiente de Teste (STG)?`)) {
        try {
            DOM.showLoading(true);
            await API.releaseBatchToStaging(batchId);
            DOM.showToast('Versão liberada para Teste (STG) com sucesso!');
            await loadData(true);
        } catch (error) {
            console.error('Erro ao liberar lote:', error);
            DOM.showToast('Erro ao liberar lote: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
};

window.removeVersionFromBatch = async (batchId) => {
    if (confirm(`ATENÇÃO: Deseja remover as informações de versão deste lote? \nIsso fará com que os PRs voltem para o status 'Aguardando Versão'.`)) {
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
    if (confirm(`DESEJA REMOVER ESSE PR DO LOTE?\nEle voltará para o status de 'Aprovado' e sairá desta versão.`)) {
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
    
    if (confirm(`Deseja CANCELAR a solicitação de versão para estes ${prIds.length} PRs? \nEles voltarão para a lista de 'Aprovados'.`)) {
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
    if (confirm(`Deseja CANCELAR a solicitação de versão? \nOs PRs voltarão para a lista de 'Aprovados' e sairão deste lote.`)) {
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
    if (confirm(`ATENÇÃO: Deseja DELETAR este lote completamente?\nTodos os PRs voltarão para o status 'Aprovado' e o lote será removido.`)) {
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
    if (confirm(`Criar issue de deploy no GitLab para esse lote de versão?`)) {
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
