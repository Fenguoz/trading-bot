import TelegramBot, {
  KeyboardButton,
  ReplyKeyboardMarkup,
} from "node-telegram-bot-api";
import { TradeBotID, WELCOME_REFERRAL } from "../bot.opts";
import { copytoclipboard } from "../utils";
import {
  get_referral_amount,
  get_referral_num,
} from "../services/referral.service";

export const showWelcomeReferralProgramMessage = async (
  bot: TelegramBot,
  chat: TelegramBot.Chat,
  uniquecode?: string
) => {
  try {
    const chatId = chat.id;
    const inlineKeyboards = [
      [
        {
          text: "管理付款 📄",
          callback_data: JSON.stringify({
            command: "payout_address",
          }),
        },
      ],
      [
        // {
        //   text: "Set up Alert Bot 🤖",
        //   callback_data: JSON.stringify({
        //     command: "alert_bot",
        //   }),
        // },
        {
          text: `❌ 关闭`,
          callback_data: JSON.stringify({
            command: "dismiss_message",
          }),
        },
      ],
    ];
    if (!uniquecode || uniquecode === "") {
      const reply_markup = {
        inline_keyboard: [
          [
            {
              text: "创建推荐代码 💰",
              callback_data: JSON.stringify({
                command: "create_referral_code",
              }),
            },
          ],
          ...inlineKeyboards,
        ],
      };

      const caption =
        `<b>🎉 欢迎加入推荐计划</b>\n\n` +
        `请创建一个唯一的推荐代码以开始使用👇.`;
      await bot.sendPhoto(chatId, WELCOME_REFERRAL, {
        caption: caption,
        reply_markup,
        parse_mode: "HTML",
      });
    } else {
      const reply_markup = {
        inline_keyboard: inlineKeyboards,
      };
      let num = await get_referral_num(uniquecode);
      let totalAmount = await get_referral_amount(uniquecode);
      const referralLink = `https://t.me/${TradeBotID}?start=${uniquecode}`;
      const contents =
        "<b>🎉 欢迎加入推荐计划</b>\n\n" +
        `<b>推荐您的朋友，可永久获得其费用的 25%！</b>\n\n` +
        `<b>推荐数量: ${num.num}\n已赚取 Sol: ${totalAmount.totalAmount}</b>\n\n` +
        `<b>您的推荐代码 🔖</b>\n${copytoclipboard(uniquecode)}\n\n` +
        `<b>您的推荐链接 🔗</b>\n${copytoclipboard(referralLink)}\n\n` +
        // `<i>Note: Don't forget set up payout address to get paid</i>\n\n` +
        `- 与您想要的任何人分享您的推荐链接，并从他们的交换中赚取收益 🔁\n` +
        `- 查看利润、支出并更改支出地址 📄\n`;

      await bot.sendPhoto(chatId, WELCOME_REFERRAL, {
        caption: contents,
        reply_markup,
        parse_mode: "HTML",
      });
    }
  } catch (e) {
    console.log("~ showWelcomeReferralProgramMessage Error ~", e);
  }
};
