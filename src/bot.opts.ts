export const BotMenu = [
  { command: 'start', description: 'Welcome' },
  { command: 'monitor', description: 'Monitor' },
  // { command: 'position', description: 'Positions' },
  { command: 'settings', description: 'Settings & Tools' },
];

export const BUY_XSOL_TEXT = `🌳Buy X SOL\n\n<i>💲 Enter SOL Value in format "0.05"</i>`;
export const PRESET_BUY_TEXT = `🌳预设购买SOL按钮 \n\n<i>💲 以“0.0X”格式输入 SOL 值</i>`;
export const AUTO_BUY_TEXT = `🌳自动购买 SOL 按钮 \n\n<i>💲 以“0.0X”格式输入 SOL 值</i>`;
export const SELL_XPRO_TEXT = `🌳Sell X %\n\n<i>💲 Enter X Value in format "25.5"</i>`;
export const WITHDRAW_XTOKEN_TEXT = `🌳Withdraw X token\n\n<i>💲 Enter X Value in format "25.5"</i>`;
export const SET_SLIPPAGE_TEXT = `滑点 X %\n\n<i>💲 以“2.5”格式输入 X 值</i>`;
export const SET_FREQUENCY_TEXT = `🌳 速率\n\n<i>💲 请输入速率值，例如"4"</i>`;
export const TradeBotID = process.env.GROWTRADE_BOT_ID;
export const WELCOME_REFERRAL = 'https://imgtr.ee/images/2024/04/22/24635465dd390956e0fb39857a66bab5.png';
export const BridgeBotID = process.env.BridgeBotID;

export const INPUT_SOL_ADDRESS = 'Please send your SOL payout address in solana network.';
export const SET_GAS_FEE = `🌳 自定义 GAS\n\n<i>💲 以“0.001”格式输入 SOL 值</i>`;
export const SET_JITO_FEE = `🌳 自定义 Fee Amount\n\n<i>💲 以“0.001”格式输入 SOL 值</i>`;

export const ADD_MONITOR = `🌳 添加监控\n\n<i>💲 您可发送推特的主页链接</i>`;

export const WITHDRAW_TOKEN_AMT_TEXT = `<i>🌳 Enter your receive wallet address</i>`;
export enum CommandEnum {
  CLOSE = "dismiss_message",
  Dismiss = "dismiss_message",
  REFRESH = "refresh"
}
