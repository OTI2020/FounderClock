const { getDb } = require('./db');

function upsertMember(guildId, userId, username) {
  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (existing) {
    db.prepare('UPDATE members SET username = ? WHERE guild_id = ? AND user_id = ?').run(username, guildId, userId);
  } else {
    db.prepare(
      'INSERT INTO members (guild_id, user_id, username, language, created_at) VALUES (?, ?, ?, NULL, ?)'
    ).run(guildId, userId, username, new Date().toISOString());
  }
}

function getLanguage(guildId, userId) {
  const db = getDb();
  const row = db.prepare('SELECT language FROM members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return (row && row.language) || 'de';
}

function setLanguage(guildId, userId, username, language) {
  upsertMember(guildId, userId, username);
  const db = getDb();
  db.prepare('UPDATE members SET language = ? WHERE guild_id = ? AND user_id = ?').run(language, guildId, userId);
}

function getUsername(guildId, userId) {
  const db = getDb();
  const row = db.prepare('SELECT username FROM members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  return row && row.username;
}

module.exports = { upsertMember, getLanguage, setLanguage, getUsername };
