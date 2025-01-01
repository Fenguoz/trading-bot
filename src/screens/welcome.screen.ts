import TelegramBot from "node-telegram-bot-api";
import { UserService } from "../services/user.service";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { copytoclipboard } from "../utils";
import { TokenService } from "../services/token.metadata";

const MAX_RETRIES = 5;
export const welcomeKeyboardList = [
  // [{ text: '🏦 Buy/Sell', command: 'buysell' }],
  // snipe_token, my_position
  // [
  //   { text: "🎯 Sniper [Soon]", command: "dummy_button" },
  //   { text: "📊 Positions", command: "position" },
  // ], // position
  // [{ text: '♻️ Withdraw', command: 'transfer_funds' }],
  // [{ text: "Burn: Off ♨️", command: `burn_switch` }],
  [
    // { text: "⛓ Bridge", command: "bridge" },
    { text: "🛠 设置 & 工具", command: "settings" },
  ],
  [{ text: "🎁 推荐计划", command: "referral" }],
  [{ text: "❌ 关闭", command: "dismiss_message" }],
];

export const WelcomeScreenHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message
) => {
  try {
    const { username, id: chat_id, first_name, last_name } = msg.chat;
    // check if bot
    if (!username) {
      bot.sendMessage(
        chat_id,
        "⚠️ You have no telegram username. Please take at least one and try it again."
      );
      return;
    }
    const user = await UserService.findOne({ username });
    // if new user, create one
    if (!user) {
      const res = await newUserHandler(bot, msg);
      if (!res) return;
    }
    // send welcome guide
    await welcomeGuideHandler(bot, msg);
    // await bot.deleteMessage(chat_id, msg.message_id);
  } catch (error) {
    console.log("-WelcomeScreenHandler-", error);
  }
};

const newUserHandler = async (bot: TelegramBot, msg: TelegramBot.Message) => {
  const { username, id: chat_id, first_name, last_name } = msg.chat;

  let retries = 0;
  let userdata: any = null;
  let private_key = "";
  let wallet_address = "";

  // find unique private_key
  do {
    const keypair = Keypair.generate();
    private_key = bs58.encode(keypair.secretKey);
    wallet_address = keypair.publicKey.toString();

    const wallet = await UserService.findOne({ wallet_address });
    if (!wallet) {
      // add
      const newUser = {
        chat_id,
        username,
        first_name,
        last_name,
        wallet_address,
        private_key,
      };
      userdata = await UserService.create(newUser); // true; //
    } else {
      retries++;
    }
  } while (retries < MAX_RETRIES && !userdata);

  // impossible to create
  if (!userdata) {
    await bot.sendMessage(
      chat_id,
      "Sorry, we cannot create your account. Please contact support team"
    );
    return false;
  }

  // send private key & wallet address
  const caption =
    `👋 欢迎!\n\n` +
    `已为您生成新钱包。这是您的钱包地址\n\n` +
    `${wallet_address}\n\n` +
    `<b>保存以下私钥</b>❗\n\n` +
    `<tg-spoiler>${private_key}</tg-spoiler>\n\n`;

  await bot.sendMessage(chat_id, caption, {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "* 忽略消息",
            callback_data: JSON.stringify({
              command: "dismiss_message",
            }),
          },
        ],
      ],
    },
  });
  return true;
};

export const welcomeGuideHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  replaceId?: number
) => {
  const { id: chat_id, username } = msg.chat;
  const user = await UserService.findOne({ username });

  if (!user) return;
  const solbalance = await TokenService.getSOLBalance(user.wallet_address);
  const caption =
    `<b>欢迎 | Beta 版本</b>\n\n` +
    `<b>💳 我的钱包:</b>\n${copytoclipboard(user.wallet_address)}\n\n` +
    `<b>💳 余额:</b> ${solbalance} SOL\n\n` +
    `<a href="https://solscan.io/address/${user.wallet_address}">查看浏览器</a>\n\n` +
    `<b>粘贴合约地址以触发买入/卖出菜单或选择一个选项开始。</b>`;

  const burn_fee = user.burn_fee;
  const reply_markup = {
    inline_keyboard: welcomeKeyboardList.map((rowItem) =>
      rowItem.map((item) => {
        if (item.command.includes("bridge")) {
          return {
            text: item.text,
            url: "https://t.me/growbridge_bot",
          };
        }
        if (item.text.includes("Burn")) {
          const burnText = `${burn_fee ? "Burn: On 🔥" : "Burn: Off ♨️"}`;
          return {
            text: burnText,
            callback_data: JSON.stringify({
              command: item.command,
            }),
          };
        }
        return {
          text: item.text,
          callback_data: JSON.stringify({
            command: item.command,
          }),
        };
      })
    ),
  };

  if (replaceId) {
    bot.editMessageText(caption, {
      message_id: replaceId,
      chat_id,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup,
    });
  } else {
    await bot.sendMessage(chat_id, caption, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup,
    });
  }
};
