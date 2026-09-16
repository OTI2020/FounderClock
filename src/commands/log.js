const { SlashCommandBuilder } = require('discord.js');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const sessionsDb = require('../database/sessions');
const time = require('../utils/time');
const { buildEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Nachträglich Arbeitszeit erfassen / Log time retroactively')
    .addStringOption((o) =>
      o.setName('dauer').setDescription('z. B. 2h, 1,5h, 90m / e.g. 2h, 1.5h, 90m').setRequired(true)
    )
    .addStringOption((o) => o.setName('beschreibung').setDescription('Beschreibung / Description').setRequired(true))
    .addStringOption((o) =>
      o.setName('datum').setDescription('z. B. 2026-09-14, heute / e.g. 2026-09-14, today').setRequired(false)
    ),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);

    const durationInput = interaction.options.getString('dauer', true);
    const description = interaction.options.getString('beschreibung', true);
    const dateInput = interaction.options.getString('datum');

    const durationSeconds = time.parseDuration(durationInput);
    if (!durationSeconds || durationSeconds <= 0) {
      await interaction.reply({
        content: t(lang, 'common.error.invalidDuration', { input: durationInput }),
        ephemeral: true,
      });
      return;
    }

    const workDate = time.parseDateFlexible(dateInput);
    if (!workDate) {
      await interaction.reply({
        content: t(lang, 'common.error.invalidDate', { input: dateInput }),
        ephemeral: true,
      });
      return;
    }
    if (workDate > time.dayjs().format('YYYY-MM-DD')) {
      await interaction.reply({ content: t(lang, 'common.error.futureDate'), ephemeral: true });
      return;
    }

    sessionsDb.addManualEntry(interaction.guildId, interaction.user.id, {
      workDate,
      durationSeconds,
      description,
      source: 'manual',
    });

    const embed = buildEmbed({
      color: 'success',
      description: t(lang, 'log.success', {
        duration: time.formatDuration(durationSeconds, lang),
        date: workDate,
        user: `<@${interaction.user.id}>`,
        description,
      }),
    });

    await interaction.reply({ embeds: [embed] });
  },
};
