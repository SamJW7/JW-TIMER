import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';
import { KeepAwake } from '@capacitor-community/keep-awake';

const OverlayNative = registerPlugin('Overlay');

let wakeLockSentinel = null;
let overlayActive = false;
let commandCallback = null;
let lifecycleCallback = null;
let lastOverlayState = null;

export function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/* =========================================================
   VIBRATION / HAPTICS BRIDGE
   ========================================================= */
export async function triggerVibrationPattern(patternMs) {
  const seq = Array.isArray(patternMs) ? patternMs : [patternMs];
  const validSeq = seq.map((n) => Math.max(20, Math.round(Number(n) || 0)));

  if (isNativeAndroid()) {
    try {
      for (let i = 0; i < validSeq.length; i += 2) {
        const vibrateMs = validSeq[i];
        await Haptics.vibrate({ duration: vibrateMs });
        const pauseMs = validSeq[i + 1];
        if (pauseMs && i + 2 < validSeq.length) {
          await new Promise((res) => setTimeout(res, vibrateMs + pauseMs));
        }
      }
      return true;
    } catch (err) {
      console.warn('Capacitor Haptics fallback to navigator.vibrate:', err);
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(validSeq.length === 1 ? validSeq[0] : validSeq);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/* =========================================================
   KEEP SCREEN AWAKE BRIDGE
   ========================================================= */
export async function setKeepScreenAwake(enabled) {
  if (isNativeAndroid()) {
    try {
      if (enabled) {
        await KeepAwake.keepAwake();
      } else {
        await KeepAwake.allowSleep();
      }
      return true;
    } catch (err) {
      console.warn('KeepAwake native warning:', err);
    }
  }

  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      if (enabled) {
        if (!wakeLockSentinel) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
          wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
          });
        }
      } else if (wakeLockSentinel) {
        await wakeLockSentinel.release();
        wakeLockSentinel = null;
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/* =========================================================
   NATIVE APP LIFECYCLE & ML KIT OCR BRIDGE
   ========================================================= */
export const NativeAppBridge = {
  async exitApp() {
    if (isNativeAndroid()) {
      try {
        await OverlayNative.exitApp();
        return true;
      } catch (err) {
        console.warn('Native exitApp failed:', err);
      }
    }
    return false;
  },

  async recognizeImage(base64) {
    if (!isNativeAndroid()) {
      throw new Error('NATIVE_MLKIT_REQUIRED');
    }
    return await OverlayNative.recognizeImage({ base64 });
  },
};

/* =========================================================
   ANDROID FLOATING OVERLAY BRIDGE (window.AndroidOverlay)
   ========================================================= */
function dispatchCommand(action) {
  if (typeof commandCallback === 'function') {
    commandCallback(action);
  }
  if (typeof window.onAndroidOverlayCommand === 'function') {
    window.onAndroidOverlayCommand(action);
  }
}

export function initOverlayListeners(onCommand, onLifecycle) {
  commandCallback = onCommand;
  lifecycleCallback = onLifecycle;

  if (isNativeAndroid()) {
    try {
      OverlayNative.addListener('overlayAction', (data) => {
        if (data?.action) {
          dispatchCommand(data.action);
        }
      });

      OverlayNative.addListener('appLifecycle', (data) => {
        if (data?.event && typeof lifecycleCallback === 'function') {
          lifecycleCallback(data.event, Boolean(data.hasPermission));
        }
      });
    } catch (err) {
      console.warn('Overlay listener setup failed:', err);
    }
  }

  window.addEventListener('androidOverlayCommand', (ev) => {
    const action = ev?.detail?.action || ev?.detail;
    if (action) dispatchCommand(action);
  });
}

function drawPiPPreview(state) {
  const canvas = document.getElementById('pip-canvas');
  if (!canvas || !state) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rem = Number(state.remainingSeconds) || 0;
  const isOver = Boolean(state.isOvertime) || rem < 0;
  const isWarn = Boolean(state.isWarning) || (!isOver && rem <= 60);
  const abs = Math.abs(rem);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const digits = `${isOver ? '+' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  ctx.fillStyle = isOver ? '#2a0b12' : '#080f1f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = isOver ? '#ef4444' : isWarn ? '#f59e0b' : '#10b981';
  ctx.font = 'bold 76px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(digits, canvas.width / 2, 118);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px sans-serif';
  const title = (state.partTitle || 'JW Timer').slice(0, 34);
  ctx.fillText(title, canvas.width / 2, 168);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px sans-serif';
  const spk = (state.speaker || '').slice(0, 38);
  ctx.fillText(spk, canvas.width / 2, 204);
}

async function toggleBrowserPiP(state) {
  const video = document.getElementById('pip-video');
  const canvas = document.getElementById('pip-canvas');
  if (!video || !canvas || !document.pictureInPictureEnabled) {
    return false;
  }

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      overlayActive = false;
      return false;
    }
    drawPiPPreview(state);
    if (!video.srcObject) {
      video.srcObject = canvas.captureStream(10);
      await video.play();
    }
    await video.requestPictureInPicture();
    overlayActive = true;
    video.addEventListener(
      'leavepictureinpicture',
      () => {
        overlayActive = false;
      },
      { once: true }
    );
    return true;
  } catch {
    return false;
  }
}

export const AndroidOverlayBridge = {
  isOverlayActive() {
    return overlayActive;
  },

  // Manual tap on Float Overlay button — prompts for permission if missing
  async toggle(state) {
    lastOverlayState = state;
    if (isNativeAndroid()) {
      if (overlayActive) {
        await OverlayNative.stopOverlay();
        overlayActive = false;
        return { active: false, permissionRequired: false };
      }
      const perm = await OverlayNative.checkPermission();
      if (!perm?.granted) {
        await OverlayNative.requestPermission();
        const recheck = await OverlayNative.checkPermission();
        if (!recheck?.granted) {
          return { active: false, permissionRequired: true };
        }
      }
      await OverlayNative.startOverlay(state);
      overlayActive = true;
      return { active: true, permissionRequired: false };
    }

    const started = await toggleBrowserPiP(state);
    return { active: started, permissionRequired: false, browserFallback: true };
  },

  // Silent Auto-Float when leaving app — never opens permission settings automatically
  async tryAutoShow(state) {
    lastOverlayState = state;
    if (!isNativeAndroid()) return false;
    try {
      const perm = await OverlayNative.checkPermission();
      if (!perm?.granted) return false;
      await OverlayNative.startOverlay(state);
      overlayActive = true;
      return true;
    } catch {
      return false;
    }
  },

  async syncState(state) {
    lastOverlayState = state;
    if (!overlayActive) return;

    if (isNativeAndroid()) {
      try {
        await OverlayNative.updateState(state);
      } catch (err) {
        console.warn('Overlay update failed:', err);
      }
    } else if (document.pictureInPictureElement) {
      drawPiPPreview(state);
    }
  },

  async hide() {
    if (!overlayActive && !isNativeAndroid()) return;
    overlayActive = false;
    if (isNativeAndroid()) {
      try {
        await OverlayNative.stopOverlay();
      } catch {
        // ignore
      }
    } else if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
      } catch {
        // ignore
      }
    }
  },

  getLastState() {
    return lastOverlayState;
  },
};

window.AndroidOverlay = {
  toggle: (state) => AndroidOverlayBridge.toggle(state),
  tryAutoShow: (state) => AndroidOverlayBridge.tryAutoShow(state),
  updateState: (state) => AndroidOverlayBridge.syncState(state),
  hide: () => AndroidOverlayBridge.hide(),
  dispatchCommand: (action) => dispatchCommand(action),
};
