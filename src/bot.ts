import {
	Client,
	type ClientOptions,
	Events,
	REST,
	Routes,
	SlashCommandBuilder,
	EmbedBuilder,
	VoiceChannel,
	type Interaction,
	VoiceState,
	ChatInputCommandInteraction,
} from 'discord.js'
import { Logger } from 'tslog'
import { Storage } from './db'
import { formatDateISO, formatDurationHMS, getPastDate } from './utils'

export interface BotConfig {
	token: string
	clientId: string
	guildId?: string
}

export class Bot extends Client {
	private config: BotConfig
	private logger: Logger<unknown>
	private storage: Storage

	constructor(
		options: ClientOptions,
		config: BotConfig,
		logger: Logger<unknown>,
		storage: Storage,
	) {
		super(options)
		this.config = config
		this.logger = logger
		this.storage = storage
		this.registerEvents()
	}

	private registerEvents() {
		this.once(Events.ClientReady, this.onReady.bind(this))
		this.on(Events.InteractionCreate, this.onInteraction.bind(this))
		this.on(Events.VoiceStateUpdate, this.onVoiceStateUpdate.bind(this))
	}

	private async onReady() {
		if (!this.user) return
		this.logger.info(`Ready! Logged in as ${this.user.tag}`)
		await this.registerCommands()
	}

	private async registerCommands() {
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

		const rest = new REST({ version: '10' }).setToken(this.config.token)

		try {
			this.logger.info('Started refreshing application (/) commands.')
			if (this.config.guildId) {
				this.logger.info(
					`Registering commands to specific guild: ${this.config.guildId}`,
				)
				await rest.put(
					Routes.applicationGuildCommands(
						this.config.clientId,
						this.config.guildId,
					),
					{
						body: commands,
					},
				)
			} else {
				this.logger.info(
					'Registering commands globally (multi-guild support).',
				)
				await rest.put(
					Routes.applicationCommands(this.config.clientId),
					{
						body: commands,
					},
				)
			}
			this.logger.info('Successfully reloaded application (/) commands.')
		} catch (error) {
			this.logger.error(error)
		}
	}

	private async onInteraction(interaction: Interaction) {
		if (!interaction.isChatInputCommand()) return

		if (interaction.commandName === 'stats') {
			await this.commandStats(interaction)
		} else if (interaction.commandName === 'leaderboard') {
			await this.commandLeaderboard(interaction)
		}
	}

	private async commandStats(interaction: ChatInputCommandInteraction) {
		const targetUser =
			interaction.options.getUser('target') || interaction.user
		const stats = this.storage.getUserStats(
			targetUser.id,
			interaction.guildId!,
		)

		let totalMs = 0
		const history: Record<string, number> = {} // Date -> Duration ms

		const thirtyDaysAgo = getPastDate(30)

		stats.forEach(s => {
			const date = new Date(s.start_time)
			if (date >= thirtyDaysAgo) {
				const dateStr = formatDateISO(date)
				if (dateStr) {
					if (s.end_time) {
						const duration = s.end_time - s.start_time
						totalMs += duration
						history[dateStr] = (history[dateStr] || 0) + duration
					}
				}
			}
		})

		// Generate "Github-like" calendar with emojis
		// This is a simplified text representation
		let calendar = ''
		for (let i = 29; i >= 0; i--) {
			const d = getPastDate(i)
			const dStr = formatDateISO(d)

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

	private async commandLeaderboard(interaction: ChatInputCommandInteraction) {
		const lb = this.storage.getGuildLeaderboard(interaction.guildId!)
		const lines = lb.map((entry, index) => {
			const hours = (entry.total_duration / (1000 * 60 * 60)).toFixed(1)
			return `${index + 1}. <@${entry.user_id}> - ${hours} hrs`
		})
		await interaction.reply(
			`**Leaderboard**\n${lines.join('\n') || 'No data yet.'}`,
		)
	}

	private async onVoiceStateUpdate(
		oldState: VoiceState,
		newState: VoiceState,
	) {
		const guildId = newState.guild.id
		const userId = newState.member?.id

		if (!userId) return

		// channelId is null if left, string if joined
		const oldChannelId = oldState.channelId
		const newChannelId = newState.channelId

		if (oldChannelId === newChannelId) return // No change (e.g. mute toggle)

		const now = new Date()

		// Handle Leave logic (oldChannelId is set)
		if (oldChannelId) {
			this.storage.endUserLiveSession({
				guildId,
				channelId: oldChannelId,
				userId,
				lastTime: now,
			})

			// Check if channel is now empty
			const channel = oldState.channel // Should be available in cache usually
			if (channel) {
				// Log "User left"
				if (channel instanceof VoiceChannel) {
					try {
						await channel.send({
							embeds: [
								new EmbedBuilder()
									.setDescription(
										`<@${oldState.member?.user.id}>(${oldState.member?.displayName})님이 떠나셨어요.`,
									)
									.setColor(`#e74c3c`),
							],
						})
					} catch (e) {
						// Ignore missing permissions or non-text channel errors
					}
				}

				if (channel.members.size === 0) {
					const channelSession =
						this.storage.endChannelSession(oldChannelId)
					if (channelSession && channelSession.endTime) {
						const durationMs =
							channelSession.endTime.getTime() -
							channelSession.startTime.getTime()

						// Format duration
						const durationStr = formatDurationHMS(durationMs)

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
								this.logger.warn(
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
			this.storage.startUserLiveSession({
				guildId,
				channelId: newChannelId,
				userId,
				startTime: now,
			})

			// Check if channel session needs starting
			const channel = newState.channel
			if (channel) {
				const started = this.storage.startChannelSession(
					guildId,
					newChannelId,
				)

				// If we started a new session, or maybe just on every user join?
				// "logs message on VC join/leave" - User requirement 1.
				// Requirement 1 says "logs message on VC join/leave".
				// It implies INDIVIDUAL join/leave logs? Or just "session ended"?
				// Req 2 says "if the last person leaves... VC ended".
				// Req 1 says "logs message on VC join/leave".

				// I will log "User joined" as well.
				try {
					if (channel instanceof VoiceChannel) {
						await channel.send({
							embeds: [
								new EmbedBuilder()
									.setDescription(
										`<@${newState.member.user.id}>(${newState.member.displayName})님이 입장하셨어요!`,
									)
									.setColor(`#2ecc71`),
							],
						})
					}
				} catch (e) {
					this.logger.warn(
						`Could not send 'User joined' message to channel ${channel.name} (${channel.id}).`,
					)
				}
			}
		}
	}

	public override async login() {
		return super.login(this.config.token)
	}
}
