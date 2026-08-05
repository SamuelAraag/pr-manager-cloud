import * as DOM from './domService.js';

let didInit = false;
let armed = false;

function supportsNotifications() {
    return typeof window !== 'undefined' && 'Notification' in window;
}

async function requestPermissionSafe() {
    if (!supportsNotifications()) return 'unsupported';

    try {
        return await Notification.requestPermission();
    } catch {
        // Some browsers throw if called without a user gesture.
        return Notification.permission;
    }
}

function armPermissionRequestOnNextGesture() {
    if (armed) return;
    if (!supportsNotifications()) return;
    if (Notification.permission !== 'default') return;

    armed = true;
    const handler = async () => {
        document.removeEventListener('pointerdown', handler, { capture: true });
        document.removeEventListener('keydown', handler, { capture: true });
        armed = false;

        const permission = await requestPermissionSafe();
        if (permission === 'denied') {
            DOM.showToast('Notificações do navegador bloqueadas. Libere nas configurações do site.', 'warning');
        }
    };

    document.addEventListener('pointerdown', handler, { capture: true, once: true });
    document.addEventListener('keydown', handler, { capture: true, once: true });
}

export function initBrowserNotifications({ autoPrompt = true } = {}) {
    if (didInit) return;
    didInit = true;

    if (!supportsNotifications()) return;

    // Try ASAP (some browsers will ignore without gesture, but it's harmless).
    if (autoPrompt && Notification.permission === 'default') {
        setTimeout(() => {
            void requestPermissionSafe().finally(() => armPermissionRequestOnNextGesture());
        }, 0);
    } else {
        armPermissionRequestOnNextGesture();
    }
}

export function showBrowserNotification({
    title = 'PR Manager',
    body = '',
    icon = 'favicon.png',
    silent = false,
    tag = '',
    data = null,
    onClickUrl = '',
} = {}) {
    if (!supportsNotifications()) return false;
    if (Notification.permission !== 'granted') return false;

    try {
        const n = new Notification(title, {
            body,
            icon,
            silent,
            tag: tag || undefined,
            data: data ?? undefined,
        });

        n.onclick = () => {
            try {
                window.focus();
            } catch {}

            if (onClickUrl) {
                window.open(onClickUrl, '_blank', 'noopener');
            }

            try {
                n.close();
            } catch {}
        };

        return true;
    } catch (error) {
        console.warn('Falha ao criar Notification:', error);
        return false;
    }
}
