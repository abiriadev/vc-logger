import type { Client, Snowflake } from 'discord.js'
import { subDays, format } from 'date-fns'

export type CamelCase<S extends string> =
	S extends `${infer P1}_${infer P2}${infer P3}`
		? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
		: Lowercase<S>

export type SnakeCase<S extends string> = S extends `${infer T}${infer U}`
	? `${T extends Uncapitalize<T> ? '' : '_'}${Lowercase<T>}${SnakeCase<U>}`
	: S

export type PartialMap<T, U> = {
	[K in keyof T as SnakeCase<string & K> & keyof U]: U[SnakeCase<string & K> &
		keyof U]
}

export const dateToUnix = (date: Date) => Math.floor(date.getTime() / 1000)

export const getPastDate = (days: number): Date => subDays(new Date(), days)

export const formatDateISO = (date: Date): string => format(date, 'yyyy-MM-dd')

export const formatDurationHMS = (ms: number): string => {
	const seconds = Math.floor((ms / 1000) % 60)
	const minutes = Math.floor((ms / (1000 * 60)) % 60)
	const hours = Math.floor(ms / (1000 * 60 * 60))

	return `${hours}h ${minutes}m ${seconds}s`
}

export async function fetchFullVoiceChannelMemberState(
	client: Client,
): Promise<Record<Snowflake, Record<Snowflake, Snowflake[]>>> {
	const guildRecords = []

	for (const [guildId, oauth2guild] of await client.guilds.fetch()) {
		const guild = await oauth2guild.fetch()

		const channels = await guild.channels.fetch()

		const vcs = channels.filter(channel => channel?.isVoiceBased())

		const channelRecords = []

		for (const [vcId, vc] of vcs) {
			channelRecords.push([vcId, vc?.members.map(member => member.id)])
		}

		guildRecords.push([guildId, Object.fromEntries(channelRecords)])
	}

	return Object.fromEntries(guildRecords)
}
