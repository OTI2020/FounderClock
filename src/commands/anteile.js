const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const sessionsDb = require('../database/sessions');
const expensesDb = require('../database/expenses');
const equityDb = require('../database/equity');
const time = require('../utils/time');
const { buildEmbed } = require('../utils/embeds');
const config = require('../config');

async function resolveDisplayName(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch {
    return `<@${userId}>`;
  }
}

function buildRoundButtons(roundId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fc:anteile:confirm:${roundId}`)
      .setLabel('Bestätigen / Confirm')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`fc:anteile:reject:${roundId}`)
      .setLabel('Ablehnen / Reject')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );
}

async function buildRoundEmbed(guild, lang, { year, quarter, hourlyRate, entries }) {
  const fields = [];
  for (const entry of entries) {
    const name = await resolveDisplayName(guild, entry.user_id);
    const status = entry.confirmed_at ? '✅' : '⏳';
    fields.push({
      name: `${status} ${name}`,
      value: `${entry.share_percent.toFixed(2)}% — ${entry.hours.toFixed(1)}${t(lang, 'common.hours')} + ${entry.expenses.toFixed(2)} ${config.defaultCurrency}`,
    });
  }

  return buildEmbed({
    color: 'info',
    title: t(lang, 'anteile.panelTitle', { quarter, year }),
    description: t(lang, 'anteile.panelDescription', {
      hourlyRate: `${Number(hourlyRate).toFixed(2)} ${config.defaultCurrency}`,
    }),
    fields,
  });
}

async function handleStart(interaction, lang) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: t(lang, 'common.error.noPermission'), ephemeral: true });
    return;
  }

  const pending = equityDb.getPendingRound(interaction.guildId);
  if (pending) {
    await interaction.reply({ content: t(lang, 'anteile.pendingElsewhere'), ephemeral: true });
    return;
  }

  const { year, quarter } = time.getQuarter();
  const existing = equityDb.findRoundForQuarter(interaction.guildId, year, quarter);
  if (existing) {
    await interaction.reply({ content: t(lang, 'anteile.alreadyExists', { quarter, year }), ephemeral: true });
    return;
  }

  const settings = equityDb.getGuildSettings(interaction.guildId, {
    hourlyRate: config.defaultHourlyRate,
    currency: config.defaultCurrency,
  });
  const hourlyRateInput = interaction.options.getNumber('stundensatz');
  const hourlyRate = hourlyRateInput || settings.hourly_rate;
  if (hourlyRateInput) equityDb.setHourlyRate(interaction.guildId, hourlyRateInput);

  const hoursByUser = sessionsDb.getAllTimeHoursByUser(interaction.guildId);
  const expensesByUser = expensesDb.getAllTimeTotalsByUser(interaction.guildId);
  const userIds = new Set([...hoursByUser.map((r) => r.user_id), ...expensesByUser.map((r) => r.user_id)]);

  if (userIds.size === 0) {
    await interaction.reply({ content: t(lang, 'anteile.noData'), ephemeral: true });
    return;
  }

  const contributions = [...userIds].map((userId) => {
    const hoursRow = hoursByUser.find((r) => r.user_id === userId);
    const expenseRow = expensesByUser.find((r) => r.user_id === userId);
    const hours = hoursRow ? hoursRow.total_seconds / 3600 : 0;
    const expenses = expenseRow ? expenseRow.total_amount : 0;
    return { userId, hours, expenses, value: hours * hourlyRate + expenses };
  });

  const totalValue = contributions.reduce((sum, c) => sum + c.value, 0);
  if (totalValue <= 0) {
    await interaction.reply({ content: t(lang, 'anteile.noData'), ephemeral: true });
    return;
  }

  const roundId = equityDb.createRound(interaction.guildId, {
    year,
    quarter,
    hourlyRate,
    createdBy: interaction.user.id,
  });

  for (const c of contributions) {
    equityDb.addEntry(roundId, c.userId, {
      hours: c.hours,
      expenses: c.expenses,
      equityValue: c.value,
      sharePercent: (c.value / totalValue) * 100,
    });
  }

  const entries = equityDb.getEntries(roundId);
  const embed = await buildRoundEmbed(interaction.guild, lang, { year, quarter, hourlyRate, entries });
  const row = buildRoundButtons(roundId);

  const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
  equityDb.setRoundMessage(roundId, interaction.channelId, message.id);
}

async function handleStatus(interaction, lang) {
  const pending = equityDb.getPendingRound(interaction.guildId);
  if (!pending) {
    await interaction.reply({ content: t(lang, 'anteile.statusNone'), ephemeral: true });
    return;
  }

  const entries = equityDb.getEntries(pending.id);
  const confirmed = entries.filter((e) => e.confirmed_at).length;
  const embed = await buildRoundEmbed(interaction.guild, lang, {
    year: pending.year,
    quarter: pending.quarter,
    hourlyRate: pending.hourly_rate,
    entries,
  });

  await interaction.reply({
    content: t(lang, 'anteile.statusPending', {
      quarter: pending.quarter,
      year: pending.year,
      confirmed,
      total: entries.length,
    }),
    embeds: [embed],
    ephemeral: true,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('anteile')
    .setDescription('Quartalsweise Anteilsberechnung / Quarterly equity calculation')
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Startet eine neue Anteilsberechnung (nur Admins) / Starts a new calculation (admins only)')
        .addNumberOption((o) =>
          o
            .setName('stundensatz')
            .setDescription('Stundensatz überschreiben / Override hourly rate')
            .setRequired(false)
            .setMinValue(0)
        )
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Zeigt den aktuellen Status / Shows the current status')),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
      await handleStart(interaction, lang);
    } else {
      await handleStatus(interaction, lang);
    }
  },
  buildRoundEmbed,
  buildRoundButtons,
};
