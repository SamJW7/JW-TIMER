import { triggerVibrationPattern } from './bridges.js';

export function formatCountdown(totalSeconds) {
  const isNeg = totalSeconds < 0;
  const abs = Math.abs(Math.round(totalSeconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${isNeg ? '+' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDurationMMSS(totalSeconds) {
  const abs = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export class MeetingTimerEngine {
  constructor({ onTick, onStateChange }) {
    this.onTick = onTick;
    this.onStateChange = onStateChange;
    this.isRunning = false;
    this.startTimestampMs = null;
    this.baseElapsedSeconds = 0;
    this.intervalId = null;
  }

  start(part, settings) {
    if (!part || this.isRunning) return;
    this.isRunning = true;
    this.baseElapsedSeconds = Number(part.actualSeconds) || 0;
    this.startTimestampMs = Date.now();

    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.sync(part, settings), 250);
    this.onStateChange?.();
  }

  pause(part) {
    if (!this.isRunning) return;
    if (part && this.startTimestampMs !== null) {
      const delta = Math.floor((Date.now() - this.startTimestampMs) / 1000);
      part.actualSeconds = this.baseElapsedSeconds + delta;
    }
    this.isRunning = false;
    this.startTimestampMs = null;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.onStateChange?.();
  }

  resetPart(part) {
    this.pause(part);
    if (!part) return;
    part.actualSeconds = 0;
    part.completed = false;
    part.firedAlerts = { oneMin: false, thirtySec: false, zero: false };
    this.baseElapsedSeconds = 0;
    this.onStateChange?.();
  }

  sync(part, settings) {
    if (!part || !this.isRunning || this.startTimestampMs === null) return;

    const delta = Math.floor((Date.now() - this.startTimestampMs) / 1000);
    const nextElapsed = this.baseElapsedSeconds + delta;
    if (nextElapsed === part.actualSeconds) return;

    part.actualSeconds = nextElapsed;
    const targetSeconds = (Number(part.plannedMinutes) || 1) * 60;
    const remainingSeconds = targetSeconds - part.actualSeconds;

    this.checkMilestones(part, remainingSeconds, targetSeconds, settings);
    this.onTick?.(part, remainingSeconds);
  }

  adjustElapsed(part, deltaSec) {
    if (!part) return;
    part.actualSeconds = Math.max(0, (Number(part.actualSeconds) || 0) + deltaSec);
    if (this.isRunning) {
      this.baseElapsedSeconds = part.actualSeconds;
      this.startTimestampMs = Date.now();
    }
    this.onStateChange?.();
  }

  checkMilestones(part, remainingSeconds, targetSeconds, settings) {
    const vib = settings?.vibration;
    if (!vib?.enabled) return;

    if (!part.firedAlerts) {
      part.firedAlerts = { oneMin: false, thirtySec: false, zero: false };
    }

    const scale = Math.max(0.5, Math.min(1.5, (Number(vib.intensityScale) || 100) / 100));

    // 1:00 Remaining (single pulse) — only trigger if part length is > 60s
    if (vib.alert60 && targetSeconds > 60 && !part.firedAlerts.oneMin && remainingSeconds <= 60 && remainingSeconds > 30) {
      part.firedAlerts.oneMin = true;
      const ms = Math.round((Number(vib.duration60Ms) || 200) * scale);
      triggerVibrationPattern(ms);
    }

    // 0:30 Remaining (double pulse) — only trigger if part length is > 30s
    if (vib.alert30 && targetSeconds > 30 && !part.firedAlerts.thirtySec && remainingSeconds <= 30 && remainingSeconds > 0) {
      part.firedAlerts.thirtySec = true;
      const pulse = Math.round((Number(vib.duration30Ms) || 150) * scale);
      triggerVibrationPattern([pulse, 100, pulse]);
    }

    // 0:00 Time's Up (long 2-second buzz)
    if (vib.alert0 && !part.firedAlerts.zero && remainingSeconds <= 0) {
      part.firedAlerts.zero = true;
      const ms = Math.round((Number(vib.duration0Ms) || 2000) * scale);
      triggerVibrationPattern(ms);
    }
  }
}
