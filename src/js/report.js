import { I18N, formatSpeakerDisplay } from './i18n.js';
import { formatDurationMMSS } from './timerEngine.js';

export function buildMeetingSummary(week, lang = 'en') {
  const t = I18N[lang] || I18N.en;
  const parts = Array.isArray(week?.parts) ? week.parts : [];

  let totalAllottedSec = 0;
  let totalActualSec = 0;

  const rows = parts.map((p, index) => {
    const allottedSec = (Number(p.plannedMinutes) || 1) * 60;
    const actualSec = Number(p.actualSeconds) || 0;
    const diffSec = actualSec - allottedSec;

    totalAllottedSec += allottedSec;
    totalActualSec += actualSec;

    let overtimeLabel = t.reportPending;
    let isOvertime = false;
    let isTimed = actualSec > 0;

    if (isTimed) {
      if (diffSec > 0) {
        overtimeLabel = `+${formatDurationMMSS(diffSec)} (${t.reportOvertime})`;
        isOvertime = true;
      } else if (diffSec < 0) {
        overtimeLabel = `-${formatDurationMMSS(Math.abs(diffSec))} (${t.reportUnder})`;
      } else {
        overtimeLabel = t.reportOnTime;
      }
    }

    return {
      index: index + 1,
      title: p.title,
      speakerText: formatSpeakerDisplay(p, lang),
      allottedText: formatDurationMMSS(allottedSec),
      actualText: formatDurationMMSS(actualSec),
      overtimeLabel,
      isOvertime,
      isTimed,
    };
  });

  const netDiffSec = totalActualSec - totalAllottedSec;
  const netSign = netDiffSec > 0 ? '+' : netDiffSec < 0 ? '-' : '';
  const netFormatted = `${netSign}${formatDurationMMSS(Math.abs(netDiffSec))}`;

  // Clean plain-text report without ASCII boxes or heavy symbols
  const lines = [];
  lines.push(t.reportTitle);
  lines.push(`${t.reportWeek}: ${week?.weekLabel || '-'}`);
  if (week?.congregationName) {
    lines.push(`${week.congregationName}`);
  }
  lines.push(`${t.reportChairman}: ${week?.chairman || '-'}`);
  lines.push('');

  rows.forEach((r) => {
    lines.push(`- ${r.index}. ${r.title}`);
    lines.push(`  ${r.speakerText}`);
    lines.push(`  ${t.reportAllotted}: ${r.allottedText} | ${t.reportActual}: ${r.actualText} | ${r.overtimeLabel}`);
  });

  lines.push('');
  lines.push(`${t.reportTotalAllotted}: ${formatDurationMMSS(totalAllottedSec)}`);
  lines.push(`${t.reportTotalActual}: ${formatDurationMMSS(totalActualSec)}`);
  lines.push(`${t.reportTotalNet}: ${netFormatted}`);

  return {
    rows,
    totalAllottedText: formatDurationMMSS(totalAllottedSec),
    totalActualText: formatDurationMMSS(totalActualSec),
    netFormatted,
    isNetOvertime: netDiffSec > 0,
    plainText: lines.join('\n'),
  };
}

export async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
