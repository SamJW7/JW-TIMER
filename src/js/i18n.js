export const I18N = {
  en: {
    appTitle: 'JW Timer',
    navTimer: 'Timer',
    navSchedules: 'Schedules',
    navSettings: 'Settings',
    summaryBtn: 'Summary',
    overtimeReportBtn: 'Overtime Report',
    sectionLabels: {
      opening: 'Opening',
      treasures: "Treasures From God's Word",
      ministry: 'Apply Yourself to the Field Ministry',
      living: 'Living as Christians',
      concluding: 'Concluding',
      weekend: 'Weekend Meeting',
    },
    statusOnTime: 'On Time',
    statusWarning: 'Warning',
    statusOvertime: 'Overtime',
    allotted: 'Allotted',
    elapsed: 'Elapsed',
    partCounter: (idx, total) => `Part ${idx} of ${total}`,
    unassigned: 'Unassigned',
    asstShort: 'Assistant',
    chairmanPrefix: 'Chairman',
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    nextPart: 'Next Part',
    previous: 'Previous',
    reset: 'Reset',
    floatOverlay: 'Float Overlay',
    stopOverlay: 'Hide Overlay',
    quickAdjust: 'Quick Adjust',
    targetAdjustLabel: 'Target',
    timerAdjustLabel: 'Timer',
    queueHeading: 'Meeting Parts',
    queueEditBtn: 'Edit',
    resetWeekTimes: 'Reset Week Times',
    timerEmptyTitle: 'No active schedule selected',
    timerEmptyDesc: 'Create, paste, or scan a meeting schedule to start timing.',
    goToSchedulesBtn: 'Go to Schedules',
    schedulesHeading: 'Meeting Schedules',
    schedulesSub: 'Manage Midweek & Weekend meeting schedules offline.',
    schedMidweek: 'Midweek',
    schedWeekend: 'Weekend',
    uploadImageBtn: 'Upload Schedule Image',
    pasteTextBtn: 'Paste Schedule Text',
    newBlankWeekBtn: 'New Blank Week',
    newWeekendWeekBtn: '+ New Weekend Schedule (Manual)',
    schedEmptyTitleMidweek: 'No Midweek schedules yet',
    schedEmptyDescMidweek: 'Upload a schedule image, paste text, or create a blank week.',
    schedEmptyTitleWeekend: 'No Weekend schedules yet',
    schedEmptyDescWeekend: 'Create a manual Weekend Public Talk & Watchtower schedule.',
    activeWeekTag: 'Active',
    useWeekBtn: 'Use Schedule',
    editWeekBtn: 'Edit',
    deleteWeekBtn: 'Delete',
    partsUnit: 'parts',
    weekendTag: 'Weekend',
    midweekTag: 'Midweek',
    settingsHeading: 'Settings',
    settingsSub: 'Language, display, auto-float, screen wake lock, and vibration alerts.',
    generalCardTitle: 'Display & Behavior',
    settingLangTitle: 'Language',
    settingLangDesc: 'Translates all UI labels and overtime reports.',
    settingThemeTitle: 'Appearance',
    settingThemeDesc: 'Switch between Midnight dark and Clean Light.',
    themeMidnight: 'Midnight',
    themeLight: 'Light',
    settingAwakeTitle: 'Keep Screen Awake',
    settingAwakeDesc: 'Prevents Android display from sleeping during meetings.',
    settingAutoFloatTitle: 'Auto-Float When Leaving App',
    settingAutoFloatDesc: 'Automatically floats the pill over JW Library when a timer is running or paused mid-meeting.',
    settingTutorialTitle: 'How to Use JW Timer',
    settingTutorialDesc: 'View the 4-slide interactive walkthrough guide anytime.',
    viewTutorialBtn: 'View Tutorial',
    vibCardTitle: 'Vibration Alerts',
    testVibration: 'Test Vibration',
    vibMasterTitle: 'Enable Vibration Alerts',
    vibMasterDesc: 'Master toggle for countdown haptic cues.',
    vib60Title: '1:00 Remaining (Single Pulse)',
    vib60Desc: 'Gentle cue when 1 minute remains.',
    vib30Title: '0:30 Remaining (Double Pulse)',
    vib30Desc: 'Double tap warning at 30 seconds left.',
    vib0Title: "0:00 Time's Up (Long Buzz)",
    vib0Desc: 'Extended 2-second alert when time expires.',
    vibIntensityTitle: 'Pulse Duration / Intensity',
    lbl60Ms: '1:00 (ms)',
    lbl30Ms: '0:30 (ms)',
    lbl0Ms: '0:00 (ms)',
    editorTitle: 'Edit Schedule',
    editorScanBtn: 'Scan Image',
    editorPasteBtn: 'Paste Text',
    editWeekLabel: 'Meeting Date',
    editWeekCong: 'Congregation',
    editWeekChair: 'Chairman',
    editorPartsLabel: 'Parts (hold & drag ⋮⋮ to reorder)',
    addPartRow: '+ Add Part',
    cancel: 'Cancel',
    saveWeek: 'Save',
    ocrLoadedToast: 'Schedule scanned — review parts and tap Save.',
    ocrPreviewTitle: 'Review Scanned Schedule',
    ocrMode3Col: 'Parsed via S-140 / KHS 3-column row alignment. Verify before saving.',
    ocrModePlanB: 'Parsed via Plan B adaptive line regex. Edit any row before saving.',
    ocrPreparingImage: 'Preparing image...',
    ocrRunningMlKit: 'Scanning offline via Native Android ML Kit...',
    ocrParsingRows: 'Parsing schedule rows...',
    thPart: 'Part Title',
    thSection: 'Section',
    thMin: 'Min',
    thSpeaker: 'Speaker / Role',
    thAsst: 'Assistant',
    addRow: '+ Add Row',
    saveOcrWeek: 'Save Schedule Week',
    autofillTitle: 'Paste Schedule Text',
    loadSample: 'Load Sample Template',
    clear: 'Clear',
    saveAsWeek: 'Save as Week',
    summaryTitle: 'Meeting Overtime Summary',
    sumAllotted: 'Allotted',
    sumActual: 'Actual',
    sumVariance: 'Net Variance',
    sumOvertime: 'Overtime',
    sumPreviewLabel: 'Plain-Text Report (Viber / Messenger Ready)',
    close: 'Close',
    copyReport: 'Copy Plain-Text Report',
    reportTitleMidweek: 'MIDWEEK MEETING TIME REPORT',
    reportTitleWeekend: 'WEEKEND MEETING TIME REPORT',
    reportWeek: 'Date',
    reportChairman: 'Chairman',
    reportAllotted: 'Allotted',
    reportActual: 'Actual',
    reportOvertime: 'Overtime',
    reportOnTime: 'On time',
    reportUnder: 'under',
    reportPending: 'Not timed',
    reportTotalAllotted: 'Total Allotted',
    reportTotalActual: 'Total Actual',
    reportTotalNet: 'Net Variance',
    confirmDeleteTitle: 'Delete Schedule?',
    confirmDeleteMsg: (label, isLast) =>
      isLast
        ? `Delete "${label}"? This is your last remaining schedule card.`
        : `Delete "${label}"? This schedule and its recorded times will be removed.`,
    confirmDeleteBtn: 'Delete Schedule',
    confirmExitTitle: 'Exit JW Timer? / Lumabas sa JW Timer?',
    confirmExitMsg: 'Do you want to exit JW Timer?',
    confirmExitRunningWarn: 'Warning: A countdown timer is currently running. Exiting now will stop the timer.',
    confirmExitStayBtn: 'Stay',
    confirmExitLeaveBtn: 'Exit App',
    toastCopied: 'Plain-text report copied to clipboard.',
    toastWeekSaved: 'Schedule saved.',
    toastWeekDeleted: 'Schedule deleted.',
    toastWeekActivated: 'Active schedule switched.',
    toastTimesReset: 'Schedule times reset.',
    toastNoActiveSchedule: 'Select or create a schedule first.',
    toastVibTest: 'Vibration test triggered.',
    toastOverlayActive: 'Floating overlay active.',
    toastOverlayStopped: 'Floating overlay closed.',
    toastOverlayPermNeeded: 'Please allow "Display over other apps" permission, then tap Float Overlay again.',
    toastOcrInit: 'Scanning schedule offline...',
    toastOcrFailed: 'Could not read image. Try Paste Schedule Text or add parts manually.',
    toastOcrNativeOnly: 'Image OCR runs natively via offline ML Kit inside the Android APK. Use Paste Schedule Text here in browser preview.',
    toastOcrNoText: 'No schedule text was detected in that image. Try a sharper photo or Paste Schedule Text.',
    toastImageDecodeError: 'Failed to decode the selected image file. Please choose another image.',
    toastExitBrowser: 'Close this browser tab to exit web preview.',
    walkthrough: {
      headerTitle: 'Welcome to JW Timer',
      skip: 'Skip',
      back: 'Back',
      next: 'Next',
      getStarted: 'Get Started',
      stepLabel: (idx, total) => `Step ${idx} of ${total}`,
      slides: [
        {
          title: 'Import Schedules in Seconds',
          desc: 'Start with a Midweek S-140 / KHS screenshot, paste text, or build a manual Weekend schedule — all 100% offline.',
          tips: [
            { label: 'Scan Image', detail: 'Reads Midweek schedules offline via native Android ML Kit.' },
            { label: 'Paste Text', detail: 'Quickly auto-fill parts or load a blank template.' },
            { label: 'Weekend Tab', detail: 'Create Public Talk & Watchtower Study agendas manually.' },
          ],
        },
        {
          title: 'Full-Screen Editor & Touch Drag-and-Drop',
          desc: 'Customize any part title, speaker role, or duration inside the full-screen editor.',
          tips: [
            { label: 'Edit Anytime', detail: 'Tap Edit on any schedule card or directly from the Timer tab.' },
            { label: 'Hold & Drag ⋮⋮', detail: 'Press and hold the grip handle to lift and reorder parts smoothly.' },
            { label: 'Section Colors', detail: 'Color-coded accents keep Midweek & Weekend parts organized.' },
          ],
        },
        {
          title: 'Live Stage & Timing Controls',
          desc: 'Stay on track during live meetings with responsive buttons and discreet haptic cues.',
          tips: [
            { label: 'Start / Next Part', detail: 'Run countdowns cleanly and jump between parts with one tap.' },
            { label: '-30s / +30s & -1m / +1m', detail: 'Fix late/early clicks on the fly or adjust target minutes.' },
            { label: 'Vibration Alerts', detail: 'Silent cues at 1:00, 0:30, and 0:00 — configurable in Settings.' },
          ],
        },
        {
          title: 'Auto-Float Over JW Library & Overtime Report',
          desc: 'Keep timing visible while checking notes or scriptures in JW Library, then share results right after the meeting.',
          tips: [
            { label: 'Auto-Float Pill', detail: 'Pops up over JW Library once "Display over other apps" is allowed.' },
            { label: '1-Tap Return', detail: 'Tap the floating pill anytime to jump straight back into JW Timer.' },
            { label: 'Overtime Report', detail: 'Copy a clean plain-text summary in 1 tap for Viber or Messenger.' },
          ],
        },
      ],
    },
  },
  tl: {
    appTitle: 'JW Timer',
    navTimer: 'Timer',
    navSchedules: 'Iskedyul',
    navSettings: 'Settings',
    summaryBtn: 'Ulat',
    overtimeReportBtn: 'Ulat ng Overtime',
    sectionLabels: {
      opening: 'Pambungad',
      treasures: 'Kayamanan Mula sa Salita ng Diyos',
      ministry: 'Maging Mahusay sa Ministeryo sa Larangan',
      living: 'Pamumuhay Bilang Kristiyano',
      concluding: 'Pangwakas',
      weekend: 'Pulong sa Dulong Sanlinggo',
    },
    statusOnTime: 'Sa Oras',
    statusWarning: 'Babala',
    statusOvertime: 'Lumampas (Overtime)',
    allotted: 'Takda',
    elapsed: 'Nakalipas',
    partCounter: (idx, total) => `Bahagi ${idx} ng ${total}`,
    unassigned: 'Walang nakatala',
    asstShort: 'Katulong',
    chairmanPrefix: 'Tagapangulo',
    start: 'Simulan',
    pause: 'Ihinto',
    resume: 'Ituloy',
    nextPart: 'Susunod',
    previous: 'Nakaraan',
    reset: 'Ulitin',
    floatOverlay: 'Float Overlay',
    stopOverlay: 'Isara ang Overlay',
    quickAdjust: 'Mabilisang Adjust',
    targetAdjustLabel: 'Takda',
    timerAdjustLabel: 'Timer',
    queueHeading: 'Mga Bahagi ng Pulong',
    queueEditBtn: 'I-edit',
    resetWeekTimes: 'I-reset ang Oras',
    timerEmptyTitle: 'Walang aktibong iskedyul na napili',
    timerEmptyDesc: 'Gumawa, mag-paste, o mag-scan ng iskedyul para magsimula ng timer.',
    goToSchedulesBtn: 'Pumunta sa Iskedyul',
    schedulesHeading: 'Mga Iskedyul ng Pulong',
    schedulesSub: 'Pamahalaan ang Gitnang Sanlinggo at Dulong Sanlinggo offline.',
    schedMidweek: 'Gitnang Sanlinggo',
    schedWeekend: 'Dulong Sanlinggo',
    uploadImageBtn: 'Mag-upload ng Larawan ng Iskedyul',
    pasteTextBtn: 'I-paste ang Teksto',
    newBlankWeekBtn: 'Bagong Linggo',
    newWeekendWeekBtn: '+ Bagong Iskedyul sa Dulong Sanlinggo (Mano-mano)',
    schedEmptyTitleMidweek: 'Wala pang iskedyul sa Gitnang Sanlinggo',
    schedEmptyDescMidweek: 'Mag-upload ng larawan, mag-paste ng teksto, o gumawa ng bagong linggo.',
    schedEmptyTitleWeekend: 'Wala pang iskedyul sa Dulong Sanlinggo',
    schedEmptyDescWeekend: 'Gumawa ng mano-manong iskedyul para sa Dulong Sanlinggo.',
    activeWeekTag: 'Aktibo',
    useWeekBtn: 'Gamitin',
    editWeekBtn: 'I-edit',
    deleteWeekBtn: 'Burahin',
    partsUnit: 'bahagi',
    weekendTag: 'Dulong Sanlinggo',
    midweekTag: 'Gitnang Sanlinggo',
    settingsHeading: 'Settings',
    settingsSub: 'Wika, tema, auto-float, pagpapanatiling gising ng screen, at vibration alerts.',
    generalCardTitle: 'Display at Gawain',
    settingLangTitle: 'Wika',
    settingLangDesc: 'Isinasalin ang lahat ng label at plain-text na ulat.',
    settingThemeTitle: 'Tema',
    settingThemeDesc: 'Lumipat sa pagitan ng Midnight dark at Clean Light.',
    themeMidnight: 'Midnight',
    themeLight: 'Light',
    settingAwakeTitle: 'Panatilihing Gising ang Screen',
    settingAwakeDesc: 'Pinipigilan ang pagtulog ng screen habang may pulong.',
    settingAutoFloatTitle: 'Auto-Float Kapag Lumabas sa App',
    settingAutoFloatDesc: 'Awtomatikong lumulutang ang timer pill sa ibabaw ng JW Library kapag tumatakbo o naka-pause sa gitna ng pulong.',
    settingTutorialTitle: 'Paano Gamitin ang JW Timer',
    settingTutorialDesc: 'Buksan ulit ang 4-slide walkthrough guide anumang oras.',
    viewTutorialBtn: 'View Tutorial',
    vibCardTitle: 'Mga Vibration Alert',
    testVibration: 'Subukan (Test)',
    vibMasterTitle: 'I-on ang Vibration Alerts',
    vibMasterDesc: 'Pangunahing switch para sa mga vibration cue.',
    vib60Title: '1:00 Natitira (Single Pulse)',
    vib60Desc: 'Mahinang vibration kapag 1 minuto na lang.',
    vib30Title: '0:30 Natitira (Double Pulse)',
    vib30Desc: 'Dalawang maikling tap kapag 30 segundo na lang.',
    vib0Title: '0:00 Tapos na ang Oras (Long Buzz)',
    vib0Desc: 'Mahabang 2-segundong vibration kapag ubos na ang oras.',
    vibIntensityTitle: 'Tagal / Lakas ng Vibration',
    lbl60Ms: '1:00 (ms)',
    lbl30Ms: '0:30 (ms)',
    lbl0Ms: '0:00 (ms)',
    editorTitle: 'I-edit ang Iskedyul',
    editorScanBtn: 'Mag-scan',
    editorPasteBtn: 'I-paste',
    editWeekLabel: 'Petsa ng Pulong',
    editWeekCong: 'Kongregasyon',
    editWeekChair: 'Tagapangulo',
    editorPartsLabel: 'Mga Bahagi (pindutin at i-drag ang ⋮⋮)',
    addPartRow: '+ Magdagdag',
    cancel: 'Kanselahin',
    saveWeek: 'I-save',
    ocrLoadedToast: 'Na-scan na ang iskedyul — suriin at pindutin ang I-save.',
    ocrPreviewTitle: 'Suriin ang Na-scan na Iskedyul',
    ocrMode3Col: 'Na-parse gamit ang S-140 / KHS 3-column row alignment. Suriin bago i-save.',
    ocrModePlanB: 'Na-parse gamit ang Plan B adaptive regex. I-edit kung kailangan bago i-save.',
    ocrPreparingImage: 'Inihahanda ang larawan...',
    ocrRunningMlKit: 'Bina-scan gamit ang offline Native ML Kit...',
    ocrParsingRows: 'Kinukuha ang mga bahagi ng iskedyul...',
    thPart: 'Pamagat ng Bahagi',
    thSection: 'Seksiyon',
    thMin: 'Min',
    thSpeaker: 'Tagapagsalita / Tungkulin',
    thAsst: 'Katulong',
    addRow: '+ Magdagdag ng Row',
    saveOcrWeek: 'I-save ang Iskedyul',
    autofillTitle: 'I-paste ang Teksto ng Iskedyul',
    loadSample: 'Halimbawang Template',
    clear: 'Burahin',
    saveAsWeek: 'I-save Bilang Linggo',
    summaryTitle: 'Ulat ng Oras at Overtime',
    sumAllotted: 'Takda',
    sumActual: 'Aktwal',
    sumVariance: 'Kabuuang Diperensya',
    sumOvertime: 'Overtime',
    sumPreviewLabel: 'Plain-Text na Ulat (Handa para sa Viber / Messenger)',
    close: 'Isara',
    copyReport: 'Kopyahin ang Plain-Text Report',
    reportTitleMidweek: 'ULAT NG ORAS SA GITNANG SANLINGGO',
    reportTitleWeekend: 'ULAT NG ORAS SA DULONG SANLINGGO',
    reportWeek: 'Petsa',
    reportChairman: 'Tagapangulo',
    reportAllotted: 'Takda',
    reportActual: 'Aktwal',
    reportOvertime: 'Overtime',
    reportOnTime: 'Sakto',
    reportUnder: 'kulang',
    reportPending: 'Hindi pa naorasan',
    reportTotalAllotted: 'Kabuuang Takda',
    reportTotalActual: 'Kabuuang Aktwal',
    reportTotalNet: 'Kabuuang Diperensya',
    confirmDeleteTitle: 'Burahin ang Iskedyul?',
    confirmDeleteMsg: (label, isLast) =>
      isLast
        ? `Burahin ang "${label}"? Ito na ang huling natitirang iskedyul.`
        : `Burahin ang "${label}"? Mabubura ang iskedyul at ang mga naorasang bahagi nito.`,
    confirmDeleteBtn: 'Burahin',
    confirmExitTitle: 'Exit JW Timer? / Lumabas sa JW Timer?',
    confirmExitMsg: 'Sigurado ka bang gusto mong isara ang JW Timer?',
    confirmExitRunningWarn: 'Babala: May tumatakbong timer ngayon. Hihinto ang countdown kapag isinara ang app.',
    confirmExitStayBtn: 'Manatili',
    confirmExitLeaveBtn: 'Lumabas',
    toastCopied: 'Nakopya na ang plain-text na ulat sa clipboard.',
    toastWeekSaved: 'Na-save na ang iskedyul.',
    toastWeekDeleted: 'Nabura na ang iskedyul.',
    toastWeekActivated: 'Napalitan na ang aktibong iskedyul.',
    toastTimesReset: 'Na-reset na ang mga oras.',
    toastNoActiveSchedule: 'Pumili o gumawa muna ng iskedyul.',
    toastVibTest: 'Sinusubukan ang vibration.',
    toastOverlayActive: 'Aktibo na ang floating overlay.',
    toastOverlayStopped: 'Isinara ang floating overlay.',
    toastOverlayPermNeeded: 'Paki-payagan ang "Display over other apps" at i-tap muli ang Float Overlay.',
    toastOcrInit: 'Bina-scan ang larawan offline...',
    toastOcrFailed: 'Hindi mabasa ang larawan. Subukan ang I-paste ang Teksto o mano-manong pag-edit.',
    toastOcrNativeOnly: 'Gumagana ang Image OCR offline gamit ang Native Android ML Kit sa APK. Gamitin ang I-paste ang Teksto sa browser preview.',
    toastOcrNoText: 'Walang mabasang teksto sa larawan. Subukan ang mas malinaw na larawan o I-paste ang Teksto.',
    toastImageDecodeError: 'Hindi mabuksan ang napiling larawan. Pumili ng ibang larawan.',
    toastExitBrowser: 'Isara ang browser tab na ito para lumabas sa preview.',
    walkthrough: {
      headerTitle: 'Welcome sa JW Timer',
      skip: 'Laktawan',
      back: 'Bumalik',
      next: 'Susunod',
      getStarted: 'Simulan Na',
      stepLabel: (idx, total) => `Hakbang ${idx} ng ${total}`,
      slides: [
        {
          title: 'I-import ang Schedule sa Ilang Segundo',
          desc: 'Gumawa ng schedule 100% offline — i-scan ang Midweek S-140 / KHS screenshot, mag-paste ng text, o gumawa ng manual Weekend schedule.',
          tips: [
            { label: 'Upload Image', detail: 'I-upload lang ang screenshot ng S-140 schedule para ma-scan offline.' },
            { label: 'Paste Text', detail: 'I-paste ang teksto para mabilis ma-fill out ang mga bahagi.' },
            { label: 'Weekend Tab', detail: 'Gumawa ng manual Public Talk & Watchtower Study schedule.' },
          ],
        },
        {
          title: 'Full-Screen Editor & Smooth Drag-and-Drop',
          desc: 'I-customize ang bawat bahagi, pangalan ng speaker, at takdang minuto sa full-screen editor.',
          tips: [
            { label: 'I-edit Kahit Kailan', detail: 'Pindutin ang Edit sa schedule card o sa Timer tab.' },
            { label: 'Hold & Drag ⋮⋮', detail: 'I-press and hold ang ⋮⋮ grip para i-drag at ayusin ang pagkakasunod.' },
            { label: 'Section Colors', detail: 'May kulay bawat seksiyon para madaling makita ang daloy ng pulong.' },
          ],
        },
        {
          title: 'Live Stage & Timing Controls',
          desc: 'Mag-time nang kampante habang pulong gamit ang malalaking buttons at tahimik na vibration alerts.',
          tips: [
            { label: 'Start / Next Part', detail: 'I-start, i-pause, o lumipat sa susunod na bahagi sa 1 tap.' },
            { label: '-30s / +30s & -1m / +1m', detail: 'Pang-adjust agad kung late o maaga na-click, o kung nagbago ang target.' },
            { label: 'Vibration Alerts', detail: 'May tahimik na signal sa 1:00, 0:30, at 0:00 (pwedeng i-adjust sa Settings).' },
          ],
        },
        {
          title: 'Auto-Float sa JW Library & Overtime Report',
          desc: 'Tuloy ang pagtingin sa oras kahit lumipat ka sa JW Library, at madaling i-share ang report pagkatapos.',
          tips: [
            { label: 'Auto-Float Pill', detail: 'Nag-a-auto-float ang timer pill kapag nag-switch ka sa JW Library (basta naka-allow ang "Display over other apps").' },
            { label: '1-Tap Balik', detail: 'I-tap lang ang floating pill para bumalik agad sa JW Timer.' },
            { label: 'Overtime Report', detail: 'I-copy ang overtime report para sa Viber or Messenger sa 1 tap.' },
          ],
        },
      ],
    },
  },
};

export function isBibleReadingPart(part) {
  return /pagbabasa|bible\s*reading/i.test(part?.title || '');
}

export function getContextualRolePlaceholders(part, index = 0) {
  const title = (part?.title || '').toLowerCase();
  const section = part?.section || '';

  if (section === 'opening' || section === 'concluding' || title.includes('pambungad') || title.includes('opening') || title.includes('pangwakas') || title.includes('concluding')) {
    return { speakerPlaceholder: 'Chairman: Name', assistantPlaceholder: '' };
  }
  if (isBibleReadingPart(part)) {
    return { speakerPlaceholder: 'Bible Reader: Name', assistantPlaceholder: '' };
  }
  if (section === 'ministry') {
    const numMatch = title.match(/\b(\d+)\b/);
    const num = numMatch ? numMatch[1] : index > 0 ? String(index) : '1';
    return {
      speakerPlaceholder: `Student ${num}: Name`,
      assistantPlaceholder: `Assistant ${num}: Name`,
    };
  }
  if (title.includes('pag-aaral') || title.includes('bible study') || title.includes('watchtower') || title.includes('bantayan') || title.includes('cbs')) {
    return { speakerPlaceholder: 'Conductor: Name', assistantPlaceholder: '' };
  }
  return { speakerPlaceholder: 'Speaker: Name', assistantPlaceholder: '' };
}

function hasRolePrefix(str) {
  return /^(?:Chairman|Tagapangulo|Speaker(?:\s*\d+)?|Tagapagsalita(?:\s*\d+)?|Gems\s*Conductor|LN\s*Speaker|CBS\s*Conductor|Student\s*Speaker|Bible\s*Reader|Tagabasa\s*sa\s*Bibliya|Student(?:\s*\d+)?|Estudyante(?:\s*\d+)?|Assistant(?:\s*\d+)?|Katulong(?:\s*\d+)?|Conductor|Kondyaktor)\s*:/i.test(
    str.trim()
  );
}

export function formatSpeakerDisplay(part, lang = 'en') {
  const t = I18N[lang] || I18N.en;
  const spk = (part?.speaker || '').trim();
  const asst = isBibleReadingPart(part) ? '' : (part?.assistant || '').trim();
  if (!spk) return t.unassigned;

  if (asst && !part?.isTalk) {
    const formattedAsst = hasRolePrefix(asst) ? asst : `${t.asstShort}: ${asst}`;
    return `${spk} | ${formattedAsst}`;
  }
  return spk;
}

export function renderSpeakerToElement(el, part, lang = 'en') {
  if (!el) return;
  const t = I18N[lang] || I18N.en;
  el.textContent = '';

  const spk = (part?.speaker || '').trim();
  const asst = isBibleReadingPart(part) ? '' : (part?.assistant || '').trim();

  if (!spk) {
    el.textContent = t.unassigned;
    return;
  }

  const appendSegment = (segmentText) => {
    const m = segmentText.match(/^([^:]{2,26}:)\s*(.+)$/);
    if (m) {
      const prefixSpan = document.createElement('span');
      prefixSpan.className = 'role-prefix';
      prefixSpan.textContent = `${m[1]} `;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'role-person';
      nameSpan.textContent = m[2];

      el.appendChild(prefixSpan);
      el.appendChild(nameSpan);
    } else {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'role-person';
      nameSpan.textContent = segmentText;
      el.appendChild(nameSpan);
    }
  };

  appendSegment(spk);

  if (asst && !part?.isTalk) {
    const sep = document.createElement('span');
    sep.className = 'role-sep';
    sep.textContent = '|';
    el.appendChild(sep);
    const formattedAsst = hasRolePrefix(asst) ? asst : `${t.asstShort}: ${asst}`;
    appendSegment(formattedAsst);
  }
}
