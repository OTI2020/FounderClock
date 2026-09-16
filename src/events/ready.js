const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`FounderClock ist online als ${client.user.tag}.`);
  },
};
