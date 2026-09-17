const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
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
  return response.text();
}

// Erkennt das Dateiformat anhand von Dateiname/Content-Type, sodass /import
// sowohl CSV als auch JSON ohne extra Option akzeptiert.
function isJsonAttachment(attachment) {
  const name = (attachment.name || '').toLowerCase();
  if (name.endsWith('.json')) return true;
  if (name.endsWith('.csv')) return false;
  return (attachment.contentType || '').includes('json');
}

// Wandelt ein JSON-Array von Objekten (wie /export es liefert) in dieselbe
// { headers, records }-Form wie parseCsv um, damit die restliche
// Validierungs-/Alias-Logik unverändert weiterverwendet werden kann.
function parseJsonRecords(text) {
  const data = JSON.parse(text);
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('import')
    .setDescription('CSV- oder JSON-Daten importieren (nur Admins) / Import CSV or JSON data (admins only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('zeiten')
        .setDescription('Zeiten aus CSV/JSON importieren / Import time entries from CSV/JSON')
        .addAttachmentOption((o) =>
          o.setName('datei').setDescription('CSV- oder JSON-Datei / CSV or JSON file').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('ausgaben')
        .setDescription('Ausgaben aus CSV/JSON importieren / Import expenses from CSV/JSON')
        .addAttachmentOption((o) =>
          o.setName('datei').setDescription('CSV- oder JSON-Datei / CSV or JSON file').setRequired(true)
        )
    ),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);
    const subcommand = interaction.options.getSubcommand();
    const attachment = interaction.options.getAttachment('datei', true);

    await interaction.deferReply({ ephemeral: true });

    let text;
    try {
      text = await downloadAttachment(attachment);
    } catch {
      await interaction.editReply({ content: t(lang, 'import.downloadFailed') });
      return;
    }

    let headers, records;
    try {
      ({ headers, records } = isJsonAttachment(attachment) ? parseJsonRecords(text) : csv.parseCsv(text));
    } catch {
      await interaction.editReply({ content: t(lang, 'import.invalidJson') });
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
