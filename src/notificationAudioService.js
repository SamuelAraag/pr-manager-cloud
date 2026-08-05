import * as DOM from './domService.js';

export function initNotificationAudio({
    src = 'src/assets/sounds/digital-bell-ui.mp3',
    volume = 0.2,
    throttleMs = 350,
    showUnlockHint = true,
} = {}) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = Math.min(1, Math.max(0, volume));

    let unlocked = false;
    let lastPlayedAt = 0;
    let warnedUnlock = false;
    let armed = false;

    async function unlockFromGesture() {
        try {
            const prevMuted = audio.muted;
            audio.muted = true;
            audio.currentTime = 0;
            await audio.play();
            audio.pause();
            audio.currentTime = 0;
            audio.muted = prevMuted;
            unlocked = true;
            return true;
        } catch {
            unlocked = false;
            return false;
        }
    }

    function armUnlockOnNextGesture() {
        if (armed || unlocked) return;
        armed = true;

        const handler = async () => {
            document.removeEventListener('pointerdown', handler, { capture: true });
            document.removeEventListener('keydown', handler, { capture: true });
            armed = false;
            await unlockFromGesture();
        };

        document.addEventListener('pointerdown', handler, { capture: true, once: true });
        document.addEventListener('keydown', handler, { capture: true, once: true });
    }

    // Best-effort: arm unlock immediately so the first interaction enables sound.
    armUnlockOnNextGesture();

    async function play() {
        const now = Date.now();
        if (now - lastPlayedAt < throttleMs) return false;
        lastPlayedAt = now;

        if (!unlocked) {
            armUnlockOnNextGesture();
            if (showUnlockHint && !warnedUnlock) {
                warnedUnlock = true;
                DOM.showToast('Para tocar som de notificação, clique na página para liberar áudio do navegador.', 'info');
            }
            return false;
        }

        try {
            audio.currentTime = 0;
            await audio.play();
            return true;
        } catch {
            unlocked = false;
            armUnlockOnNextGesture();
            return false;
        }
    }

    return { play };
}
