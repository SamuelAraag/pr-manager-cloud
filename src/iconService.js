let scheduled = null;
let warnOnce = false;

function tryCreateIcons() {
    const create = window?.lucide?.createIcons;
    if (typeof create !== 'function') return false;

    try {
        create();
        return true;
    } catch (error) {
        console.warn('Falha ao renderizar ícones (lucide.createIcons):', error);
        return false;
    }
}

/**
 * Renders Lucide icons, retrying for a short period to avoid race conditions with CDN loading.
 */
export function refreshIcons({ retries = 30, delayMs = 100 } = {}) {
    if (tryCreateIcons()) return;

    let remaining = Math.max(0, retries);
    if (scheduled) return;

    const tick = () => {
        scheduled = null;

        if (tryCreateIcons()) {
            warnOnce = false;
            return;
        }

        remaining -= 1;
        if (remaining <= 0) {
            if (!warnOnce) {
                warnOnce = true;
                console.warn('Lucide não carregou a tempo; ícones podem ficar sem renderizar.');
            }
            return;
        }

        scheduled = window.setTimeout(tick, delayMs);
    };

    scheduled = window.setTimeout(tick, delayMs);
}

