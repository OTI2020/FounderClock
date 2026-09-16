const dayjs = require('dayjs');
const { getDb } = require('./db');

function getOpenSession(guildId, userId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM sessions WHERE guild_id = ? AND user_id = ? AND check_out_at IS NULL ORDER BY id DESC LIMIT 1`
    )
    .get(guildId, userId);
}

function startCheckin(guildId, userId) {
  const open = getOpenSession(guildId, userId);
  if (open) return { ok: false, reason: 'already_checked_in', session: open };

  const db = getDb();
  const now = dayjs();
  const info = db
    .prepare(
      `INSERT INTO sessions (guild_id, user_id, work_date, check_in_at, source, created_at)
       VALUES (?, ?, ?, ?, 'checkin', ?)`
    )
    .run(guildId, userId, now.format('YYYY-MM-DD'), now.toISOString(), now.toISOString());

  return { ok: true, id: info.lastInsertRowid, checkInAt: now.toISOString() };
}

function closeCheckin(guildId, userId, description) {
  const open = getOpenSession(guildId, userId);
  if (!open) return { ok: false, reason: 'not_checked_in' };

  const db = getDb();
  const now = dayjs();
  const durationSeconds = Math.max(0, now.diff(dayjs(open.check_in_at), 'second'));

  db.prepare(`UPDATE sessions SET check_out_at = ?, duration_seconds = ?, description = ? WHERE id = ?`).run(
    now.toISOString(),
    durationSeconds,
    description,
    open.id
  );

  return { ok: true, durationSeconds, checkInAt: open.check_in_at, checkOutAt: now.toISOString() };
}

function addManualEntry(guildId, userId, { workDate, durationSeconds, description, source = 'manual' }) {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO sessions (guild_id, user_id, work_date, duration_seconds, description, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, userId, workDate, durationSeconds, description, source, now);
  return info.lastInsertRowid;
}

function getRangeSessions(guildId, fromDate, toDate) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM sessions
       WHERE guild_id = ? AND work_date BETWEEN ? AND ? AND duration_seconds IS NOT NULL
       ORDER BY work_date ASC, id ASC`
    )
    .all(guildId, fromDate, toDate);
}

function getWeekTotalsByUser(guildId, fromDate, toDate) {
  const db = getDb();
  return db
    .prepare(
      `SELECT user_id, SUM(duration_seconds) AS total_seconds, COUNT(*) AS entries
       FROM sessions
       WHERE guild_id = ? AND work_date BETWEEN ? AND ? AND duration_seconds IS NOT NULL
       GROUP BY user_id`
    )
    .all(guildId, fromDate, toDate);
}

function getAllTimeHoursByUser(guildId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT user_id, SUM(duration_seconds) AS total_seconds
       FROM sessions
       WHERE guild_id = ? AND duration_seconds IS NOT NULL
       GROUP BY user_id`
    )
    .all(guildId);
}

module.exports = {
  startCheckin,
  getOpenSession,
  closeCheckin,
  addManualEntry,
  getRangeSessions,
  getWeekTotalsByUser,
  getAllTimeHoursByUser,
};
