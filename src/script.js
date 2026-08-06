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

let currentData = { prs: [] };
let availableUsers = [];

// Filtro por app (Épico 3): apps.html manda para index.html?app=<nome>;
// a ligação é pelo nome do projeto até o Épico 5 trocar por FK.
const appFilter = new URLSearchParams(window.location.search).get('app');
// id do app filtrado (resolvido quando a lista de apps carrega) — usado pela config por app
let currentAppId = null;

initializeTheme('themeToggleBtn');

// Épico 5.3: o <select id="project"> não tem mais lista fixa no HTML — vem inteira da
// API (mesmos apps que a Home de Apps do Épico 3 já lista). Também resolve o papel do
// usuário NO APP filtrado (Épico 4.3, reaproveitando o "myRole" que GET /Apps já calcula).
async function loadProjectOptions() {
    const projectSelect = document.getElementById('project');
    const previousValue = projectSelect?.value;

    try {
        const apps = await API.fetchApps();
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
                    projectSelect.appendChild(option);
                });
            if (previousValue && apps.some(a => a.name === previousValue)) {
                projectSelect.value = previousValue;
            }
        }

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
    } catch (error) {
        console.error('Erro ao carregar lista de apps:', error);
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

// Populate developer datalist
function populateDevList() {
    const devList = document.getElementById('devList');
    if (!devList) return;

    devList.innerHTML = '';

    availableUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        devList.appendChild(option);
    });
}

// Get user ID by name (usuários vêm da API — Épico 2)
function getUserIdByName(userName) {
    const user = availableUsers.find(u => u.name === userName);
    return user ? user.id : null;
}

const prModal = document.getElementById('prModal');
const setupModal = document.getElementById('setupModal');
const shortcutsModal = document.getElementById('shortcutsModal');
const requestVersionModal = document.getElementById('requestVersionModal');
const requestVersionDevSelect = document.getElementById('requestVersionDevSelect');
const requestVersionModalDescription = document.getElementById('requestVersionModalDescription');
const confirmRequestVersionModalBtn = document.getElementById('confirmRequestVersionModalBtn');
const prForm = document.getElementById('prForm');
const profileScreen = document.getElementById('profileScreen');
const currentUserDisplay = document.getElementById('currentUserDisplay');
const currentUserDisplayRight = document.getElementById('currentUserDisplayRight');
const godModeContainer = document.getElementById('godModeContainer');
const godModeInput = document.getElementById('godModeInput');
let pendingVersionRequestContext = null;

if (currentUserDisplay) currentUserDisplay.addEventListener('click', showProfileSelection);
if (currentUserDisplayRight) currentUserDisplayRight.addEventListener('click', showProfileSelection);

// Click outside to close profile selection if user already selected
if (profileScreen) {
    profileScreen.addEventListener('click', (e) => {
        if (e.target === profileScreen && LocalStorage.getItem('appUser')) {
            profileScreen.style.display = 'none';
            document.body.classList.remove('no-scroll');
        }
    });
}

window.addEventListener('keydown', (e) => {
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
                    
                    EffectService.triggerGodMode();
                    updateUserDisplay(result.user.name);
                    await loadData(true);
                    
                    godModeContainer.style.display = 'none';
                    godModeInput.value = '';
                    
                    // Apply role-based visibility
                    AuthService.applyRoleBasedVisibility();

                    // If login successful, close profile screen if open
                    if (profileScreen) {
                        profileScreen.style.display = 'none';
                        document.body.classList.remove('no-scroll');
                    }
                }
            } catch (error) {
                DOM.showToast('Senha incorreta!', 'error');
            } finally {
                DOM.showLoading(false);
            }
        }
    });
}

function closeAllModals() {
    prModal.style.display = 'none';
    if (setupModal) setupModal.style.display = 'none';
    if (shortcutsModal) shortcutsModal.style.display = 'none';
    if (requestVersionModal) requestVersionModal.style.display = 'none';
    pendingVersionRequestContext = null;
    
    if (LocalStorage.getItem('appUser')) {
        profileScreen.style.display = 'none';
        document.body.classList.remove('no-scroll');
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
    populateDevList();

    const appUser = LocalStorage.getItem('appUser');
    if (!appUser) {
        showProfileSelection();
    } else {
        updateUserDisplay(appUser);

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

// Login padrão (usuário/email + senha) — substitui a antiga grade de perfis
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const identifier = document.getElementById('loginIdentifier').value.trim();
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginError');
        if (errorEl) errorEl.style.display = 'none';

        if (!identifier || !password) return;

        try {
            DOM.showLoading(true);
            const result = await API.login(identifier, password);

            LocalStorage.setItem('appUser', result.user.name);
            LocalStorage.setItem('appUserId', result.user.id);
            LocalStorage.setItem('token', result.token);

            if (AuthService.isAdmin()) {
                EffectService.triggerGodMode();
            }

            await loadUsers(); // lista completa (autenticada) para selects/avatares
            updateUserDisplay(result.user.name);
            profileScreen.style.display = 'none';
            document.body.classList.remove('no-scroll');

            document.getElementById('loginPassword').value = '';

            await loadProjectOptions();
            applyDemoProjectsToSelect();
            await loadData(true);

            AuthService.applyRoleBasedVisibility();
            connectSignalR();
        } catch (error) {
            console.error('Erro no login:', error);
            if (errorEl) {
                errorEl.textContent = 'Usuário ou senha inválidos.';
                errorEl.style.display = 'block';
            }
        } finally {
            DOM.showLoading(false);
        }
    });
}

function handleLogout() {
    if (!confirm('Tem certeza que deseja deslogar?')) {
        return;
    }
    
    LocalStorage.clearSession();
    showProfileSelection();
    
    DOM.showToast('Usuário deslogado!');
}

function showProfileSelection() {
    // tela de login padrão: limpa credenciais e erro antes de exibir
    const passwordInput = document.getElementById('loginPassword');
    const errorEl = document.getElementById('loginError');
    if (passwordInput) passwordInput.value = '';
    if (errorEl) errorEl.style.display = 'none';

    profileScreen.style.display = 'flex';
    document.body.classList.add('no-scroll');
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

    const appTitle = document.getElementById('appTitle');
    if (appTitle) {
        if (isAdmin) {
            appTitle.style.background = 'none';
            appTitle.style.webkitTextFillColor = 'var(--accent-color)';
            appTitle.style.color = 'var(--accent-color)';
        } else {
            appTitle.style.background = 'linear-gradient(90deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 72%, white))';
            appTitle.style.webkitBackgroundClip = 'text';
            appTitle.style.backgroundClip = 'text';
            appTitle.style.webkitTextFillColor = 'transparent';
        }
    }
}

function getVersionAssignableUsers() {
    return availableUsers.filter(user => (user.role || '').toLowerCase() === 'dev');
}

async function loadUsers() {
    // Antes do login não há token: a tela "Quem está editando?" usa o endpoint
    // anônimo de perfis (só ativos, sem email). Com token, usa a lista completa.
    try {
        let users = LocalStorage.getItem('token')
            ? await API.fetchUsers()
            : await API.fetchProfiles();

        // token expirado/inválido → cai para o endpoint anônimo em vez de grade vazia
        if (!Array.isArray(users) || users.length === 0) {
            users = await API.fetchProfiles();
        }

        if (Array.isArray(users) && users.length > 0) {
            availableUsers = users;
            populateDevList();
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
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

async function loadPrTablesData(animate = false) {
    const prResult = await API.fetchPRs();
    if (!prResult || !Array.isArray(prResult.prs)) {
        throw new Error('Falha ao carregar PRs');
    }
    currentData.prs = appFilter
        ? prResult.prs.filter(p => p.project === appFilter)
        : prResult.prs;
    refreshOpenPrs(animate);

    const batches = await API.fetchBatches();
    if (!Array.isArray(batches)) {
        throw new Error('Falha ao carregar lotes');
    }
    currentData.batches = appFilter
        ? batches.filter(b => b.project === appFilter)
        : batches;
    refreshApprovedPrs(animate);
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

async function loadData(skipLoading = false) {
    const token = LocalStorage.getItem('token');
    const appUser = LocalStorage.getItem('appUser');
    
    if (!token || !appUser) {
        return;
    }
    
    try {
        await loadUsers();

        // Sequential boot: open PRs first, then approved PRs
        await loadPrTablesData(false);

        const sprints = await API.fetchSprints();
        if (!Array.isArray(sprints)) {
            throw new Error('Falha ao carregar sprints');
        }
        currentData.sprints = sprints;
        refreshTestingAndHistory(false);
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        DOM.showToast('Erro ao carregar dados da API', 'error');
    } finally {
        if (!skipLoading) {
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
    document.getElementById('modalTitle').textContent = 'Editar Pull Request';
    document.getElementById('prId').value = pr.id;
    document.getElementById('project').value = pr.project || '';
    document.getElementById('dev').value = pr.dev || '';
    document.getElementById('summary').value = pr.summary || '';
    document.getElementById('prLink').value = pr.prLink || '';
    document.getElementById('taskLink').value = pr.taskLink || '';
    document.getElementById('teamsLink').value = pr.teamsLink || '';
    
    updateSummaryLabel(pr.taskLink || '');

    const relatedContainer = document.getElementById('relatedTasksContainer');
    relatedContainer.innerHTML = '';
    
    if (pr.linksRelatedTask) {
        const links = pr.linksRelatedTask.split(';').filter(link => link.trim() !== '');
        links.forEach(linkData => {
            let [summary, url] = linkData.split('|');
            if (!url) {
                url = summary;
                summary = '';
            }
            addRelatedTaskInput(url, summary);
        });
    }
    
    updateSummaryLabel();

    const noTestingCheckbox = document.getElementById('noTestingRequired');
    if (noTestingCheckbox) {
        noTestingCheckbox.checked = !!pr.noTestingRequired;
    }

    const appUser = LocalStorage.getItem('appUser');
    const isApproved = !!pr.approved;


    const fieldsToLock = ['project', 'dev', 'summary', 'prLink', 'taskLink', 'teamsLink'];
    fieldsToLock.forEach(id => {
        document.getElementById(id).disabled = isApproved;
    });
    // Épico 5.3: dentro de um app, o campo projeto fica travado mesmo com o PR não aprovado.
    if (appFilter) document.getElementById('project').disabled = true;

    if (noTestingCheckbox) {
        noTestingCheckbox.disabled = isApproved;
    }

    const relatedInputs = document.querySelectorAll('.related-task-input');
    relatedInputs.forEach(input => input.disabled = isApproved);
    
    const addRelatedBtn = document.getElementById('addRelatedTaskBtn');
    if (addRelatedBtn) addRelatedBtn.disabled = isApproved;
    
    const removeRelatedBtns = document.querySelectorAll('#relatedTasksContainer button');
    removeRelatedBtns.forEach(btn => btn.disabled = isApproved);

    if (isApproved) {
        document.getElementById('modalTitle').innerHTML = 'Editar Pull Request <span class="tag" style="background: color-mix(in srgb, var(--success-color) 16%, transparent); color: var(--success-color); margin-left:10px;">Aprovado</span>';
    } else {
        document.getElementById('modalTitle').textContent = 'Editar Pull Request';
    }

    prModal.style.display = 'flex';
}

function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Novo Pull Request';
    prForm.reset();
    document.getElementById('prId').value = '';
    
    updateSummaryLabel();
    
    document.getElementById('relatedTasksContainer').innerHTML = '';
    
    const appUser = LocalStorage.getItem('appUser');
    if (appUser) {
        document.getElementById('dev').value = appUser;
    }

    const fieldsToLock = ['project', 'dev', 'summary', 'prLink', 'taskLink', 'teamsLink'];
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

    const addRelatedBtn = document.getElementById('addRelatedTaskBtn');
    if (addRelatedBtn) addRelatedBtn.disabled = false;
    
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

// Gestão de Organizações (Épico 8b): tela administrativa é ROTA própria, nunca modal.
if (document.getElementById('orgsBtn')) {
    document.getElementById('orgsBtn').addEventListener('click', () => {
        window.location.href = 'organizacoes.html';
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

document.getElementById('addRelatedTaskBtn').addEventListener('click', () => addRelatedTaskInput());

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

    const mainUrl = document.getElementById('taskLink').value;
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
    div.className = 'related-task-group';
    div.style.display = 'flex';
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


document.getElementById('newSprintBtn').addEventListener('click', async () => {
    const sprintName = prompt('Informe o nome da nova Sprint (ex: 28):', 'Sprint ');
    if (sprintName && sprintName.trim() !== 'Sprint ') {
        try {
            DOM.showLoading(true);
            const sprintData = {
                name: sprintName
            };

            await API.createSprint(sprintData);
            DOM.showToast(`Sprint "${sprintName}" criada com sucesso e definida como ativa!`);
            await loadData(true);
        } catch (error) {
            console.error('Erro ao criar sprint:', error);
            DOM.showToast('Erro ao criar sprint: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
});

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

    if (!confirm('Tem certeza que deseja ARQUIVAR este PR? Ele sairá da lista de pendentes.')) {
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


const devInput = document.getElementById('dev');

devInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const typedValue = e.target.value.trim().toLowerCase();
        const devNames = availableUsers.map(u => u.name);

        if (!typedValue || devNames.some(d => d.toLowerCase() === typedValue)) {
            return;
        }

        const match = devNames.find(d => d.toLowerCase().startsWith(typedValue));

        if (match) {
            e.preventDefault();
            e.target.value = match;
            DOM.showToast(`Auto-preenchido: ${match}`);
        }
    }
});

devInput.addEventListener('change', (e) => {
    const isValid = availableUsers.find(u => u.name === e.target.value);

    if (e.target.value && !isValid) {
        DOM.showToast('Desenvolvedor inválido. Escolha um da lista.', 'warning');
        e.target.value = '';
    }
});

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
    
    const devInputForForm = document.getElementById('dev');
    const prIdInput = document.getElementById('prId').value;
    const devName = devInputForForm.value;

    if (!availableUsers.find(u => u.name === devName)) {
        DOM.showToast('Por favor, selecione um desenvolvedor válido da lista.', 'warning');
        devInputForForm.focus();
        return;
    }

    try {
        DOM.showLoading(true);
        
        const devId = getUserIdByName(devName);
        
        if (!devId) {
            DOM.showToast('Atenção: Desenvolvedor não encontrado', 'warning');
            return;
        }
        
        const prData = {
            project: document.getElementById('project').value,
            devId: devId,
            summary: document.getElementById('summary').value,
            prLink: document.getElementById('prLink').value || '',
            taskLink: document.getElementById('taskLink').value || '',
            teamsLink: document.getElementById('teamsLink').value || '',
            noTestingRequired: document.getElementById('noTestingRequired').checked,
            linksRelatedTask: Array.from(document.querySelectorAll('.related-task-group'))
                .map(group => {
                    const url = group.querySelector('.related-task-input-url').value.trim();
                    const summary = group.querySelector('.related-task-input-summary').value.trim();
                    return url ? `${summary}|${url}` : '';
                })
                .filter(val => val !== '')
                .join(';')
        };

        let savedPR;
        
        if (prIdInput) {
            savedPR = await API.updatePR(prIdInput, prData);
            // DOM.showToast('PR atualizado com sucesso!');
            
            // Local update
            const index = currentData.prs.findIndex(p => p.id == prIdInput);
            if (index !== -1 && savedPR) {
                currentData.prs[index] = savedPR;
            }
        } else {
            savedPR = await API.createPR(prData);
            DOM.showToast('PR criado com sucesso!');
            
            if (savedPR) {
                currentData.prs.push(savedPR);
            }
        }
        
        refreshOpenPrs();
        
        prModal.style.display = 'none';
        prForm.reset();
    } catch (error) {
        console.error('Erro detalhado ao salvar:', error);
        DOM.showToast('Erro ao salvar: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
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
