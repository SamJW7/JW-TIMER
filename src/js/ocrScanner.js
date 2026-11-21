import { createWorker } from 'tesseract.js';
import { createDefaultMidweekParts, generateId, inferSectionFromTitle, normalizePart } from './storage.js';

const SKIP_SONG_RE = /(?:^|\b)(?:awit(?:\s+blg\.?)?|song(?:\s+no\.?)?)\s*\d*\b/i;
const SKIP_PRAYER_RE = /\b(?:panalangin|opening\s+prayer|closing\s+prayer|prayer)\b/i;
const SKIP_CBS_READER_RE = /\b(?:cbs\s+reader|congregation\s+bible\s+study\s+reader|tagabasa\s+sa\s+pag-aaral|tagabasa(?:\s+ng\s+bantayan)?)\b/i;
const PURE_READER_RE = /^reader\b[:\s-]*/i;

function isSkippedRow(title) {
  const clean = (title || '').trim();
  if (!clean) return false;
  if (SKIP_SONG_RE.test(clean)) return true;
  if (SKIP_PRAYER_RE.test(clean)) return true;
  if (SKIP_CBS_READER_RE.test(clean)) return true;
  if (PURE_READER_RE.test(clean)) return true;
  return false;
}

function detectSectionHeader(text) {
  const up = (text || '').toUpperCase();
  if (up.includes('KAYAMANAN') || up.includes('TREASURES FROM GOD')) return 'treasures';
  if (up.includes('MINISTERYO') || up.includes('FIELD MINISTRY') || up.includes('APPLY YOURSELF')) return 'ministry';
  if (up.includes('PAMUMUHAY') || up.includes('LIVING AS CHRISTIANS')) return 'living';
  return null;
}

function isPureSectionHeader(text) {
  const clean = (text || '').replace(/[^a-zA-Z\s']/g, '').trim().toUpperCase();
  return (
    clean === 'KAYAMANAN MULA SA SALITA NG DIYOS' ||
    clean === "TREASURES FROM GOD'S WORD" ||
    clean === 'TREASURES FROM GODS WORD' ||
    clean === 'MAGING MAHUSAY SA MINISTERYO' ||
    clean === 'APPLY YOURSELF TO THE FIELD MINISTRY' ||
    clean === 'PAMUMUHAY BILANG KRISTIYANO' ||
    clean === 'LIVING AS CHRISTIANS'
  );
}

function cleanPartTitle(rawTitle) {
  return (rawTitle || '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^\(\d{1,2}\s*(?:min\.?|mins?\.?|minuto)\)\s*/i, '')
    .replace(/\(\d{1,2}\s*(?:min\.?|mins?\.?|minuto)\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSpeakerAndAssistant(rawNames, section, title) {
  let clean = (rawNames || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { speaker: '', assistant: '' };

  // Strip CBS Reader if inline with CBS Conductor
  if (section === 'living' && /pag-aaral|bible study|cbs/i.test(title)) {
    clean = clean
      .replace(/\s*(?:\/|&|,|\||;)?\s*(?:cbs\s*)?(?:reader|tagabasa)\s*[:\-]\s*.+$/i, '')
      .replace(/\s*\((?:reader|tagabasa)[^)]*\)/gi, '')
      .trim();
    // If two names separated by / on CBS line, first is Conductor, second is Reader (excluded)
    if (clean.includes('/')) {
      clean = clean.split('/')[0].trim();
    }
    return { speaker: clean, assistant: '' };
  }

  // Explicit (Asst: Name) or (Katulong: Name)
  const explicitMatch = clean.match(/^(.+?)\s*\(?(?:asst|assistant|katulong)\s*[:\-]\s*([^)]+)\)?$/i);
  if (explicitMatch) {
    return {
      speaker: explicitMatch[1].trim(),
      assistant: explicitMatch[2].trim(),
    };
  }

  // Delimiters: "Name 1 / Name 2", "Name 1 & Name 2", "Name 1 | Name 2"
  const delimMatch = clean.match(/^(.+?)\s*(?:\/|&|\|)\s*(.+)$/);
  if (delimMatch && section === 'ministry') {
    return {
      speaker: delimMatch[1].trim(),
      assistant: delimMatch[2].trim(),
    };
  }

  return { speaker: clean, assistant: '' };
}

function extractMetadataFromText(fullText) {
  let weekLabel = '';
  let chairman = '';
  const lines = (fullText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const dateRegex =
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Enero|Pebrero|Marso|Abril|Mayo|Hunyo|Hulyo|Agosto|Setyembre|Oktubre|Nobyembre|Disyembre)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,?\s*\d{4}\b/i;

  for (const line of lines.slice(0, 12)) {
    if (!weekLabel) {
      const m = line.match(dateRegex);
      if (m) weekLabel = m[0].replace(/\s+/g, ' ').trim();
    }
    if (!chairman) {
      const chMatch = line.match(/^(?:chairman|tagapangulo)\s*[:\-]\s*(.+)$/i);
      if (chMatch) chairman = chMatch[1].trim();
    }
  }

  return { weekLabel, chairman };
}

/* =========================================================
   PRIMARY S-140 / KHS 3-COLUMN Y-ROW PARSER
   ========================================================= */
function parseS140ThreeColumn(data) {
  const words = [];
  const blocks = Array.isArray(data?.blocks) ? data.blocks : [];

  for (const block of blocks) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const w of line.words || []) {
          const text = (w.text || '').trim();
          if (!text || !w.bbox) continue;
          words.push({
            text,
            x0: w.bbox.x0,
            y0: w.bbox.y0,
            x1: w.bbox.x1,
            y1: w.bbox.y1,
            xCenter: (w.bbox.x0 + w.bbox.x1) / 2,
            yCenter: (w.bbox.y0 + w.bbox.y1) / 2,
            height: Math.max(8, w.bbox.y1 - w.bbox.y0),
          });
        }
      }
    }
  }

  if (words.length < 6) return null;

  const heights = words.map((w) => w.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 16;
  const yTolerance = Math.max(8, medianH * 0.7);
  const imageWidth = Math.max(...words.map((w) => w.x1), 1);

  // Cluster words into vertical Y-rows
  const sortedWords = [...words].sort((a, b) => a.yCenter - b.yCenter || a.x0 - b.x0);
  const rows = [];

  for (const w of sortedWords) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(w.yCenter - lastRow.avgY) <= yTolerance) {
      lastRow.words.push(w);
      lastRow.avgY =
        lastRow.words.reduce((sum, item) => sum + item.yCenter, 0) / lastRow.words.length;
    } else {
      rows.push({ avgY: w.yCenter, words: [w] });
    }
  }

  // Sort words inside each row left-to-right and locate duration column anchors
  const durationXs = [];
  rows.forEach((row) => {
    row.words.sort((a, b) => a.x0 - b.x0);
    row.fullText = row.words.map((w) => w.text).join(' ');

    for (let i = 0; i < row.words.length; i++) {
      const curr = row.words[i];
      const next = row.words[i + 1];
      const combined = next ? `${curr.text} ${next.text}` : curr.text;

      if (/^\(?\d{1,2}\)?$/.test(curr.text) && next && /^min\.?s?\.?$|^minuto$/i.test(next.text.replace(/[()]/g, ''))) {
        durationXs.push((curr.xCenter + next.xCenter) / 2);
      } else if (/^\(?\d{1,2}\s*min\.?s?\.?\)?$/i.test(curr.text)) {
        durationXs.push(curr.xCenter);
      } else if (/\(\d{1,2}\s*min/i.test(combined)) {
        durationXs.push(curr.xCenter);
      }
    }
  });

  // Require at least 2 aligned duration tokens for 3-column mode
  if (durationXs.length < 2) return null;

  durationXs.sort((a, b) => a - b);
  const medianMidX = durationXs[Math.floor(durationXs.length / 2)];
  const midLeftBound = Math.max(imageWidth * 0.28, medianMidX - imageWidth * 0.1);
  const midRightBound = Math.min(imageWidth * 0.82, medianMidX + imageWidth * 0.11);

  const parsedParts = [];
  let activeSection = 'opening';
  let extractedChairman = '';

  for (const row of rows) {
    const rowText = row.fullText.trim();
    if (!rowText) continue;

    // Detect Chairman in metadata rows
    const chMatch = rowText.match(/(?:chairman|tagapangulo)\s*[:\-]\s*(.+)/i);
    if (chMatch && !extractedChairman) {
      extractedChairman = chMatch[1].trim();
    }

    const secHeader = detectSectionHeader(rowText);
    if (secHeader) {
      activeSection = secHeader;
      if (isPureSectionHeader(rowText)) continue;
    }

    const leftWords = [];
    const midWords = [];
    const rightWords = [];

    for (const w of row.words) {
      if (w.xCenter < midLeftBound) {
        leftWords.push(w.text);
      } else if (w.xCenter <= midRightBound) {
        midWords.push(w.text);
      } else {
        rightWords.push(w.text);
      }
    }

    const leftText = leftWords.join(' ').trim();
    const midText = midWords.join(' ').trim();
    const rightText = rightWords.join(' ').trim();

    // Extract minutes from Middle Column (or inline parenthesized "(X min.)" inside Left Column)
    let minutes = null;
    const midMinMatch = midText.match(/(\d{1,2})\s*(?:min\.?|mins?\.?|minuto)?/i);
    const leftMinMatch = leftText.match(/\((\d{1,2})\s*(?:min\.?|mins?\.?|minuto)\)/i);

    if (midMinMatch && /\d/.test(midText)) {
      minutes = Number(midMinMatch[1]);
    } else if (leftMinMatch) {
      minutes = Number(leftMinMatch[1]);
    }

    // Handle assistant continuation row directly below a Ministry part
    if (!minutes && !leftText && rightText && parsedParts.length > 0) {
      const prev = parsedParts[parsedParts.length - 1];
      if (prev.section === 'ministry' && !prev.assistant && !isSkippedRow(rightText)) {
        const cleanedAsst = rightText.replace(/^(?:asst|assistant|katulong)\s*[:\-]\s*/i, '').trim();
        if (cleanedAsst) {
          prev.assistant = cleanedAsst;
          prev.isTalk = false;
        }
      }
      continue;
    }

    if (!minutes || minutes < 1 || minutes > 60) continue;

    const title = cleanPartTitle(leftText);
    if (!title || isSkippedRow(title)) continue;

    let partSection = activeSection;
    if (/pambungad|opening/i.test(title)) partSection = 'opening';
    else if (/pangwakas|concluding|closing/i.test(title)) partSection = 'concluding';
    else if (activeSection === 'opening') partSection = inferSectionFromTitle(title);

    const { speaker, assistant } = splitSpeakerAndAssistant(rightText, partSection, title);

    parsedParts.push(
      normalizePart({
        id: generateId('part'),
        title,
        section: partSection,
        speaker: speaker || ((partSection === 'opening' || partSection === 'concluding') ? extractedChairman : ''),
        assistant,
        isTalk: partSection !== 'ministry' && !assistant,
        plannedMinutes: minutes,
      })
    );
  }

  return parsedParts.length >= 3 ? { parts: parsedParts, chairman: extractedChairman } : null;
}

/* =========================================================
   PLAN B ADAPTIVE REGEX PARSER
   ========================================================= */
function parsePlanBRegex(fullText) {
  const lines = (fullText || '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const parts = [];
  let activeSection = 'opening';
  let extractedChairman = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const chMatch = line.match(/(?:chairman|tagapangulo)\s*[:\-]\s*(.+)/i);
    if (chMatch && !extractedChairman) {
      extractedChairman = chMatch[1].trim();
      continue;
    }

    const secHeader = detectSectionHeader(line);
    if (secHeader) {
      activeSection = secHeader;
      if (isPureSectionHeader(line)) continue;
    }

    // Match "... (X min.) Speaker Name" or "... X min. Speaker Name"
    const m = line.match(/^(.+?)\s+\(?(\d{1,2})\s*(?:min\.?|mins?\.?|minuto)\)?(?:\s+(.+))?$/i);
    if (!m) continue;

    const title = cleanPartTitle(m[1]);
    const minutes = Number(m[2]);
    let rightNames = (m[3] || '').trim();

    if (!title || isSkippedRow(title) || minutes < 1 || minutes > 60) continue;

    let partSection = activeSection;
    if (/pambungad|opening/i.test(title)) partSection = 'opening';
    else if (/pangwakas|concluding|closing/i.test(title)) partSection = 'concluding';
    else if (activeSection === 'opening') partSection = inferSectionFromTitle(title);

    // Check next line for an assistant name if Ministry part
    let assistantFromNext = '';
    if (partSection === 'ministry' && lines[i + 1]) {
      const nextLine = lines[i + 1];
      if (!/\d{1,2}\s*min/i.test(nextLine) && !detectSectionHeader(nextLine) && !isSkippedRow(nextLine)) {
        const asstMatch = nextLine.match(/^(?:asst|assistant|katulong)\s*[:\-]\s*(.+)$/i);
        if (asstMatch) {
          assistantFromNext = asstMatch[1].trim();
          i++;
        }
      }
    }

    const { speaker, assistant } = splitSpeakerAndAssistant(rightNames, partSection, title);

    parts.push(
      normalizePart({
        id: generateId('part'),
        title,
        section: partSection,
        speaker: speaker || ((partSection === 'opening' || partSection === 'concluding') ? extractedChairman : ''),
        assistant: assistant || assistantFromNext,
        isTalk: partSection !== 'ministry' && !(assistant || assistantFromNext),
        plannedMinutes: minutes,
      })
    );
  }

  return { parts, chairman: extractedChairman };
}

/* =========================================================
   OFFLINE TESSERACT.JS RUNNER
   ========================================================= */
export async function scanScheduleImageOffline(imageFile, onProgress) {
  let worker = null;
  try {
    worker = await createWorker(['eng', 'tgl'], 1, {
      workerPath: './tesseract/worker.min.js',
      corePath: './tesseract',
      langPath: './tessdata',
      workerBlobURL: false,
      gzip: true,
      logger: (msg) => {
        if (typeof onProgress === 'function') {
          onProgress({
            status: msg.status || 'Processing',
            progress: Math.round((msg.progress || 0) * 100),
          });
        }
      },
    });

    const result = await worker.recognize(imageFile, {}, { blocks: true, text: true });
    const data = result?.data || {};
    const fullText = data.text || '';

    const meta = extractMetadataFromText(fullText);

    // Primary S-140 / KHS 3-Column Y-Row Parser
    const primary = parseS140ThreeColumn(data);
    if (primary && primary.parts.length >= 3) {
      return {
        modeUsed: '3-column',
        weekLabel: meta.weekLabel || 'December 4, 2026',
        chairman: primary.chairman || meta.chairman || '',
        parts: primary.parts,
        rawText: fullText,
      };
    }

    // Plan B Adaptive Mode
    const planB = parsePlanBRegex(fullText);
    return {
      modeUsed: 'plan-b',
      weekLabel: meta.weekLabel || 'December 4, 2026',
      chairman: planB.chairman || meta.chairman || '',
      parts: planB.parts,
      rawText: fullText,
    };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // ignore
      }
    }
  }
}

/* =========================================================
   PRESERVED TEXT AUTO-FILL PARSER (FROM ORIGINAL APP)
   ========================================================= */
export function parseMeetingScheduleText(rawText, lang = 'tl') {
  if (!rawText || !rawText.trim()) return null;

  const result = {
    congregation: 'Kingdom Hall',
    date: '',
    chairman: '',
    openingSpeaker: '',
    treasures: { speaker: '', gemsConductor: '', bibleReader: '' },
    ministryParts: [],
    living: { localNeedsSpeaker: '', cbsConductor: '' },
    concludingSpeaker: '',
  };

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let currentSection = 'meta';
  let currentMinistryPart = null;

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper.startsWith('DATE:') || upper.startsWith('PETSA:')) {
      result.date = line.replace(/^(DATE:|PETSA:)/i, '').trim();
      continue;
    }
    if (upper.startsWith('CONGREGATION:') || upper.startsWith('KONGREGASYON:')) {
      result.congregation = line.replace(/^(CONGREGATION:|KONGREGASYON:)/i, '').trim();
      continue;
    }
    if (upper.startsWith('CHAIRMAN:') || upper.startsWith('TAGAPANGULO:')) {
      result.chairman = line.replace(/^(CHAIRMAN:|TAGAPANGULO:)/i, '').trim();
      continue;
    }
    if (/^(PAMBUNGAD NA KOMENTO:|OPENING COMMENTS:|OPENING:|PAMBUNGAD:)/i.test(line)) {
      result.openingSpeaker = line.replace(/^(PAMBUNGAD NA KOMENTO:|OPENING COMMENTS:|OPENING:|PAMBUNGAD:)/i, '').trim();
      continue;
    }
    if (/^(PANGWAKAS NA KOMENTO:|CONCLUDING COMMENTS:|CLOSING COMMENTS:|PANGWAKAS:|CLOSING:)/i.test(line)) {
      result.concludingSpeaker = line
        .replace(/^(PANGWAKAS NA KOMENTO:|CONCLUDING COMMENTS:|CLOSING COMMENTS:|PANGWAKAS:|CLOSING:)/i, '')
        .trim();
      continue;
    }

    if (upper.includes('KAYAMANAN') || upper.includes('TREASURES FROM GOD')) {
      currentSection = 'treasures';
      continue;
    }
    if (upper.includes('MINISTERYO') || upper.includes('FIELD MINISTRY')) {
      currentSection = 'ministry';
      continue;
    }
    if (upper.includes('PAMUMUHAY') || upper.includes('LIVING AS CHRISTIANS') || upper.includes('PAG-AARAL NG KONGREGASYON')) {
      currentSection = 'living';
      continue;
    }

    if (currentSection === 'meta' || currentSection === 'treasures') {
      if (/^(SPEAKER:|TAGAPAGSALITA:|PAHAYAG:)/i.test(line)) {
        result.treasures.speaker = line.replace(/^(SPEAKER:|TAGAPAGSALITA:|PAHAYAG:)/i, '').trim();
      } else if (/^(GEMS CONDUCTOR:|GEMS:|ESPIRITUWAL NA HIYAS:)/i.test(line)) {
        result.treasures.gemsConductor = line.replace(/^(GEMS CONDUCTOR:|GEMS:|ESPIRITUWAL NA HIYAS:)/i, '').trim();
      } else if (/^(BIBLE READER:|READER:|PAGBABASA SA BIBLIYA:)/i.test(line)) {
        result.treasures.bibleReader = line.replace(/^(BIBLE READER:|READER:|PAGBABASA SA BIBLIYA:)/i, '').trim();
      }
    } else if (currentSection === 'ministry') {
      if (/^(PART|BAHAGI|ITEM)/i.test(line)) {
        const titleMatch = line.replace(/^(PART\s*\d*:?|BAHAGI\s*\d*:?|ITEM\s*\d*:?)/i, '').trim();
        currentMinistryPart = {
          title: titleMatch || line,
          student: '',
          assistant: '',
          isTalk: false,
        };
        result.ministryParts.push(currentMinistryPart);
      } else if (/^(STUDENT:|ESTUDYANTE:)/i.test(line)) {
        const studentName = line.replace(/^(STUDENT:|ESTUDYANTE:)/i, '').trim();
        if (!currentMinistryPart) {
          currentMinistryPart = { title: 'Ministry Part', student: studentName, assistant: '', isTalk: false };
          result.ministryParts.push(currentMinistryPart);
        } else {
          currentMinistryPart.student = studentName;
        }
      } else if (/^(ASSISTANT:|KATULONG:)/i.test(line)) {
        if (currentMinistryPart) {
          currentMinistryPart.assistant = line.replace(/^(ASSISTANT:|KATULONG:)/i, '').trim();
        }
      } else if (/^(SPEAKER:|TAGAPAGSALITA:)/i.test(line)) {
        if (currentMinistryPart) {
          currentMinistryPart.student = line.replace(/^(SPEAKER:|TAGAPAGSALITA:)/i, '').trim();
          currentMinistryPart.isTalk = true;
        }
      }
    } else if (currentSection === 'living') {
      if (/^(LOKAL NA PANGANGAILANGAN:|LOCAL NEEDS:)/i.test(line)) {
        result.living.localNeedsSpeaker = line.replace(/^(LOKAL NA PANGANGAILANGAN:|LOCAL NEEDS:)/i, '').trim();
      } else if (/^(BIBLE STUDY:|PAG-AARAL SA BIBLIYA:|CBS CONDUCTOR:|CONDUCTOR:|KONDYAKTOR:)/i.test(line)) {
        result.living.cbsConductor = line
          .replace(/^(BIBLE STUDY:|PAG-AARAL SA BIBLIYA:|CBS CONDUCTOR:|CONDUCTOR:|KONDYAKTOR:)/i, '')
          .trim();
      }
      // Explicitly ignore CBS Reader / Tagabasa sa Pag-aaral per filtering rules
    }
  }

  const baseParts = createDefaultMidweekParts(lang);
  const chair = result.chairman;
  const openSpk = result.openingSpeaker || chair;
  const closeSpk = result.concludingSpeaker || chair;

  const beforeMinistry = baseParts.filter((p) => p.section === 'opening' || p.section === 'treasures');
  const afterMinistry = baseParts.filter((p) => p.section === 'living' || p.section === 'concluding');

  beforeMinistry.forEach((p) => {
    const low = p.title.toLowerCase();
    if (p.section === 'opening') p.speaker = openSpk;
    else if (low.includes('hiyas') || low.includes('gems')) p.speaker = result.treasures.gemsConductor;
    else if (low.includes('pagbabasa') || low.includes('reading')) p.speaker = result.treasures.bibleReader;
    else p.speaker = result.treasures.speaker;
  });

  const ministryList =
    result.ministryParts.length > 0
      ? result.ministryParts.map((mp, idx) =>
          normalizePart({
            id: generateId('part'),
            title: mp.title,
            section: 'ministry',
            speaker: mp.student,
            assistant: mp.assistant,
            isTalk: mp.isTalk,
            plannedMinutes: idx === 0 ? 3 : idx === 1 ? 4 : 5,
          })
        )
      : baseParts.filter((p) => p.section === 'ministry');

  afterMinistry.forEach((p) => {
    const low = p.title.toLowerCase();
    if (p.section === 'concluding') p.speaker = closeSpk;
    else if (low.includes('lokal') || low.includes('local')) p.speaker = result.living.localNeedsSpeaker;
    else if (low.includes('pag-aaral') || low.includes('bible study')) p.speaker = result.living.cbsConductor;
  });

  return {
    weekLabel: result.date || 'December 4, 2026',
    congregationName: result.congregation || 'Kingdom Hall',
    chairman: chair,
    parts: [...beforeMinistry, ...ministryList, ...afterMinistry],
  };
}
