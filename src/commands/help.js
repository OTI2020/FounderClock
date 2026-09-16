const { SlashCommandBuilder } = require('discord.js');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const { buildEmbed } = require('../utils/embeds');

const COMMANDS = ['checkin', 'checkout', 'log', 'ausgabe', 'stats', 'export', 'import', 'anteile', 'sprache'];

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Zeigt alle Befehle / Shows all commands'),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);

    const embed = buildEmbed({
      color: 'info',
      title: t(lang, 'help.title'),
      description: t(lang, 'help.description'),
      fields: COMMANDS.map((name) => ({ name: `/${name}`, value: t(lang, `help.${name}`) })),
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
