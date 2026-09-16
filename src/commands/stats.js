const { SlashCommandBuilder } = require('discord.js');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const sessionsDb = require('../database/sessions');
const expensesDb = require('../database/expenses');
const time = require('../utils/time');
const config = require('../config');
const { buildEmbed } = require('../utils/embeds');

async function resolveDisplayName(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch {
    return `<@${userId}>`;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Wochenübersicht aller Mitglieder / Weekly overview for all members')
    .addIntegerOption((o) =>
      o
        .setName('woche')
        .setDescription('0 = aktuelle Woche, 1 = letzte Woche, ... / 0 = current week, 1 = last week, ...')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(52)
    ),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);
    const weeksAgo = interaction.options.getInteger('woche') || 0;

    const { start, end } = time.getIsoWeekRange(weeksAgo);
    const timeTotals = sessionsDb.getWeekTotalsByUser(interaction.guildId, start, end);
    const expenseTotals = expensesDb.getWeekTotalsByUser(interaction.guildId, start, end);

    const userIds = new Set([...timeTotals.map((r) => r.user_id), ...expenseTotals.map((r) => r.user_id)]);
    const embed = buildEmbed({ color: 'info', title: t(lang, 'stats.title', { start, end }) });

    if (userIds.size === 0) {
      embed.setDescription(t(lang, 'stats.noData'));
      await interaction.reply({ embeds: [embed] });
      return;
    }

    let totalSeconds = 0;
    let totalEntries = 0;
    let totalExpenses = 0;

    for (const userId of userIds) {
      const timeRow = timeTotals.find((r) => r.user_id === userId);
      const expenseRow = expenseTotals.find((r) => r.user_id === userId);
      const seconds = timeRow ? timeRow.total_seconds : 0;
      const entries = timeRow ? timeRow.entries : 0;
      const expenseAmount = expenseRow ? expenseRow.total_amount : 0;

      totalSeconds += seconds;
      totalEntries += entries;
      totalExpenses += expenseAmount;

      const name = await resolveDisplayName(interaction.guild, userId);
      embed.addFields({
        name,
        value: t(lang, 'stats.memberField', {
          hours: time.formatDuration(seconds, lang),
          sessions: entries,
          expenses: `${expenseAmount.toFixed(2)} ${config.defaultCurrency}`,
        }),
      });
    }

    embed.addFields({
      name: `— ${t(lang, 'stats.totalLabel')} —`,
      value: t(lang, 'stats.memberField', {
        hours: time.formatDuration(totalSeconds, lang),
        sessions: totalEntries,
        expenses: `${totalExpenses.toFixed(2)} ${config.defaultCurrency}`,
      }),
    });

    await interaction.reply({ embeds: [embed] });
  },
};
