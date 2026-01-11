import Database from 'better-sqlite3'
import { Logger } from 'tslog'

const log = new Logger({ name: 'db' })

// Initialize DB
const db = new Database('vc_logger.db')

db.pragma('journal_mode = WAL')

export function initDb() {
	log.info('Initializing database...')
	db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER
    )
  `)

	db.exec(`
    CREATE TABLE IF NOT EXISTS channel_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER
    )
  `)
	log.info('Database initialized.')
}

export function startUserSession(
	userId: string,
	guildId: string,
	channelId: string,
) {
	const stmt = db.prepare(`
    INSERT INTO user_sessions (user_id, guild_id, channel_id, start_time)
    VALUES (?, ?, ?, ?)
  `)
	const startTime = Date.now()
	stmt.run(userId, guildId, channelId, startTime)
	return startTime
}

export function endUserSession(
	userId: string,
	guildId: string,
	channelId: string,
) {
	// Find the most recent active session for this user in this channel
	const stmt = db.prepare(`
    SELECT id, start_time FROM user_sessions
    WHERE user_id = ? AND guild_id = ? AND channel_id = ? AND end_time IS NULL
    ORDER BY start_time DESC
    LIMIT 1
  `)
	const row = stmt.get(userId, guildId, channelId) as
		| { id: number; start_time: number }
		| undefined

	if (row) {
		const endTime = Date.now()
		const updateStmt = db.prepare(`
      UPDATE user_sessions
      SET end_time = ?
      WHERE id = ?
    `)
		updateStmt.run(endTime, row.id)
		return { startTime: row.start_time, endTime }
	}
	return null
}

export function getChannelSession(channelId: string) {
	const stmt = db.prepare(`
    SELECT id, start_time FROM channel_sessions
    WHERE channel_id = ? AND end_time IS NULL
    ORDER BY start_time DESC
    LIMIT 1
  `)
	return stmt.get(channelId) as { id: number; start_time: number } | undefined
}

export function startChannelSession(guildId: string, channelId: string) {
	const existing = getChannelSession(channelId)
	if (!existing) {
		const stmt = db.prepare(`
      INSERT INTO channel_sessions (guild_id, channel_id, start_time)
      VALUES (?, ?, ?)
    `)
		stmt.run(guildId, channelId, Date.now())
		return true // Started new session
	}
	return false // Already active
}

export function endChannelSession(channelId: string) {
	const existing = getChannelSession(channelId)
	if (existing) {
		const endTime = Date.now()
		const stmt = db.prepare(`
      UPDATE channel_sessions
      SET end_time = ?
      WHERE id = ?
    `)
		stmt.run(endTime, existing.id)
		return { startTime: existing.start_time, endTime }
	}
	return null
}

export function getUserStats(userId: string, guildId: string) {
	// Get all completed sessions
	const stmt = db.prepare(`
        SELECT start_time, end_time FROM user_sessions
        WHERE user_id = ? AND guild_id = ? AND end_time IS NOT NULL
    `)
	return stmt.all(userId, guildId) as {
		start_time: number
		end_time: number
	}[]
}

export function getGuildLeaderboard(guildId: string) {
	const stmt = db.prepare(`
        SELECT user_id, SUM(end_time - start_time) as total_duration
        FROM user_sessions
        WHERE guild_id = ? AND end_time IS NOT NULL
        GROUP BY user_id
        ORDER BY total_duration DESC
        LIMIT 10
    `)
	return stmt.all(guildId) as { user_id: string; total_duration: number }[]
}
