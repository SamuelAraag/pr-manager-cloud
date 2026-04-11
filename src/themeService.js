const THEME_STORAGE_KEY = 'pr_manager_theme';
const DEFAULT_THEME = 'dark';

function normalizeTheme(theme) {
    return theme === 'dark' ? 'dark' : 'light';
}

function getStoredTheme() {
    try {
        return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME);
    } catch {
        return DEFAULT_THEME;
    }
}

function applyTheme(theme) {
    const normalizedTheme = normalizeTheme(theme);
    document.documentElement.setAttribute('data-theme', normalizedTheme);
    try {
        localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
    } catch {
        // noop
    }
    return normalizedTheme;
}

function getThemeToggleLabel(theme) {
    return theme === 'dark' ? 'Tema Escuro' : 'Tema Claro';
}

function updateThemeToggleButton(button, theme) {
    if (!button) return;

    button.setAttribute('data-theme-value', theme);
    button.setAttribute('title', `Alternar tema. Atual: ${getThemeToggleLabel(theme)}`);

    const label = button.querySelector('[data-role="theme-label"]');
    const icon = button.querySelector('[data-role="theme-icon"]');

    if (icon) {
        icon.setAttribute('data-lucide', theme === 'dark' ? 'moon' : 'sun');
    }

    if (label) {
        label.textContent = theme === 'dark' ? 'Escuro' : 'Claro';
        label.setAttribute('aria-hidden', 'true');
    } else if (!icon) {
        button.textContent = getThemeToggleLabel(theme);
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function initializeTheme(buttonId = null) {
    const currentTheme = applyTheme(getStoredTheme());

    if (!buttonId) return currentTheme;

    const button = document.getElementById(buttonId);
    if (!button) return currentTheme;

    updateThemeToggleButton(button, currentTheme);

    button.addEventListener('click', () => {
        const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark'
            ? 'light'
            : 'dark';

        const appliedTheme = applyTheme(nextTheme);
        updateThemeToggleButton(button, appliedTheme);
    });

    return currentTheme;
}

export { applyTheme, getStoredTheme, initializeTheme };
