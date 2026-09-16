const config = require('./src/config');
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

if (!config.token || !config.clientId) {
  console.error('DISCORD_TOKEN und CLIENT_ID müssen in der .env gesetzt sein.');
  process.exit(1);
}

const commands = [];
const commandsDir = path.join(__dirname, 'src', 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(config.token);

(async () => {
  try {
    const route = config.guildId
      ? Routes.applicationGuildCommands(config.clientId, config.guildId)
      : Routes.applicationCommands(config.clientId);

    const data = await rest.put(route, { body: commands });
    console.log(
      `${data.length} Slash-Commands registriert (${config.guildId ? `Guild ${config.guildId}` : 'global'}).`
    );
  } catch (error) {
    console.error('Fehler beim Registrieren der Slash-Commands:', error);
    process.exit(1);
  }
})();
