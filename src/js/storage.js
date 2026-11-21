const WEEKS_STORAGE_KEY = 'km_weeks_v1';
const ACTIVE_WEEK_KEY = 'km_active_week_id_v1';
const SETTINGS_STORAGE_KEY = 'km_settings_v1';

export const DEFAULT_SETTINGS = {
  language: 'tl',
  theme: 'midnight',
  keepAwake: true,
  vibration: {
    enabled: true,
    alert60: true,
    alert30: true,
    alert0: true,
    duration60Ms: 200,
    duration30Ms: 150,
    duration0Ms: 2000,
    intensityScale: 100,
  },
};

export function createDefaultMidweekParts(lang = 'tl') {
  const isTl = lang === 'tl';
  return [
    {
      id: generateId('part'),
      title: isTl ? 'Pambungad na Komento' : 'Opening Comments',
      section: 'opening',
      speaker: '',
      assistant: '',
      isTalk: true,
      plannedMinutes: 1,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Kayamanan sa Salita ng Diyos' : "Treasures From God's Word",
      section: 'treasures',
      speaker: '',
      assistant: '',
      isTalk: true,
      plannedMinutes: 10,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Espirituwal na Hiyas' : 'Spiritual Gems',
      section: 'treasures',
      speaker: '',
      assistant: '',
      isTalk: true,
      plannedMinutes: 10,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Pagbabasa sa Bibliya' : 'Bible Reading',
      section: 'treasures',
      speaker: '',
      assistant: '',
      isTalk: true,
      plannedMinutes: 4,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Pagpapasimula ng Pakikipag-usap' : 'Starting a Conversation',
      section: 'ministry',
      speaker: '',
      assistant: '',
      isTalk: false,
      plannedMinutes: 3,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Pakikipag-usap Muli' : 'Following Up',
      section: 'ministry',
      speaker: '',
      assistant: '',
      isTalk: false,
      plannedMinutes: 4,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Paggawa ng mga Alagad' : 'Making Disciples',
      section: 'ministry',
      speaker: '',
      assistant: '',
      isTalk: false,
      plannedMinutes: 5,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Lokal na Pangangailangan' : 'Local Needs',
      section: 'living',
      speaker: '',
      assistant: '',
      isTalk: true,
      plannedMinutes: 15,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Pag-aaral ng Kongregasyon sa Bibliya' : 'Congregation Bible Study',
      section: 'living',
      speaker: '',
      assistant: '',
      isTalk: true,
      plannedMinutes: 30,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
    {
      id: generateId('part'),
      title: isTl ? 'Pangwakas na Komento' : 'Concluding Comments',
      section: 'concluding',
      speaker: '',
      assistant: '',
      isTalk: true,
      plannedMinutes: 3,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
  ];
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizePart(raw, index = 0) {
  const title = String(raw?.title || `Part ${index + 1}`).trim();
  const section = ['opening', 'treasures', 'ministry', 'living', 'concluding'].includes(raw?.section)
    ? raw.section
    : inferSectionFromTitle(title);

  let speaker = String(raw?.speaker || '').trim();
  // Ensure CBS Reader is stripped if present inside CBS speaker string
  if (/pag-aaral|bible study|cbs/i.test(title)) {
    speaker = speaker.replace(/\s*\((?:tagabasa|reader)\s*:[^)]*\)/gi, '').trim();
  }

  return {
    id: raw?.id || generateId('part'),
    title,
    section,
    speaker,
    assistant: String(raw?.assistant || '').trim(),
    isTalk: typeof raw?.isTalk === 'boolean' ? raw.isTalk : section !== 'ministry',
    plannedMinutes: Math.max(1, Number(raw?.plannedMinutes) || 5),
    actualSeconds: Math.max(0, Number(raw?.actualSeconds) || 0),
    completed: Boolean(raw?.completed),
    firedAlerts: {
      oneMin: Boolean(raw?.firedAlerts?.oneMin),
      thirtySec: Boolean(raw?.firedAlerts?.thirtySec),
      zero: Boolean(raw?.firedAlerts?.zero),
    },
  };
}

export function inferSectionFromTitle(title) {
  const low = title.toLowerCase();
  if (low.includes('pambungad') || low.includes('opening')) return 'opening';
  if (low.includes('pangwakas') || low.includes('concluding') || low.includes('closing')) return 'concluding';
  if (
    low.includes('kayamanan') ||
    low.includes('treasures') ||
    low.includes('hiyas') ||
    low.includes('gems') ||
    low.includes('pagbabasa') ||
    low.includes('bible reading')
  ) {
    return 'treasures';
  }
  if (
    low.includes('lokal') ||
    low.includes('local') ||
    low.includes('pamumuhay') ||
    low.includes('living') ||
    low.includes('pag-aaral') ||
    low.includes('bible study') ||
    low.includes('cbs') ||
    low.includes('accomplishments')
  ) {
    return 'living';
  }
  return 'ministry';
}

export function createWeekObject({ weekLabel, congregationName = 'Kingdom Hall', chairman = '', parts = [] }, lang = 'tl') {
  return {
    id: generateId('week'),
    weekLabel: (weekLabel || '').trim() || (lang === 'tl' ? 'Bagong Linggo' : 'New Week'),
    congregationName: (congregationName || '').trim() || 'Kingdom Hall',
    chairman: (chairman || '').trim(),
    createdAt: Date.now(),
    parts: (parts.length > 0 ? parts : createDefaultMidweekParts(lang)).map((p, idx) => normalizePart(p, idx)),
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        vibration: {
          ...DEFAULT_SETTINGS.vibration,
          ...(parsed.vibration || {}),
        },
      };
    }
    const legacyLang = localStorage.getItem('km_offline_lang_setting');
    const legacyTheme = localStorage.getItem('km_offline_theme_setting');
    return {
      ...DEFAULT_SETTINGS,
      language: legacyLang === 'en' ? 'en' : 'tl',
      theme: legacyTheme === 'light' ? 'light' : 'midnight',
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save settings:', err);
  }
}

export function loadWeeks(lang = 'tl') {
  try {
    const raw = localStorage.getItem(WEEKS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((w) => ({
          ...w,
          parts: Array.isArray(w.parts) ? w.parts.map((p, i) => normalizePart(p, i)) : createDefaultMidweekParts(lang),
        }));
      }
    }

    // Attempt migration from legacy single-agenda midweek store
    const legacyModesRaw = localStorage.getItem('km_offline_agendas_by_mode');
    const legacySingleRaw = localStorage.getItem('km_offline_agenda_data_v3');
    let legacyMidweek = null;

    if (legacyModesRaw) {
      const modes = JSON.parse(legacyModesRaw);
      if (modes?.midweek?.parts?.length) legacyMidweek = modes.midweek;
    } else if (legacySingleRaw) {
      const single = JSON.parse(legacySingleRaw);
      if (single?.parts?.length) legacyMidweek = single;
    }

    if (legacyMidweek) {
      const filteredParts = legacyMidweek.parts.filter((p) => {
        const low = (p.title || '').toLowerCase();
        return !low.includes('awit') && !low.includes('song') && !low.includes('panalangin') && !low.includes('prayer');
      });
      const migrated = createWeekObject(
        {
          weekLabel: legacyMidweek.meetingDate || 'December 4, 2026',
          congregationName: legacyMidweek.congregationName || 'Kingdom Hall',
          chairman: legacyMidweek.chairman || '',
          parts: filteredParts,
        },
        lang
      );
      saveWeeks([migrated], migrated.id);
      return [migrated];
    }
  } catch (err) {
    console.warn('Load weeks fallback:', err);
  }

  const starter = createWeekObject(
    {
      weekLabel: 'December 4, 2026',
      congregationName: 'Kingdom Hall',
      chairman: '',
      parts: createDefaultMidweekParts(lang),
    },
    lang
  );
  saveWeeks([starter], starter.id);
  return [starter];
}

export function loadActiveWeekId(weeks) {
  try {
    const saved = localStorage.getItem(ACTIVE_WEEK_KEY);
    if (saved && weeks.some((w) => w.id === saved)) return saved;
  } catch {
    // ignore
  }
  return weeks[0]?.id || null;
}

export function saveWeeks(weeks, activeWeekId) {
  try {
    localStorage.setItem(WEEKS_STORAGE_KEY, JSON.stringify(weeks));
    if (activeWeekId) {
      localStorage.setItem(ACTIVE_WEEK_KEY, activeWeekId);
    }
  } catch (err) {
    console.warn('Failed to save weeks:', err);
  }
}
