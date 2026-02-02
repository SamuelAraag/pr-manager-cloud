import * as LocalStorage from './localStorageService.js';
import * as API from './apiService.js';
import * as DOM from './domService.js';
import { GitLabService } from './automationService.js';
import { EffectService } from './effectService.js';
import { VersionConstants } from './constants/versionConstants.js';
import { ApiConstants } from './constants/apiConstants.js';

let currentData = { prs: [] };
let availableUsers = [];
const validDevs = ['Rodrigo Barbosa', 'Itallo Cerqueira', 'Marcos Paulo', 'Samuel Santos', 'Kemilly Alvez'];

// Load users from API
async function loadUsers() {
    try {
        const users = await API.fetchUsers();
        if (users && users.length > 0) {
            availableUsers = users;
            console.log('Usuários carregados:', availableUsers);
            return true;
        } else {
            console.warn('Nenhum usuário encontrado na API, usando lista padrão');
            return false;
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        return false;
    }
}

// Render profile selection dynamically
function renderProfileSelection() {
    const profilesGrid = document.querySelector('.profiles-grid');
    if (!profilesGrid) return;
    
    profilesGrid.innerHTML = '';
    
    const usersToShow = (availableUsers.length > 0 ? availableUsers : 
        validDevs.map((name, index) => ({ id: index + 1, name, profileImage: null })))
        .filter(user => user.name !== 'Samuel Santos');
    
    usersToShow.forEach(user => {
        const profileItem = document.createElement('div');
        profileItem.className = 'profile-item';
        profileItem.setAttribute('data-user', user.name);
        profileItem.setAttribute('data-user-id', user.id);
        
        const defaultImages = {
            'Itallo Cerqueira': 'src/assets/profiles/itallo-cerqueira.jpeg',
            'Rodrigo Barbosa': 'src/assets/profiles/rodrigo-barbosa.jpeg',
            'Kemilly Alvez': 'src/assets/profiles/kemilly-alvez.jpeg',
            'Samuel Santos': 'src/assets/profiles/samuel-santos-profile.png'
        };
        
        const imageSrc = user.profileImage || defaultImages[user.name] || 'src/assets/profiles/default-profile.png';
        
        profileItem.innerHTML = `
            <img class="avatar" src="${imageSrc}">
            <span>${user.name}</span>
        `;
        
        profilesGrid.appendChild(profileItem);
    });
    
    // Re-attach event listeners
    attachProfileListeners();
}

// Populate developer datalist
function populateDevList() {
    const devList = document.getElementById('devList');
    if (!devList) return;
    
    devList.innerHTML = '';
    
    const usersToShow = availableUsers.length > 0 ? availableUsers : 
        validDevs.map((name, index) => ({ id: index + 1, name }));
    
    usersToShow.forEach(user => {
        const option = document.createElement('option');
        option.value = user.name;
        devList.appendChild(option);
    });
}

// Get user ID by name
function getUserIdByName(userName) {
    if (availableUsers.length > 0) {
        const user = availableUsers.find(u => u.name === userName);
        return user ? user.id : null;
    }
    // Fallback to hardcoded mapping
    const devMap = {
        'Rodrigo Barbosa': 1,
        'Itallo Cerqueira': 2,
        'Marcos Paulo': 3,
        'Samuel Santos': 4,
        'Kemilly Alvez': 5
    };
    return devMap[userName] || null;
}

const prModal = document.getElementById('prModal');
const setupModal = document.getElementById('setupModal');
const shortcutsModal = document.getElementById('shortcutsModal');
const prForm = document.getElementById('prForm');
const ghTokenInput = document.getElementById('ghTokenInput');
const profileScreen = document.getElementById('profileScreen');
const currentUserDisplay = document.getElementById('currentUserDisplay');
const currentUserDisplayRight = document.getElementById('currentUserDisplayRight');
const godModeContainer = document.getElementById('godModeContainer');
const godModeInput = document.getElementById('godModeInput');

if (currentUserDisplay) currentUserDisplay.addEventListener('click', showProfileSelection);
if (currentUserDisplayRight) currentUserDisplayRight.addEventListener('click', showProfileSelection);

// Click outside to close profile selection if user already selected
if (profileScreen) {
    profileScreen.addEventListener('click', (e) => {
        if (e.target === profileScreen && LocalStorage.getItem('appUser')) {
            profileScreen.style.display = 'none';
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
    } else if (key === 'u') {
        e.preventDefault();
        showProfileSelection();
    } else if (key === '?' || (e.shiftKey && e.key === '?')) {
        e.preventDefault();
        shortcutsModal.style.display = 'flex';
    } else if (e.key === 'Escape') {
        closeAllModals();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'k') {
        e.preventDefault();
        
        const currentUser = LocalStorage.getItem('appUser');
        const previousUser = LocalStorage.getItem('previousUser');
        const adminUser = 'Samuel Santos';
        const existingToken = LocalStorage.getItem('token');

        if (currentUser === adminUser) {
            if (previousUser && previousUser !== adminUser) {
                LocalStorage.setItem('appUser', previousUser);
                updateUserDisplay(previousUser);
                loadData(true);
                return;
            }
        }

        LocalStorage.setItem('previousUser', currentUser);

        if (existingToken) {
            LocalStorage.setItem('appUser', adminUser);
            EffectService.triggerGodMode();
            updateUserDisplay(adminUser);
            loadData(true);
            return;
        }

        godModeInput.value = '';
        godModeInput.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'l') {
        e.preventDefault();
        
        const token = LocalStorage.getItem('token');
        if (token) {
            EffectService.triggerScanLine();
            LocalStorage.removeItem('token');
            LocalStorage.removeItem('previousUser');
            
            if (LocalStorage.getItem('appUser') === 'Samuel Santos') {
                LocalStorage.removeItem('appUser');
                showProfileSelection();
            }
        }
    }
});

if (godModeInput) {
    godModeInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const password = godModeInput.value;
            if (!password) return;

            try {
                DOM.showLoading(true);
                const result = await API.adminLogin(password);
                
                if (result && result.user) {
                    LocalStorage.setItem('appUser', result.user.name);
                    LocalStorage.setItem('appUserId', result.user.id);
                    LocalStorage.setItem('token', result.token);
                    
                    EffectService.triggerGodMode();
                    updateUserDisplay(result.user.name);
                    await loadData(true);
                    
                    godModeContainer.style.display = 'none';
                    godModeInput.value = '';
                }
            } catch (error) {
                console.error('Erro no God Mode:', error);
                DOM.showToast('Senha incorreta!', 'error');
            } finally {
                DOM.showLoading(false);
            }
        }
    });
}

function closeAllModals() {
    prModal.style.display = 'none';
    setupModal.style.display = 'none';
    if (shortcutsModal) shortcutsModal.style.display = 'none';
    
    if (LocalStorage.getItem('appUser')) {
        profileScreen.style.display = 'none';
    }
}

async function init() {
    LocalStorage.init();
    
    // Set application version
    const versionEl = document.getElementById('appVersion');
    if (versionEl) {
        versionEl.textContent = VersionConstants.VERSION;
    }
    
    // Load users from API first

    //TODO: Implementar oadUsers
    // await loadUsers();
    renderProfileSelection();
    populateDevList();
    
    const appUser = LocalStorage.getItem('appUser');
    if (!appUser) {
        showProfileSelection();
    } else {
        updateUserDisplay(appUser);
        
        const token = LocalStorage.getItem('githubToken');
        await loadData();
    }

    // Start polling service
    setInterval(() => {
        if (LocalStorage.getItem('appUser')) {
            loadData(true);
        }
    }, ApiConstants.POLLING_INTERVAL);
}

function attachProfileListeners() {
    document.querySelectorAll('.profile-item').forEach(item => {
        item.addEventListener('click', () => {
            const userName = item.getAttribute('data-user');
            const userId = item.getAttribute('data-user-id');
            
            if (userName === 'Samuel Santos') {
                EffectService.triggerGodMode();
            }

            LocalStorage.setItem('appUser', userName);
            LocalStorage.setItem('appUserId', userId);
            updateUserDisplay(userName);
            profileScreen.style.display = 'none';
            
            loadData(true);
        });
    });
}

function showProfileSelection() {
    profileScreen.style.display = 'flex';
}

// openSetupModal is defined below near the save button logic


function updateUserDisplay(userName) {
    const profileImages = {
        'Itallo Cerqueira': 'src/assets/profiles/itallo-cerqueira.jpeg',
        'Rodrigo Barbosa': 'src/assets/profiles/rodrigo-barbosa.jpeg',
        'Kemilly Alvez': 'src/assets/profiles/kemilly-alvez.jpeg',
        'Samuel Santos': 'src/assets/profiles/samuel-santos-profile.png'
    };

    const imageSrc = profileImages[userName] || 'src/assets/profiles/default-profile.png';
    const isAdmin = userName === 'Samuel Santos';

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

    // Show/hide setup button - only admin can configure tokens
    const setupBtn = document.getElementById('setupBtn');
    if (setupBtn) {
        setupBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    const appTitle = document.getElementById('appTitle');
    if (appTitle) {
        if (isAdmin) {
            appTitle.style.background = 'none';
            appTitle.style.webkitTextFillColor = '#eb0000';
            appTitle.style.color = '#eb0000';
        } else {
            appTitle.style.background = 'linear-gradient(90deg, #58a6ff, #bc85ff)';
            appTitle.style.webkitBackgroundClip = 'text';
            appTitle.style.backgroundClip = 'text';
            appTitle.style.webkitTextFillColor = 'transparent';
        }
    }
}

async function loadData(skipLoading = false) {
    if (!skipLoading) {
        DOM.showLoading(true);
    }
    
    try {
        const [prResult, batches, sprints] = await Promise.all([
            API.fetchPRs(),
            API.fetchBatches(),
            API.fetchSprints()
        ]);
        
        if (prResult && batches && sprints) {
            currentData.prs = prResult.prs;
            currentData.sprints = sprints;
            DOM.renderTable(prResult.prs, batches, sprints, openEditModal);
        } else {
            DOM.showToast('Erro ao carregar dados da API', 'error');
        }
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        DOM.showToast('Erro ao carregar dados da API', 'error');
    } finally {
        if (!skipLoading) {
            DOM.showLoading(false);
        }
    }
}

function openEditModal(pr) {
    document.getElementById('modalTitle').textContent = 'Editar Pull Request';
    document.getElementById('prId').value = pr.id;
    document.getElementById('project').value = pr.project || 'DF-e';
    document.getElementById('dev').value = pr.dev || '';
    document.getElementById('summary').value = pr.summary || '';
    document.getElementById('prLink').value = pr.prLink || '';
    document.getElementById('taskLink').value = pr.taskLink || '';
    document.getElementById('teamsLink').value = pr.teamsLink || '';

    const appUser = LocalStorage.getItem('appUser');
    const isSamuel = appUser === 'Samuel Santos';
    const isApproved = !!pr.approved;


    const fieldsToLock = ['project', 'dev', 'summary', 'prLink', 'taskLink', 'teamsLink'];
    fieldsToLock.forEach(id => {
        document.getElementById(id).disabled = isApproved;
    });

    if (isApproved) {
        document.getElementById('modalTitle').innerHTML = 'Editar Pull Request <span class="tag" style="background:#238636; color:white; margin-left:10px;">Aprovado</span>';
    } else {
        document.getElementById('modalTitle').textContent = 'Editar Pull Request';
    }

    prModal.style.display = 'flex';
}

function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Novo Pull Request';
    prForm.reset();
    document.getElementById('prId').value = '';
    
    const appUser = LocalStorage.getItem('appUser');
    if (appUser) {
        document.getElementById('dev').value = appUser;
    }

    const fieldsToLock = ['project', 'dev', 'summary', 'prLink', 'taskLink', 'teamsLink'];
    fieldsToLock.forEach(id => {
        document.getElementById(id).disabled = false;
    });
    
    prModal.style.display = 'flex';
}

document.getElementById('addPrBtn').addEventListener('click', openAddModal);
document.getElementById('setupBtn').addEventListener('click', openSetupModal);

document.getElementById('changeUserBtn').addEventListener('click', showProfileSelection);

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

// Shortcuts specific function
window.approvePr = async (prId) => {
    if (!prId) return;

    if (!confirm('Tem certeza que deseja aprovar este PR?')) {
        return;
    }
    
    // Check if user is logged in
    const appUserId = LocalStorage.getItem('appUserId');
    if (!appUserId) {
        DOM.showToast('Erro: Usuário não identificado. Selecione um perfil na tela inicial.', 'error');
        return;
    }

    try {
        DOM.showLoading(true);
        await API.approvePR(prId, parseInt(appUserId));
        
        DOM.showToast('PR Aprovado com sucesso!');
        await loadData(true);
        
        const prModal = document.getElementById('prModal');
        if (prModal && prModal.style.display === 'flex') {
            prModal.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao aprovar:', error);
        DOM.showToast('Erro ao aprovar: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
    }
};

window.requestCorrection = async (prId) => {
    if (!prId) return;

    if (!confirm('Solicitar correção para este PR?')) {
        return;
    }

    try {
        DOM.showLoading(true);
        await API.requestCorrection(prId);
        
        DOM.showToast('Correção solicitada com sucesso!');
        await loadData(true);
    } catch (error) {
        console.error('Erro ao solicitar correção:', error);
        DOM.showToast('Erro ao solicitar correção: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
    }
};

window.markPrFixed = async (prId) => {
    if (!prId) return;

    if (!confirm('Marcar este PR como corrigido e reenviar para revisão?')) {
        return;
    }

    try {
        DOM.showLoading(true);
        await API.markPrFixed(prId);
        
        DOM.showToast('PR marcado como corrigido!');
        await loadData(true);
    } catch (error) {
        console.error('Erro ao marcar corrigido:', error);
        DOM.showToast('Erro: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
    }
};

window.archivePr = async (prId) => {
    if (!prId) return;

    if (!confirm('Tem certeza que deseja ARQUIVAR este PR? Ele sairá da lista de pendentes.')) {
        return;
    }

    try {
        DOM.showLoading(true);
        await API.archivePR(prId);
        
        DOM.showToast('PR arquivado com sucesso!');
        await loadData(true);
    } catch (error) {
        console.error('Erro ao arquivar:', error);
        DOM.showToast('Erro ao arquivar: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
    }
};


const devInput = document.getElementById('dev');

devInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const typedValue = e.target.value.trim().toLowerCase();
        
        if (!typedValue || validDevs.some(d => d.toLowerCase() === typedValue)) {
            return;
        }

        const match = validDevs.find(d => d.toLowerCase().startsWith(typedValue));
        
        if (match) {
            e.preventDefault();
            e.target.value = match;
            DOM.showToast(`Auto-preenchido: ${match}`);
        }
    }
});

devInput.addEventListener('change', (e) => {
    const isValid = validDevs.includes(e.target.value) || 
                    availableUsers.find(u => u.name === e.target.value);
    
    if (e.target.value && !isValid) {
        DOM.showToast('Desenvolvedor inválido. Escolha um da lista.', 'error');
        e.target.value = '';
    }
});

document.querySelectorAll('.close-btn, .close-modal').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
});

function openSetupModal() {
    API.getAutomationConfig().then(config => {
        if (config) {
            ghTokenInput.value = config.githubToken || '';
            document.getElementById('glTokenInput').value = config.gitlabToken || '';
        } else {
            ghTokenInput.value = LocalStorage.getItem('githubToken') || '';
            document.getElementById('glTokenInput').value = LocalStorage.getItem('gitlabToken') || '';
        }
    }).catch(err => {
        console.error('Erro ao buscar config:', err);
        ghTokenInput.value = LocalStorage.getItem('githubToken') || '';
        document.getElementById('glTokenInput').value = LocalStorage.getItem('gitlabToken') || '';
    }).finally(() => {
        setupModal.style.display = 'flex';
    });
}

// ...

document.getElementById('saveConfigBtn').addEventListener('click', async () => {
    const ghToken = ghTokenInput.value.trim();
    const glToken = document.getElementById('glTokenInput').value.trim();
    const secretPass = document.getElementById('secretPasswordInput').value.trim();
    
    if (!ghToken || !glToken) {
        alert('Por favor, insira os tokens necessários.');
        return;
    }

    if (!confirm('Deseja realmente salvar essas configurações?')) {
        return;
    }

    try {
        DOM.showLoading(true);
        await API.saveAutomationConfig({
            githubToken: ghToken,
            gitlabToken: glToken,
            secretPassword: secretPass
        });

        LocalStorage.setItem('githubToken', ghToken);
        if (glToken) LocalStorage.setItem('gitlabToken', glToken);
        
        DOM.showToast('Configurações salvas com sucesso!');
        setupModal.style.display = 'none';
        loadData();
    } catch (error) {
        DOM.showToast('Erro ao salvar configurações: ' + error.message, 'error');
    } finally {
        DOM.showLoading(false);
    }
});

prForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const devInputForForm = document.getElementById('dev');
    const prIdInput = document.getElementById('prId').value;
    const devName = devInputForForm.value;

    if (!validDevs.includes(devName) && !availableUsers.find(u => u.name === devName)) {
        DOM.showToast('Por favor, selecione um desenvolvedor válido da lista.', 'error');
        devInputForForm.focus();
        return;
    }

    try {
        DOM.showLoading(true);
        
        const devId = getUserIdByName(devName);
        
        if (!devId) {
            DOM.showToast('Erro: Desenvolvedor não encontrado', 'error');
            return;
        }
        
        const prData = {
            project: document.getElementById('project').value,
            devId: devId,
            summary: document.getElementById('summary').value,
            prLink: document.getElementById('prLink').value || '',
            taskLink: document.getElementById('taskLink').value || '',
            teamsLink: document.getElementById('teamsLink').value || ''
        };

        let savedPR;
        
        if (prIdInput) {
            savedPR = await API.updatePR(prIdInput, prData);
            DOM.showToast('PR atualizado com sucesso!');
        } else {
            savedPR = await API.createPR(prData);
            DOM.showToast('PR criado com sucesso!');
        }
        
        await loadData(true);
        
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

    [elVersion, elPipeline, elRollback].forEach(el => el.style.border = '1px solid #30363d');

    let hasError = false;

    if (!version) {
        elVersion.style.border = '1px solid #da3633';
        hasError = true;
    }
    if (!pipeline) {
        elPipeline.style.border = '1px solid #da3633';
        hasError = true;
    }
    if (!rollback) {
        elRollback.style.border = '1px solid #da3633';
        hasError = true;
    }

    if (hasError) {
        DOM.showToast('Preencha todos os campos obrigatórios.', 'error');
        return;
    }

    const versionRegex = /^\d+\.\d+\.\d+\.\d+$/;
    
    if (!versionRegex.test(version)) {
        elVersion.style.border = '1px solid #da3633';
        DOM.showToast('Versão inválida. Use 4 grupos numéricos (ex: 26.01.30.428)', 'error');
        return;
    }

    if (!versionRegex.test(rollback)) {
        elRollback.style.border = '1px solid #da3633';
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

    if (confirm(`Solicitar versão para ${prIds.length} PRs aprovados de "${projectName}"?`)) {
        try {
            DOM.showLoading(true);
            
            await API.requestVersionBatch(prIds);
            
            DOM.showToast('Versão solicitada com sucesso!');
            await loadData(true);
        } catch (error) {
            console.error('Erro ao solicitar versão:', error);
            DOM.showToast('Erro ao solicitar versão: ' + error.message, 'error');
        } finally {
            DOM.showLoading(false);
        }
    }
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

init();
