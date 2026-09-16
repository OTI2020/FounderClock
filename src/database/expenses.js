const { getDb } = require('./db');

function addExpense(guildId, userId, { amount, currency, description, category, expenseDate }) {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO expenses (guild_id, user_id, amount, currency, description, category, expense_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, userId, amount, currency, description, category || null, expenseDate, now);
  return info.lastInsertRowid;
}

function getCategories(guildId) {
  const db = getDb();
  return db
    .prepare(`SELECT DISTINCT category FROM expenses WHERE guild_id = ? AND category IS NOT NULL`)
    .all(guildId)
    .map((r) => r.category);
}

function getRangeExpenses(guildId, fromDate, toDate) {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM expenses WHERE guild_id = ? AND expense_date BETWEEN ? AND ? ORDER BY expense_date ASC, id ASC`)
    .all(guildId, fromDate, toDate);
}

function getWeekTotalsByUser(guildId, fromDate, toDate) {
  const db = getDb();
  return db
    .prepare(
      `SELECT user_id, SUM(amount) AS total_amount, COUNT(*) AS entries
       FROM expenses WHERE guild_id = ? AND expense_date BETWEEN ? AND ?
       GROUP BY user_id`
    )
    .all(guildId, fromDate, toDate);
}

function getAllTimeTotalsByUser(guildId) {
  const db = getDb();
  return db
    .prepare(`SELECT user_id, SUM(amount) AS total_amount FROM expenses WHERE guild_id = ? GROUP BY user_id`)
    .all(guildId);
}

module.exports = {
  addExpense,
  getCategories,
  getRangeExpenses,
  getWeekTotalsByUser,
  getAllTimeTotalsByUser,
};
