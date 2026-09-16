const { getDb } = require('./db');

function getGuildSettings(guildId, defaults) {
  const db = getDb();
  let row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  if (!row) {
    db.prepare('INSERT INTO guild_settings (guild_id, hourly_rate, currency) VALUES (?, ?, ?)').run(
      guildId,
      defaults.hourlyRate,
      defaults.currency
    );
    row = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId);
  }
  return row;
}

function setHourlyRate(guildId, hourlyRate) {
  const db = getDb();
  getGuildSettings(guildId, { hourlyRate, currency: 'EUR' });
  db.prepare('UPDATE guild_settings SET hourly_rate = ? WHERE guild_id = ?').run(hourlyRate, guildId);
}

function findRoundForQuarter(guildId, year, quarter) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM equity_rounds WHERE guild_id = ? AND year = ? AND quarter = ? AND status != 'cancelled'
       ORDER BY id DESC LIMIT 1`
    )
    .get(guildId, year, quarter);
}

function getPendingRound(guildId) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM equity_rounds WHERE guild_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`)
    .get(guildId);
}

function getRoundById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM equity_rounds WHERE id = ?').get(id);
}

function createRound(guildId, { year, quarter, hourlyRate, createdBy }) {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO equity_rounds (guild_id, year, quarter, status, hourly_rate, created_by, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`
    )
    .run(guildId, year, quarter, hourlyRate, createdBy, now);
  return info.lastInsertRowid;
}

function setRoundMessage(roundId, channelId, messageId) {
  const db = getDb();
  db.prepare('UPDATE equity_rounds SET channel_id = ?, message_id = ? WHERE id = ?').run(channelId, messageId, roundId);
}

function addEntry(roundId, userId, { hours, expenses, equityValue, sharePercent }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO equity_entries (round_id, user_id, hours, expenses, equity_value, share_percent)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(roundId, userId, hours, expenses, equityValue, sharePercent);
}

function getEntries(roundId) {
  const db = getDb();
  return db.prepare('SELECT * FROM equity_entries WHERE round_id = ? ORDER BY share_percent DESC').all(roundId);
}

function confirmEntry(roundId, userId) {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db
    .prepare(`UPDATE equity_entries SET confirmed_at = ? WHERE round_id = ? AND user_id = ? AND confirmed_at IS NULL`)
    .run(now, roundId, userId);
  return result.changes > 0;
}

function allConfirmed(roundId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN confirmed_at IS NULL THEN 1 ELSE 0 END) AS unconfirmed
       FROM equity_entries WHERE round_id = ?`
    )
    .get(roundId);
  return row.total > 0 && row.unconfirmed === 0;
}

function completeRound(roundId) {
  const db = getDb();
  db.prepare(`UPDATE equity_rounds SET status = 'completed', completed_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    roundId
  );
}

function cancelRound(roundId) {
  const db = getDb();
  db.prepare(`UPDATE equity_rounds SET status = 'cancelled' WHERE id = ?`).run(roundId);
}

module.exports = {
  getGuildSettings,
  setHourlyRate,
  findRoundForQuarter,
  getPendingRound,
  getRoundById,
  createRound,
  setRoundMessage,
  addEntry,
  getEntries,
  confirmEntry,
  allConfirmed,
  completeRound,
  cancelRound,
};
