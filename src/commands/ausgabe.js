const { SlashCommandBuilder } = require('discord.js');
const { t } = require('../i18n');
const membersDb = require('../database/members');
const expensesDb = require('../database/expenses');
const time = require('../utils/time');
const { findBestMatch } = require('../utils/fuzzy');
const { buildEmbed } = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ausgabe')
    .setDescription('Ausgabe erfassen / Log an expense')
    .addNumberOption((o) => o.setName('betrag').setDescription('Betrag / Amount').setRequired(true).setMinValue(0.01))
    .addStringOption((o) => o.setName('beschreibung').setDescription('Beschreibung / Description').setRequired(true))
    .addStringOption((o) => o.setName('kategorie').setDescription('Kategorie / Category').setRequired(false))
    .addStringOption((o) =>
      o.setName('datum').setDescription('z. B. 2026-09-14, heute / e.g. 2026-09-14, today').setRequired(false)
    ),
  async execute(interaction) {
    membersDb.upsertMember(interaction.guildId, interaction.user.id, interaction.user.username);
    const lang = membersDb.getLanguage(interaction.guildId, interaction.user.id);

    const amount = interaction.options.getNumber('betrag', true);
    const description = interaction.options.getString('beschreibung', true);
    const dateInput = interaction.options.getString('datum');
    let category = interaction.options.getString('kategorie');
    let categoryWasNormalized = false;

    const expenseDate = time.parseDateFlexible(dateInput);
    if (!expenseDate) {
      await interaction.reply({ content: t(lang, 'common.error.invalidDate', { input: dateInput }), ephemeral: true });
      return;
    }
    if (expenseDate > time.dayjs().format('YYYY-MM-DD')) {
      await interaction.reply({ content: t(lang, 'common.error.futureDate'), ephemeral: true });
      return;
    }

    if (category) {
      const existingCategories = expensesDb.getCategories(interaction.guildId);
      const match = findBestMatch(category, existingCategories, 0.72);
      if (match && match.match.toLowerCase() !== category.toLowerCase()) {
        category = match.match;
        categoryWasNormalized = true;
      }
    }

    expensesDb.addExpense(interaction.guildId, interaction.user.id, {
      amount,
      currency: config.defaultCurrency,
      description,
      category,
      expenseDate,
    });

    const formattedAmount = `${amount.toFixed(2)} ${config.defaultCurrency}`;
    let text = t(lang, 'ausgabe.success', {
      amount: formattedAmount,
      description,
      category: category || '–',
      date: expenseDate,
    });
    if (categoryWasNormalized) {
      text += t(lang, 'ausgabe.categoryNormalized', { category });
    }

    const embed = buildEmbed({ color: 'success', description: text });
    await interaction.reply({ embeds: [embed] });
  },
};
