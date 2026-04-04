import { ChangelogData, CURRENT_VERSION } from './changelog.data.js';
import { initializeTheme } from '../../themeService.js';

async function init() {
    initializeTheme('themeToggleBtn');

    const appVersionEl = document.getElementById('appVersion');

    if (appVersionEl) {
        appVersionEl.textContent = CURRENT_VERSION;
    }

    const container = document.getElementById('fullChangelogContent');
    if (container) {
        container.innerHTML = ChangelogData.map(item => `
            <div class="changelog-item">
                <div class="changelog-header">
                    <span class="changelog-version">v${item.version}</span>
                    <span class="changelog-date">${new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                </div>
                <ul class="changelog-list">
                    ${item.changes.map(change => `<li>${change}</li>`).join('')}
                </ul>
            </div>
        `).join('');
    }

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 100);
}

init();
