const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ExcelJS = require('exceljs');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const sessionsDb = require('../database/sessions');
const expensesDb = require('../database/expenses');
const time = require('../utils/time');
const csv = require('../utils/csv');
const { findBestMatch } = require('../utils/fuzzy');
const config = require('../config');

// Erwartete Spalten mit gängigen DE/EN-Aliassen. Fuzzy-Matching gleicht
// zusätzlich Tippfehler in den CSV-Kopfzeilen aus (z. B. "Beschreibng").
const SESSION_ALIASES = {
  user_id: ['user_id', 'userid', 'discord_id', 'id', 'nutzer_id', 'mitglied_id', 'member_id'],
  date: ['date', 'datum', 'work_date', 'arbeitsdatum'],
  hours: ['hours', 'stunden', 'dauer', 'duration', 'std', 'zeit'],
  description: ['description', 'beschreibung', 'notiz', 'notes', 'kommentar'],
};

const EXPENSE_ALIASES = {
  user_id: ['user_id', 'userid', 'discord_id', 'id', 'nutzer_id', 'mitglied_id', 'member_id'],
  date: ['date', 'datum', 'expense_date', 'ausgabedatum'],
  amount: ['amount', 'betrag', 'summe', 'preis'],
  description: ['description', 'beschreibung', 'notiz'],
  category: ['category', 'kategorie', 'kat'],
};

function resolveHeaders(headers, aliasMap) {
  const resolved = {};
  const missing = [];
  const usedHeaders = new Set();

  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    const availableHeaders = headers.filter((h) => !usedHeaders.has(h));
    let found = availableHeaders.find((h) => aliases.includes(h.toLowerCase()));

    if (!found) {
      const candidates = aliases
        .map((alias) => findBestMatch(alias, availableHeaders, 0.75))
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);
      found = candidates.length > 0 ? candidates[0].match : null;
    }

    if (found) {
      resolved[canonical] = found;
      usedHeaders.add(found);
    } else {
      missing.push(canonical);
    }
  }

  return { resolved, missing };
}

async function downloadAttachment(attachment) {
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Erkennt das Dateiformat anhand von Dateiname/Content-Type, sodass /import
// CSV, JSON und Excel ohne extra Option unterscheiden kann.
function detectFormat(attachment) {
  const name = (attachment.name || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.csv')) return 'csv';

  const contentType = (attachment.contentType || '').toLowerCase();
  if (contentType.includes('spreadsheet') || contentType.includes('ms-excel')) return 'excel';
  if (contentType.includes('json')) return 'json';
  return 'csv';
}

// Wandelt ein JSON-Array von Objekten (wie /export es liefert) in dieselbe
// { headers, records }-Form wie parseCsv um, damit die restliche
// Validierungs-/Alias-Logik unverändert weiterverwendet werden kann.
function parseJsonRecords(buffer) {
  const data = JSON.parse(buffer.toString('utf-8'));
  if (!Array.isArray(data)) throw new Error('JSON ist kein Array');

  const headerSet = new Set();
  data.forEach((row) => {
    if (row && typeof row === 'object') Object.keys(row).forEach((k) => headerSet.add(k));
  });
  const headers = [...headerSet];

  const records = data.map((row) => {
    const record = {};
    headers.forEach((h) => {
      const value = row ? row[h] : undefined;
      record[h] = value === undefined || value === null ? '' : String(value).trim();
    });
    return record;
  });

  return { headers, records };
}

// Liest das erste Tabellenblatt einer Excel-Datei (erste Zeile = Kopfzeile)
// in dieselbe { headers, records }-Form wie parseCsv/parseJsonRecords.
async function parseExcelRecords(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Keine Tabellenblätter gefunden');

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? '').trim();
  });

  const records = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    headers.forEach((h, colNumber) => {
      if (!h) return;
      const value = row.getCell(colNumber).value;
      record[h] = value === null || value === undefined ? '' : String(value).trim();
    });
    records.push(record);
  });

  return { headers: headers.filter(Boolean), records };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('import')
    .setDescription('CSV-, JSON- oder Excel-Daten importieren (nur Admins) / Import CSV, JSON or Excel data (admins only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('zeiten')
        .setDescription('Zeiten aus CSV/JSON/Excel importieren / Import time entries from CSV/JSON/Excel')
        .addAttachmentOption((o) =>
          o.setName('datei').setDescription('CSV-, JSON- oder .xlsx-Datei / CSV, JSON or .xlsx file').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('ausgaben')
        .setDescription('Ausgaben aus CSV/JSON/Excel importieren / Import expenses from CSV/JSON/Excel')
        .addAttachmentOption((o) =>
          o.setName('datei').setDescription('CSV-, JSON- oder .xlsx-Datei / CSV, JSON or .xlsx file').setRequired(true)
        )
    ),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);
    const subcommand = interaction.options.getSubcommand();
    const attachment = interaction.options.getAttachment('datei', true);

    await interaction.deferReply({ ephemeral: true });

    let buffer;
    try {
      buffer = await downloadAttachment(attachment);
    } catch {
      await interaction.editReply({ content: t(lang, 'import.downloadFailed') });
      return;
    }

    const format = detectFormat(attachment);
    let headers, records;
    try {
      if (format === 'excel') {
        ({ headers, records } = await parseExcelRecords(buffer));
      } else if (format === 'json') {
        ({ headers, records } = parseJsonRecords(buffer));
      } else {
        ({ headers, records } = csv.parseCsv(buffer.toString('utf-8')));
      }
    } catch {
      await interaction.editReply({
        content: t(lang, format === 'excel' ? 'import.invalidExcel' : 'import.invalidJson'),
      });
      return;
    }

    if (records.length === 0) {
      await interaction.editReply({ content: t(lang, 'export.noData') });
      return;
    }

    const aliasMap = subcommand === 'zeiten' ? SESSION_ALIASES : EXPENSE_ALIASES;
    const { resolved, missing } = resolveHeaders(headers, aliasMap);
    if (missing.length > 0) {
      await interaction.editReply({ content: t(lang, 'import.missingColumns', { columns: missing.join(', ') }) });
      return;
    }

    const errors = [];
    let success = 0;

    records.forEach((record, index) => {
      const rowNumber = index + 2;
      try {
        const userId = record[resolved.user_id]?.trim();
        if (!userId || !/^\d+$/.test(userId)) throw new Error('ungültige user_id');

        if (subcommand === 'zeiten') {
          const workDate = time.parseDateFlexible(record[resolved.date]);
          const durationSeconds = time.parseDuration(record[resolved.hours]);
          if (!workDate || !durationSeconds || durationSeconds <= 0) throw new Error('ungültiges Datum/Dauer');

          sessionsDb.addManualEntry(interaction.guildId, userId, {
            workDate,
            durationSeconds,
            description: record[resolved.description] || '',
            source: 'import',
          });
        } else {
          const expenseDate = time.parseDateFlexible(record[resolved.date]);
          const amount = Number(String(record[resolved.amount]).replace(',', '.'));
          if (!expenseDate || Number.isNaN(amount) || amount <= 0) throw new Error('ungültiges Datum/Betrag');

          expensesDb.addExpense(interaction.guildId, userId, {
            amount,
            currency: config.defaultCurrency,
            description: record[resolved.description] || '',
            category: record[resolved.category] || null,
            expenseDate,
          });
        }
        success++;
      } catch (error) {
        errors.push(`#${rowNumber}: ${error.message}`);
      }
    });

    let content = t(lang, 'import.summary', { success, total: records.length });
    if (errors.length > 0) {
      content += `\n\n${t(lang, 'import.errorsHeader')}\n${errors.slice(0, 10).join('\n')}`;
    }
    await interaction.editReply({ content });
  },
};
