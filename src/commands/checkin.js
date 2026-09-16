const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const { buildEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkin')
    .setDescription('Öffnet ein Check-in Panel / Opens a check-in panel'),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);

    const embed = buildEmbed({
      color: 'info',
      title: t(lang, 'checkin.panelTitle'),
      description: t(lang, 'checkin.panelDescription'),
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fc:checkin')
        .setLabel('Einchecken / Check in')
        .setEmoji('🟢')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
