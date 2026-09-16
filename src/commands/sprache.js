const { SlashCommandBuilder } = require('discord.js');
const { t, isSupportedLanguage } = require('../i18n');
const membersDb = require('../database/members');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprache')
    .setDescription('Persönliche Sprache umstellen / Change your personal language')
    .addStringOption((o) =>
      o
        .setName('wert')
        .setDescription('Sprache wählen / Choose language')
        .setRequired(true)
        .addChoices({ name: 'Deutsch', value: 'de' }, { name: 'English', value: 'en' })
    ),
  async execute(interaction) {
    const value = interaction.options.getString('wert', true);
    const lang = isSupportedLanguage(value) ? value : 'de';

    membersDb.setLanguage(interaction.guildId, interaction.user.id, interaction.user.username, lang);
    await interaction.reply({ content: t(lang, 'sprache.success'), ephemeral: true });
  },
};
