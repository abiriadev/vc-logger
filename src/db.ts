import Database from 'better-sqlite3'
import sql from 'sql-template-strings'
import { Logger } from 'tslog'

export interface UserSession {
	id: number
	user_id: string
	guild_id: string
	channel_id: string
	start_time: number
	end_time?: number
}

export interface ChannelSession {
	id: number
	guild_id: string
	channel_id: string
	start_time: number
	end_time?: number
}

export interface LeaderboardEntry {
	user_id: string
	total_duration: number
}

export class Storage {
	private db: Database.Database
	private logger: Logger<unknown>

	constructor(dbPath: string, logger: Logger<unknown>) {
		this.logger = logger
		this.db = new Database(dbPath)
		this.db.pragma('journal_mode = WAL')
		this.initDb()
	}

	private initDb() {
		this.logger.info('Initializing database...')
		this.db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER
    )
  `)

		this.db.exec(`
    CREATE TABLE IF NOT EXISTS channel_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      end_time INTEGER
    )
  `)
		this.logger.info('Database initialized.')
	}

	public startUserSession(
		userId: string,
		guildId: string,
		channelId: string,
	): number {
		const startTime = Date.now()
		const query = sql`
      INSERT INTO user_sessions (user_id, guild_id, channel_id, start_time)
      VALUES (${userId}, ${guildId}, ${channelId}, ${startTime})
    `
		const stmt = this.db.prepare(query.sql)
		stmt.run(...query.values)
		return startTime
	}

	public endUserSession(userId: string, guildId: string, channelId: string) {
		const query = sql`
      SELECT id, start_time FROM user_sessions
      WHERE user_id = ${userId} AND guild_id = ${guildId} AND channel_id = ${channelId} AND end_time IS NULL
      ORDER BY start_time DESC
      LIMIT 1
    `
		const stmt = this.db.prepare(query.sql)
		const row = stmt.get(...query.values) as
			| { id: number; start_time: number }
			| undefined

		if (row) {
			const endTime = Date.now()
			const updateQuery = sql`
        UPDATE user_sessions
        SET end_time = ${endTime}
        WHERE id = ${row.id}
      `
			const updateStmt = this.db.prepare(updateQuery.sql)
			updateStmt.run(...updateQuery.values)
			return { startTime: row.start_time, endTime }
		}
		return null
	}

	public getChannelSession(
		channelId: string,
	): { id: number; start_time: number } | undefined {
		const query = sql`
      SELECT id, start_time FROM channel_sessions
      WHERE channel_id = ${channelId} AND end_time IS NULL
      ORDER BY start_time DESC
      LIMIT 1
    `
		const stmt = this.db.prepare(query.sql)
		return stmt.get(...query.values) as
			| { id: number; start_time: number }
			| undefined
	}

	public startChannelSession(guildId: string, channelId: string): boolean {
		const existing = this.getChannelSession(channelId)
		if (!existing) {
			const startTime = Date.now()
			const query = sql`
        INSERT INTO channel_sessions (guild_id, channel_id, start_time)
        VALUES (${guildId}, ${channelId}, ${startTime})
      `
			const stmt = this.db.prepare(query.sql)
			stmt.run(...query.values)
			return true
		}
		return false
	}

	public endChannelSession(channelId: string) {
		const existing = this.getChannelSession(channelId)
		if (existing) {
			const endTime = Date.now()
			const query = sql`
        UPDATE channel_sessions
        SET end_time = ${endTime}
        WHERE id = ${existing.id}
      `
			const stmt = this.db.prepare(query.sql)
			stmt.run(...query.values)
			return { startTime: existing.start_time, endTime }
		}
		return null
	}

	public getUserStats(
		userId: string,
		guildId: string,
	): { start_time: number; end_time: number }[] {
		const query = sql`
      SELECT start_time, end_time FROM user_sessions
      WHERE user_id = ${userId} AND guild_id = ${guildId} AND end_time IS NOT NULL
    `
		const stmt = this.db.prepare(query.sql)
		return stmt.all(...query.values) as {
			start_time: number
			end_time: number
		}[]
	}

	public getGuildLeaderboard(guildId: string): LeaderboardEntry[] {
		const query = sql`
      SELECT user_id, SUM(end_time - start_time) as total_duration
      FROM user_sessions
      WHERE guild_id = ${guildId} AND end_time IS NOT NULL
      GROUP BY user_id
      ORDER BY total_duration DESC
      LIMIT 10
    `
		const stmt = this.db.prepare(query.sql)
		return stmt.all(...query.values) as LeaderboardEntry[]
	}

	public close() {
		this.logger.info('Closing database connection...')
		this.db.close()
	}
}
