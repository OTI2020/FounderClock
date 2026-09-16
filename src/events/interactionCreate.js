const { Events } = require('discord.js');
const membersDb = require('../database/members');
const sessionsDb = require('../database/sessions');
const equityDb = require('../database/equity');
const time = require('../utils/time');
const { t } = require('../i18n');
const anteileCommand = require('../commands/anteile');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButtonSafely(interaction);
    }
  },
};

async function handleChatInputCommand(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'FounderClock funktioniert nur auf einem Server. / FounderClock only works inside a server.',
      ephemeral: true,
    });
    return;
  }

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Fehler in Command "${interaction.commandName}":`, error);
    await replyWithGenericError(interaction);
  }
}

async function handleButtonSafely(interaction) {
  try {
    await handleButton(interaction);
  } catch (error) {
    console.error('Fehler bei Button-Interaktion:', error);
    await replyWithGenericError(interaction);
  }
}

async function replyWithGenericError(interaction) {
  const lang = interaction.guildId ? membersDb.getLanguage(interaction.guildId, interaction.user.id) : 'de';
  const payload = { content: t(lang, 'common.error.generic'), ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

async function handleButton(interaction) {
  if (!interaction.guildId) return;

  membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
  const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);
  const [namespace, action, ...rest] = interaction.customId.split(':');
  if (namespace !== 'fc') return;

  if (action === 'checkin') {
    await handleCheckinButton(interaction, lang);
    return;
  }

  if (action === 'anteile') {
    await handleAnteileButton(interaction, lang, rest);
  }
}

async function handleCheckinButton(interaction, lang) {
  const result = sessionsDb.startCheckin(interaction.guildId, interaction.user.id);
  if (!result.ok) {
    const since = time.dayjs(result.session.check_in_at).format('HH:mm');
    await interaction.reply({ content: t(lang, 'checkin.alreadyIn', { since }), ephemeral: true });
    return;
  }
  const timeStr = time.dayjs(result.checkInAt).format('HH:mm');
  await interaction.reply({ content: t(lang, 'checkin.success', { time: timeStr }), ephemeral: true });
}

async function handleAnteileButton(interaction, lang, [subAction, roundIdRaw]) {
  const roundId = Number(roundIdRaw);
  const round = equityDb.getRoundById(roundId);
  if (!round || round.status !== 'pending') {
    await interaction.reply({ content: t(lang, 'anteile.statusNone'), ephemeral: true });
    return;
  }

  const entries = equityDb.getEntries(roundId);
  const entry = entries.find((e) => e.user_id === interaction.user.id);
  if (!entry) {
    await interaction.reply({ content: t(lang, 'anteile.notEligible'), ephemeral: true });
    return;
  }

  if (subAction === 'reject') {
    equityDb.cancelRound(roundId);
    await interaction.reply({ content: t(lang, 'anteile.rejected') });
    const embed = await anteileCommand.buildRoundEmbed(interaction.guild, lang, {
      year: round.year,
      quarter: round.quarter,
      hourlyRate: round.hourly_rate,
      entries,
    });
    await interaction.message.edit({ embeds: [embed], components: [] }).catch(() => {});
    return;
  }

  if (subAction === 'confirm') {
    if (entry.confirmed_at) {
      await interaction.reply({ content: t(lang, 'anteile.alreadyConfirmed'), ephemeral: true });
      return;
    }

    equityDb.confirmEntry(roundId, interaction.user.id);
    await interaction.reply({ content: t(lang, 'anteile.confirmed'), ephemeral: true });

    const updatedEntries = equityDb.getEntries(roundId);
    const finished = equityDb.allConfirmed(roundId);
    if (finished) equityDb.completeRound(roundId);

    const embed = await anteileCommand.buildRoundEmbed(interaction.guild, lang, {
      year: round.year,
      quarter: round.quarter,
      hourlyRate: round.hourly_rate,
      entries: updatedEntries,
    });
    await interaction.message
      .edit({ embeds: [embed], components: finished ? [] : interaction.message.components })
      .catch(() => {});

    if (finished && interaction.channel) {
      await interaction.channel
        .send(t(lang, 'anteile.completed', { quarter: round.quarter, year: round.year }))
        .catch(() => {});
    }
  }
}
