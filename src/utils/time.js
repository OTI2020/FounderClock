const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const isoWeek = require('dayjs/plugin/isoWeek');
const { findBestMatch } = require('./fuzzy');

dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);

const HOUR_WORDS = ['h', 'std', 'stunde', 'stunden', 'hr', 'hrs', 'hour', 'hours'];
const MINUTE_WORDS = ['m', 'min', 'mins', 'minute', 'minuten', 'minutes'];

function matchUnit(word) {
  if (HOUR_WORDS.includes(word)) return 'h';
  if (MINUTE_WORDS.includes(word)) return 'm';
  if (findBestMatch(word, HOUR_WORDS, 0.7)) return 'h';
  if (findBestMatch(word, MINUTE_WORDS, 0.7)) return 'm';
  return null;
}

function toSeconds(amount, unit) {
  return unit === 'h' ? amount * 3600 : amount * 60;
}

/**
 * Parst Dauer-Eingaben wie "2h", "1,5h", "90m", "1:30", "2 Stunden 30 Minuten"
 * und toleriert Tippfehler bei den Einheiten (Fuzzy-Matching). Gibt Sekunden
 * oder null zurück, wenn nichts erkannt werden konnte.
 */
function parseDuration(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase().replace(',', '.');

  const clock = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) {
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60;
  }

  const combined = raw.match(/^(\d+(?:\.\d+)?)\s*([a-zäöü]+)\s*(?:(\d+(?:\.\d+)?)\s*([a-zäöü]+))?$/i);
  if (combined) {
    const [, amount1, unit1, amount2, unit2] = combined;
    let seconds = 0;
    let matchedAny = false;

    const unit1Match = matchUnit(unit1);
    if (unit1Match) {
      seconds += toSeconds(Number(amount1), unit1Match);
      matchedAny = true;
    }
    if (amount2 && unit2) {
      const unit2Match = matchUnit(unit2);
      if (unit2Match) {
        seconds += toSeconds(Number(amount2), unit2Match);
        matchedAny = true;
      }
    }
    if (matchedAny) return Math.round(seconds);
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return Math.round(Number(raw) * 3600);
  }

  return null;
}

function formatDuration(totalSeconds, lang = 'de') {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  const hourLabel = lang === 'en' ? 'h' : 'Std';
  const minuteLabel = lang === 'en' ? 'm' : 'Min';

  if (hours === 0 && minutes === 0) return `0${hourLabel}`;
  if (minutes === 0) return `${hours}${hourLabel}`;
  if (hours === 0) return `${minutes}${minuteLabel}`;
  return `${hours}${hourLabel} ${minutes}${minuteLabel}`;
}

const DATE_KEYWORDS = { heute: 0, today: 0, gestern: -1, yesterday: -1 };
const DATE_FORMATS = ['YYYY-MM-DD', 'YYYY-M-D', 'DD.MM.YYYY', 'D.M.YYYY', 'DD.MM.', 'D.M.'];

/**
 * Parst Datumsangaben wie "2026-09-14", "14.09.2026", "heute"/"today".
 * Gibt YYYY-MM-DD oder null zurück.
 */
function parseDateFlexible(input) {
  if (!input) return dayjs().format('YYYY-MM-DD');
  const raw = String(input).trim().toLowerCase();

  if (raw in DATE_KEYWORDS) {
    return dayjs().add(DATE_KEYWORDS[raw], 'day').format('YYYY-MM-DD');
  }

  for (const format of DATE_FORMATS) {
    const parsed = dayjs(raw, format, true);
    if (parsed.isValid()) {
      if (format === 'DD.MM.' || format === 'D.M.') {
        return parsed.year(dayjs().year()).format('YYYY-MM-DD');
      }
      return parsed.format('YYYY-MM-DD');
    }
  }
  return null;
}

function getIsoWeekRange(weeksAgo = 0) {
  const reference = dayjs().subtract(weeksAgo, 'week');
  const start = reference.startOf('isoWeek');
  const end = reference.endOf('isoWeek');
  return {
    start: start.format('YYYY-MM-DD'),
    end: end.format('YYYY-MM-DD'),
    weekNumber: start.isoWeek(),
    year: start.isoWeekYear(),
  };
}

function getQuarter(date = dayjs()) {
  const quarter = Math.floor(date.month() / 3) + 1;
  return { year: date.year(), quarter };
}

module.exports = { dayjs, parseDuration, formatDuration, parseDateFlexible, getIsoWeekRange, getQuarter };
