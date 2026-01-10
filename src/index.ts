import {
	Client,
	Events,
	GatewayIntentBits,
	ChannelType,
	TextChannel,
	VoiceChannel,
	REST,
	Routes,
	SlashCommandBuilder,
} from 'discord.js'
import { Logger } from 'tslog'
import * as db from './db.js'

const log = new Logger({ name: 'bot' })

const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID

if (!TOKEN || !CLIENT_ID) {
	log.fatal('Missing environment variables. Please check README.')
	process.exit(1)
}

// Initialize DB
db.initDb()

const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
})

// Commands
const commands = [
	new SlashCommandBuilder()
		.setName('stats')
		.setDescription('View voice stats')
		.addUserOption(option =>
			option
				.setName('target')
				.setDescription('The user')
				.setRequired(false),
		),
	new SlashCommandBuilder()
		.setName('leaderboard')
		.setDescription('View server voice leaderboard'),
].map(command => command.toJSON())

const rest = new REST({ version: '10' }).setToken(TOKEN)

client.once(Events.ClientReady, async c => {
	log.info(`Ready! Logged in as ${c.user.tag}`)

	try {
		log.info('Started refreshing application (/) commands.')
		if (GUILD_ID) {
			log.info(`Registering commands to specific guild: ${GUILD_ID}`)
			await rest.put(
				Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
				{
					body: commands,
				},
			)
		} else {
			log.info('Registering commands globally (multi-guild support).')
			await rest.put(Routes.applicationCommands(CLIENT_ID), {
				body: commands,
			})
		}
		log.info('Successfully reloaded application (/) commands.')
	} catch (error) {
		log.error(error)
	}
})

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return

	if (interaction.commandName === 'stats') {
		const targetUser =
			interaction.options.getUser('target') || interaction.user
		const stats = db.getUserStats(targetUser.id, interaction.guildId!)

		let totalMs = 0
		const history: Record<string, number> = {} // Date -> Duration ms

		const now = new Date()
		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

		stats.forEach(s => {
			const date = new Date(s.start_time)
			if (date >= thirtyDaysAgo) {
				const dateStr = date.toISOString().split('T')[0]
				if (dateStr) {
					const duration = s.end_time - s.start_time
					totalMs += duration
					history[dateStr] = (history[dateStr] || 0) + duration
				}
			}
		})

		// Generate "Github-like" calendar with emojis
		// This is a simplified text representation
		let calendar = ''
		for (let i = 29; i >= 0; i--) {
			const d = new Date()
			d.setDate(d.getDate() - i)
			const dStr = d.toISOString().split('T')[0]

			if (dStr) {
				const dur = history[dStr] || 0

				// Emoji scale based on hours
				const hours = dur / (1000 * 60 * 60)
				if (hours === 0) calendar += '⬜'
				else if (hours < 1) calendar += '🟨'
				else if (hours < 4) calendar += '🟧'
				else calendar += '🟥'
			}

			if (i % 7 === 0 && i !== 0) calendar += '\n' // Break line occasionally for formatting? Or just a line.
		}

		const totalHours = (totalMs / (1000 * 60 * 60)).toFixed(2)

		await interaction.reply({
			content: `**Stats for ${targetUser.username}** (Last 30 Days)\nTotal Time: ${totalHours} hours\n\nActivity:\n${calendar}`,
		})
	}

	if (interaction.commandName === 'leaderboard') {
		const lb = db.getGuildLeaderboard(interaction.guildId!)
		const lines = lb.map((entry, index) => {
			const hours = (entry.total_duration / (1000 * 60 * 60)).toFixed(1)
			return `${index + 1}. <@${entry.user_id}> - ${hours} hrs`
		})
		await interaction.reply(
			`**Leaderboard**\n${lines.join('\n') || 'No data yet.'}`,
		)
	}
})

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
	const guildId = newState.guild.id
	const userId = newState.member?.id

	if (!userId) return

	// channelId is null if left, string if joined
	const oldChannelId = oldState.channelId
	const newChannelId = newState.channelId

	if (oldChannelId === newChannelId) return // No change (e.g. mute toggle)

	// Handle Leave logic (oldChannelId is set)
	if (oldChannelId) {
		const result = db.endUserSession(userId, guildId, oldChannelId)

		// Check if channel is now empty
		const channel = oldState.channel // Should be available in cache usually
		if (channel) {
			// Log "User left"
			if (channel instanceof VoiceChannel) {
				try {
					await channel.send(
						`${oldState.member?.user.username} left VC.`,
					)
				} catch (e) {
					// Ignore missing permissions or non-text channel errors
				}
			}

			if (channel.members.size === 0) {
				const channelSession = db.endChannelSession(oldChannelId)
				if (channelSession) {
					const durationMs =
						channelSession.endTime - channelSession.startTime

					// Format duration
					const seconds = Math.floor((durationMs / 1000) % 60)
					const minutes = Math.floor((durationMs / (1000 * 60)) % 60)
					const hours = Math.floor(durationMs / (1000 * 60 * 60))
					const durationStr = `${hours}h ${minutes}m ${seconds}s`

					// Log to 'corresponding' text channel
					if (channel instanceof VoiceChannel) {
						// Try to send to the voice channel itself (Text-in-Voice)
						// Or look for a text channel with same name?
						// User said: "Priority 2 ... no fallback". "Corresponding channel of every voice channel".
						// Assuming Text-In-Voice first.
						try {
							await channel.send(
								`VC ended. ~ ${durationStr} lasted.`,
							)
						} catch (e) {
							log.warn(
								`Could not send 'VC Ended' message to channel ${channel.name} (${channel.id}).`,
							)
						}
					}
				}
			}
		}
	}

	// Handle Join logic (newChannelId is set)
	if (newChannelId) {
		db.startUserSession(userId, guildId, newChannelId)

		// Check if channel session needs starting
		const channel = newState.channel
		if (channel) {
			const started = db.startChannelSession(guildId, newChannelId)

			// If we started a new session, or maybe just on every user join?
			// "logs message on VC join/leave" - User requirement 1.
			// Requirement 1 says "logs message on VC join/leave".
			// It implies INDIVIDUAL join/leave logs? Or just "session ended"?
			// Req 2 says "if the last person leaves... VC ended".
			// Req 1 says "logs message on VC join/leave".

			// I will log "User joined" as well.
			try {
				if (channel instanceof VoiceChannel) {
					await channel.send(
						`${newState.member?.user.username} joined VC.`,
					)
				}
			} catch (e) {
				log.warn(
					`Could not send 'User joined' message to channel ${channel.name} (${channel.id}).`,
				)
			}
		}
	}
})

client.login(TOKEN)
