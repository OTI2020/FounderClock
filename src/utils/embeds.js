const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
  info: 0x5865f2,
};

function buildEmbed({ color = 'primary', title, description, fields, footer }) {
  const embed = new EmbedBuilder().setColor(COLORS[color] || COLORS.primary).setTimestamp(new Date());
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields && fields.length) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  return embed;
}

module.exports = { buildEmbed, COLORS };
