import { ChangelogData, CURRENT_VERSION } from './changelog.data.js';
import { initializeTheme } from '../../themeService.js';

function formatChangelogDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    const localDate = new Date(year, month - 1, day);

    return localDate.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

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
                    <span class="changelog-date">${formatChangelogDate(item.date)}</span>
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
