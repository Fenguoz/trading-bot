import TelegramBot from "node-telegram-bot-api";
import { PROXY_URL, TELEGRAM_BOT_API_TOKEN, USE_PROXY } from "./config";
import { BotMenu } from "./bot.opts";
import { callbackQueryHandler } from "./controllers/callback.handler";
import { messageHandler } from "./controllers/message.handler";
import { WelcomeScreenHandler } from "./screens/welcome.screen";
import { UserService } from "./services/user.service";
import { settingScreenHandler } from "./screens/settings.screen";
import { MonitorScreenHandler } from "./screens/monitor.screen";
import { runMonitorUserSchedule } from "./cron/monitor.user.cron";
import { runSOLPriceUpdateSchedule } from "./cron/sol.price.cron";
import { WalletScreenHandler } from "./screens/wallet.screen";

const token = TELEGRAM_BOT_API_TOKEN;

if (!token) {
  throw new Error(
    "TELEGRAM_BOT API_KEY is not defined in the environment variables"
  );
}

export interface ReferralIdenticalType {
  referrer: string;
  chatId: string;
  messageId: string;
  channelName: string;
}

const startTradeBot = () => {
  const bot = new TelegramBot(token, {
    polling: true,
    request: {
      ...USE_PROXY ? {
        proxy: PROXY_URL,
      } : {},
      url: "https://api.telegram.org",
    }
  });
  runMonitorUserSchedule(bot);
  // runSOLPriceUpdateSchedule();
  bot.setMyCommands(BotMenu);

  // bot callback
  bot.on(
    "callback_query",
    async function onCallbackQuery(callbackQuery: TelegramBot.CallbackQuery) {
      callbackQueryHandler(bot, callbackQuery);
    }
  );

  // bot message
  bot.on("message", async (msg: TelegramBot.Message) => {
    messageHandler(bot, msg);
  });

  // bot commands
  bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
    // Need to remove "/start" text
    bot.deleteMessage(msg.chat.id, msg.message_id);

    await WelcomeScreenHandler(bot, msg);
    const referralcode = UserService.extractUniqueCode(msg.text ?? "");
    if (referralcode && referralcode !== "") {
      // store info
      const chat = msg.chat;
      if (chat.username) {
        const data = await UserService.findLastOne({ username: chat.username });
        if (data && data.referral_code && data.referral_code !== "") return;
        await UserService.updateMany(
          { username: chat.username },
          {
            referral_code: referralcode,
            referral_date: new Date(),
          }
        );
      }
    }
  });
  bot.onText(/\/wallet/, async (msg: TelegramBot.Message) => {
    await WalletScreenHandler(bot, msg);
  });
  bot.onText(/\/monitor/, async (msg: TelegramBot.Message) => {
    await MonitorScreenHandler(bot, msg);
  });
  bot.onText(/\/settings/, async (msg: TelegramBot.Message) => {
    await settingScreenHandler(bot, msg);
  });
};

export default startTradeBot;
