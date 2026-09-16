const { SlashCommandBuilder } = require('discord.js');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const sessionsDb = require('../database/sessions');
const time = require('../utils/time');
const { buildEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkout')
    .setDescription('Auschecken mit Beschreibung / Check out with a description')
    .addStringOption((o) =>
      o.setName('beschreibung').setDescription('Was hast du gemacht? / What did you work on?').setRequired(true)
    ),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);
    const description = interaction.options.getString('beschreibung', true);

    const result = sessionsDb.closeCheckin(interaction.guildId, interaction.user.id, description);
    if (!result.ok) {
      await interaction.reply({ content: t(lang, 'checkout.notCheckedIn'), ephemeral: true });
      return;
    }

    const embed = buildEmbed({
      color: 'success',
      description: t(lang, 'checkout.success', {
        duration: time.formatDuration(result.durationSeconds, lang),
        description,
      }),
    });

    await interaction.reply({ embeds: [embed] });
  },
};
