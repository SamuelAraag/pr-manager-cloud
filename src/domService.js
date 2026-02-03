import { getItem } from './localStorageService.js';

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type}`;
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

function renderTable(prs, batches, sprints, onEdit) {
    const openPrs = prs.filter(p => !p.approved);
    
    const approvedTotal = prs.filter(p => p.approved);
    const approvedPending = approvedTotal.filter(p => !p.deployedToStg);
    
    const activeSprints = sprints.filter(s => s.isActive);
    const inactiveSprints = sprints.filter(s => !s.isActive);

    const totalOpenBadge = document.getElementById('totalOpenPrs');
    if (totalOpenBadge) {
        totalOpenBadge.textContent = openPrs.length;
        totalOpenBadge.style.display = openPrs.length > 0 ? 'inline-block' : 'none';
    }

    renderOpenTable(openPrs, 'openPrTableBody', onEdit);
    renderApprovedTables(approvedPending, batches, 'dashboardApproved', onEdit);
    renderTestingTable(activeSprints, 'dashboardTesting', onEdit);
    renderHistoryTable(inactiveSprints, 'dashboardHistory', onEdit);

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function renderOpenTable(data, containerId, onEdit) {
    const body = document.getElementById(containerId);
    if (!body) return;
    body.innerHTML = '';
    if (data.length === 0) {
        body.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum PR pendente.</td></tr>';
        return;
    }
    const grouped = data.reduce((acc, pr) => {
        const project = pr.project || 'Outros';
        if (!acc[project]) acc[project] = [];
        acc[project].push(pr);
        return acc;
    }, {});
    const projectNames = Object.keys(grouped).sort();
    
    let animationDelay = 0;

    projectNames.forEach(projectName => {
        const projectPrs = grouped[projectName];
        const headerContent = `${projectName} (${projectPrs.length})`;
        const headerRow = document.createElement('tr');
        headerRow.className = 'group-header fade-in-row';
        headerRow.style.animationDelay = `${animationDelay}ms`;
        animationDelay += 50;

        headerRow.innerHTML = `<td colspan="6"><div style="display:flex; justify-content:space-between; align-items:center;"><div style="font-weight: 600;">${headerContent}</div></div></td>`;
        body.appendChild(headerRow);
        
        projectPrs.forEach((pr) => {
            const tr = document.createElement('tr');
            tr.className = 'fade-in-row';
            tr.style.animationDelay = `${animationDelay}ms`;
            animationDelay += 50;

            const needsCorrection = !!pr.needsCorrection;
            const currentUser = getItem('appUser');
            const isSamuel = currentUser === 'Samuel Santos';
            
            if (isSamuel) {
                if (!needsCorrection) {
                    tr.style.background = 'rgba(211, 84, 0, 0.05)';
                    tr.style.borderLeft = '3px solid #d35400';
                }
            } else {
                if (needsCorrection && pr.dev === currentUser) {
                    tr.style.background = 'rgba(230, 126, 34, 0.05)';
                    tr.style.borderLeft = '3px solid #e67e22';
                }
            }

            let statusBg, statusText, statusTooltip;

            if (needsCorrection) {
                statusBg = '#e67e22';
                statusText = 'Ajustes';
                statusTooltip = `title="Motivo: ${pr.correctionReason || 'Geral'}" style="cursor:help; background: ${statusBg}"`;
            } else if (pr.reqVersion === 'ok' || !pr.reqVersion) {
                statusText = 'Revisão';
                statusBg = isSamuel ? '#d35400' : '#30363d'; 
                statusTooltip = `style="background: ${statusBg}"`;
            } else {
                statusBg = '#30363d';
                statusText = pr.reqVersion;
                statusTooltip = `style="background: ${statusBg}"`;
            }

            tr.innerHTML = `
                <td><span class="tag">${pr.project || '-'}</span></td>
                <td style="font-weight: 500;">${pr.summary || '-'}</td>
                <td>${pr.dev || '-'}</td>
                <td><span class="status-badge" ${statusTooltip}>${statusText}</span></td>
                <td><div style="display: flex; gap: 0.8rem;">${pr.teamsLink ? `<a href="${pr.teamsLink}" target="_blank" class="link-icon" title="Link Teams"><i data-lucide="message-circle" style="width: 16px;"></i></a>` : ''}${pr.taskLink ? `<a href="${pr.taskLink}" target="_blank" class="link-icon" title="Link Task"><i data-lucide="external-link" style="width: 16px;"></i></a>` : ''}${pr.prLink ? `<a href="${pr.prLink}" target="_blank" class="link-icon" title="Link PR"><i data-lucide="git-pull-request" style="width: 16px;"></i></a>` : ''}${renderRelatedLinks(pr.linksRelatedTask)}</div></td>
                <td>
                    <div style="display: flex; gap: 5px; justify-content: flex-end;">
                        <button class="btn btn-outline edit-btn" style="padding: 0.4rem;" title="Editar"><i data-lucide="edit-3" style="width: 14px;"></i></button>
                        
                        ${getItem('appUser') === 'Samuel Santos' ? 
                            `<button class="btn btn-outline" 
                                style="padding: 0.4rem; border-color: #d35400; color: #e67e22; ${needsCorrection ? 'opacity: 0.5; cursor: not-allowed;' : ''}" 
                                title="${needsCorrection ? 'Correção já solicitada' : 'Solicitar Correção'}"
                                onclick="${needsCorrection ? '' : `window.requestCorrection('${pr.id}')`}"
                                ${needsCorrection ? 'disabled' : ''}>
                                <i data-lucide="alert-circle" style="width: 14px;"></i>
                            </button>
                            <button class="btn btn-outline" 
                                style="padding: 0.4rem; border-color: #238636; color: #238636;" 
                                title="Aprovar PR"
                                onclick="window.approvePr('${pr.id}')">
                                <i data-lucide="check-circle" style="width: 14px;"></i>
                            </button>` 
                            : ''}

                        ${(getItem('appUser') === pr.dev && needsCorrection) ? 
                            `<button class="btn btn-outline" 
                                style="padding: 0.4rem; border-color: #238636; color: #238636;" 
                                title="Marcar como Corrigido"
                                onclick="window.markPrFixed('${pr.id}')">
                                <i data-lucide="check" style="width: 14px;"></i>
                            </button>` 
                            : ''}
                            
                        ${(getItem('appUser') === 'Samuel Santos') ?
                            `<button class="btn btn-outline" 
                                style="padding: 0.4rem; border-color: #da3633; color: #da3633;" 
                                title="Arquivar PR"
                                onclick="window.archivePr('${pr.id}')">
                                <i data-lucide="trash-2" style="width: 14px;"></i>
                            </button>`
                            : ''}
                    </div>
                </td>`;
            const editBtn = tr.querySelector('.edit-btn');
            editBtn.addEventListener('click', () => onEdit(pr));
            body.appendChild(tr);
        });
    });
}

function renderTestingTable(activeSprints, containerId, onEdit) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    let hasDeployed = false;
    let totalTestingBatches = 0;
    activeSprints.forEach(sprint => {
        const deployedBatches = (sprint.versionBatches || []).filter(b => b.status === 'Deployed');
        if (deployedBatches.length > 0) hasDeployed = true;
        totalTestingBatches += deployedBatches.length;
    });

    const totalTestingBadge = document.getElementById('totalTestingPrs');
    if (totalTestingBadge) {
        totalTestingBadge.textContent = totalTestingBatches;
        totalTestingBadge.style.display = totalTestingBatches > 0 ? 'inline-block' : 'none';
    }

    if (!hasDeployed) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary); background: #161b22; border: 1px solid #30363d; border-radius: 6px;">Nenhuma versão em teste (STG).</div>';
        return;
    }

    const currentUser = getItem('appUser');

    let animationDelay = 0;

    activeSprints.forEach(sprint => {
        const deployedBatches = (sprint.versionBatches || []).filter(b => b.status === 'Deployed');
        
        if (deployedBatches.length === 0) return;

        const headerContainer = document.createElement('div');
        headerContainer.className = 'fade-in-row';
        headerContainer.style.animationDelay = `${animationDelay}ms`;
        animationDelay += 50;

        headerContainer.style.display = 'flex';
        headerContainer.style.justifyContent = 'space-between';
        headerContainer.style.alignItems = 'center';
        headerContainer.style.marginBottom = '1rem';
        headerContainer.style.marginTop = '2rem';
        headerContainer.style.borderBottom = '1px solid #30363d';
        headerContainer.style.paddingBottom = '0.5rem';

        const sprintTitle = document.createElement('h3');
        sprintTitle.textContent = sprint.name;
        sprintTitle.style.cssText = 'color: var(--text-primary); margin: 0; padding-left: 15px; border-left: 4px solid #8e44ad; font-size: 1.1rem; opacity: 0.9;';
        
        let completeBtn = '';
        if (currentUser === 'Samuel Santos' || currentUser === 'Kemilly Alvez') {
             completeBtn = `
                <button class="btn btn-outline" style="font-size: 0.75rem; padding: 0.3rem 0.8rem; border-color: #30363d; color: var(--text-secondary);" onclick="window.completeSprint(${sprint.id})">
                    <i data-lucide="check-circle-2" style="width: 14px; margin-right: 5px;"></i>
                    Concluir Sprint
                </button>
            `;
        }

        headerContainer.appendChild(sprintTitle);
        if (completeBtn) {
            const btnContainer = document.createElement('div');
            btnContainer.style.paddingRight = '15px';
            btnContainer.innerHTML = completeBtn;
            headerContainer.appendChild(btnContainer);
        }

        container.appendChild(headerContainer);

        // Render Deployed Version Batches within Sprint
        deployedBatches.forEach(batch => {
            let gitlabLink = '';
            if (batch.gitlabIssueLink) {
                gitlabLink = `
                    <a href="${batch.gitlabIssueLink}" target="_blank" class="btn" style="background-color: #30363d; color: var(--text-secondary); padding: 0.2rem 0.6rem; font-size: 0.75rem; margin-left: 10px; display: inline-flex; align-items: center; gap: 5px; text-decoration: none; border: 1px solid #444; border-radius: 4px;">
                        <i data-lucide="gitlab" style="width: 14px;"></i>
                        Ver Chamado
                    </a>
                `;
            }

            let removeBtn = '';
            if (currentUser === 'Samuel Santos') {
                removeBtn = `
                    <button class="btn" style="background-color: transparent; border: 1px solid #da3633; color: #da3633; padding: 0.2rem 0.6rem; font-size: 0.75rem; margin-left: 10px; display: inline-flex; align-items: center; gap: 5px; border-radius: 4px;" title="Remover Versão e Resetar Lote" onclick="window.removeVersionFromBatch('${batch.batchId}')">
                        <i data-lucide="trash-2" style="width: 14px;"></i>
                    </button>
                `;
            }

            const card = document.createElement('div');
            card.className = 'data-card fade-in-row'; // Add animation class
            card.style.animationDelay = `${animationDelay}ms`; // Set delay
            animationDelay += 50;
            card.style.marginBottom = '1.5rem';
            card.style.borderLeft = '4px solid #8e44ad';
            
            const headerDiv = document.createElement('div');
            headerDiv.style.padding = '1rem';
            headerDiv.style.borderBottom = '1px solid #30363d';
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'space-between';
            headerDiv.style.alignItems = 'center';
            
            headerDiv.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <span style="font-weight: 600; font-size: 1.1rem;">${batch.project} (${(batch.pullRequests || []).length})</span>
                    <span class="tag" style="background:#8e44ad; color:white; margin-left: 10px;">v${batch.version}</span>
                </div>
                <div style="display:flex; align-items:center;">
                    ${gitlabLink}
                    ${removeBtn}
                </div>
            `;
            
            const tableContainer = document.createElement('div');
            tableContainer.className = 'table-container';
            const table = document.createElement('table');
            table.innerHTML = `<thead><tr><th>Projeto</th><th>Resumo</th><th>Dev</th><th>Links</th></tr></thead><tbody></tbody>`;
            const tbody = table.querySelector('tbody');
            (batch.pullRequests || []).forEach(pr => {
                const tr = document.createElement('tr');
                 
                let prRemoveBtn = '';
                if (currentUser === 'Samuel Santos') {
                    prRemoveBtn = `
                    <button class="btn" style="background: transparent; color: #ff7b72; border: 1px solid #ff7b72; padding: 0.1rem 0.4rem; font-size: 0.7rem; margin-left: 5px;" 
                        title="Remover este PR desta versão" 
                        onclick="window.removePrFromBatch('${batch.batchId}', '${pr.id}')">
                        <i data-lucide="x" style="width: 12px;"></i>
                    </button>
                    `;
                }

                tr.innerHTML = `<td><span class="tag">${pr.project || '-'}</span></td><td>${pr.summary || '-'}</td><td>${pr.dev || '-'}</td><td><div style="display: flex; gap: 0.8rem; align-items: center;">${pr.teamsLink ? `<a href="${pr.teamsLink}" target="_blank" class="link-icon" title="Link Teams"><i data-lucide="message-circle" style="width: 16px;"></i></a>` : ''}${pr.taskLink ? `<a href="${pr.taskLink}" target="_blank" class="link-icon" title="Link Task"><i data-lucide="external-link" style="width: 14px;"></i></a>` : ''}${pr.prLink ? `<a href="${pr.prLink}" target="_blank" class="link-icon" title="Link PR"><i data-lucide="git-pull-request" style="width: 14px;"></i></a>` : ''}${renderRelatedLinks(pr.linksRelatedTask)}${prRemoveBtn}</div></td>`;
                 tbody.appendChild(tr);
            });

            tableContainer.appendChild(table);
            card.appendChild(headerDiv);
            card.appendChild(tableContainer);
            container.appendChild(card);
        });
    });
}

function renderHistoryTable(inactiveSprints, containerId, onEdit) {
    // Renders the COMPLETED sprints (History)
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    
    if (inactiveSprints.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary); background: #161b22; border: 1px solid #30363d; border-radius: 6px; opacity: 0.6;">Nenhum histórico disponível.</div>';
        return;
    }

    let animationDelay = 0;

    inactiveSprints.forEach(sprint => {
        // Sprint Header (Grayer / Simpler)
        const sprintHeader = document.createElement('h4');
        sprintHeader.textContent = sprint.name;
        sprintHeader.style.cssText = 'color: var(--text-secondary); margin: 2rem 0 1rem 0; padding-left: 10px; border-left: 3px solid #555; font-size: 1rem; opacity: 0.7;';
        sprintHeader.className = 'fade-in-row'; // Add animation class
        sprintHeader.style.animationDelay = `${animationDelay}ms`; // Set delay
        animationDelay += 50;
        
        container.appendChild(sprintHeader);

        (sprint.versionBatches || []).forEach(batch => {
            let gitlabLink = '';
            if (batch.gitlabIssueLink) {
                 gitlabLink = `
                    <a href="${batch.gitlabIssueLink}" target="_blank" style="color: var(--text-secondary); font-size: 0.75rem; text-decoration: none; opacity: 0.8;">
                        <i data-lucide="gitlab" style="width: 12px;"></i> Issue
                    </a>
                `;
            }

            const card = document.createElement('div');
            card.className = 'data-card fade-in-row'; // Add animation class to card
            card.style.animationDelay = `${animationDelay}ms`; // Set delay
            animationDelay += 50;

            card.style.marginBottom = '1rem';
            card.style.border = '1px solid #30363d'; // Simple border, no color
            card.style.backgroundColor = 'rgba(22, 27, 34, 0.5)'; // Slighly transparent
            card.style.opacity = '0.7'; // Overall dimmer look

            const headerDiv = document.createElement('div');
            headerDiv.style.padding = '0.5rem 1rem'; // Compact padding
            headerDiv.style.borderBottom = '1px solid #30363d';
            headerDiv.style.display = 'flex';
            headerDiv.style.justifyContent = 'space-between';
            headerDiv.style.alignItems = 'center';
            headerDiv.style.background = '#21262d';
            
            headerDiv.innerHTML = `
                <div style="display:flex; align-items:center; gap: 10px;">
                    <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-secondary);">${batch.project}</span>
                    <span class="tag" style="background:#555; color:#ccc; font-size:0.7rem;">v${batch.version}</span>
                </div>
                <div>${gitlabLink}</div>
            `;
            
            const tableContainer = document.createElement('div');
            tableContainer.className = 'table-container';
            const table = document.createElement('table');
            table.style.fontSize = '0.85rem';
            table.innerHTML = `<thead><tr style="background:transparent;"><th style="padding:0.5rem;">Projeto</th><th style="padding:0.5rem;">Resumo</th><th style="padding:0.5rem;">Dev</th><th style="padding:0.5rem;">Links</th></tr></thead><tbody></tbody>`;
            const tbody = table.querySelector('tbody');
            (batch.pullRequests || []).forEach(pr => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td style="padding:0.5rem; color:var(--text-secondary);">${pr.project || '-'}</td><td style="padding:0.5rem; color:var(--text-secondary);">${pr.summary || '-'}</td><td style="padding:0.5rem; color:var(--text-secondary);">${pr.dev || '-'}</td><td style="padding:0.5rem;"><div style="display: flex; gap: 0.8rem; align-items: center;">${pr.teamsLink ? `<a href="${pr.teamsLink}" target="_blank" class="link-icon" title="Link Teams"><i data-lucide="message-circle" style="width: 16px;"></i></a>` : ''}${pr.taskLink ? `<a href="${pr.taskLink}" target="_blank" class="link-icon" title="Link Task"><i data-lucide="external-link" style="width: 14px;"></i></a>` : ''}${pr.prLink ? `<a href="${pr.prLink}" target="_blank" class="link-icon" title="Link PR"><i data-lucide="git-pull-request" style="width: 14px;"></i></a>` : ''}${renderRelatedLinks(pr.linksRelatedTask)}</div></td>`;
                tbody.appendChild(tr);
            });

            tableContainer.appendChild(table);
            card.appendChild(headerDiv);
            card.appendChild(tableContainer);
            container.appendChild(card);
        });
    });
}

function renderApprovedTables(approvedPrs, batches, containerId, onEdit) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const pendingBatches = batches.filter(b => b.status === 'Pending' || b.status === 'Released');
    
    const prIdsInBatches = new Set(batches.flatMap(b => b.pullRequests.map(pr => pr.id)));
    const backlogPrs = approvedPrs.filter(pr => !prIdsInBatches.has(pr.id));
    
    const totalApprovedBadge = document.getElementById('totalApprovedPrs');
    if (totalApprovedBadge) {
        totalApprovedBadge.textContent = approvedPrs.length;
        totalApprovedBadge.style.display = approvedPrs.length > 0 ? 'inline-block' : 'none';
    }
    
    const backlogByProject = backlogPrs.reduce((acc, pr) => {
        const p = pr.project || 'Outros';
        if (!acc[p]) acc[p] = [];
        acc[p].push(pr);
        return acc;
    }, {});
    
    let animationDelay = 0;

    const currentUser = getItem('appUser');
    pendingBatches.forEach(batch => {
        const card = createApprovedCard(batch.project, batch.pullRequests, currentUser, batch.batchId, batch.gitlabIssueLink);
        card.classList.add('fade-in-row');
        card.style.animationDelay = `${animationDelay}ms`;
        animationDelay += 50;
        container.appendChild(card);
    });

    Object.keys(backlogByProject).sort().forEach(projectName => {
        const projectPrs = backlogByProject[projectName];
        const card = createApprovedCard(projectName, projectPrs, currentUser, null);
        card.classList.add('fade-in-row');
        card.style.animationDelay = `${animationDelay}ms`;
        animationDelay += 50;
        container.appendChild(card);
    });

    if (pendingBatches.length === 0 && backlogPrs.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary); background: #161b22; border: 1px solid #30363d; border-radius: 6px;">Nenhum PR aguardando liberação.</div>';
    }
}

function createApprovedCard(projectName, projectPrs, currentUser, batchId, batchLink = null) {
    const isRequestingVersion = projectPrs.some(p => p.versionRequested);
    let headerStyle = '';
    let leftContent = `${projectName} (${projectPrs.length})`;
    let rightContent = '';
    let versionInputs = '';
    const hasVersionInfo = projectPrs.some(p => p.version);

    const uniqueKey = batchId || projectName.replace(/\s/g, '') + (hasVersionInfo ? projectPrs[0].version : ''); 

    let deployBtn = '';
    const info = projectPrs.find(p => p.version) || projectPrs[0];
    const gitlabIssueLink = batchLink || info?.gitlabIssueLink;

    if (hasVersionInfo) {
        let gitlabLink = '';
        if (gitlabIssueLink) {
                gitlabLink = `
                <a href="${gitlabIssueLink}" target="_blank" class="btn" style="background-color: #FC6D26; color: white; padding: 0.2rem 0.6rem; font-size: 0.75rem; margin-left: 10px; display: inline-flex; align-items: center; gap: 5px; text-decoration: none; border-radius: 4px;">
                    <i data-lucide="gitlab" style="width: 14px;"></i>
                    Ver Chamado
                </a>
            `;
            
            if (currentUser === 'Samuel Santos') {
                    deployBtn = `
                    <button class="btn" style="background-color: #8e44ad; color: white; padding: 0.3rem 0.6rem; font-size: 0.75rem; margin-left: 10px; display: inline-flex; align-items: center; gap: 5px; border-radius: 4px;" onclick="window.confirmDeploy('${batchId}')">
                        <i data-lucide="rocket" style="width: 14px;"></i>
                        Liberar STG
                    </button>
                `;
            }
        }
        rightContent += ` 
            <div style="display: flex; align-items: center; gap: 15px;">
                <span class="tag" style="background:#238636; color:white;">v${info.version}</span>
                ${gitlabLink}
                ${deployBtn}
            </div>
        `;
    }

    if (isRequestingVersion) {
        const devCounts = projectPrs.reduce((acc, pr) => { acc[pr.dev] = (acc[pr.dev] || 0) + 1; return acc; }, {});
        const majorityDev = Object.keys(devCounts).reduce((a, b) => devCounts[a] > devCounts[b] ? a : b);
        if (currentUser === majorityDev) {
            headerStyle = 'background-color: rgba(218, 54, 51, 0.2); border: 1px solid #da3633; color: #ff7b72;'; 
            leftContent += ` <span style="font-size:0.75rem; margin-left:10px; color:#ff7b72;">(Ação Necessária: Versão)</span>`;
            versionInputs = `
                <div style="margin-top: 15px; display: flex; gap: 10px; align-items: center; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <input type="text" placeholder="Versão (ex: 1.0.0)" class="version-input-group" id="v_ver_${uniqueKey}" style="font-size:0.85rem; padding:0.4rem;">
                    <input type="url" placeholder="Pipeline Link" class="version-input-group" id="v_pipe_${uniqueKey}" style="font-size:0.85rem; padding:0.4rem;">
                    <input type="text" placeholder="Rollback" class="version-input-group" id="v_roll_${uniqueKey}" style="font-size:0.85rem; padding:0.4rem;">
                    <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size:0.8rem;" onclick="window.saveGroupVersion('${batchId}')">Salvar</button>
                </div>`;
        } else {
            leftContent += ` <span style="font-size:0.75rem; margin-left:10px; color:#ff7b72;">(Aguardando: ${majorityDev})</span>`;
        }
    } else if (hasVersionInfo && currentUser === 'Samuel Santos' && !gitlabIssueLink) {
            leftContent += `
                <button class="btn" style="background-color: #6C5CE7; color: white; padding: 0.3rem 0.8rem; font-size: 0.75rem; display: flex; align-items: center; gap: 5px; margin-left: 15px;" onclick="window.createGitLabIssue('${batchId}')">
                    <i data-lucide="gitlab" style="width: 14px;"></i>
                    Criar Chamado
                </button>`;
    }

    const card = document.createElement('div');
    card.className = 'data-card';
    card.style.marginBottom = '2rem'; 
    let requestVersionBtn = '';
    
    const canRequestVersion = currentUser === 'Samuel Santos' || currentUser === 'Kemilly Vitória';
    if (!hasVersionInfo && !isRequestingVersion && canRequestVersion) {
            requestVersionBtn = `
           <button class="btn btn-primary" style="padding: 0.3rem 0.8rem; font-size: 0.75rem; display: flex; align-items: center; gap: 5px; margin-left:15px;" onclick="window.requestVersionBatch([${projectPrs.map(p => p.id).join(',')}], '${projectName.replace(/'/g, "\\'")}')">
                <i data-lucide="package-check" style="width: 14px;"></i>
                Solicitar Versão
            </button>`;
    }
    
    
    let deleteBatchBtn = '';
    if (batchId && currentUser === 'Samuel Santos') {
        deleteBatchBtn = `
            <button class="btn" style="background: transparent; color: #da3633; border: 1px solid #da3633; padding: 0.2rem 0.6rem; font-size: 0.75rem; margin-left: 10px; display: inline-flex; align-items: center; gap: 5px; border-radius: 4px;" 
                title="Deletar este lote completamente" 
                onclick="window.deleteBatch('${batchId}')">
                <i data-lucide="trash" style="width: 14px;"></i>
                Deletar Lote
            </button>
        `;
    }
    
    rightContent += requestVersionBtn;
    rightContent += deleteBatchBtn;

    const headerDiv = document.createElement('div');
    headerDiv.style.padding = '1rem';
    headerDiv.style.borderBottom = '1px solid #30363d';
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';
    if (headerStyle) { headerDiv.style.cssText += headerStyle; }
    headerDiv.innerHTML = `<div style="display:flex; align-items:center;">${leftContent}</div><div style="display:flex; align-items:center;">${rightContent}</div>`;

    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-container';
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Projeto</th><th>Resumo</th><th>Dev</th><th>Status</th><th>Rollback</th><th>Links</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    
    projectPrs.forEach(pr => {
        const tr = document.createElement('tr');
        
        let prRemoveBtn = '';
        if (batchId && (isRequestingVersion || hasVersionInfo) && currentUser === 'Samuel Santos') {
            prRemoveBtn = `
                <button class="btn" style="background: transparent; color: #ff7b72; border: 1px solid #ff7b72; padding: 0.1rem 0.4rem; font-size: 0.7rem; margin-left: 5px;" 
                    title="Remover este PR desta versão" 
                    onclick="window.removePrFromBatch('${batchId}', '${pr.id}')">
                    <i data-lucide="x" style="width: 12px;"></i>
                </button>
            `;
        }
        
        let archiveBtn = '';
        if (!batchId && (currentUser === 'Samuel Santos')) {
            archiveBtn = `
                <button class="btn" style="background: transparent; color: #da3633; border: 1px solid #da3633; padding: 0.1rem 0.4rem; font-size: 0.7rem; margin-left: 5px;" 
                    title="Arquivar PR" 
                    onclick="window.archivePr('${pr.id}')">
                    <i data-lucide="archive" style="width: 12px;"></i>
                </button>
            `;
        }
        
        tr.innerHTML = `
            <td><span class="tag">${pr.project || '-'}</span></td>
            <td style="font-weight: 500;">${pr.summary || '-'}</td>
            <td>${pr.dev || '-'}</td>
            <td><span class="status-badge" style="background: #8e44ad">Mergeado</span></td>
            <td style="font-size: 0.8rem; color: var(--text-secondary);">${pr.rollback || '-'}</td>
            <td>
                <div style="display: flex; gap: 5px; justify-content: flex-end; align-items: center;">
                    ${pr.teamsLink ? `<a href="${pr.teamsLink}" target="_blank" class="link-icon" title="Link Teams"><i data-lucide="message-circle" style="width: 16px;"></i></a>` : ''}
                    ${pr.taskLink ? `<a href="${pr.taskLink}" target="_blank" class="link-icon" title="Link Task"><i data-lucide="external-link" style="width: 16px;"></i></a>` : ''}
                    ${pr.prLink ? `<a href="${pr.prLink}" target="_blank" class="link-icon" title="Link PR"><i data-lucide="git-pull-request" style="width: 16px;"></i></a>` : ''}
                    ${renderRelatedLinks(pr.linksRelatedTask)}
                    ${prRemoveBtn}
                    ${archiveBtn}
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
    card.appendChild(headerDiv);
    if (versionInputs) {
        const inputsDiv = document.createElement('div');
        inputsDiv.style.padding = '1rem';
        inputsDiv.style.background = 'rgba(218, 54, 51, 0.05)';
        inputsDiv.innerHTML = versionInputs;
        card.appendChild(inputsDiv);
    }
    tableContainer.appendChild(table);
    card.appendChild(tableContainer);
    
    return card;
}

function renderRelatedLinks(linksString) {
    if (!linksString || typeof linksString !== 'string') return '';
    try {
        const links = linksString.split(';').filter(link => link.trim().startsWith('http'));
        return links.map((link, index) => {
            return `<a href="${link}" target="_blank" class="link-icon" title="Tarefa Vinculada ${index + 1}" style="color: #bc85ff;"><i data-lucide="link" style="width: 14px;"></i></a>`;
        }).join('');
    } catch (e) {
        return '';
    }
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    const db = document.getElementById('dashboard');
    const dbApp = document.getElementById('dashboardApproved');
    const dbTest = document.getElementById('dashboardTesting');
    const dbHist = document.getElementById('dashboardHistory');

    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
    
    const contentDisplay = show ? 'none' : 'block';
    
    if (db) db.style.display = contentDisplay;
    if (dbApp) dbApp.style.display = contentDisplay;
    if (dbTest) dbTest.style.display = contentDisplay;
    if (dbHist) dbHist.style.display = contentDisplay;
}

export { showToast, renderTable, showLoading };
