require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  dbPath: process.env.DB_PATH || null,
  defaultHourlyRate: Number(process.env.DEFAULT_HOURLY_RATE) || 25,
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'EUR',
};
