const WEEKS_STORAGE_KEY = 'km_weeks_v1';
const ACTIVE_WEEK_KEY = 'km_active_week_id_v1';
const SETTINGS_STORAGE_KEY = 'km_settings_v1';
const TUTORIAL_SEEN_KEY = 'km_tutorial_seen_v1';

export const DEFAULT_SETTINGS = {
  language: 'en',
  theme: 'midnight',
  keepAwake: true,
  autoFloatOnLeave: true,
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

export function createDefaultMidweekParts(lang = 'en') {
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

export function createDefaultWeekendParts(lang = 'en') {
  const isTl = lang === 'tl';
  return [
    {
      id: generateId('part'),
      title: isTl ? 'Pampublikong Pahayag' : 'Public Talk',
      section: 'weekend',
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
      title: isTl ? 'Pag-aaral sa Bantayan' : 'Watchtower Study',
      section: 'weekend',
      speaker: '',
      assistant: '',
      isTalk: true,
      plannedMinutes: 60,
      actualSeconds: 0,
      completed: false,
      firedAlerts: { oneMin: false, thirtySec: false, zero: false },
    },
  ];
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function sanitizeRoleValue(val) {
  let clean = String(val || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  // Reject bare placeholder fragments that lack an actual person's name
  if (/^(?:unassigned|walang\s+nakatala|name|pangalan|speak|nan|none|n\/a|-+)$/i.test(clean)) {
    return '';
  }

  // Strip leaked placeholder suffix like "Student: Speak", "Assistant 1: Nan", "Speaker: Name"
  const roleMatch = clean.match(/^([^:]{2,32}:)\s*(.*)$/);
  if (roleMatch) {
    const afterColon = roleMatch[2].trim();
    if (!afterColon || /^(?:name|pangalan|speak|nan|unassigned|none|-+)$/i.test(afterColon)) {
      return '';
    }
    clean = `${roleMatch[1]} ${afterColon}`;
  }

  return clean;
}

export function normalizePart(raw, index = 0) {
  const title = String(raw?.title || `Part ${index + 1}`).trim();
  const validSections = ['opening', 'treasures', 'ministry', 'living', 'concluding', 'weekend'];
  const section = validSections.includes(raw?.section)
    ? raw.section
    : inferSectionFromTitle(title);

  let speaker = sanitizeRoleValue(raw?.speaker || '');
  let assistant = sanitizeRoleValue(raw?.assistant || '');

  // Only Ministry parts allow an assistant, and Bible Reading never has an assistant
  if (section !== 'ministry' || /pagbabasa|bible\s*reading/i.test(title)) {
    assistant = '';
  }

  // Exclude CBS Reader and Watchtower Reader while preserving Conductor
  if (/pag-aaral|bible study|cbs|bantayan|watchtower/i.test(title)) {
    speaker = sanitizeRoleValue(
      speaker
        .replace(/\s*(?:\/|&|,|\||;)?\s*(?:cbs|watchtower)?\s*(?:tagabasa|reader)\s*[:\-]?[^|)]*/gi, '')
        .replace(/\s*\((?:tagabasa|reader)[^)]*\)/gi, '')
    );
    assistant = '';
  }

  const isTalk =
    /pagbabasa|bible\s*reading/i.test(title) || section === 'weekend'
      ? true
      : typeof raw?.isTalk === 'boolean'
        ? raw.isTalk
        : section !== 'ministry';

  return {
    id: raw?.id || generateId('part'),
    title,
    section,
    speaker,
    assistant,
    isTalk,
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
  if (low.includes('pampublikong pahayag') || low.includes('public talk') || low.includes('bantayan') || low.includes('watchtower')) {
    return 'weekend';
  }
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

export function createWeekObject(
  { weekLabel, congregationName = 'Kingdom Hall', chairman = '', parts = [], meetingType = 'midweek' },
  lang = 'en'
) {
  const normalizedType = meetingType === 'weekend' ? 'weekend' : 'midweek';
  const defaultParts =
    normalizedType === 'weekend' ? createDefaultWeekendParts(lang) : createDefaultMidweekParts(lang);

  return {
    id: generateId('week'),
    meetingType: normalizedType,
    weekLabel: (weekLabel || '').trim() || (lang === 'tl' ? 'Bagong Iskedyul' : 'New Schedule'),
    congregationName: (congregationName || '').trim() || 'Kingdom Hall',
    chairman: (chairman || '').trim(),
    createdAt: Date.now(),
    parts: (parts.length > 0 ? parts : defaultParts).map((p, idx) => normalizePart(p, idx)),
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
        autoFloatOnLeave:
          typeof parsed.autoFloatOnLeave === 'boolean'
            ? parsed.autoFloatOnLeave
            : DEFAULT_SETTINGS.autoFloatOnLeave,
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
      language: legacyLang === 'tl' ? 'tl' : DEFAULT_SETTINGS.language,
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

export function loadWeeks(lang = 'en') {
  try {
    const raw = localStorage.getItem(WEEKS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((w) => ({
          ...w,
          meetingType: w.meetingType === 'weekend' ? 'weekend' : 'midweek',
          parts: Array.isArray(w.parts)
            ? w.parts.map((p, i) => normalizePart(p, i))
            : w.meetingType === 'weekend'
              ? createDefaultWeekendParts(lang)
              : createDefaultMidweekParts(lang),
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
          meetingType: 'midweek',
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

  return [];
}

export function loadActiveWeekId(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) return null;
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
    } else {
      localStorage.removeItem(ACTIVE_WEEK_KEY);
    }
  } catch (err) {
    console.warn('Failed to save weeks:', err);
  }
}

export function hasSeenTutorial() {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // ignore
  }
}
