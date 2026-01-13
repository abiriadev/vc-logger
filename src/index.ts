import { GatewayIntentBits } from 'discord.js'
import { Logger } from 'tslog'
import { Storage } from './db'
import { Bot, type BotConfig } from './bot'
import { env } from 'node:process'

const LOG_LEVEL = env.LOG_LEVEL ? parseInt(env.LOG_LEVEL, 10) : undefined

const logger = new Logger({
	minLevel: LOG_LEVEL,
})

if (env['DISCORD_TOKEN'] === undefined) {
	logger.fatal(
		'Missing environment variable DISCORD_TOKEN. Please check README.',
	)
	process.exit(1)
}

const DISCORD_TOKEN = env['DISCORD_TOKEN']

if (env['CLIENT_ID'] === undefined) {
	logger.fatal('Missing environment variable CLIENT_ID. Please check README.')
	process.exit(1)
}
const CLIENT_ID = env['CLIENT_ID']

if (env['GUILD_ID'] === undefined) {
	logger.fatal('Missing environment variable GUILD_ID. Please check README.')
	process.exit(1)
}
const GUILD_ID = env['GUILD_ID']

const DB_PATH = process.env.DB_PATH || 'vc_logger.db'

// Initialize DB
const storage = new Storage(DB_PATH, logger)

// Init Bot
const botConfig: BotConfig = {
	token: DISCORD_TOKEN,
	clientId: CLIENT_ID,
	guildId: GUILD_ID,
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
