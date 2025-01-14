import TelegramBot from "node-telegram-bot-api";
import { UserService } from "../services/user.service";
import { fetchTokenAccountData, getTokenData } from "../utils/web3";
import { TokenService } from "../services/token.metadata";
import { RaydiumTokenService } from "../services/raydium.token.service";
import { getPriceInSOL } from "../raydium/raydium.service";

export const WalletScreenHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message
) => {
  try {
    const { id: chat_id, username } = msg.chat;
    const user = await UserService.findOne({ username });
    if (!user) {
      await bot.sendMessage(chat_id, `请先绑定钱包`);
      return;
    }

    const solbalance = await TokenService.getSOLBalance(user.wallet_address);
    var caption = `<b>LeekTrade</b>\n\n` +
      `💳 <b>Balance: ${solbalance.toFixed(6)} SOL</b>\n`;

    const tokenAccounts = await fetchTokenAccountData(user.wallet_address)
    var tokens = [] as any;
    for (const tokenAccount of tokenAccounts) {
      var _token = await getTokenData(tokenAccount.mint);
      if(!_token) continue;

      var tokenAsset = (tokenAccount.amount * _token.price).toFixed(4);
      caption += `💳 <b>Token: ${tokenAccount.amount} ${_token.symbol} ($ ${tokenAsset})</b>\n`

      tokens.push({
        mint: tokenAccount.mint,
        amount: tokenAccount.amount,
        symbol: _token.symbol,
        price: await getPriceInSOL(tokenAccount.mint)
      })
    }

    const reply_markup = await getReplyOptionsForWallet(
      chat_id,
      tokens
    );

    await bot.sendMessage(chat_id, caption, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup
    });

  } catch (e) {
    console.log("~WalletScreenHandler~", e);
  }
};

export const getReplyOptionsForWallet = async (
  chat_id: number,
  tokens: any[]
) => {

  const reply_markup = {
    inline_keyboard: [
      ...tokens.map((token) => {
        const { mint, amount, symbol, price } = token;
        return [
          {
            text: `🟢 ${symbol}`,
            callback_data: JSON.stringify({
              command: `token_${mint}`,
            }),
          },
          {
            text: `${amount}`,
            callback_data: JSON.stringify({
              command: `token_${mint}`,
            }),
          },
        ];
      }),
      [
        {
          text: "↩️ 返回",
          callback_data: JSON.stringify({
            command: "back_home",
          }),
        },
        {
          text: `❌ 关闭`,
          callback_data: JSON.stringify({
            command: "dismiss_message",
          }),
        },
      ],
    ],
  };

  return reply_markup;
};