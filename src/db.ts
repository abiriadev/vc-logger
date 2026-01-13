import Database from 'better-sqlite3'
import { Logger } from 'tslog'
import sql, { SQLStatement } from 'sql-template-strings'
import type { Snowflake } from 'discord.js'
import { dateToUnix, type PartialMap } from './utils'

export interface UserSession {
	id: number
	guildId: Snowflake
	channelId: Snowflake
	userId: Snowflake
	startTime: Date
	endTime: Date
}

interface UserSessionRaw {
	id: number
	guild_id: string
	channel_id: string
	user_id: string
	start_time: number
	end_time: number
}

function toUserSession(raw: UserSessionRaw): UserSession {
	return {
		id: raw.id,
		guildId: raw.guild_id,
		channelId: raw.channel_id,
		userId: raw.user_id,
		startTime: new Date(raw.start_time),
		endTime: new Date(raw.end_time),
	}
}

function fromUserSession<T extends Partial<UserSession> = UserSession>(
	value: T,
): PartialMap<T, UserSessionRaw> {
	const raw: any = {}

	if (value.id !== undefined) raw.id = value.id
	if (value.guildId !== undefined) raw.guild_id = value.guildId
	if (value.channelId !== undefined) raw.channel_id = value.channelId
	if (value.userId !== undefined) raw.user_id = value.userId
	if (value.startTime !== undefined)
		raw.start_time = dateToUnix(value.startTime)
	if (value.endTime !== undefined) raw.end_time = dateToUnix(value.endTime)

	return raw
}

export interface UserLiveSession {
	id: number
	guildId: Snowflake
	channelId: Snowflake
	userId: Snowflake
	startTime: Date
	lastTime: Date
}

interface UserLiveSessionRaw {
	id: number
	guild_id: string
	channel_id: string
	user_id: string
	start_time: number
	last_time: number
}

function toUserLiveSession(raw: UserLiveSessionRaw): UserLiveSession {
	return {
		id: raw.id,
		guildId: raw.guild_id,
		channelId: raw.channel_id,
		userId: raw.user_id,
		startTime: new Date(raw.start_time),
		lastTime: new Date(raw.last_time),
	}
}

function fromUserLiveSession<
	T extends Partial<UserLiveSession> = UserLiveSession,
>(value: T): PartialMap<T, UserLiveSessionRaw> {
	const raw: any = {}

	if (value.id !== undefined) raw.id = value.id
	if (value.guildId !== undefined) raw.guild_id = value.guildId
	if (value.channelId !== undefined) raw.channel_id = value.channelId
	if (value.userId !== undefined) raw.user_id = value.userId
	if (value.startTime !== undefined)
		raw.start_time = dateToUnix(value.startTime)
	if (value.lastTime !== undefined) raw.last_time = dateToUnix(value.lastTime)

	return raw
}

export interface ChannelSession {
	id: number
	guildId: Snowflake
	channelId: Snowflake
	startTime: Date
	endTime: Date
}

interface ChannelSessionRaw {
	id: number
	guild_id: string
	channel_id: string
	start_time: number
	end_time: number
}

function toChannelSession(raw: ChannelSessionRaw): ChannelSession {
	return {
		id: raw.id,
		guildId: raw.guild_id,
		channelId: raw.channel_id,
		startTime: new Date(raw.start_time),
		endTime: new Date(raw.end_time),
	}
}

function fromChannelSession<T extends Partial<ChannelSession>>(
	value: T,
): PartialMap<T, UserSessionRaw> {
	const raw: any = {}

	if (value.id !== undefined) raw.id = value.id
	if (value.guildId !== undefined) raw.guild_id = value.guildId
	if (value.channelId !== undefined) raw.channel_id = value.channelId
	if (value.startTime !== undefined)
		raw.start_time = dateToUnix(value.startTime)
	if (value.endTime !== undefined) raw.end_time = dateToUnix(value.endTime)

	return raw
}

export interface LeaderboardEntry {
	user_id: string
	total_duration: number
}

export class Storage {
	private db: Database.Database
	private logger: Logger<unknown>
	private stmtsCache: Map<string, Database.Statement>

	constructor(dbPath: string, logger: Logger<unknown>) {
		this.logger = logger

		this.db = new Database(dbPath)
		this.stmtsCache = new Map()

		this.db.pragma(sql`journal_mode = WAL`.sql)

		this.initDb()
	}

	private stmt(sql: SQLStatement) {
		let cachedStmt = this.stmtsCache.get(sql.sql)

		if (!cachedStmt) {
			const stmt = this.db.prepare(sql.sql)

			this.stmtsCache.set(sql.sql, stmt)

			cachedStmt = stmt
		}

		return {
			run() {
				return cachedStmt.run(...sql.values)
			},
			get() {
				return cachedStmt.get(...sql.values)
			},
			all() {
				return cachedStmt.all(...sql.values)
			},
			iterate() {
				return cachedStmt.iterate(...sql.values)
			},
		}
	}

	private initDb() {
		this.logger.info('Initializing database...')

		// table: user_session
		this.db.exec(
			sql`
			create table if not exists "user_sessions" (
				"id" integer primary key autoincrement,
				"guild_id" text not null,
				"channel_id" text not null,
				"user_id" text not null,
				"start_time" integer not null,
				"end_time" integer not null
			)
			`.sql,
		)

		// table: user_live_session
		this.db.exec(
			sql`
			create table if not exists "user_live_sessions" (
				"id" integer primary key autoincrement,
				"guild_id" text not null,
				"channel_id" text not null,
				"user_id" text not null,
				"start_time" integer not null,
				"last_time" integer not null
			)
			`.sql,
		)

		// table: channel_session
		this.db.exec(
			sql`
			create table if not exists "channel_sessions" (
				"id" integer primary key autoincrement,
				"guild_id" text not null,
				"channel_id" text not null,
				"start_time" integer not null,
				"end_time" integer not null
			)
			`.sql,
		)

		this.logger.info('Database initialized.')
	}

	public startUserLiveSession(
		input: Pick<
			UserLiveSession,
			'guildId' | 'channelId' | 'userId' | 'startTime'
		>,
	): UserLiveSession {
		const inputRaw = fromUserLiveSession(input)

		const liveSessionRaw = this.stmt(
			sql`
			insert into "user_live_sessions" (guild_id, channel_id, user_id, start_time)
			values (${inputRaw.guild_id}, ${inputRaw.channel_id}, ${inputRaw.user_id}, ${inputRaw.start_time})
			returning *
			`,
		).get() as UserLiveSessionRaw | undefined

		if (!liveSessionRaw)
			throw new Error(
				'Failed to retrieve newly created user live session',
			)

		return toUserLiveSession(liveSessionRaw)
	}

	public endUserLiveSession(
		input: Pick<
			UserLiveSession,
			'guildId' | 'channelId' | 'userId' | 'lastTime'
		>,
	): UserSession {
		const inputRaw = fromUserLiveSession(input)

		// first, find the row. if it doesn't exist, throw.
		const liveSessionRaw = this.stmt(
			sql`
			delete from "user_live_sessions"
			where
				"guild_id" = ${inputRaw.guild_id}
				and "channel_id" = ${inputRaw.channel_id}
				and "user_id" = ${inputRaw.user_id}
			returning *
			`,
		).get() as UserLiveSessionRaw | undefined

		if (!liveSessionRaw) throw new Error('Live session not found')

		// second, insert the session into the user_sessions table.
		const sessionRaw = this.stmt(
			sql`
			insert into "user_sessions" (guild_id, channel_id, user_id, start_time, end_time)
			values (${liveSessionRaw.guild_id}, ${liveSessionRaw.channel_id}, ${liveSessionRaw.user_id}, ${liveSessionRaw.start_time}, ${inputRaw.last_time})
			returning *
			`,
		).get() as UserSessionRaw | undefined

		if (!sessionRaw)
			throw new Error('Failed to retrieve newly created user session')

		return toUserSession(sessionRaw)
	}

	public archiveCurrentUserLiveSession(
		input: Pick<UserLiveSession, 'guildId' | 'channelId' | 'userId'>,
	): UserSession {
		// first, find the row. if it doesn't exist, throw.
		const liveSessionRaw = this.stmt(
			sql`
			delete from "user_live_sessions"
			where
				"guild_id" = ${input.guildId}
				and "channel_id" = ${input.channelId}
				and "user_id" = ${input.userId}
			returning *
			`,
		).get() as UserLiveSessionRaw | undefined

		if (!liveSessionRaw) throw new Error('Live session not found')

		// second, insert the session into the user_sessions table.
		const sessionRaw = this.stmt(
			sql`
			insert into "user_sessions" (guild_id, channel_id, user_id, start_time, end_time)
			values (${liveSessionRaw.guild_id}, ${liveSessionRaw.channel_id}, ${liveSessionRaw.user_id}, ${liveSessionRaw.start_time}, ${liveSessionRaw.last_time})
			returning *
			`,
		).get() as UserSessionRaw | undefined

		if (!sessionRaw)
			throw new Error('Failed to retrieve newly created user session')

		return toUserSession(sessionRaw)
	}

	public startUserSession(
		userId: string,
		guildId: string,
		channelId: string,
	): number {
		const startTime = Date.now()

		this.stmt(
			sql`
			insert into "user_sessions" (guild_id, channel_id, user_id, start_time)
			values (${guildId}, ${channelId}, ${userId}, ${startTime})
			`,
		).run()

		return startTime
	}

	public endUserSession(userId: string, guildId: string, channelId: string) {
		const row = this.stmt(
			sql`
			select "id", "start_time" from "user_sessions"
			where
				"guild_id" = ${guildId}
				and "channel_id" = ${channelId}
				and "user_id" = ${userId}
				and "end_time" is null
			order by "start_time" desc
			limit 1
		`,
		).get() as
			| {
					id: number
					start_time: number
			  }
			| undefined

		if (row) {
			const endTime = Date.now()

			this.stmt(
				sql`
				update "user_sessions"
				set "end_time" = ${endTime}
				where "id" = ${row.id}
			`,
			).run()

			return {
				startTime: row.start_time,
				endTime,
			}
		}

		return null
	}

	public getChannelSession(channelId: string): ChannelSession {
		const raw = this.stmt(
			sql`
			select "id", "start_time" from "channel_sessions"
			where
				"channel_id" = ${channelId}
				and "end_time" is null
			order by "start_time" desc
			limit 1
			`,
		).get() as ChannelSessionRaw | undefined

		if (!raw) throw new Error('Channel session not found')

		return toChannelSession(raw)
	}

	public startChannelSession(guildId: string, channelId: string): boolean {
		try {
			this.getChannelSession(channelId)
			return false
		} catch (error) {
			// Session not found, proceed to create
		}

		const startTime = Date.now()

		this.stmt(
			sql`
			insert into "channel_sessions" ("guild_id", channel_id, start_time)
			values (${guildId}, ${channelId}, ${startTime})
			`,
		).run()

		return true
	}

	public endChannelSession(channelId: string) {
		const existing = this.getChannelSession(channelId)

		const endTime = new Date()

		this.stmt(
			sql`
			update "channel_sessions"
			set "end_time" = ${dateToUnix(endTime)}
			where "id" = ${existing.id}
			`,
		).run()

		return {
			startTime: existing.startTime,
			endTime,
		}
	}

	public getUserStats(
		userId: string,
		guildId: string,
	): {
		start_time: number
		end_time: number
	}[] {
		return this.stmt(
			sql`
			select "start_time", "end_time" from "user_sessions"
			where
				"guild_id" = ${guildId}
				and "user_id" = ${userId}
				and "end_time" is not null
			`,
		).all() as {
			start_time: number
			end_time: number
		}[]
	}

	public getGuildLeaderboard(guildId: string): LeaderboardEntry[] {
		return this.stmt(
			sql`
			select "user_id", sum("end_time" - "start_time") as total_duration
			from "user_sessions"
			where
				"guild_id" = ${guildId}
				and "end_time" is not null
			group by "user_id"
			offset 0 rows fetch next 10 rows only
			`,
		).all() as LeaderboardEntry[]
	}

	public close() {
		this.logger.info('Closing database connection...')
		this.db.close()
	}
}
