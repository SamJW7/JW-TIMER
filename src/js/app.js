import {
  I18N,
  formatSpeakerDisplay,
  getContextualRolePlaceholders,
  isBibleReadingPart,
  renderSpeakerToElement,
} from './i18n.js';
import {
  createDefaultMidweekParts,
  createDefaultWeekendParts,
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
let schedulesFilterMode = getActiveWeek()?.meetingType || 'midweek';

let editingWeekId = null;
let editorDraftMeta = {
  meetingType: 'midweek',
  weekLabel: '',
  congregationName: 'Kingdom Hall',
  chairman: '',
};
let editorDraftParts = [];
let ocrSourceTarget = 'new-week';
let autofillSourceTarget = 'new-week';
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
   TIMER ENGINE & AUTO-FLOAT OVERLAY LIFECYCLE
   ========================================================= */
function isMidMeetingActive() {
  const part = getActivePart();
  const week = getActiveWeek();
  if (!part || !week) return false;
  if (timerEngine.isRunning) return true;
  if ((part.actualSeconds || 0) > 0) return true;
  if (currentPartIndex > 0) return true;
  return week.parts.some((p) => (p.actualSeconds || 0) > 0);
}

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

async function handleAppLeave() {
  if (!settings.autoFloatOnLeave || !isMidMeetingActive()) return;
  const payload = buildOverlayPayload();
  if (!payload) return;
  const shown = await AndroidOverlayBridge.tryAutoShow(payload);
  if (shown) renderTimerStage();
}

async function handleAppReturn() {
  await AndroidOverlayBridge.hide();
  if (settings.keepAwake) setKeepScreenAwake(true);
  const part = getActivePart();
  if (timerEngine.isRunning && part) {
    timerEngine.sync(part, settings);
  }
  renderTimerStage();
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
  $('txt-target-adjust-label').textContent = dict.targetAdjustLabel;
  $('txt-timer-adjust-label').textContent = dict.timerAdjustLabel;
  $('txt-view-summary').textContent = dict.overtimeReportBtn;
  $('txt-queue-heading').textContent = dict.queueHeading;
  $('txt-queue-edit-btn').textContent = dict.queueEditBtn;
  $('txt-reset-week-times').textContent = dict.resetWeekTimes;

  $('txt-schedules-heading').textContent = dict.schedulesHeading;
  $('txt-schedules-sub').textContent = dict.schedulesSub;
  $('btn-sched-midweek').textContent = dict.schedMidweek;
  $('btn-sched-weekend').textContent = dict.schedWeekend;
  $('txt-upload-ocr').textContent = dict.uploadImageBtn;
  $('txt-open-text-autofill').textContent = dict.pasteTextBtn;
  $('txt-new-blank-week').textContent = dict.newBlankWeekBtn;
  $('txt-new-weekend-week').textContent = dict.newWeekendWeekBtn;

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
  $('txt-setting-autofloat-title').textContent = dict.settingAutoFloatTitle;
  $('txt-setting-autofloat-desc').textContent = dict.settingAutoFloatDesc;

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
  $('txt-editor-scan-btn').textContent = dict.editorScanBtn;
  $('txt-editor-paste-btn').textContent = dict.editorPasteBtn;
  $('txt-edit-week-label').textContent = dict.editWeekLabel;
  $('txt-edit-week-cong').textContent = dict.editWeekCong;
  $('txt-edit-week-chair').textContent = dict.editWeekChair;
  $('txt-editor-parts-label').textContent = dict.editorPartsLabel;
  $('txt-add-part-row').textContent = dict.addPartRow;
  $('txt-cancel-editor').textContent = dict.cancel;
  $('txt-save-editor').textContent = dict.saveWeek;

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

  $('btn-lang-en').classList.toggle('active', settings.language === 'en');
  $('btn-lang-tl').classList.toggle('active', settings.language === 'tl');
  $('btn-theme-midnight').classList.toggle('active', settings.theme !== 'light');
  $('btn-theme-light').classList.toggle('active', settings.theme === 'light');
  $('toggle-keep-awake').checked = Boolean(settings.keepAwake);
  $('toggle-auto-float').checked = Boolean(settings.autoFloatOnLeave);

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
  renderSpeakerToElement($('timer-speaker-line'), part, settings.language);

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
      heading.className = `queue-section-label ${p.section}`;
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

  $('btn-sched-midweek').classList.toggle('active', schedulesFilterMode === 'midweek');
  $('btn-sched-weekend').classList.toggle('active', schedulesFilterMode === 'weekend');
  $('toolbar-midweek').classList.toggle('hidden', schedulesFilterMode !== 'midweek');
  $('toolbar-weekend').classList.toggle('hidden', schedulesFilterMode !== 'weekend');

  grid.innerHTML = '';
  const filteredWeeks = weeks.filter((w) => (w.meetingType || 'midweek') === schedulesFilterMode);

  if (filteredWeeks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'surface-card';
    empty.innerHTML = `<p class="section-subtitle">${
      schedulesFilterMode === 'weekend' ? dict.newWeekendWeekBtn : dict.newBlankWeekBtn
    }</p>`;
    grid.appendChild(empty);
    return;
  }

  filteredWeeks.forEach((week) => {
    const isActive = week.id === activeWeekId;
    const card = document.createElement('article');
    card.className = `week-card${isActive ? ' active-week' : ''}`;

    const totalMin = week.parts.reduce((sum, p) => sum + (Number(p.plannedMinutes) || 0), 0);

    const top = document.createElement('div');
    top.className = 'week-card-top';

    const info = document.createElement('div');
    const badgeRow = document.createElement('div');
    badgeRow.style.marginBottom = '6px';
    const typeBadge = document.createElement('span');
    typeBadge.className = `section-badge ${week.meetingType === 'weekend' ? 'weekend' : 'treasures'}`;
    typeBadge.textContent = week.meetingType === 'weekend' ? dict.weekendTag : dict.midweekTag;
    badgeRow.appendChild(typeBadge);

    const title = document.createElement('h3');
    title.className = 'week-card-title';
    title.textContent = week.weekLabel;

    const meta = document.createElement('p');
    meta.className = 'week-card-meta';
    meta.textContent = `${week.parts.length} ${dict.partsUnit} · ${totalMin} min${week.chairman ? ` · ${dict.chairmanPrefix}: ${week.chairman}` : ''}`;

    info.appendChild(badgeRow);
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
  ['timer', 'schedules', 'settings'].forEach((name) => {
    $(`tab-${name}`)?.classList.toggle('active', name === tabName);
    $(`nav-btn-${name}`)?.classList.toggle('active', name === tabName);
  });
}

/* =========================================================
   FULL-SCREEN SCHEDULE EDITOR WITH TOUCH DRAG-AND-DROP
   ========================================================= */
function updateEditorPartBadges() {
  const list = $('editor-parts-list');
  if (!list) return;
  Array.from(list.children).forEach((card, i) => {
    const badge = card.querySelector('.part-num-badge');
    if (badge) badge.textContent = `#${i + 1}`;
  });
}

function attachCardDragHandlers(handleEl, cardEl, listEl) {
  handleEl.addEventListener('pointerdown', (startEvent) => {
    startEvent.preventDefault();
    startEvent.stopPropagation();

    try {
      handleEl.setPointerCapture(startEvent.pointerId);
    } catch {
      // Ignore if pointer capture is unsupported
    }

    cardEl.classList.add('dragging');
    listEl.classList.add('is-dragging');

    const onPointerMove = (moveEvent) => {
      const y = moveEvent.clientY;
      const cards = Array.from(listEl.children);
      const currentIdx = cards.indexOf(cardEl);
      if (currentIdx === -1) return;

      for (let i = 0; i < cards.length; i++) {
        if (i === currentIdx) continue;
        const rect = cards[i].getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (i < currentIdx && y < midY) {
          const [moved] = editorDraftParts.splice(currentIdx, 1);
          editorDraftParts.splice(i, 0, moved);
          listEl.insertBefore(cardEl, cards[i]);
          updateEditorPartBadges();
          break;
        }
        if (i > currentIdx && y > midY) {
          const [moved] = editorDraftParts.splice(currentIdx, 1);
          editorDraftParts.splice(i, 0, moved);
          listEl.insertBefore(cardEl, cards[i].nextSibling);
          updateEditorPartBadges();
          break;
        }
      }
    };

    const endDrag = () => {
      cardEl.classList.remove('dragging');
      listEl.classList.remove('is-dragging');
      handleEl.removeEventListener('pointermove', onPointerMove);
      handleEl.removeEventListener('pointerup', endDrag);
      handleEl.removeEventListener('pointercancel', endDrag);
      try {
        if (handleEl.hasPointerCapture?.(startEvent.pointerId)) {
          handleEl.releasePointerCapture(startEvent.pointerId);
        }
      } catch {
        // Ignore
      }
      renderEditorPartRows();
    };

    handleEl.addEventListener('pointermove', onPointerMove);
    handleEl.addEventListener('pointerup', endDrag);
    handleEl.addEventListener('pointercancel', endDrag);
  });
}

function renderEditorPartRows() {
  const dict = t();
  const list = $('editor-parts-list');
  if (!list) return;
  list.innerHTML = '';

  let ministryNum = 0;
  editorDraftParts.forEach((p, idx) => {
    if (p.section === 'ministry') ministryNum += 1;
    const placeholders = getContextualRolePlaceholders(p, ministryNum);
    const showAssistant = p.section === 'ministry' && !isBibleReadingPart(p);

    const card = document.createElement('div');
    card.className = 'editor-part-card';

    card.innerHTML = `
      <div class="editor-row-1">
        <button type="button" class="part-drag-handle" aria-label="Drag to reorder">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="5" r="1.8"/><circle cx="15" cy="5" r="1.8"/>
            <circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/>
            <circle cx="9" cy="19" r="1.8"/><circle cx="15" cy="19" r="1.8"/>
          </svg>
        </button>
        <span class="part-num-badge mono-tabular">#${idx + 1}</span>
        <input type="text" class="input-control part-title-input" data-field="title" value="${escapeAttr(p.title)}" placeholder="${escapeAttr(dict.thPart)}" />
        <button type="button" class="part-delete-btn" data-remove="1" aria-label="Delete part">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
        </button>
      </div>

      <div class="editor-row-2">
        <select class="input-control section-select sec-${escapeAttr(p.section)}" data-field="section">
          <option value="opening" ${p.section === 'opening' ? 'selected' : ''}>${escapeHtml(dict.sectionLabels.opening)}</option>
          <option value="treasures" ${p.section === 'treasures' ? 'selected' : ''}>${escapeHtml(dict.sectionLabels.treasures)}</option>
          <option value="ministry" ${p.section === 'ministry' ? 'selected' : ''}>${escapeHtml(dict.sectionLabels.ministry)}</option>
          <option value="living" ${p.section === 'living' ? 'selected' : ''}>${escapeHtml(dict.sectionLabels.living)}</option>
          <option value="concluding" ${p.section === 'concluding' ? 'selected' : ''}>${escapeHtml(dict.sectionLabels.concluding)}</option>
          <option value="weekend" ${p.section === 'weekend' ? 'selected' : ''}>${escapeHtml(dict.sectionLabels.weekend)}</option>
        </select>
        <div class="minutes-input-wrap">
          <input type="number" min="1" max="90" class="mono-tabular" data-field="plannedMinutes" value="${p.plannedMinutes}" />
          <span class="minutes-unit">min</span>
        </div>
      </div>

      <div class="editor-row-3">
        <input type="text" class="input-control" data-field="speaker" value="${escapeAttr(p.speaker || '')}" placeholder="${escapeAttr(placeholders.speakerPlaceholder)}" />
        ${
          showAssistant
            ? `<input type="text" class="input-control" data-field="assistant" value="${escapeAttr(p.assistant || '')}" placeholder="${escapeAttr(placeholders.assistantPlaceholder || 'Assistant: Name')}" />`
            : ''
        }
      </div>
    `;

    card.querySelectorAll('[data-field]').forEach((el) => {
      const handler = () => {
        const partIndex = Array.from(list.children).indexOf(card);
        if (partIndex < 0 || !editorDraftParts[partIndex]) return;
        const field = el.getAttribute('data-field');

        if (field === 'plannedMinutes') {
          editorDraftParts[partIndex].plannedMinutes = Math.max(1, Math.min(90, Number(el.value) || 1));
        } else if (field === 'section') {
          editorDraftParts[partIndex].section = el.value;
          if (el.value !== 'ministry' || isBibleReadingPart(editorDraftParts[partIndex])) {
            editorDraftParts[partIndex].assistant = '';
            editorDraftParts[partIndex].isTalk = true;
          }
          renderEditorPartRows();
        } else {
          editorDraftParts[partIndex][field] = el.value;
          if (field === 'title' && isBibleReadingPart(editorDraftParts[partIndex])) {
            editorDraftParts[partIndex].assistant = '';
            editorDraftParts[partIndex].isTalk = true;
          } else if (field === 'assistant') {
            editorDraftParts[partIndex].isTalk =
              !el.value.trim() && editorDraftParts[partIndex].section !== 'ministry';
          }
        }
      };

      el.addEventListener('input', handler);
      if (el.tagName === 'SELECT') el.addEventListener('change', handler);
    });

    card.querySelector('[data-remove]').addEventListener('click', () => {
      const partIndex = Array.from(list.children).indexOf(card);
      if (partIndex < 0 || editorDraftParts.length <= 1) return;
      editorDraftParts.splice(partIndex, 1);
      renderEditorPartRows();
    });

    const dragHandle = card.querySelector('.part-drag-handle');
    if (dragHandle) {
      attachCardDragHandlers(dragHandle, card, list);
    }

    list.appendChild(card);
  });
}

function openWeekEditorDrawer(weekId) {
  const week = weeks.find((w) => w.id === weekId);
  if (!week) return;
  editingWeekId = weekId;
  editorDraftMeta = {
    meetingType: week.meetingType === 'weekend' ? 'weekend' : 'midweek',
    weekLabel: week.weekLabel || '',
    congregationName: week.congregationName || 'Kingdom Hall',
    chairman: week.chairman || '',
  };
  $('edit-week-label').value = editorDraftMeta.weekLabel;
  $('edit-week-cong').value = editorDraftMeta.congregationName;
  $('edit-week-chairman').value = editorDraftMeta.chairman;
  $('editor-ocr-banner').classList.add('hidden');
  $('editor-ocr-progress-box').classList.add('hidden');

  editorDraftParts = week.parts.map((p) => ({ ...p }));
  renderEditorPartRows();
  $('drawer-week-editor').classList.add('open');
}

function openScannedDraftInEditor(scanResult) {
  const dict = t();
  editingWeekId = null;
  editorDraftMeta = {
    meetingType: 'midweek',
    weekLabel: scanResult.weekLabel || 'December 4, 2026',
    congregationName: getActiveWeek()?.congregationName || 'Kingdom Hall',
    chairman: scanResult.chairman || '',
  };
  $('edit-week-label').value = editorDraftMeta.weekLabel;
  $('edit-week-cong').value = editorDraftMeta.congregationName;
  $('edit-week-chairman').value = editorDraftMeta.chairman;

  const banner = $('editor-ocr-banner');
  banner.textContent = scanResult.modeUsed === '3-column' ? dict.ocrMode3Col : dict.ocrModePlanB;
  banner.classList.remove('hidden');
  $('editor-ocr-progress-box').classList.add('hidden');

  editorDraftParts = (scanResult.parts || []).map((p, i) => normalizePart(p, i));
  renderEditorPartRows();
  $('drawer-week-editor').classList.add('open');
  showToast(dict.ocrLoadedToast);
}

function closeWeekEditorDrawer() {
  $('drawer-week-editor').classList.remove('open');
  $('editor-ocr-progress-box').classList.add('hidden');
  editingWeekId = null;
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
    const payload = buildOverlayPayload();
    if (payload) AndroidOverlayBridge.syncState(payload);
  });
  $('btn-min-plus').addEventListener('click', () => {
    const part = getActivePart();
    if (!part) return;
    part.plannedMinutes = Math.min(90, part.plannedMinutes + 1);
    saveWeeks(weeks, activeWeekId);
    renderTimerStage();
    renderQueueList();
    const payload = buildOverlayPayload();
    if (payload) AndroidOverlayBridge.syncState(payload);
  });
  $('btn-sec-minus').addEventListener('click', () => {
    const part = getActivePart();
    if (!part) return;
    timerEngine.adjustRemainingSeconds(part, -30, settings);
  });
  $('btn-sec-plus').addEventListener('click', () => {
    const part = getActivePart();
    if (!part) return;
    timerEngine.adjustRemainingSeconds(part, 30, settings);
  });
  $('btn-edit-active-week').addEventListener('click', () => {
    const week = getActiveWeek();
    if (week) openWeekEditorDrawer(week.id);
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
    const payload = buildOverlayPayload();
    if (payload) AndroidOverlayBridge.syncState(payload);
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

  // Schedules tab segmented toggle (Midweek / Weekend)
  $('btn-sched-midweek').addEventListener('click', () => {
    schedulesFilterMode = 'midweek';
    renderSchedulesGrid();
  });
  $('btn-sched-weekend').addEventListener('click', () => {
    schedulesFilterMode = 'weekend';
    renderSchedulesGrid();
  });

  // Midweek Schedules OCR upload + Inline Editor Scan
  $('btn-upload-ocr').addEventListener('click', () => {
    ocrSourceTarget = 'new-week';
    $('ocr-image-input').click();
  });
  $('btn-editor-scan-image').addEventListener('click', () => {
    ocrSourceTarget = 'replace-editor';
    $('ocr-image-input').click();
  });

  $('ocr-image-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isInlineEditor = ocrSourceTarget === 'replace-editor';
    const progressBox = isInlineEditor ? $('editor-ocr-progress-box') : $('ocr-progress-box');
    const statusTextEl = isInlineEditor ? $('editor-ocr-status-text') : $('ocr-status-text');
    const pctEl = isInlineEditor ? $('editor-ocr-progress-pct') : $('ocr-progress-pct');
    const barEl = isInlineEditor ? $('editor-ocr-progress-bar') : $('ocr-progress-bar');

    progressBox.classList.remove('hidden');
    statusTextEl.textContent = t().toastOcrInit;
    pctEl.textContent = '0%';
    barEl.style.width = '0%';

    try {
      const scanResult = await scanScheduleImageOffline(file, ({ status, progress }) => {
        statusTextEl.textContent = status;
        pctEl.textContent = `${progress}%`;
        barEl.style.width = `${progress}%`;
      });
      progressBox.classList.add('hidden');

      if (isInlineEditor) {
        const dict = t();
        if (scanResult.weekLabel) {
          editorDraftMeta.weekLabel = scanResult.weekLabel;
          $('edit-week-label').value = scanResult.weekLabel;
        }
        if (scanResult.chairman) {
          editorDraftMeta.chairman = scanResult.chairman;
          $('edit-week-chairman').value = scanResult.chairman;
        }
        editorDraftParts = (scanResult.parts || []).map((p, i) => normalizePart(p, i));
        const banner = $('editor-ocr-banner');
        banner.textContent = scanResult.modeUsed === '3-column' ? dict.ocrMode3Col : dict.ocrModePlanB;
        banner.classList.remove('hidden');
        renderEditorPartRows();
        showToast(dict.ocrLoadedToast);
      } else {
        openScannedDraftInEditor(scanResult);
      }
    } catch (err) {
      console.error('Offline OCR failed:', err);
      progressBox.classList.add('hidden');
      showToast(t().toastOcrFailed);
    }
  });

  $('btn-new-blank-week').addEventListener('click', () => {
    const newWeek = createWeekObject(
      {
        meetingType: 'midweek',
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

  // Weekend Schedule manual creator
  $('btn-new-weekend-week').addEventListener('click', () => {
    const newWeekend = createWeekObject(
      {
        meetingType: 'weekend',
        weekLabel: settings.language === 'tl' ? 'Dulong Sanlinggo' : 'Weekend Meeting',
        congregationName: getActiveWeek()?.congregationName || 'Kingdom Hall',
        chairman: '',
        parts: createDefaultWeekendParts(settings.language),
      },
      settings.language
    );
    weeks.unshift(newWeekend);
    activeWeekId = newWeekend.id;
    currentPartIndex = 0;
    saveWeeks(weeks, activeWeekId);
    renderAll();
    openWeekEditorDrawer(newWeekend.id);
  });

  // Full-Screen Schedule Editor controls
  $('btn-cancel-editor-drawer').addEventListener('click', closeWeekEditorDrawer);
  $('btn-add-part-row').addEventListener('click', () => {
    const defaultSection = editorDraftMeta.meetingType === 'weekend' ? 'weekend' : 'living';
    editorDraftParts.push(
      normalizePart({
        id: generateId('part'),
        title: settings.language === 'tl' ? 'Bagong Bahagi' : 'New Part',
        section: defaultSection,
        speaker: '',
        assistant: '',
        plannedMinutes: 5,
      })
    );
    renderEditorPartRows();
  });
  $('btn-save-editor-drawer').addEventListener('click', () => {
    const nextLabel = $('edit-week-label').value.trim();
    const nextCong = $('edit-week-cong').value.trim() || 'Kingdom Hall';
    const nextChairman = $('edit-week-chairman').value.trim();
    const normalizedParts = editorDraftParts.map((p, idx) => normalizePart(p, idx));

    if (editingWeekId) {
      const week = weeks.find((w) => w.id === editingWeekId);
      if (!week) return;
      week.weekLabel = nextLabel || week.weekLabel;
      week.congregationName = nextCong;
      week.chairman = nextChairman;
      week.parts = normalizedParts;
      saveWeeks(weeks, activeWeekId);
      closeWeekEditorDrawer();
      renderAll();
      const payload = buildOverlayPayload();
      if (payload) AndroidOverlayBridge.syncState(payload);
      showToast(t().toastWeekSaved);
      return;
    }

    const savedWeek = createWeekObject(
      {
        meetingType: editorDraftMeta.meetingType || 'midweek',
        weekLabel: nextLabel || editorDraftMeta.weekLabel || 'December 4, 2026',
        congregationName: nextCong,
        chairman: nextChairman,
        parts: normalizedParts,
      },
      settings.language
    );
    weeks.unshift(savedWeek);
    activeWeekId = savedWeek.id;
    currentPartIndex = 0;
    schedulesFilterMode = savedWeek.meetingType;
    saveWeeks(weeks, activeWeekId);
    closeWeekEditorDrawer();
    renderAll();
    switchTab('timer');
    const payload = buildOverlayPayload();
    if (payload) AndroidOverlayBridge.syncState(payload);
    showToast(t().toastWeekSaved);
  });

  // Text Auto-Fill Modal (supports Schedules new week AND Editor inline replacement)
  $('btn-open-text-autofill').addEventListener('click', () => {
    autofillSourceTarget = 'new-week';
    updateTextAutofillPreview();
    $('modal-text-autofill').classList.add('open');
  });
  $('btn-editor-paste-text').addEventListener('click', () => {
    autofillSourceTarget = 'replace-editor';
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
Speaker: Juan Dela Cruz
Gems Conductor: Brother Reyes
Bible Reader: Pedro Reyes

2. MAGING MAHUSAY SA MINISTERYO
Part 1: Pagpapasimula ng Pakikipag-usap
Student 1: Shaevi Lei Lizada
Assistant 1: Carol Combis

Part 2: Pakikipag-usap Muli
Student 2: Maria Santos
Assistant 2: Ana Lim

3. PAMUMUHAY BILANG KRISTIYANO
Lokal na Pangangailangan: Brother Dela Cruz
Bible Study: Brother Mendoza
Tagabasa sa Pag-aaral: Brother Tan`;
    updateTextAutofillPreview();
  });
  $('btn-apply-text-autofill').addEventListener('click', () => {
    const parsed = parseMeetingScheduleText($('autofill-textarea').value, settings.language);
    if (!parsed) return;
    $('modal-text-autofill').classList.remove('open');

    if (autofillSourceTarget === 'replace-editor') {
      if (parsed.weekLabel) {
        editorDraftMeta.weekLabel = parsed.weekLabel;
        $('edit-week-label').value = parsed.weekLabel;
      }
      if (parsed.congregationName) {
        editorDraftMeta.congregationName = parsed.congregationName;
        $('edit-week-cong').value = parsed.congregationName;
      }
      if (parsed.chairman) {
        editorDraftMeta.chairman = parsed.chairman;
        $('edit-week-chairman').value = parsed.chairman;
      }
      editorDraftParts = (parsed.parts || []).map((p, i) => normalizePart(p, i));
      renderEditorPartRows();
      showToast(t().ocrLoadedToast);
      return;
    }

    const savedWeek = createWeekObject(parsed, settings.language);
    weeks.unshift(savedWeek);
    activeWeekId = savedWeek.id;
    currentPartIndex = 0;
    schedulesFilterMode = 'midweek';
    saveWeeks(weeks, activeWeekId);
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
  $('toggle-auto-float').addEventListener('change', (e) => {
    settings.autoFloatOnLeave = e.target.checked;
    saveSettings(settings);
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

  // Native Android Overlay Commands & Lifecycle Hooks
  initOverlayListeners(
    (action) => {
      if (action === 'PLAY_PAUSE') {
        toggleStartPause();
      } else if (action === 'NEXT_PART') {
        advanceNextPartManual();
      } else if (action === 'RETURN_TO_APP' || action === 'OPEN_APP') {
        switchTab('timer');
        handleAppReturn();
        window.focus();
      }
    },
    (lifecycleEvent) => {
      if (lifecycleEvent === 'APP_LEAVE') {
        handleAppLeave();
      } else if (lifecycleEvent === 'APP_RETURN') {
        handleAppReturn();
      }
    }
  );

  // WebView visibilitychange fallback for Auto-Float & timer sync
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleAppLeave();
    } else if (document.visibilityState === 'visible') {
      handleAppReturn();
    }
  });
}

bindEvents();
setKeepScreenAwake(settings.keepAwake);
renderAll();
