const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const sessionsDb = require('../database/sessions');
const expensesDb = require('../database/expenses');
const time = require('../utils/time');
const csv = require('../utils/csv');

const SESSION_HEADERS = ['user_id', 'username', 'date', 'hours', 'description', 'source'];
const EXPENSE_HEADERS = ['user_id', 'username', 'date', 'amount', 'currency', 'description', 'category'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('export')
    .setDescription('Daten als CSV oder JSON exportieren / Export data as CSV or JSON')
    .addStringOption((o) =>
      o
        .setName('typ')
        .setDescription('Was exportieren? / What to export?')
        .setRequired(false)
        .addChoices(
          { name: 'Beides / Both', value: 'beides' },
          { name: 'Zeiten / Time', value: 'zeiten' },
          { name: 'Ausgaben / Expenses', value: 'ausgaben' }
        )
    )
    .addStringOption((o) =>
      o
        .setName('format')
        .setDescription('Dateiformat / File format')
        .setRequired(false)
        .addChoices({ name: 'CSV', value: 'csv' }, { name: 'JSON', value: 'json' })
    )
    .addStringOption((o) => o.setName('von').setDescription('Startdatum / Start date').setRequired(false))
    .addStringOption((o) => o.setName('bis').setDescription('Enddatum / End date').setRequired(false)),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);

    const typ = interaction.options.getString('typ') || 'beides';
    const format = interaction.options.getString('format') || 'csv';
    const vonInput = interaction.options.getString('von');
    const bisInput = interaction.options.getString('bis');

    const von = vonInput ? time.parseDateFlexible(vonInput) : '0000-01-01';
    const bis = bisInput ? time.parseDateFlexible(bisInput) : '9999-12-31';
    if (!von || !bis) {
      await interaction.reply({
        content: t(lang, 'common.error.invalidDate', { input: vonInput || bisInput }),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    const attachments = [];
    const summaries = [];

    function buildFile(rows, headers, baseName) {
      if (format === 'json') {
        return { content: JSON.stringify(rows, null, 2), name: `${baseName}.json` };
      }
      return { content: csv.toCsv(headers, rows), name: `${baseName}.csv` };
    }

    if (typ === 'beides' || typ === 'zeiten') {
      const rows = sessionsDb.getRangeSessions(interaction.guildId, von, bis).map((s) => ({
        user_id: s.user_id,
        username: membersDb.getUsername(interaction.guildId, s.user_id) || '',
        date: s.work_date,
        hours: (s.duration_seconds / 3600).toFixed(2),
        description: s.description || '',
        source: s.source,
      }));
      if (rows.length > 0) {
        const file = buildFile(rows, SESSION_HEADERS, 'zeiten');
        attachments.push(new AttachmentBuilder(Buffer.from(file.content, 'utf-8'), { name: file.name }));
        summaries.push(t(lang, 'export.successSessions', { count: rows.length }));
      }
    }

    if (typ === 'beides' || typ === 'ausgaben') {
      const rows = expensesDb.getRangeExpenses(interaction.guildId, von, bis).map((e) => ({
        user_id: e.user_id,
        username: membersDb.getUsername(interaction.guildId, e.user_id) || '',
        date: e.expense_date,
        amount: e.amount.toFixed(2),
        currency: e.currency,
        description: e.description,
        category: e.category || '',
      }));
      if (rows.length > 0) {
        const file = buildFile(rows, EXPENSE_HEADERS, 'ausgaben');
        attachments.push(new AttachmentBuilder(Buffer.from(file.content, 'utf-8'), { name: file.name }));
        summaries.push(t(lang, 'export.successExpenses', { count: rows.length }));
      }
    }

    if (attachments.length === 0) {
      await interaction.editReply({ content: t(lang, 'export.noData') });
      return;
    }

    await interaction.editReply({ content: summaries.join('\n'), files: attachments });
  },
};
