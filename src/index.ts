import { GatewayIntentBits } from 'discord.js'
import { Logger } from 'tslog'
import * as db from './db.js'
import { Bot, type BotConfig } from './bot.js'

const log = new Logger({ name: 'main' })

const TOKEN = process.env.DISCORD_TOKEN
const CLIENT_ID = process.env.CLIENT_ID
const GUILD_ID = process.env.GUILD_ID

if (!TOKEN || !CLIENT_ID) {
	log.fatal('Missing environment variables. Please check README.')
	process.exit(1)
}

// Initialize DB
db.initDb()

// Init Bot
const botConfig: BotConfig = {
	token: TOKEN,
	clientId: CLIENT_ID,
	guildId: GUILD_ID,
}

const bot = new Bot(
	{
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
	},
	botConfig,
	log,
)

bot.login()
