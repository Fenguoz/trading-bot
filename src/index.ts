import dotenv from 'dotenv';
import { Bot } from './bot';
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const twitter = {
  appKey: process.env.TWITTER_APP_KEY ?? '',
  appSecret: process.env.TWITTER_APP_SECRET ?? '',
  accessToken: process.env.TWITTER_ACCESS_TOKEN ?? '',
  accessSecret: process.env.TWITTER_ACCESS_SECRET ?? '',
};
const redisHost = process.env.REDIS_HOST ?? 'localhost';
const reidsPort = process.env.REDIS_PORT ?? '6379';

// Bot start
new Bot({
  token,
  twitter,
  redis: { host: redisHost, port: parseInt(reidsPort) },
  db: { filePath: 'dataBase' }
}).start();
console.log('Telegram Bot is running...');