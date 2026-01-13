import { GatewayIntentBits } from 'discord.js'
import { Logger } from 'tslog'
import { Storage } from './db'
import { Bot, type BotConfig } from './bot'
import { env } from 'node:process'
import z from 'zod'

const configSchema = z.object({
	LOG_LEVEL: z.coerce.number().int(),
	DISCORD_TOKEN: z.string(),
	CLIENT_ID: z.string(),
	GUILD_ID: z.string().optional(),
	DB_PATH: z.string().default('vc_logger.db'),
})

const config = configSchema.parse(env)

const logger = new Logger({ minLevel: config.LOG_LEVEL })

// Initialize DB
const storage = new Storage(config.DB_PATH, logger)

// Init Bot
const botConfig: BotConfig = {
	token: config.DISCORD_TOKEN,
	clientId: config.CLIENT_ID,
	guildId: config.GUILD_ID,
}

const bot = new Bot(
	{
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
	},
	botConfig,
	logger,
	storage,
)

bot.login()

const destroy = async () => {
	logger.info('Gracefully shutting down...')

	await bot.destroy()

	logger.info('Bye')
}

process.on('SIGINT', destroy)
process.on('SIGTERM', destroy)
