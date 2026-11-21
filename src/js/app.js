import { I18N, formatSpeakerDisplay } from './i18n.js';
import {
  createDefaultMidweekParts,
  createWeekObject,
  generateId,
  loadActiveWeekId,
  loadSettings,
  loadWeeks,
  normalizePart,
  saveSettings,
  saveWeeks,
} from './storage.js';
import {
  AndroidOverlayBridge,
  initOverlayListeners,
  setKeepScreenAwake,
  triggerVibrationPattern,
} from './bridges.js';
import { formatCountdown, formatDurationMMSS, MeetingTimerEngine } from './timerEngine.js';
import { parseMeetingScheduleText, scanScheduleImageOffline } from './ocrScanner.js';
import { buildMeetingSummary, copyTextToClipboard } from './report.js';

let settings = loadSettings();
let weeks = loadWeeks(settings.language);
let activeWeekId = loadActiveWeekId(weeks);
let currentPartIndex = 0;
let activeTab = 'timer';

let editingWeekId = null;
let editorDraftParts = [];
let ocrDraft = null;
let toastTimer = null;

const $ = (id) => document.getElementById(id);

function t() {
  return I18N[settings.language] || I18N.en;
}

function getActiveWeek() {
  return weeks.find((w) => w.id === activeWeekId) || weeks[0];
}

function getActivePart() {
  const week = getActiveWeek();
  if (!week || !week.parts.length) return null;
  if (currentPartIndex >= week.parts.length) currentPartIndex = week.parts.length - 1;
  if (currentPartIndex < 0) currentPartIndex = 0;
  return week.parts[currentPartIndex];
}

function showToast(msg) {
  const banner = $('toast-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => banner.classList.remove('visible'), 2600);
}

/* =========================================================
   TIMER ENGINE & OVERLAY SYNC
   ========================================================= */
function buildOverlayPayload() {
  const part = getActivePart();
  if (!part) return null;
  const targetSec = part.plannedMinutes * 60;
  const remainingSec = targetSec - (part.actualSeconds || 0);
  return {
    remainingSeconds: remainingSec,
    isOvertime: remainingSec < 0,
    isWarning: remainingSec >= 0 && remainingSec <= 60 && part.actualSeconds > 0,
    isRunning: timerEngine.isRunning,
    partTitle: part.title,
    speaker: formatSpeakerDisplay(part, settings.language),
    section: part.section,
  };
}

const timerEngine = new MeetingTimerEngine({
  onTick: () => {
    renderTimerStage();
    renderQueueList();
    saveWeeks(weeks, activeWeekId);
    const payload = buildOverlayPayload();
    if (payload) AndroidOverlayBridge.syncState(payload);
  },
  onStateChange: () => {
    renderTimerStage();
    renderQueueList();
    saveWeeks(weeks, activeWeekId);
    const payload = buildOverlayPayload();
    if (payload) AndroidOverlayBridge.syncState(payload);
  },
});

function toggleStartPause() {
  const part = getActivePart();
  if (!part) return;
  if (timerEngine.isRunning) {
    timerEngine.pause(part);
  } else {
    timerEngine.start(part, settings);
  }
}

function advanceNextPartManual() {
  const week = getActiveWeek();
  const part = getActivePart();
  if (!week || !part) return;

  timerEngine.pause(part);
  part.completed = true;
  saveWeeks(weeks, activeWeekId);

  if (currentPartIndex < week.parts.length - 1) {
    currentPartIndex += 1;
    renderTimerStage();
    renderQueueList();
    const payload = buildOverlayPayload();
    if (payload) AndroidOverlayBridge.syncState(payload);
  } else {
    renderTimerStage();
    renderQueueList();
    openSummaryModal();
  }
}

function movePreviousPart() {
  const part = getActivePart();
  if (part) timerEngine.pause(part);
  if (currentPartIndex > 0) {
    currentPartIndex -= 1;
  }
  renderTimerStage();
  renderQueueList();
  const payload = buildOverlayPayload();
  if (payload) AndroidOverlayBridge.syncState(payload);
}

/* =========================================================
   RENDERERS
   ========================================================= */
function applyThemeAndTranslations() {
  const dict = t();
  document.documentElement.lang = settings.language === 'tl' ? 'tl' : 'en';
  document.body.classList.toggle('theme-light', settings.theme === 'light');
  document.body.classList.toggle('theme-midnight', settings.theme !== 'light');

  $('header-app-title').textContent = dict.appTitle;
  $('txt-header-summary').textContent = dict.summaryBtn;
  $('nav-label-timer').textContent = dict.navTimer;
  $('nav-label-schedules').textContent = dict.navSchedules;
  $('nav-label-settings').textContent = dict.navSettings;

  $('txt-next-part').textContent = dict.nextPart;
  $('txt-prev-part').textContent = dict.previous;
  $('txt-reset-part').textContent = dict.reset;
  $('txt-quick-adjust-label').textContent = dict.quickAdjust;
  $('txt-view-summary').textContent = dict.overtimeReportBtn;
  $('txt-queue-heading').textContent = dict.queueHeading;
  $('txt-reset-week-times').textContent = dict.resetWeekTimes;

  $('txt-schedules-heading').textContent = dict.schedulesHeading;
  $('txt-schedules-sub').textContent = dict.schedulesSub;
  $('txt-upload-ocr').textContent = dict.uploadImageBtn;
  $('txt-open-text-autofill').textContent = dict.pasteTextBtn;
  $('txt-new-blank-week').textContent = dict.newBlankWeekBtn;

  $('txt-settings-heading').textContent = dict.settingsHeading;
  $('txt-settings-sub').textContent = dict.settingsSub;
  $('txt-general-card-title').textContent = dict.generalCardTitle;
  $('txt-setting-lang-title').textContent = dict.settingLangTitle;
  $('txt-setting-lang-desc').textContent = dict.settingLangDesc;
  $('txt-setting-theme-title').textContent = dict.settingThemeTitle;
  $('txt-setting-theme-desc').textContent = dict.settingThemeDesc;
  $('btn-theme-midnight').textContent = dict.themeMidnight;
  $('btn-theme-light').textContent = dict.themeLight;
  $('txt-setting-awake-title').textContent = dict.settingAwakeTitle;
  $('txt-setting-awake-desc').textContent = dict.settingAwakeDesc;

  $('txt-vib-card-title').textContent = dict.vibCardTitle;
  $('txt-test-vibration').textContent = dict.testVibration;
  $('txt-vib-master-title').textContent = dict.vibMasterTitle;
  $('txt-vib-master-desc').textContent = dict.vibMasterDesc;
  $('txt-vib-60-title').textContent = dict.vib60Title;
  $('txt-vib-60-desc').textContent = dict.vib60Desc;
  $('txt-vib-30-title').textContent = dict.vib30Title;
  $('txt-vib-30-desc').textContent = dict.vib30Desc;
  $('txt-vib-0-title').textContent = dict.vib0Title;
  $('txt-vib-0-desc').textContent = dict.vib0Desc;
  $('txt-vib-intensity-title').textContent = dict.vibIntensityTitle;
  $('txt-lbl-60-ms').textContent = dict.lbl60Ms;
  $('txt-lbl-30-ms').textContent = dict.lbl30Ms;
  $('txt-lbl-0-ms').textContent = dict.lbl0Ms;

  $('txt-editor-drawer-title').textContent = dict.editorTitle;
  $('txt-edit-week-label').textContent = dict.editWeekLabel;
  $('txt-edit-week-cong').textContent = dict.editWeekCong;
  $('txt-edit-week-chair').textContent = dict.editWeekChair;
  $('txt-editor-parts-label').textContent = dict.editorPartsLabel;
  $('txt-add-part-row').textContent = dict.addPartRow;
  $('txt-cancel-editor').textContent = dict.cancel;
  $('txt-save-editor').textContent = dict.saveWeek;

  $('txt-ocr-preview-title').textContent = dict.ocrPreviewTitle;
  $('txt-ocr-week-label').textContent = dict.editWeekLabel;
  $('txt-ocr-chairman').textContent = dict.editWeekChair;
  $('th-ocr-part').textContent = dict.thPart;
  $('th-ocr-section').textContent = dict.thSection;
  $('th-ocr-min').textContent = dict.thMin;
  $('th-ocr-speaker').textContent = dict.thSpeaker;
  $('th-ocr-asst').textContent = dict.thAsst;
  $('txt-ocr-add-row').textContent = dict.addRow;
  $('txt-cancel-ocr').textContent = dict.cancel;
  $('txt-save-ocr').textContent = dict.saveOcrWeek;

  $('txt-autofill-title').textContent = dict.autofillTitle;
  $('txt-autofill-sample').textContent = dict.loadSample;
  $('txt-autofill-clear').textContent = dict.clear;
  $('txt-cancel-autofill').textContent = dict.cancel;
  $('txt-apply-autofill').textContent = dict.saveAsWeek;

  $('txt-summary-title').textContent = dict.summaryTitle;
  $('txt-sum-allotted').textContent = dict.sumAllotted;
  $('txt-sum-actual').textContent = dict.sumActual;
  $('txt-sum-overtime').textContent = dict.sumVariance;
  $('th-sum-part').textContent = dict.thPart;
  $('th-sum-speaker').textContent = dict.thSpeaker;
  $('th-sum-allotted').textContent = dict.sumAllotted;
  $('th-sum-actual').textContent = dict.sumActual;
  $('th-sum-overtime').textContent = dict.sumOvertime;
  $('txt-sum-preview-label').textContent = dict.sumPreviewLabel;
  $('txt-close-summary').textContent = dict.close;
  $('txt-copy-plain-report').textContent = dict.copyReport;

  // Settings active segmented states
  $('btn-lang-en').classList.toggle('active', settings.language === 'en');
  $('btn-lang-tl').classList.toggle('active', settings.language === 'tl');
  $('btn-theme-midnight').classList.toggle('active', settings.theme !== 'light');
  $('btn-theme-light').classList.toggle('active', settings.theme === 'light');
  $('toggle-keep-awake').checked = Boolean(settings.keepAwake);

  const vib = settings.vibration;
  $('toggle-vib-enabled').checked = Boolean(vib.enabled);
  $('toggle-vib-60').checked = Boolean(vib.alert60);
  $('toggle-vib-30').checked = Boolean(vib.alert30);
  $('toggle-vib-0').checked = Boolean(vib.alert0);
  $('range-vib-intensity').value = String(vib.intensityScale);
  $('txt-vib-intensity-val').textContent = `${vib.intensityScale}%`;
  $('input-vib-60-ms').value = String(vib.duration60Ms);
  $('input-vib-30-ms').value = String(vib.duration30Ms);
  $('input-vib-0-ms').value = String(vib.duration0Ms);
}

function renderTimerStage() {
  const dict = t();
  const week = getActiveWeek();
  const part = getActivePart();
  if (!week || !part) return;

  $('header-week-meta').textContent = `${week.weekLabel}${week.chairman ? ` · ${dict.chairmanPrefix}: ${week.chairman}` : ''}`;
  $('txt-queue-week-label').textContent = `${week.weekLabel}${week.chairman ? ` · ${dict.chairmanPrefix}: ${week.chairman}` : ''}`;

  const secBadge = $('timer-section-badge');
  secBadge.textContent = dict.sectionLabels[part.section] || part.section;
  secBadge.className = `section-badge ${part.section}`;

  $('timer-part-title').textContent = `${currentPartIndex + 1}. ${part.title}`;
  $('timer-speaker-line').textContent = formatSpeakerDisplay(part, settings.language);

  const targetSec = part.plannedMinutes * 60;
  const elapsedSec = part.actualSeconds || 0;
  const remainingSec = targetSec - elapsedSec;

  const isOvertime = remainingSec < 0 || (remainingSec === 0 && elapsedSec > 0);
  const isWarning = !isOvertime && remainingSec <= 60 && elapsedSec > 0;

  const well = $('timer-display-well');
  const statusBadge = $('timer-status-badge');
  const progressBar = $('timer-progress-bar');

  well.classList.remove('state-warning', 'state-overtime');
  statusBadge.classList.remove('ontime', 'warning', 'overtime');

  if (isOvertime) {
    well.classList.add('state-overtime');
    statusBadge.classList.add('overtime');
    statusBadge.textContent = dict.statusOvertime;
    progressBar.style.backgroundColor = 'var(--state-overtime)';
  } else if (isWarning) {
    well.classList.add('state-warning');
    statusBadge.classList.add('warning');
    statusBadge.textContent = dict.statusWarning;
    progressBar.style.backgroundColor = 'var(--state-warning)';
  } else {
    statusBadge.classList.add('ontime');
    statusBadge.textContent = dict.statusOnTime;
    progressBar.style.backgroundColor = 'var(--state-ontime)';
  }

  $('timer-digits').textContent = formatCountdown(remainingSec);
  $('timer-allotted-label').textContent = `${dict.allotted}: ${formatDurationMMSS(targetSec)}`;
  $('timer-elapsed-label').textContent = `${dict.elapsed}: ${formatDurationMMSS(elapsedSec)}`;
  $('timer-part-counter').textContent = dict.partCounter(currentPartIndex + 1, week.parts.length);

  const pct = Math.min(100, Math.round((elapsedSec / Math.max(1, targetSec)) * 100));
  progressBar.style.width = `${pct}%`;

  const startBtn = $('btn-start-pause');
  const startLabel = $('txt-start-pause');
  if (timerEngine.isRunning) {
    startBtn.className = 'btn btn-lg btn-danger';
    startLabel.textContent = dict.pause;
  } else {
    startBtn.className = 'btn btn-lg btn-primary';
    startLabel.textContent = elapsedSec > 0 ? dict.resume : dict.start;
  }

  $('txt-float-overlay').textContent = AndroidOverlayBridge.isOverlayActive()
    ? dict.stopOverlay
    : dict.floatOverlay;
}

function renderQueueList() {
  const dict = t();
  const week = getActiveWeek();
  const container = $('timer-parts-queue');
  if (!week || !container) return;

  container.innerHTML = '';
  let lastSection = '';

  week.parts.forEach((p, idx) => {
    if (p.section !== lastSection) {
      lastSection = p.section;
      const heading = document.createElement('div');
      heading.className = 'queue-section-label';
      heading.textContent = dict.sectionLabels[p.section] || p.section;
      container.appendChild(heading);
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `queue-item-btn${idx === currentPartIndex ? ' active' : ''}`;
    btn.addEventListener('click', () => {
      const active = getActivePart();
      if (active) timerEngine.pause(active);
      currentPartIndex = idx;
      renderTimerStage();
      renderQueueList();
      const payload = buildOverlayPayload();
      if (payload) AndroidOverlayBridge.syncState(payload);
    });

    const targetSec = p.plannedMinutes * 60;
    const diff = p.actualSeconds - targetSec;
    let timeRight = `${p.plannedMinutes}m`;
    let timeColor = 'var(--text-secondary)';
    if (p.actualSeconds > 0) {
      if (diff > 0) {
        timeRight = `+${formatDurationMMSS(diff)}`;
        timeColor = 'var(--state-overtime)';
      } else {
        timeRight = formatDurationMMSS(p.actualSeconds);
        timeColor = 'var(--state-ontime)';
      }
    }

    const mainDiv = document.createElement('div');
    mainDiv.className = 'queue-item-main';

    const titleEl = document.createElement('div');
    titleEl.className = 'queue-item-title';
    titleEl.textContent = `${idx + 1}. ${p.title}`;

    const subEl = document.createElement('div');
    subEl.className = 'queue-item-sub';
    subEl.textContent = `${formatSpeakerDisplay(p, settings.language)} · ${p.plannedMinutes} min`;

    mainDiv.appendChild(titleEl);
    mainDiv.appendChild(subEl);

    const timeEl = document.createElement('div');
    timeEl.className = 'queue-item-time mono-tabular';
    timeEl.style.color = timeColor;
    timeEl.textContent = timeRight;

    btn.appendChild(mainDiv);
    btn.appendChild(timeEl);
    container.appendChild(btn);
  });
}

function renderSchedulesGrid() {
  const dict = t();
  const grid = $('weeks-grid');
  if (!grid) return;
  grid.innerHTML = '';

  weeks.forEach((week) => {
    const isActive = week.id === activeWeekId;
    const card = document.createElement('article');
    card.className = `week-card${isActive ? ' active-week' : ''}`;

    const totalMin = week.parts.reduce((sum, p) => sum + (Number(p.plannedMinutes) || 0), 0);

    const top = document.createElement('div');
    top.className = 'week-card-top';

    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'week-card-title';
    title.textContent = week.weekLabel;

    const meta = document.createElement('p');
    meta.className = 'week-card-meta';
    meta.textContent = `${week.parts.length} ${dict.partsUnit} · ${totalMin} min${week.chairman ? ` · ${dict.chairmanPrefix}: ${week.chairman}` : ''}`;

    info.appendChild(title);
    info.appendChild(meta);
    top.appendChild(info);

    if (isActive) {
      const activeTag = document.createElement('span');
      activeTag.className = 'status-badge ontime';
      activeTag.textContent = dict.activeWeekTag;
      top.appendChild(activeTag);
    }

    const actions = document.createElement('div');
    actions.className = 'week-card-actions';

    if (!isActive) {
      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = 'btn btn-compact btn-primary';
      useBtn.textContent = dict.useWeekBtn;
      useBtn.addEventListener('click', () => {
        const cur = getActivePart();
        if (cur) timerEngine.pause(cur);
        activeWeekId = week.id;
        currentPartIndex = 0;
        saveWeeks(weeks, activeWeekId);
        renderAll();
        switchTab('timer');
        showToast(dict.toastWeekActivated);
      });
      actions.appendChild(useBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-compact btn-secondary';
    editBtn.textContent = dict.editWeekBtn;
    editBtn.addEventListener('click', () => openWeekEditorDrawer(week.id));
    actions.appendChild(editBtn);

    if (weeks.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-compact btn-ghost';
      delBtn.textContent = dict.deleteWeekBtn;
      delBtn.addEventListener('click', () => {
        weeks = weeks.filter((w) => w.id !== week.id);
        if (activeWeekId === week.id) {
          activeWeekId = weeks[0].id;
          currentPartIndex = 0;
        }
        saveWeeks(weeks, activeWeekId);
        renderAll();
      });
      actions.appendChild(delBtn);
    }

    card.appendChild(top);
    card.appendChild(actions);
    grid.appendChild(card);
  });
}

function renderAll() {
  applyThemeAndTranslations();
  renderTimerStage();
  renderQueueList();
  renderSchedulesGrid();
}

/* =========================================================
   TAB SWITCHING
   ========================================================= */
function switchTab(tabName) {
  activeTab = tabName;
  ['timer', 'schedules', 'settings'].forEach((name) => {
    $(`tab-${name}`)?.classList.toggle('active', name === tabName);
    $(`nav-btn-${name}`)?.classList.toggle('active', name === tabName);
  });
}

/* =========================================================
   MANUAL EDIT / ADD-PART DRAWER
   ========================================================= */
function renderEditorPartRows() {
  const dict = t();
  const list = $('editor-parts-list');
  list.innerHTML = '';

  editorDraftParts.forEach((p, idx) => {
    const row = document.createElement('div');
    row.className = 'ocr-progress-box';

    row.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 140px 82px; gap:8px;">
        <input type="text" class="input-control" data-field="title" value="${escapeAttr(p.title)}" placeholder="${escapeAttr(dict.thPart)}" />
        <select class="input-control" data-field="section">
          <option value="opening" ${p.section === 'opening' ? 'selected' : ''}>${dict.sectionLabels.opening}</option>
          <option value="treasures" ${p.section === 'treasures' ? 'selected' : ''}>Treasures</option>
          <option value="ministry" ${p.section === 'ministry' ? 'selected' : ''}>Ministry</option>
          <option value="living" ${p.section === 'living' ? 'selected' : ''}>Living</option>
          <option value="concluding" ${p.section === 'concluding' ? 'selected' : ''}>${dict.sectionLabels.concluding}</option>
        </select>
        <input type="number" min="1" max="90" class="input-control mono-tabular" data-field="plannedMinutes" value="${p.plannedMinutes}" />
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap:8px; align-items:center;">
        <input type="text" class="input-control" data-field="speaker" value="${escapeAttr(p.speaker)}" placeholder="${escapeAttr(dict.thSpeaker)}" />
        <input type="text" class="input-control" data-field="assistant" value="${escapeAttr(p.assistant)}" placeholder="${escapeAttr(dict.thAsst)}" />
        <button type="button" class="btn btn-compact btn-ghost" data-remove="1">✕</button>
      </div>
    `;

    row.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => {
        const field = el.getAttribute('data-field');
        if (field === 'plannedMinutes') {
          editorDraftParts[idx].plannedMinutes = Math.max(1, Number(el.value) || 1);
        } else {
          editorDraftParts[idx][field] = el.value;
          if (field === 'assistant') {
            editorDraftParts[idx].isTalk = !el.value.trim() && editorDraftParts[idx].section !== 'ministry';
          }
        }
      });
    });

    row.querySelector('[data-remove]').addEventListener('click', () => {
      if (editorDraftParts.length <= 1) return;
      editorDraftParts.splice(idx, 1);
      renderEditorPartRows();
    });

    list.appendChild(row);
  });
}

function openWeekEditorDrawer(weekId) {
  const week = weeks.find((w) => w.id === weekId);
  if (!week) return;
  editingWeekId = weekId;
  $('edit-week-label').value = week.weekLabel || '';
  $('edit-week-cong').value = week.congregationName || '';
  $('edit-week-chairman').value = week.chairman || '';
  editorDraftParts = week.parts.map((p) => ({ ...p }));
  renderEditorPartRows();
  $('drawer-week-editor').classList.add('open');
}

function closeWeekEditorDrawer() {
  $('drawer-week-editor').classList.remove('open');
  editingWeekId = null;
}

/* =========================================================
   OFFLINE OCR PREVIEW MODAL
   ========================================================= */
function renderOcrPreviewTable() {
  const dict = t();
  const tbody = $('ocr-preview-tbody');
  tbody.innerHTML = '';

  (ocrDraft?.parts || []).forEach((p, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="input-control" data-ocr="title" value="${escapeAttr(p.title)}" /></td>
      <td>
        <select class="input-control" data-ocr="section">
          <option value="opening" ${p.section === 'opening' ? 'selected' : ''}>Opening</option>
          <option value="treasures" ${p.section === 'treasures' ? 'selected' : ''}>Treasures</option>
          <option value="ministry" ${p.section === 'ministry' ? 'selected' : ''}>Ministry</option>
          <option value="living" ${p.section === 'living' ? 'selected' : ''}>Living</option>
          <option value="concluding" ${p.section === 'concluding' ? 'selected' : ''}>Concluding</option>
        </select>
      </td>
      <td><input type="number" min="1" max="90" class="input-control mono-tabular" data-ocr="plannedMinutes" value="${p.plannedMinutes}" /></td>
      <td><input type="text" class="input-control" data-ocr="speaker" value="${escapeAttr(p.speaker)}" /></td>
      <td><input type="text" class="input-control" data-ocr="assistant" value="${escapeAttr(p.assistant)}" /></td>
      <td><button type="button" class="btn btn-compact btn-ghost" data-ocr-del="1">✕</button></td>
    `;

    tr.querySelectorAll('[data-ocr]').forEach((el) => {
      el.addEventListener('input', () => {
        const f = el.getAttribute('data-ocr');
        if (f === 'plannedMinutes') {
          ocrDraft.parts[idx].plannedMinutes = Math.max(1, Number(el.value) || 1);
        } else {
          ocrDraft.parts[idx][f] = el.value;
          if (f === 'assistant') {
            ocrDraft.parts[idx].isTalk = !el.value.trim() && ocrDraft.parts[idx].section !== 'ministry';
          }
        }
      });
    });

    tr.querySelector('[data-ocr-del]').addEventListener('click', () => {
      ocrDraft.parts.splice(idx, 1);
      renderOcrPreviewTable();
    });

    tbody.appendChild(tr);
  });
}

function openOcrPreviewModal(scanResult) {
  const dict = t();
  ocrDraft = {
    modeUsed: scanResult.modeUsed,
    weekLabel: scanResult.weekLabel || 'December 4, 2026',
    chairman: scanResult.chairman || '',
    parts: (scanResult.parts || []).map((p, i) => normalizePart(p, i)),
  };

  $('ocr-mode-note').textContent =
    scanResult.modeUsed === '3-column' ? dict.ocrMode3Col : dict.ocrModePlanB;
  $('ocr-week-label').value = ocrDraft.weekLabel;
  $('ocr-chairman').value = ocrDraft.chairman;

  renderOcrPreviewTable();
  $('modal-ocr-preview').classList.add('open');
}

/* =========================================================
   SUMMARY MODAL
   ========================================================= */
function openSummaryModal() {
  const week = getActiveWeek();
  if (!week) return;
  const summary = buildMeetingSummary(week, settings.language);

  $('summary-week-sub').textContent = `${week.weekLabel}${week.chairman ? ` · ${t().chairmanPrefix}: ${week.chairman}` : ''}`;
  $('sum-val-allotted').textContent = summary.totalAllottedText;
  $('sum-val-actual').textContent = summary.totalActualText;
  const varEl = $('sum-val-overtime');
  varEl.textContent = summary.netFormatted;
  varEl.style.color = summary.isNetOvertime ? 'var(--state-overtime)' : 'var(--state-ontime)';

  const tbody = $('summary-table-tbody');
  tbody.innerHTML = '';
  summary.rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${r.index}. ${escapeHtml(r.title)}</strong></td>
      <td>${escapeHtml(r.speakerText)}</td>
      <td class="mono-tabular">${r.allottedText}</td>
      <td class="mono-tabular">${r.actualText}</td>
      <td class="mono-tabular" style="font-weight:700; color:${r.isOvertime ? 'var(--state-overtime)' : 'var(--state-ontime)'};">${escapeHtml(r.overtimeLabel)}</td>
    `;
    tbody.appendChild(tr);
  });

  $('summary-plain-text').value = summary.plainText;
  $('modal-summary').classList.add('open');
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* =========================================================
   TEXT AUTO-FILL HELPERS
   ========================================================= */
function updateTextAutofillPreview() {
  const raw = $('autofill-textarea').value;
  const parsed = parseMeetingScheduleText(raw, settings.language);
  const box = $('autofill-live-summary');
  if (!parsed) {
    box.innerHTML = `<span class="section-subtitle">Paste a schedule template above to preview extracted parts.</span>`;
    return;
  }
  box.innerHTML = `
    <strong>${escapeHtml(parsed.weekLabel)}</strong>
    <span class="section-subtitle">${parsed.parts.length} parts detected · Chairman: ${escapeHtml(parsed.chairman || '-')}</span>
  `;
}

/* =========================================================
   INITIALIZATION & EVENT WIRING
   ========================================================= */
function bindEvents() {
  // Bottom 3-tab navigation
  ['timer', 'schedules', 'settings'].forEach((tab) => {
    $(`nav-btn-${tab}`).addEventListener('click', () => switchTab(tab));
  });

  // Timer controls
  $('btn-start-pause').addEventListener('click', toggleStartPause);
  $('btn-next-part').addEventListener('click', advanceNextPartManual);
  $('btn-prev-part').addEventListener('click', movePreviousPart);
  $('btn-reset-part').addEventListener('click', () => {
    const part = getActivePart();
    if (part) timerEngine.resetPart(part);
  });
  $('btn-min-minus').addEventListener('click', () => {
    const part = getActivePart();
    if (!part) return;
    part.plannedMinutes = Math.max(1, part.plannedMinutes - 1);
    saveWeeks(weeks, activeWeekId);
    renderTimerStage();
    renderQueueList();
  });
  $('btn-min-plus').addEventListener('click', () => {
    const part = getActivePart();
    if (!part) return;
    part.plannedMinutes = Math.min(90, part.plannedMinutes + 1);
    saveWeeks(weeks, activeWeekId);
    renderTimerStage();
    renderQueueList();
  });
  $('btn-reset-week-times').addEventListener('click', () => {
    const week = getActiveWeek();
    const cur = getActivePart();
    if (cur) timerEngine.pause(cur);
    if (!week) return;
    week.parts.forEach((p) => {
      p.actualSeconds = 0;
      p.completed = false;
      p.firedAlerts = { oneMin: false, thirtySec: false, zero: false };
    });
    currentPartIndex = 0;
    saveWeeks(weeks, activeWeekId);
    renderTimerStage();
    renderQueueList();
    showToast(t().toastTimesReset);
  });

  $('btn-float-overlay').addEventListener('click', async () => {
    const payload = buildOverlayPayload();
    if (!payload) return;
    const res = await AndroidOverlayBridge.toggle(payload);
    renderTimerStage();
    if (res.permissionRequired) {
      showToast(t().toastOverlayPermNeeded);
    } else if (res.active) {
      showToast(t().toastOverlayActive);
    } else {
      showToast(t().toastOverlayStopped);
    }
  });

  // Summary triggers
  $('btn-header-summary').addEventListener('click', openSummaryModal);
  $('btn-open-summary-inline').addEventListener('click', openSummaryModal);
  $('btn-close-summary').addEventListener('click', () => $('modal-summary').classList.remove('open'));
  $('btn-close-summary-footer').addEventListener('click', () => $('modal-summary').classList.remove('open'));
  $('btn-copy-plain-report').addEventListener('click', async () => {
    const text = $('summary-plain-text').value;
    await copyTextToClipboard(text);
    showToast(t().toastCopied);
  });

  // Schedules tab actions
  $('btn-upload-ocr').addEventListener('click', () => $('ocr-image-input').click());
  $('ocr-image-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const progressBox = $('ocr-progress-box');
    progressBox.classList.remove('hidden');
    $('ocr-status-text').textContent = t().toastOcrInit;
    $('ocr-progress-pct').textContent = '0%';
    $('ocr-progress-bar').style.width = '0%';

    try {
      const scanResult = await scanScheduleImageOffline(file, ({ status, progress }) => {
        $('ocr-status-text').textContent = status;
        $('ocr-progress-pct').textContent = `${progress}%`;
        $('ocr-progress-bar').style.width = `${progress}%`;
      });
      progressBox.classList.add('hidden');
      openOcrPreviewModal(scanResult);
    } catch (err) {
      console.error('Offline OCR failed:', err);
      progressBox.classList.add('hidden');
      showToast(t().toastOcrFailed);
    }
  });

  $('btn-new-blank-week').addEventListener('click', () => {
    const newWeek = createWeekObject(
      {
        weekLabel: settings.language === 'tl' ? 'Bagong Linggo' : 'New Schedule Week',
        congregationName: getActiveWeek()?.congregationName || 'Kingdom Hall',
        chairman: '',
        parts: createDefaultMidweekParts(settings.language),
      },
      settings.language
    );
    weeks.unshift(newWeek);
    saveWeeks(weeks, activeWeekId);
    renderSchedulesGrid();
    openWeekEditorDrawer(newWeek.id);
  });

  // Manual Week Editor Drawer
  $('btn-close-editor-drawer').addEventListener('click', closeWeekEditorDrawer);
  $('btn-cancel-editor-drawer').addEventListener('click', closeWeekEditorDrawer);
  $('btn-add-part-row').addEventListener('click', () => {
    editorDraftParts.push(
      normalizePart({
        id: generateId('part'),
        title: settings.language === 'tl' ? 'Bagong Bahagi' : 'New Part',
        section: 'living',
        speaker: '',
        assistant: '',
        plannedMinutes: 5,
      })
    );
    renderEditorPartRows();
  });
  $('btn-save-editor-drawer').addEventListener('click', () => {
    const week = weeks.find((w) => w.id === editingWeekId);
    if (!week) return;
    week.weekLabel = $('edit-week-label').value.trim() || week.weekLabel;
    week.congregationName = $('edit-week-cong').value.trim() || 'Kingdom Hall';
    week.chairman = $('edit-week-chairman').value.trim();
    week.parts = editorDraftParts.map((p, idx) => normalizePart(p, idx));
    saveWeeks(weeks, activeWeekId);
    closeWeekEditorDrawer();
    renderAll();
    showToast(t().toastWeekSaved);
  });

  // OCR Preview Modal
  $('btn-close-ocr-preview').addEventListener('click', () => $('modal-ocr-preview').classList.remove('open'));
  $('btn-cancel-ocr-preview').addEventListener('click', () => $('modal-ocr-preview').classList.remove('open'));
  $('btn-ocr-add-row').addEventListener('click', () => {
    if (!ocrDraft) return;
    ocrDraft.parts.push(
      normalizePart({
        id: generateId('part'),
        title: 'New Part',
        section: 'ministry',
        plannedMinutes: 4,
      })
    );
    renderOcrPreviewTable();
  });
  $('btn-save-ocr-week').addEventListener('click', () => {
    if (!ocrDraft) return;
    const savedWeek = createWeekObject(
      {
        weekLabel: $('ocr-week-label').value.trim() || ocrDraft.weekLabel,
        congregationName: getActiveWeek()?.congregationName || 'Kingdom Hall',
        chairman: $('ocr-chairman').value.trim(),
        parts: ocrDraft.parts,
      },
      settings.language
    );
    weeks.unshift(savedWeek);
    activeWeekId = savedWeek.id;
    currentPartIndex = 0;
    saveWeeks(weeks, activeWeekId);
    $('modal-ocr-preview').classList.remove('open');
    renderAll();
    switchTab('timer');
    showToast(t().toastWeekSaved);
  });

  // Text Auto-Fill Modal
  $('btn-open-text-autofill').addEventListener('click', () => {
    updateTextAutofillPreview();
    $('modal-text-autofill').classList.add('open');
  });
  $('btn-close-text-autofill').addEventListener('click', () => $('modal-text-autofill').classList.remove('open'));
  $('btn-cancel-text-autofill').addEventListener('click', () => $('modal-text-autofill').classList.remove('open'));
  $('autofill-textarea').addEventListener('input', updateTextAutofillPreview);
  $('btn-autofill-clear').addEventListener('click', () => {
    $('autofill-textarea').value = '';
    updateTextAutofillPreview();
  });
  $('btn-autofill-sample').addEventListener('click', () => {
    $('autofill-textarea').value = `DATE: December 4, 2026
CONGREGATION: Kingdom Hall Central
CHAIRMAN: Brother Cruz

1. KAYAMANAN MULA SA SALITA NG DIYOS
Speaker: Brother Santos
Gems Conductor: Brother Reyes
Bible Reader: Brother Lim

2. MAGING MAHUSAY SA MINISTERYO
Part 1: Pagpapasimula ng Pakikipag-usap
Student: Student 1
Assistant: Assistant 1

Part 2: Pakikipag-usap Muli
Student: Student 2
Assistant: Assistant 2

3. PAMUMUHAY BILANG KRISTIYANO
Lokal na Pangangailangan: Brother Dela Cruz
Bible Study: Brother Mendoza
Tagabasa sa Pag-aaral: Brother Tan`;
    updateTextAutofillPreview();
  });
  $('btn-apply-text-autofill').addEventListener('click', () => {
    const parsed = parseMeetingScheduleText($('autofill-textarea').value, settings.language);
    if (!parsed) return;
    const savedWeek = createWeekObject(parsed, settings.language);
    weeks.unshift(savedWeek);
    activeWeekId = savedWeek.id;
    currentPartIndex = 0;
    saveWeeks(weeks, activeWeekId);
    $('modal-text-autofill').classList.remove('open');
    renderAll();
    switchTab('timer');
    showToast(t().toastWeekSaved);
  });

  // Settings Tab
  $('btn-lang-en').addEventListener('click', () => {
    settings.language = 'en';
    saveSettings(settings);
    renderAll();
  });
  $('btn-lang-tl').addEventListener('click', () => {
    settings.language = 'tl';
    saveSettings(settings);
    renderAll();
  });
  $('btn-theme-midnight').addEventListener('click', () => {
    settings.theme = 'midnight';
    saveSettings(settings);
    applyThemeAndTranslations();
  });
  $('btn-theme-light').addEventListener('click', () => {
    settings.theme = 'light';
    saveSettings(settings);
    applyThemeAndTranslations();
  });
  $('toggle-keep-awake').addEventListener('change', (e) => {
    settings.keepAwake = e.target.checked;
    saveSettings(settings);
    setKeepScreenAwake(settings.keepAwake);
  });

  // Vibration Settings
  $('toggle-vib-enabled').addEventListener('change', (e) => {
    settings.vibration.enabled = e.target.checked;
    saveSettings(settings);
  });
  $('toggle-vib-60').addEventListener('change', (e) => {
    settings.vibration.alert60 = e.target.checked;
    saveSettings(settings);
  });
  $('toggle-vib-30').addEventListener('change', (e) => {
    settings.vibration.alert30 = e.target.checked;
    saveSettings(settings);
  });
  $('toggle-vib-0').addEventListener('change', (e) => {
    settings.vibration.alert0 = e.target.checked;
    saveSettings(settings);
  });
  $('range-vib-intensity').addEventListener('input', (e) => {
    settings.vibration.intensityScale = Number(e.target.value) || 100;
    $('txt-vib-intensity-val').textContent = `${settings.vibration.intensityScale}%`;
    saveSettings(settings);
  });
  $('input-vib-60-ms').addEventListener('change', (e) => {
    settings.vibration.duration60Ms = Math.max(50, Math.min(1000, Number(e.target.value) || 200));
    saveSettings(settings);
  });
  $('input-vib-30-ms').addEventListener('change', (e) => {
    settings.vibration.duration30Ms = Math.max(50, Math.min(1000, Number(e.target.value) || 150));
    saveSettings(settings);
  });
  $('input-vib-0-ms').addEventListener('change', (e) => {
    settings.vibration.duration0Ms = Math.max(500, Math.min(4000, Number(e.target.value) || 2000));
    saveSettings(settings);
  });
  $('btn-test-vibration').addEventListener('click', () => {
    const vib = settings.vibration;
    const scale = Math.max(0.5, Math.min(1.5, (Number(vib.intensityScale) || 100) / 100));
    const pulse = Math.round((Number(vib.duration30Ms) || 150) * scale);
    triggerVibrationPattern([pulse, 100, pulse]);
    showToast(t().toastVibTest);
  });

  // Native Android Overlay Commands
  initOverlayListeners((action) => {
    if (action === 'PLAY_PAUSE') {
      toggleStartPause();
    } else if (action === 'NEXT_PART') {
      advanceNextPartManual();
    } else if (action === 'RETURN_TO_APP' || action === 'OPEN_APP') {
      switchTab('timer');
      window.focus();
    }
  });

  // Keep Wake Lock & drift-free timer synced when returning from background/overlay
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (settings.keepAwake) setKeepScreenAwake(true);
      const part = getActivePart();
      if (timerEngine.isRunning && part) {
        timerEngine.sync(part, settings);
        renderTimerStage();
      }
    }
  });
}

bindEvents();
setKeepScreenAwake(settings.keepAwake);
renderAll();
