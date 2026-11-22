import { isNativeAndroid, NativeAppBridge } from './bridges.js';
import {
  createDefaultMidweekParts,
  generateId,
  inferSectionFromTitle,
  normalizePart,
  sanitizeRoleValue,
} from './storage.js';

const SKIP_SONG_RE = /(?:^|\b)(?:awit(?:\s+blg\.?)?|song(?:\s+no\.?)?)\s*\d*\b/i;
const SKIP_PRAYER_RE = /\b(?:panalangin|opening\s+prayer|closing\s+prayer|prayer)\b/i;
const PRAYER_ROLE_RE = /\b(?:(?:opening|closing)\s+prayer|(?:(?:pambungad|pangwakas)\s+na\s+)?panalangin|prayer)\s*[:\-]\s*/gi;
const PRAYER_NO_COLON_RE = /\b(?:(?:opening|closing)\s+prayer|(?:pambungad|pangwakas)\s+na\s+panalangin|panalangin)\b/gi;
const READER_DROP_RE = /\b(?:CBS\s*Reader|Watchtower\s*Reader|Tagabasa(?:\s+sa\s+Pag-aaral|\s+ng\s+Bantayan)?|Reader)\s*[:\-]\s*/gi;
const META_DROP_RE = /\b(?:Date|Petsa|Congregation|Kongregasyon|Time|Oras)\s*[:\-]\s*/gi;
const SKIP_READER_RE = /\b(?:cbs\s+reader|watchtower\s+reader|congregation\s+bible\s+study\s+reader|tagabasa(?:\s+sa\s+pag-aaral|\s+ng\s+bantayan)?)\b/i;
const PURE_READER_RE = /^reader\s*[:\-]/i;

const OPENING_COMMENT_RE = /pambungad\s+(?:na\s+(?:mga\s+)?)?komento|opening\s+comments?/i;
const CONCLUDING_COMMENT_RE = /pangwakas\s+(?:na\s+(?:mga\s+)?)?komento|concluding\s+comments?|closing\s+comments?/i;

const ROLE_ENTRY_RE =
  /(Chairman|Tagapangulo|LN\s*Speaker|CBS\s*Conductor|Gems\s*Conductor|Student\s*Speaker|Speaker(?:\s*\d+)?|Tagapagsalita(?:\s*\d+)?|Bible\s*Reader|Tagabasa\s*sa\s*Bibliya|Student(?:\s*\d+)?|Estudyante(?:\s*\d+)?|Assistant(?:\s*\d+)?|Katulong(?:\s*\d+)?|Conductor|Kondyaktor)\s*[:\-]\s*/gi;

const SUBLINE_DESCRIPTION_RE =
  /^(?:tema|theme|kabanata|chap\.?|chapter|aralin|lesson|bahay-bahay|impormal|di-pormal|pagdalaw-muli|paggawa\s+ng\s+mga\s+alagad|\(?(?:lmd|th|bt|lff|scl|w\d+|mwb)\b|\d+\s+min\s+or\s+less)/i;
const SCRIPTURE_REF_ONLY_RE = /^[1-3]?\s*[A-Za-zÀ-ÿ]+\s+\d{1,3}\s*:\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?\.?$/i;

/* =========================================================
   OFFSCREEN HTML5 CANVAS IMAGE NORMALIZATION (100% OFFLINE)
   Android WebView Safe Decoder + Crisp Base64 Bridge Payload
   ========================================================= */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result) {
        resolve(reader.result);
      } else {
        reject(new Error('IMAGE_DECODE_ERROR'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('IMAGE_DECODE_ERROR'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src, cleanupFn) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        drawable: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: cleanupFn,
      });
    };
    img.onerror = () => {
      cleanupFn?.();
      reject(new Error('IMAGE_DECODE_ERROR'));
    };
    img.src = src;
  });
}

async function loadDrawableImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Fallback to object URL below
    }
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    return await loadImageElement(objectUrl, () => URL.revokeObjectURL(objectUrl));
  } catch {
    // Final fallback for Android WebView content URIs: FileReader Data URL
    const dataUrl = await readFileAsDataUrl(file);
    return await loadImageElement(dataUrl, () => {});
  }
}

async function preprocessImageToBase64(imageFile) {
  let drawableBundle = null;
  try {
    drawableBundle = await loadDrawableImage(imageFile);
  } catch {
    // If bitmap/image loading fails, fall back cleanly to raw Data URL
    return await readFileAsDataUrl(imageFile);
  }

  const { drawable, width, height, cleanup } = drawableBundle;
  try {
    // Keep crisp text resolution for ML Kit while capping size to protect Capacitor JSON bridge memory
    const maxDim = 2600;
    const minLongEdge = 1600;
    const longest = Math.max(width || 1, height || 1);
    let scale = 1;
    if (longest < minLongEdge) {
      scale = Math.min(2, minLongEdge / longest);
    } else if (longest > maxDim) {
      scale = maxDim / longest;
    }

    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return await readFileAsDataUrl(imageFile);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(drawable, 0, 0, targetW, targetH);

    return canvas.toDataURL('image/jpeg', 0.94);
  } finally {
    cleanup?.();
  }
}

/* =========================================================
   ROW & COMMENT / BANNER DETECTION HELPERS
   ========================================================= */
function extractCommentFromMixedRow(text) {
  const raw = (text || '').trim();
  if (!raw) return null;

  if (OPENING_COMMENT_RE.test(raw)) {
    const isEn = /opening\s+comments?/i.test(raw) && !/pambungad/i.test(raw);
    return {
      title: isEn ? 'Opening Comments' : 'Pambungad na Komento',
      section: 'opening',
    };
  }

  if (CONCLUDING_COMMENT_RE.test(raw)) {
    const isEn = /concluding\s+comments?|closing\s+comments?/i.test(raw) && !/pangwakas/i.test(raw);
    return {
      title: isEn ? 'Concluding Comments' : 'Pangwakas na Komento',
      section: 'concluding',
    };
  }

  return null;
}

function isSkippedRow(title) {
  const clean = (title || '').trim();
  if (!clean) return false;
  // Never skip if the row also carries Opening/Concluding Comments alongside Song & Prayer
  if (extractCommentFromMixedRow(clean)) return false;
  if (SKIP_SONG_RE.test(clean)) return true;
  if (SKIP_PRAYER_RE.test(clean)) return true;
  if (SKIP_READER_RE.test(clean)) return true;
  if (PURE_READER_RE.test(clean)) return true;
  return false;
}

function isBibleReading(title) {
  return /pagbabasa|bible\s*reading/i.test(title || '');
}

function isDescriptionSubLine(text) {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return false;
  if (new RegExp(ROLE_ENTRY_RE.source, 'i').test(clean)) return false;
  if (SUBLINE_DESCRIPTION_RE.test(clean)) return true;
  if (SCRIPTURE_REF_ONLY_RE.test(clean)) return true;
  return false;
}

function detectSectionHeader(text) {
  const up = (text || '').toUpperCase().replace(/[^A-Z0-9'\s]/g, ' ');
  if (
    up.includes('KAYAMANAN') ||
    up.includes('SALITA NG DIYOS') ||
    up.includes('TREASURES FROM GOD')
  ) {
    return 'treasures';
  }
  if (
    up.includes('MAHUSAY SA MINISTERYO') ||
    up.includes('MINISTERYO SA LARANGAN') ||
    up.includes('FIELD MINISTRY') ||
    up.includes('APPLY YOURSELF')
  ) {
    return 'ministry';
  }
  if (
    up.includes('PAMUMUHAY BILANG KRISTIYANO') ||
    up.includes('PAMUMUHAY') ||
    up.includes('LIVING AS CHRISTIANS')
  ) {
    return 'living';
  }
  return null;
}

function isPureSectionHeader(text) {
  const clean = (text || '').replace(/[^a-zA-Z\s']/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  return (
    clean === 'KAYAMANAN MULA SA SALITA NG DIYOS' ||
    clean === "TREASURES FROM GOD'S WORD" ||
    clean === 'TREASURES FROM GODS WORD' ||
    clean === 'MAGING MAHUSAY SA MINISTERYO' ||
    clean === 'MAGING MAHUSAY SA MINISTERYO SA LARANGAN' ||
    clean === 'APPLY YOURSELF TO THE FIELD MINISTRY' ||
    clean === 'PAMUMUHAY BILANG KRISTIYANO' ||
    clean === 'LIVING AS CHRISTIANS'
  );
}

function cleanPartTitle(rawTitle) {
  return (rawTitle || '')
    .replace(/^\d{1,2}\s*[.):\-]\s*/, '')
    .replace(/^\d{1,2}\s+(?=[A-Za-zÀ-ÿ])/, '')
    .replace(/^\(\d{1,2}\s*(?:min\.?|mins?\.?|minuto|mln\.?|rnin\.?)\)\s*/i, '')
    .replace(/\(?\d{1,2}\s*(?:min\.?|mins?\.?|minuto|mln\.?|rnin\.?)\)?/gi, '')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRoleLabel(label) {
  const low = label.trim().toLowerCase().replace(/\s+/g, ' ');
  if (low.startsWith('chairman') || low.startsWith('tagapangulo')) return 'Chairman';
  if (low.startsWith('ln')) return 'LN Speaker';
  if (low.startsWith('cbs')) return 'CBS Conductor';
  if (low.startsWith('gems')) return 'Gems Conductor';
  if (low.startsWith('student speaker')) return 'Student Speaker';
  if (low.startsWith('bible') || low.includes('bibliya')) return 'Bible Reader';
  if (low.startsWith('conductor') || low.startsWith('kondyaktor')) return 'Conductor';
  if (low.startsWith('speaker') || low.startsWith('tagapagsalita')) {
    const num = low.match(/\d+/);
    return num ? `Speaker ${num[0]}` : 'Speaker';
  }
  if (low.startsWith('student') || low.startsWith('estudyante')) {
    const num = low.match(/\d+/);
    return num ? `Student ${num[0]}` : 'Student';
  }
  if (low.startsWith('assistant') || low.startsWith('katulong')) {
    const num = low.match(/\d+/);
    return num ? `Assistant ${num[0]}` : 'Assistant';
  }
  return 'Speaker';
}

/* =========================================================
   OCR PERSON NAME SANITIZER & AUTO-CAPITALIZER
   ========================================================= */
function formatPersonToken(token, forceTitleCase) {
  if (!token) return '';

  // Canonicalize Jr. / Sr.
  if (/^jr\.?$/i.test(token)) return 'Jr.';
  if (/^sr\.?$/i.test(token)) return 'Sr.';

  // Canonicalize common Roman numeral suffixes (II, III, IV)
  if (/^(?:ii|iii|iv)$/i.test(token)) {
    return token.toUpperCase();
  }

  // Preserve dotted single-letter initials (e.g., A., J.) as uppercase
  if (/^[A-Za-zÀ-ÿ]\.$/.test(token)) {
    return token.toUpperCase();
  }

  const lettersOnly = token.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const isTokenAllCaps =
    lettersOnly.length >= 2 && lettersOnly === lettersOnly.toUpperCase();

  if (!forceTitleCase && !isTokenAllCaps) {
    return token;
  }

  // Title-case sub-parts split by hyphens or apostrophes (e.g., DELA-CRUZ -> Dela-Cruz, O'CONNOR -> O'Connor)
  return token
    .split(/([-'])/)
    .map((segment) => {
      if (segment === '-' || segment === "'") return segment;
      if (!segment) return '';
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join('');
}

export function cleanPersonName(rawName) {
  let clean = String(rawName || '')
    // Strip box-drawing, table border, and common OCR symbol noise
    .replace(/[|¦[\]{}_~•*=<>°¬\u2500-\u259F]+/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '';

  // Trim stray leading/trailing colons, dashes, slashes, quotes, commas, semicolons, and excess punctuation
  clean = clean
    .replace(/^[\s:;\-–—/\\"'“”‘’`.,!?·]+/, '')
    .replace(/[\s:;\-–—/\\"'“”‘’`,!?·]+$/, '')
    // Collapse multiple trailing dots (e.g., "Cruz.." -> "Cruz.")
    .replace(/\.{2,}$/, '.')
    .trim();

  if (!clean) return '';

  const tokens = clean.split(' ').filter(Boolean);

  // Remove stray leading single-character OCR artifacts (without period, e.g., "x Juan Cruz", "1 Pedro")
  while (tokens.length > 1 && /^[A-Za-z0-9]$/.test(tokens[0])) {
    tokens.shift();
  }

  // Remove stray trailing single-character OCR artifacts (preserving dotted initials like "A." and suffixes like "II", "III", "IV", "Jr.", "Sr.")
  while (tokens.length > 1 && /^[A-Za-z0-9]$/.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  // Also strip isolated punctuation-only tokens at boundaries
  while (tokens.length > 0 && /^[^A-Za-zÀ-ÿ0-9]+$/.test(tokens[0])) {
    tokens.shift();
  }
  while (tokens.length > 0 && /^[^A-Za-zÀ-ÿ0-9]+$/.test(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  clean = tokens.join(' ').trim();
  if (!clean) return '';

  // If the entire extracted name (excluding suffixes/initials) is ALL-CAPS, normalize to Title Case
  const allLetters = clean.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const forceTitleCase =
    allLetters.length >= 2 && allLetters === allLetters.toUpperCase();

  const normalized = clean
    .split(' ')
    .map((tok) => formatPersonToken(tok, forceTitleCase))
    .filter(Boolean)
    .join(' ')
    .trim();

  // Strip stray trailing period unless it belongs to Jr., Sr., or a single-letter initial (e.g., "A.")
  if (
    normalized.endsWith('.') &&
    !/(?:^|\s)(?:Jr|Sr|[A-Za-zÀ-ÿ])\.$/i.test(normalized)
  ) {
    return normalized.replace(/\.+$/, '').trim();
  }

  return normalized;
}

function collectRoleAndDropMarkers(cleanText) {
  const markers = [];
  let match;

  const roleRe = new RegExp(ROLE_ENTRY_RE.source, 'gi');
  while ((match = roleRe.exec(cleanText)) !== null) {
    markers.push({
      role: normalizeRoleLabel(match[1]),
      startIndex: match.index,
      valueStart: match.index + match[0].length,
      drop: false,
    });
  }

  // Detect Prayer / Opening Prayer / Closing Prayer / Panalangin inline so they are strictly ignored & stripped
  const prayerRe = new RegExp(PRAYER_ROLE_RE.source, 'gi');
  while ((match = prayerRe.exec(cleanText)) !== null) {
    markers.push({
      role: '__DROP_PRAYER__',
      startIndex: match.index,
      valueStart: match.index + match[0].length,
      drop: true,
    });
  }

  // Fallback for prayer labels where OCR omitted the colon (e.g., "Opening Prayer Juan Cruz", "Panalangin Juan Cruz")
  const prayerNoColonRe = new RegExp(PRAYER_NO_COLON_RE.source, 'gi');
  while ((match = prayerNoColonRe.exec(cleanText)) !== null) {
    const overlapsExisting = markers.some(
      (m) => match.index >= m.startIndex && match.index < m.valueStart
    );
    if (!overlapsExisting) {
      markers.push({
        role: '__DROP_PRAYER__',
        startIndex: match.index,
        valueStart: match.index + match[0].length,
        drop: true,
      });
    }
  }

  // Detect CBS Reader / Watchtower Reader / Tagabasa / bare Reader inline so we can drop it cleanly
  const readerRe = new RegExp(READER_DROP_RE.source, 'gi');
  while ((match = readerRe.exec(cleanText)) !== null) {
    const prefixCheck = cleanText.slice(Math.max(0, match.index - 7), match.index).toLowerCase();
    if (prefixCheck.includes('bible')) continue;
    markers.push({
      role: '__DROP_READER__',
      startIndex: match.index,
      valueStart: match.index + match[0].length,
      drop: true,
    });
  }

  // Detect metadata labels (Date:, Congregation:, etc.) inline so they do not bleed into Chairman
  const metaRe = new RegExp(META_DROP_RE.source, 'gi');
  while ((match = metaRe.exec(cleanText)) !== null) {
    markers.push({
      role: '__DROP_META__',
      startIndex: match.index,
      valueStart: match.index + match[0].length,
      drop: true,
    });
  }

  markers.sort((a, b) => a.startIndex - b.startIndex || b.valueStart - a.valueStart);

  // Deduplicate overlapping markers cleanly
  const deduped = [];
  for (const m of markers) {
    const prev = deduped[deduped.length - 1];
    if (prev && m.startIndex < prev.valueStart) continue;
    deduped.push(m);
  }
  return deduped;
}

function stripIgnoredRoleClauses(rawText) {
  const clean = (rawText || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const markers = collectRoleAndDropMarkers(clean);
  if (markers.length === 0) return clean;

  let cursor = 0;
  let kept = '';
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const next = markers[i + 1];
    const end = next ? next.startIndex : clean.length;
    if (cur.startIndex > cursor) {
      kept += clean.slice(cursor, cur.startIndex);
    }
    if (!cur.drop) {
      kept += clean.slice(cur.startIndex, end);
    }
    cursor = end;
  }
  if (cursor < clean.length) {
    kept += clean.slice(cursor);
  }

  return kept
    .replace(/\s*[|/;]+\s*(?=[|/;]|$)/g, ' ')
    .replace(/^[\s|/;,&-]+|[\s|/;,&-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRoleSegments(rawText) {
  const clean = (rawText || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const allMarkers = collectRoleAndDropMarkers(clean);
  if (allMarkers.length === 0) return [];

  const segments = [];
  for (let i = 0; i < allMarkers.length; i++) {
    const cur = allMarkers[i];
    const next = allMarkers[i + 1];
    const end = next ? next.startIndex : clean.length;
    if (cur.drop) continue;
    const rawVal = clean
      .slice(cur.valueStart, end)
      .replace(/^[\s/|&-]+|[\s/|&-]+$/g, '')
      .trim();
    const val = cleanPersonName(rawVal);
    if (val) {
      const sanitized = sanitizeRoleValue(`${cur.role}: ${val}`);
      if (sanitized) {
        segments.push({ role: cur.role, full: sanitized, value: val });
      }
    }
  }
  return segments;
}

function extractChairmanFromText(rawText) {
  const stripped = stripIgnoredRoleClauses(rawText);
  if (!stripped) return '';

  const segments = extractRoleSegments(stripped);
  const chairSeg = segments.find((seg) => seg.role === 'Chairman');
  if (chairSeg?.full) {
    return sanitizeRoleValue(chairSeg.full);
  }

  const chMatch = stripped.match(/(?:chairman|tagapangulo)\s*[:\-]\s*(.+)$/i);
  if (chMatch) {
    const beforePipe = chMatch[1].split(/\s*[|•]\s*/)[0];
    const cleanedName = cleanPersonName(beforePipe);
    return sanitizeRoleValue(cleanedName ? `Chairman: ${cleanedName}` : '');
  }
  return '';
}

function parseRoleNames(rawNames, section, title) {
  let clean = stripIgnoredRoleClauses(rawNames);
  if (!clean || isDescriptionSubLine(clean)) return { speaker: '', assistant: '' };

  const bibleReading = isBibleReading(title);
  const isCbs = section === 'living' && /pag-aaral|bible study|cbs/i.test(title);

  // Strip CBS Reader inline clauses
  if (isCbs) {
    clean = clean
      .replace(/\s*(?:\/|&|,|\||;)?\s*(?:cbs\s*)?(?:reader|tagabasa)\s*[:\-].*$/i, '')
      .replace(/\s*\((?:reader|tagabasa)[^)]*\)/gi, '')
      .trim();
  }

  // Check explicit role-prefixed segments first
  const segments = extractRoleSegments(clean);
  if (segments.length > 0) {
    let speaker = '';
    let assistant = '';

    for (const seg of segments) {
      if (seg.role.startsWith('Assistant')) {
        if (!bibleReading && !isCbs && section === 'ministry' && !assistant) {
          assistant = seg.full;
        }
      } else if (!speaker) {
        speaker = seg.full;
      }
    }

    return {
      speaker: sanitizeRoleValue(speaker),
      assistant: bibleReading || isCbs || section !== 'ministry' ? '' : sanitizeRoleValue(assistant),
    };
  }

  // Fallback when no explicit role labels appeared in right column
  if (isCbs) {
    const primary = cleanPersonName(clean.includes('/') ? clean.split('/')[0] : clean);
    return { speaker: sanitizeRoleValue(primary ? `CBS Conductor: ${primary}` : ''), assistant: '' };
  }

  if (bibleReading) {
    const readerOnly = cleanPersonName(clean.includes('/') ? clean.split('/')[0] : clean);
    return { speaker: sanitizeRoleValue(readerOnly ? `Bible Reader: ${readerOnly}` : ''), assistant: '' };
  }

  if (section === 'opening' || section === 'concluding') {
    if (SKIP_SONG_RE.test(clean) || SKIP_PRAYER_RE.test(clean)) {
      return { speaker: '', assistant: '' };
    }
    const chairName = cleanPersonName(clean);
    return { speaker: sanitizeRoleValue(chairName ? `Chairman: ${chairName}` : ''), assistant: '' };
  }

  if (section === 'ministry') {
    const delim = clean.match(/^(.+?)\s*(?:\/|&|\|)\s*(.+)$/);
    if (delim) {
      const studentName = cleanPersonName(delim[1]);
      const assistantName = cleanPersonName(delim[2]);
      return {
        speaker: sanitizeRoleValue(studentName ? `Student: ${studentName}` : ''),
        assistant: sanitizeRoleValue(assistantName ? `Assistant: ${assistantName}` : ''),
      };
    }
    const studentName = cleanPersonName(clean);
    return { speaker: sanitizeRoleValue(studentName ? `Student: ${studentName}` : ''), assistant: '' };
  }

  const speakerName = cleanPersonName(clean);
  return { speaker: sanitizeRoleValue(speakerName ? `Speaker: ${speakerName}` : ''), assistant: '' };
}

function mergeStackedRightText(existingSpeaker, existingAssistant, extraRightText, section, title) {
  if (!extraRightText || isDescriptionSubLine(extraRightText)) {
    return { speaker: existingSpeaker, assistant: existingAssistant };
  }

  const parsed = parseRoleNames(extraRightText, section, title);
  const bibleReading = isBibleReading(title);
  const isCbs = section === 'living' && /pag-aaral|bible study|cbs/i.test(title);

  let speaker = existingSpeaker;
  let assistant = bibleReading || isCbs || section !== 'ministry' ? '' : existingAssistant;

  if (parsed.speaker && !speaker) {
    speaker = parsed.speaker;
  } else if (
    parsed.speaker &&
    speaker &&
    !assistant &&
    !bibleReading &&
    !isCbs &&
    section === 'ministry' &&
    !/student\s*speaker/i.test(speaker)
  ) {
    // Second stacked line under a Ministry part without "Assistant:" keyword can be the assistant
    const cleanVal = cleanPersonName(
      parsed.speaker.replace(/^(?:Student(?:\s*\d+)?|Speaker(?:\s*\d+)?)\s*:\s*/i, '')
    );
    if (cleanVal) {
      assistant = sanitizeRoleValue(`Assistant: ${cleanVal}`);
    }
  }

  if (parsed.assistant && !assistant && !bibleReading && !isCbs && section === 'ministry') {
    assistant = parsed.assistant;
  }

  return {
    speaker: sanitizeRoleValue(speaker),
    assistant: section === 'ministry' && !bibleReading ? sanitizeRoleValue(assistant) : '',
  };
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

  for (const line of lines.slice(0, 16)) {
    if (!weekLabel) {
      const m = line.match(dateRegex);
      if (m) weekLabel = m[0].replace(/\s+/g, ' ').trim();
    }
    if (!chairman) {
      const foundChair = extractChairmanFromText(line);
      if (foundChair) chairman = foundChair;
    }
  }

  return { weekLabel, chairman };
}

function extractMinutesFromText(text) {
  if (!text) return null;
  const m = text.match(/\(?\s*(\d{1,2})\s*(?:min\.?|mins?\.?|minuto|mln\.?|rnin\.?)\s*\)?/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 60) return n;
  }
  return null;
}

/* =========================================================
   PRIMARY S-140 / KHS 3-COLUMN Y-ROW PARSER
   Consumes Native ML Kit Text Blocks + Bounding Boxes
   ========================================================= */
function parseS140ThreeColumn(data, defaultChairman = '') {
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
  const yTolerance = Math.max(8, medianH * 0.72);
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

  // Locate Middle Column (X min.) — handles italicized (4 min.) and split tokens
  const durationXs = [];
  rows.forEach((row) => {
    row.words.sort((a, b) => a.x0 - b.x0);
    row.fullText = row.words.map((w) => w.text).join(' ');

    for (let i = 0; i < row.words.length; i++) {
      const curr = row.words[i];
      const next = row.words[i + 1];
      const combined = next ? `${curr.text} ${next.text}` : curr.text;

      if (
        /^\(?\d{1,2}\)?$/.test(curr.text) &&
        next &&
        /^(?:min|mins|minuto|mln|rnin)\.?\)?$/i.test(next.text.replace(/[()]/g, ''))
      ) {
        durationXs.push((curr.xCenter + next.xCenter) / 2);
      } else if (/^\(?\d{1,2}\s*(?:min|mins|minuto|mln|rnin)\.?\)?$/i.test(curr.text)) {
        durationXs.push(curr.xCenter);
      } else if (/\(?\d{1,2}\s*(?:min|mins|minuto|mln|rnin)/i.test(combined)) {
        durationXs.push(curr.xCenter);
      }
    }
  });

  if (durationXs.length < 2) return null;

  durationXs.sort((a, b) => a - b);
  const medianMidX = durationXs[Math.floor(durationXs.length / 2)];
  const midLeftBound = Math.max(imageWidth * 0.28, medianMidX - imageWidth * 0.12);
  const midRightBound = Math.min(imageWidth * 0.82, medianMidX + imageWidth * 0.12);

  const parsedParts = [];
  const explicitChairPartIds = new Set();
  let bannerSection = null;
  let extractedChairman = '';
  let lastPartSkipped = false;
  let lastSkippedMinutes = null;

  for (const row of rows) {
    const rowText = row.fullText.trim();
    if (!rowText) continue;

    const foundRowChair = extractChairmanFromText(rowText);
    if (foundRowChair && !extractedChairman) {
      extractedChairman = foundRowChair;
    }

    const secHeader = detectSectionHeader(rowText);
    if (secHeader) {
      bannerSection = secHeader;
      lastPartSkipped = false;
      lastSkippedMinutes = null;
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

    let minutes = null;
    const midDigitMatch = midText.match(/(\d{1,2})\s*(?:min|mins|minuto|mln|rnin)?/i);
    if (midDigitMatch && /\d/.test(midText)) {
      minutes = Number(midDigitMatch[1]);
    } else {
      minutes = extractMinutesFromText(leftText) || extractMinutesFromText(`${leftText} ${midText}`);
    }

    // Handle rows without minutes (split Opening/Concluding Comments line OR stacked role lines)
    if (!minutes || minutes < 1 || minutes > 60) {
      const splitCommentMeta =
        extractCommentFromMixedRow(leftText) || extractCommentFromMixedRow(rowText);
      if (
        splitCommentMeta &&
        !parsedParts.some((p) => p.section === splitCommentMeta.section)
      ) {
        lastPartSkipped = false;
        const explicitChair =
          extractChairmanFromText(rightText) || extractChairmanFromText(rowText);
        if (explicitChair && !extractedChairman) extractedChairman = explicitChair;
        const { speaker } = parseRoleNames(
          rightText,
          splitCommentMeta.section,
          splitCommentMeta.title
        );
        const part = normalizePart({
          id: generateId('part'),
          title: splitCommentMeta.title,
          section: splitCommentMeta.section,
          speaker: explicitChair || speaker || extractedChairman,
          assistant: '',
          isTalk: true,
          plannedMinutes:
            lastSkippedMinutes || (splitCommentMeta.section === 'opening' ? 1 : 3),
        });
        if (explicitChair) explicitChairPartIds.add(part.id);
        parsedParts.push(part);
        lastSkippedMinutes = null;
        continue;
      }

      if (lastPartSkipped) continue;

      const rawCandidate =
        rightText || (new RegExp(ROLE_ENTRY_RE.source, 'i').test(rowText) ? rowText : '');
      const candidateNameText = stripIgnoredRoleClauses(rawCandidate);

      if (
        candidateNameText &&
        parsedParts.length > 0 &&
        !isSkippedRow(candidateNameText) &&
        !isDescriptionSubLine(candidateNameText)
      ) {
        const prev = parsedParts[parsedParts.length - 1];
        if (prev.section === 'opening' || prev.section === 'concluding') {
          const explicitChair = extractChairmanFromText(candidateNameText);
          if (explicitChair) {
            prev.speaker = explicitChair;
            explicitChairPartIds.add(prev.id);
            if (!extractedChairman) extractedChairman = explicitChair;
          }
          continue;
        }
        const merged = mergeStackedRightText(
          prev.speaker,
          prev.assistant,
          candidateNameText,
          prev.section,
          prev.title
        );
        prev.speaker = merged.speaker;
        prev.assistant = merged.assistant;
        prev.isTalk = isBibleReading(prev.title) ? true : prev.section !== 'ministry' && !prev.assistant;
      }
      continue;
    }

    // Check if row contains Opening/Concluding Comments mixed with Song & Prayer
    const commentMeta =
      extractCommentFromMixedRow(leftText) ||
      extractCommentFromMixedRow(`${leftText} ${midText}`) ||
      extractCommentFromMixedRow(rowText);

    if (commentMeta) {
      lastPartSkipped = false;
      lastSkippedMinutes = null;
      const explicitChair =
        extractChairmanFromText(rightText) || extractChairmanFromText(rowText);
      if (explicitChair && !extractedChairman) extractedChairman = explicitChair;
      const { speaker } = parseRoleNames(rightText, commentMeta.section, commentMeta.title);
      const part = normalizePart({
        id: generateId('part'),
        title: commentMeta.title,
        section: commentMeta.section,
        speaker: explicitChair || speaker || extractedChairman,
        assistant: '',
        isTalk: true,
        plannedMinutes: minutes,
      });
      if (explicitChair) explicitChairPartIds.add(part.id);
      parsedParts.push(part);
      continue;
    }

    const title = cleanPartTitle(leftText);
    if (!title || title.length < 2 || isSkippedRow(title)) {
      lastPartSkipped = true;
      lastSkippedMinutes = minutes;
      continue;
    }

    lastPartSkipped = false;
    lastSkippedMinutes = null;

    // Strictly respect detected section banner (never override banner with keyword guessing)
    const partSection = bannerSection || inferSectionFromTitle(title);

    const { speaker, assistant } = parseRoleNames(rightText, partSection, title);

    parsedParts.push(
      normalizePart({
        id: generateId('part'),
        title,
        section: partSection,
        speaker,
        assistant,
        isTalk: isBibleReading(title) ? true : partSection !== 'ministry' && !assistant,
        plannedMinutes: minutes,
      })
    );
  }

  // Always assign Chairman: [Chairman Name] to Opening/Concluding Comments (using header or row Chairman)
  const resolvedChairman = extractedChairman || sanitizeRoleValue(defaultChairman);
  if (resolvedChairman) {
    parsedParts.forEach((p) => {
      if ((p.section === 'opening' || p.section === 'concluding') && !explicitChairPartIds.has(p.id)) {
        p.speaker = resolvedChairman;
      }
    });
  }

  return parsedParts.length >= 3 ? { parts: parsedParts, chairman: resolvedChairman } : null;
}

/* =========================================================
   PLAN B ADAPTIVE REGEX PARSER (SUPPORTS STACKED ROLE LINES)
   ========================================================= */
function parsePlanBRegex(fullText, defaultChairman = '') {
  const lines = (fullText || '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const parts = [];
  const explicitChairPartIds = new Set();
  let bannerSection = null;
  let extractedChairman = '';
  let lastPartSkipped = false;
  let lastSkippedMinutes = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const lineChair = extractChairmanFromText(line);
    if (lineChair && !extractedChairman) {
      extractedChairman = lineChair;
    }
    if (/^(?:chairman|tagapangulo)\s*[:\-]/i.test(line)) {
      continue;
    }

    const secHeader = detectSectionHeader(line);
    if (secHeader) {
      bannerSection = secHeader;
      lastPartSkipped = false;
      lastSkippedMinutes = null;
      if (isPureSectionHeader(line)) continue;
    }

    const m = line.match(
      /^(.+?)\s+\(?(\d{1,2})\s*(?:min\.?|mins?\.?|minuto|mln\.?|rnin\.?)\)?(?:\s+(.+))?$/i
    );
    if (m) {
      const rawLeft = m[1].trim();
      const minutes = Number(m[2]);
      const rightNames = (m[3] || '').trim();

      if (minutes < 1 || minutes > 60) {
        lastPartSkipped = true;
        lastSkippedMinutes = null;
        continue;
      }

      const commentMeta = extractCommentFromMixedRow(rawLeft) || extractCommentFromMixedRow(line);
      if (commentMeta) {
        lastPartSkipped = false;
        lastSkippedMinutes = null;
        const explicitChair =
          extractChairmanFromText(rightNames) || extractChairmanFromText(line);
        if (explicitChair && !extractedChairman) extractedChairman = explicitChair;
        const { speaker } = parseRoleNames(rightNames, commentMeta.section, commentMeta.title);
        const part = normalizePart({
          id: generateId('part'),
          title: commentMeta.title,
          section: commentMeta.section,
          speaker: explicitChair || speaker || extractedChairman,
          assistant: '',
          isTalk: true,
          plannedMinutes: minutes,
        });
        if (explicitChair) explicitChairPartIds.add(part.id);
        parts.push(part);
        continue;
      }

      const title = cleanPartTitle(rawLeft);
      if (!title || title.length < 2 || isSkippedRow(title)) {
        lastPartSkipped = true;
        lastSkippedMinutes = minutes;
        continue;
      }

      lastPartSkipped = false;
      lastSkippedMinutes = null;
      const partSection = bannerSection || inferSectionFromTitle(title);
      const { speaker, assistant } = parseRoleNames(rightNames, partSection, title);

      parts.push(
        normalizePart({
          id: generateId('part'),
          title,
          section: partSection,
          speaker,
          assistant,
          isTalk: isBibleReading(title) ? true : partSection !== 'ministry' && !assistant,
          plannedMinutes: minutes,
        })
      );
      continue;
    }

    // Handle Opening/Concluding Comments line split from preceding Song & Prayer (with no minutes on this line)
    const splitCommentMeta = extractCommentFromMixedRow(line);
    if (
      splitCommentMeta &&
      !parts.some((p) => p.section === splitCommentMeta.section)
    ) {
      lastPartSkipped = false;
      const explicitChair = extractChairmanFromText(line);
      if (explicitChair && !extractedChairman) extractedChairman = explicitChair;
      const part = normalizePart({
        id: generateId('part'),
        title: splitCommentMeta.title,
        section: splitCommentMeta.section,
        speaker: explicitChair || extractedChairman,
        assistant: '',
        isTalk: true,
        plannedMinutes: lastSkippedMinutes || (splitCommentMeta.section === 'opening' ? 1 : 3),
      });
      if (explicitChair) explicitChairPartIds.add(part.id);
      parts.push(part);
      lastSkippedMinutes = null;
      continue;
    }

    // Stacked role/name lines underneath the previous part (skip sub-descriptions & prayer lines)
    const cleanedLine = stripIgnoredRoleClauses(line);
    if (
      !lastPartSkipped &&
      parts.length > 0 &&
      cleanedLine &&
      !isSkippedRow(cleanedLine) &&
      !isDescriptionSubLine(cleanedLine)
    ) {
      const prev = parts[parts.length - 1];
      const hasRole = new RegExp(ROLE_ENTRY_RE.source, 'i').test(cleanedLine);
      if (hasRole) {
        if (prev.section === 'opening' || prev.section === 'concluding') {
          const explicitChair = extractChairmanFromText(cleanedLine);
          if (explicitChair) {
            prev.speaker = explicitChair;
            explicitChairPartIds.add(prev.id);
            if (!extractedChairman) extractedChairman = explicitChair;
          }
          continue;
        }
        const merged = mergeStackedRightText(prev.speaker, prev.assistant, cleanedLine, prev.section, prev.title);
        prev.speaker = merged.speaker;
        prev.assistant = merged.assistant;
        prev.isTalk = isBibleReading(prev.title) ? true : prev.section !== 'ministry' && !prev.assistant;
      }
    }
  }

  // Always assign Chairman: [Chairman Name] to Opening/Concluding Comments (using header or row Chairman)
  const resolvedChairman = extractedChairman || sanitizeRoleValue(defaultChairman);
  if (resolvedChairman) {
    parts.forEach((p) => {
      if ((p.section === 'opening' || p.section === 'concluding') && !explicitChairPartIds.has(p.id)) {
        p.speaker = resolvedChairman;
      }
    });
  }

  return { parts, chairman: resolvedChairman };
}

/* =========================================================
   OFFLINE NATIVE ANDROID ML KIT OCR RUNNER (ZERO WEB WORKERS)
   ========================================================= */
export async function scanScheduleImageOffline(imageFile, onProgress, statusLabels = {}) {
  if (!isNativeAndroid()) {
    throw new Error('NATIVE_MLKIT_REQUIRED');
  }

  onProgress?.({
    status: statusLabels.preparing || 'Preparing image...',
    progress: 20,
  });

  const base64 = await preprocessImageToBase64(imageFile);

  onProgress?.({
    status: statusLabels.scanning || 'Scanning offline via Native Android ML Kit...',
    progress: 55,
  });

  const data = await NativeAppBridge.recognizeImage(base64);
  const fullText = (data?.text || '').trim();
  if (!fullText) {
    throw new Error('NO_TEXT_DETECTED');
  }

  onProgress?.({
    status: statusLabels.parsing || 'Parsing schedule rows...',
    progress: 85,
  });

  const meta = extractMetadataFromText(fullText);
  const primary = parseS140ThreeColumn(data, meta.chairman);
  if (primary && primary.parts.length >= 3) {
    onProgress?.({ status: 'Done', progress: 100 });
    return {
      modeUsed: '3-column',
      weekLabel: meta.weekLabel || 'December 4, 2026',
      chairman: cleanPersonName((primary.chairman || meta.chairman || '').replace(/^Chairman:\s*/i, '')),
      parts: primary.parts,
      rawText: fullText,
    };
  }

  const planB = parsePlanBRegex(fullText, meta.chairman);
  if (!planB.parts.length) {
    throw new Error('NO_TEXT_DETECTED');
  }

  onProgress?.({ status: 'Done', progress: 100 });
  return {
    modeUsed: 'plan-b',
    weekLabel: meta.weekLabel || 'December 4, 2026',
    chairman: cleanPersonName((planB.chairman || meta.chairman || '').replace(/^Chairman:\s*/i, '')),
    parts: planB.parts,
    rawText: fullText,
  };
}

/* =========================================================
   PRESERVED TEXT AUTO-FILL PARSER (ROLE-PREFIXED)
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

    if (/^(?:(?:OPENING|CLOSING)\s+PRAYER|(?:(?:PAMBUNGAD|PANGWAKAS)\s+NA\s+)?PANALANGIN|PRAYER)\s*[:\-]/i.test(line)) {
      continue;
    }
    if (upper.startsWith('DATE:') || upper.startsWith('PETSA:')) {
      result.date = line.replace(/^(DATE:|PETSA:)/i, '').trim();
      continue;
    }
    if (upper.startsWith('CONGREGATION:') || upper.startsWith('KONGREGASYON:')) {
      result.congregation = line.replace(/^(CONGREGATION:|KONGREGASYON:)/i, '').trim();
      continue;
    }
    if (upper.startsWith('CHAIRMAN:') || upper.startsWith('TAGAPANGULO:')) {
      const cleanedChair = extractChairmanFromText(line);
      result.chairman = cleanPersonName(cleanedChair.replace(/^Chairman:\s*/i, ''));
      continue;
    }
    if (/^(PAMBUNGAD NA KOMENTO:|OPENING COMMENTS:|OPENING:|PAMBUNGAD:)/i.test(line)) {
      const afterPrefix = line.replace(/^(PAMBUNGAD NA KOMENTO:|OPENING COMMENTS:|OPENING:|PAMBUNGAD:)/i, '');
      const chairFromLine = extractChairmanFromText(afterPrefix);
      if (chairFromLine) {
        result.openingSpeaker = cleanPersonName(chairFromLine.replace(/^Chairman:\s*/i, ''));
      } else {
        result.openingSpeaker = cleanPersonName(stripIgnoredRoleClauses(afterPrefix));
      }
      continue;
    }
    if (/^(PANGWAKAS NA KOMENTO:|CONCLUDING COMMENTS:|CLOSING COMMENTS:|PANGWAKAS:|CLOSING:)/i.test(line)) {
      const afterPrefix = line.replace(/^(PANGWAKAS NA KOMENTO:|CONCLUDING COMMENTS:|CLOSING COMMENTS:|PANGWAKAS:|CLOSING:)/i, '');
      const chairFromLine = extractChairmanFromText(afterPrefix);
      if (chairFromLine) {
        result.concludingSpeaker = cleanPersonName(chairFromLine.replace(/^Chairman:\s*/i, ''));
      } else {
        result.concludingSpeaker = cleanPersonName(stripIgnoredRoleClauses(afterPrefix));
      }
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
      if (/^(SPEAKER(?:\s*\d+)?:|TAGAPAGSALITA(?:\s*\d+)?:|PAHAYAG:)/i.test(line)) {
        const val = cleanPersonName(line.replace(/^(SPEAKER(?:\s*\d+)?:|TAGAPAGSALITA(?:\s*\d+)?:|PAHAYAG:)/i, ''));
        if (val) result.treasures.speaker = sanitizeRoleValue(`Speaker: ${val}`);
      } else if (/^(GEMS CONDUCTOR:|GEMS:|ESPIRITUWAL NA HIYAS:)/i.test(line)) {
        const val = cleanPersonName(line.replace(/^(GEMS CONDUCTOR:|GEMS:|ESPIRITUWAL NA HIYAS:)/i, ''));
        if (val) result.treasures.gemsConductor = sanitizeRoleValue(`Gems Conductor: ${val}`);
      } else if (/^(BIBLE READER:|READER:|PAGBABASA SA BIBLIYA:)/i.test(line)) {
        const val = cleanPersonName(line.replace(/^(BIBLE READER:|READER:|PAGBABASA SA BIBLIYA:)/i, ''));
        if (val) result.treasures.bibleReader = sanitizeRoleValue(`Bible Reader: ${val}`);
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
      } else if (/^(STUDENT\s*SPEAKER:)/i.test(line)) {
        const val = cleanPersonName(line.replace(/^STUDENT\s*SPEAKER:/i, ''));
        if (currentMinistryPart && val) {
          currentMinistryPart.student = sanitizeRoleValue(`Student Speaker: ${val}`);
          currentMinistryPart.isTalk = true;
        }
      } else if (/^(STUDENT(?:\s*\d+)?|ESTUDYANTE(?:\s*\d+)?):/i.test(line)) {
        const num = line.match(/\d+/);
        const val = cleanPersonName(line.replace(/^(STUDENT(?:\s*\d+)?|ESTUDYANTE(?:\s*\d+)?):/i, ''));
        const roleLabel = num ? `Student ${num[0]}` : `Student ${result.ministryParts.length || 1}`;
        if (!currentMinistryPart) {
          currentMinistryPart = {
            title: 'Ministry Part',
            student: val ? sanitizeRoleValue(`${roleLabel}: ${val}`) : '',
            assistant: '',
            isTalk: false,
          };
          result.ministryParts.push(currentMinistryPart);
        } else if (val) {
          currentMinistryPart.student = sanitizeRoleValue(`${roleLabel}: ${val}`);
        }
      } else if (/^(ASSISTANT(?:\s*\d+)?|KATULONG(?:\s*\d+)?):/i.test(line)) {
        const num = line.match(/\d+/);
        const val = cleanPersonName(line.replace(/^(ASSISTANT(?:\s*\d+)?|KATULONG(?:\s*\d+)?):/i, ''));
        const roleLabel = num ? `Assistant ${num[0]}` : `Assistant ${result.ministryParts.length || 1}`;
        if (currentMinistryPart && val) {
          currentMinistryPart.assistant = sanitizeRoleValue(`${roleLabel}: ${val}`);
        }
      } else if (/^(SPEAKER:|TAGAPAGSALITA:)/i.test(line)) {
        const val = cleanPersonName(line.replace(/^(SPEAKER:|TAGAPAGSALITA:)/i, ''));
        if (currentMinistryPart && val) {
          currentMinistryPart.student = sanitizeRoleValue(`Student Speaker: ${val}`);
          currentMinistryPart.isTalk = true;
        }
      }
    } else if (currentSection === 'living') {
      if (/^(LOKAL NA PANGANGAILANGAN:|LOCAL NEEDS:|LN\s*SPEAKER:)/i.test(line)) {
        const val = cleanPersonName(line.replace(/^(LOKAL NA PANGANGAILANGAN:|LOCAL NEEDS:|LN\s*SPEAKER:)/i, ''));
        if (val) result.living.localNeedsSpeaker = sanitizeRoleValue(`LN Speaker: ${val}`);
      } else if (/^(BIBLE STUDY:|PAG-AARAL SA BIBLIYA:|CBS\s*CONDUCTOR:|CONDUCTOR:|KONDYAKTOR:)/i.test(line)) {
        const val = cleanPersonName(
          line.replace(/^(BIBLE STUDY:|PAG-AARAL SA BIBLIYA:|CBS\s*CONDUCTOR:|CONDUCTOR:|KONDYAKTOR:)/i, '')
        );
        if (val) result.living.cbsConductor = sanitizeRoleValue(`CBS Conductor: ${val}`);
      }
    }
  }

  const baseParts = createDefaultMidweekParts(lang);
  const chair = cleanPersonName(sanitizeRoleValue(result.chairman).replace(/^Chairman:\s*/i, ''));
  const openSpk = sanitizeRoleValue(result.openingSpeaker ? `Chairman: ${result.openingSpeaker}` : chair ? `Chairman: ${chair}` : '');
  const closeSpk = sanitizeRoleValue(result.concludingSpeaker ? `Chairman: ${result.concludingSpeaker}` : chair ? `Chairman: ${chair}` : '');

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
    meetingType: 'midweek',
    weekLabel: result.date || 'December 4, 2026',
    congregationName: result.congregation || 'Kingdom Hall',
    chairman: chair,
    parts: [...beforeMinistry, ...ministryList, ...afterMinistry],
  };
}
