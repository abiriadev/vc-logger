import type { Client, Snowflake } from 'discord.js'

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
