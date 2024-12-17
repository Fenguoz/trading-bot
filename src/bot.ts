import TelegramBot from "node-telegram-bot-api";
import { DB } from "./db";
import { Monitor } from "./monitor";
import { Twitter } from "./twitter";
import { Keypair } from "@solana/web3.js";
import * as redis from 'redis';
import bs58 from 'bs58'
import { Queue } from "./queue";

export interface BotConfig {
  token: string,
  twitter: {
    appKey: string,
    appSecret: string,
    accessToken: string,
    accessSecret: string,
  },
  redis: {
    host: string,
    port: number,
  },
  db: {
    filePath: string,
  },
}

export class Bot {
  public readonly bot: TelegramBot;
  public readonly twitter: Twitter;
  public readonly db: DB;
  public readonly queue: Queue;
  public readonly redis: redis.RedisClientType;
  public readonly monitor: Monitor;

  constructor(config: BotConfig) {
    this.bot = new TelegramBot(config.token, {
      polling: true,
      // request: {
      //   proxy: 'http://127.0.0.1:1087',
      //   url: "https://api.telegram.org",
      // }
    });
    this.twitter = new Twitter({
      appKey: config.twitter.appKey,
      appSecret: config.twitter.appSecret,
      accessToken: config.twitter.accessToken,
      accessSecret: config.twitter.accessSecret,
    });
    this.db = new DB(config.db.filePath);
    this.redis = redis.createClient({
      url: `redis://${config.redis.host}:${config.redis.port}`
    });

    this.monitor = new Monitor(this.twitter, this.db);
    this.queue = new Queue(this.bot, this.db);
  }

  public start() {
    // Redis start
    this.redis.connect();
    // Monitor tool start
    this.monitor.start();
    // 启动队列
    this.queue.start();

    // 监听消息并处理相关命令
    this.bot.on('message', async (msg) => {
      console.log('Received message:', msg);
      const chatId = msg.chat.id;
      // const messageId = msg.message_id;
      const receivedMessage = msg.text || '';

      if (receivedMessage == '/start') {
        //判断是否已经注册
        if (await this.db.userExists(chatId)) {
          await this.db.editUser(chatId, { loginTime: Date.now() });
        } else {
          await this.db.editUser(chatId, {
            wallet: '',
            walletKey: '',
            loginTime: Date.now(),
            registerTime: Date.now(),
            integral: '0',
            settingAmount: '0.01',
            settingGas: '0.0005',
            settingTip: '0.0001',
            settingFrequency: '4',
            settingSlippage: '20',
            state: '',
          }, true);
        }

        var message = `监控推文自动购买代币机器人SOL版✅

发送推特用户名，即可自动监控推文
一旦检测到推文中包含合约地址或者pump链接
立即自动购买，可以让你始终快人一步
再也不需要时时刻刻盯着屏幕了

使用方法 发送带@的推特用户名，例如@elonmusk 

目前只支持SOL链

此外新增了邀请返佣奖励✨
邀请一名用户奖励10积分和百分之10的充值返佣

点击下面的按钮进入设置或者邀请好友`;

        //         var message = `邀请返佣👑

        // 每邀请一个用户都会获得10积分
        // 用户充值的百分之10将作为返佣（sol）
        // 充值1sol返佣0.1sol

        // 满足0.5sol即可提现💰

        // 你可以通过这个链接邀请好友: 👇👇
        // https://t.me/Aiptptest_bot?start=${chatId}`;

        var option = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '设置', callback_data: '/setting' }
              ],
              [
                { text: '个人资料', callback_data: '/info' },
                { text: '提现收益', callback_data: '/withdraw' }
              ]
            ]
          }
        }

        this.bot.sendMessage(chatId, message, option);
      } else if (receivedMessage === '/wallet') {
        //判断用户是否已生成过地址
        var user = await this.db.getUser(chatId);
        console.log('user', user);
        if (user.wallet) {
          var message = `你已经创建过钱包了，请勿重复创建。`;
          this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '重新创建钱包', callback_data: '/new_wallet' }]]
            }
          });
        } else {
          // 生成 Solana 钱包
          const wallet = this.generateSolanaWallet();

          // 将用户信息储存到本地json文件中
          await this.db.editUser(chatId, { wallet: wallet.publicKey, walletKey: wallet.secretKey });

          // // 将用户钱包信息添加到 Redis 队列
          // await this.redis.lPush('user_wallets', JSON.stringify({
          //   chatId: chatId,
          //   publicKey: wallet.publicKey,
          //   secretKey: wallet.secretKey,
          // }));

          var message = `*务必保管好私钥，一旦删除将无法找回❗️❗️*
  
  钱包地址：${wallet.publicKey}
  私钥 ：${wallet.secretKey}`;

          this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
          });
        }
      } else if (receivedMessage.startsWith('@')) { // 用户发送 @用户名，监控推特
        const twitterName = receivedMessage.substring(1);
        console.log('twitterName', twitterName)

        //如果Db中monitor不存在，就创建一个
        if (!await this.db.monitorExists(twitterName)) {
          // 检查推特用户是否存在
          const user = await this.twitter.getUserByUsername(twitterName);
          if (user.status != "active") {
            this.bot.sendMessage(chatId, `推特用户 @${twitterName} 不存在`);
            return;
          } else {
            //更新推特光标
            this.monitor.getUserTwitterHandles(twitterName)
          }
          await this.db.editMonitor(twitterName, [chatId]);
        }

        // 检查用户是否已经在监控列表中
        if (await this.db.userMonitorExists(chatId)) {
          var data = await this.db.getUserMonitor(chatId);
          if (data.includes(twitterName)) {
            this.bot.sendMessage(chatId, `你已经在监控 @${twitterName}`);
            return;
          }
        }
        await this.db.editUserMonitor(chatId, [twitterName]);

        if (!this.monitor.isUserMonitored(twitterName)) {
          this.monitor.addUserToMonitor(chatId, twitterName);
          this.bot.sendMessage(chatId, `开始监控推特用户 @${twitterName}`);
        } else {
          this.bot.sendMessage(chatId, `你已经在监控 @${twitterName}`);
        }
      }
      else {
        var state = await this.db.getUserState(chatId)
        console.log('state', state)
        if (state == 'settingAmount' || state == 'settingGas' || state == 'settingFrequency' || state == 'settingSlippage' || state == 'settingTip') {
          await this.db.setUserState(chatId, '');
          await this.db.editUser(chatId, { [state]: receivedMessage });

          var user = await this.db.getUser(chatId);

          var message = `${state} 已更新为: ${receivedMessage}


购买设置👇

购买的金额：${user.settingAmount} SOL
gas费：${user.settingGas} SOL
小费：${user.settingTip} SOL
滑点：${user.settingSlippage}%
速率：${user.settingFrequency}
积分：${user.integral}

点击下面的按钮进行修改`;

          this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '金额', callback_data: '/settingAmount' },
                ],
                [
                  { text: 'gas费', callback_data: '/settingGas' },
                  { text: '小费', callback_data: '/settingTip' },
                ],
                [
                  { text: '速率', callback_data: '/settingFrequency' },
                  { text: '滑点', callback_data: '/settingSlippage' },
                ],
                [
                  { text: '个人资料', callback_data: '/info' },
                  { text: '邀请好友', callback_data: '/invite' },
                ],
              ]
            }
          })
        } else {
          this.bot.sendMessage(chatId, `你说的是: ${receivedMessage}`);
        }
      }
    });
    this.bot.on("callback_query", async (query) => {
      console.log('callback_query:', query);
      const { data } = query; // Extract the callback data
      const chatId = query.from.id;
      const messageId = query.message?.message_id;

      if (data === "/new_wallet") {
        const wallet = this.generateSolanaWallet();

        // 将用户信息储存到本地json文件中
        await this.db.editUser(chatId, { wallet: wallet.publicKey, walletKey: wallet.secretKey });

        // // 将用户钱包信息添加到 Redis 队列
        // await this.redis.lPush('user_wallets', JSON.stringify({
        //   chatId: chatId,
        //   publicKey: wallet.publicKey,
        //   secretKey: wallet.secretKey,
        // }));

        var message = `*务必保管好私钥，一旦删除将无法找回❗️❗️*

钱包地址：${wallet.publicKey}
私钥 ：${wallet.secretKey}`;

        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
        });
      } else if (data === "/setting") {
        var user = await this.db.getUser(chatId);

        var message = `购买设置👇

购买的金额：${user.settingAmount} SOL
gas费：${user.settingGas} SOL
小费：${user.settingTip} SOL
滑点：${user.settingSlippage}%
速率：${user.settingFrequency}
积分：${user.integral}

速率：是指每隔几秒查询一次
查询一次1积分
例如 4 就是每隔4秒查询一次
速率越低查询的频率越高建议4~6
点击下面的按钮进行修改`;

        this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '金额', callback_data: '/settingAmount' },
              ],
              [
                { text: 'gas费', callback_data: '/settingGas' },
                { text: '小费', callback_data: '/settingTip' },
              ],
              [
                { text: '速率', callback_data: '/settingFrequency' },
                { text: '滑点', callback_data: '/settingSlippage' },
              ],
              [
                { text: '个人资料', callback_data: '/info' },
                { text: '邀请好友', callback_data: '/invite' },
              ],
            ]
          }
        });
      } else if (data === "/settingAmount") {
        this.db.setUserState(chatId, 'settingAmount');
        var message = `请输入购买的金额：`;
        this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        });
      } else if (data === "/settingGas") {
        this.db.setUserState(chatId, 'settingGas');
        var message = `请输入gas费：`;
        this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        });
      } else if (data === "/settingTip") {
        this.db.setUserState(chatId, 'settingTip');
        var message = `请输入小费：`;
        this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        });
      } else if (data === "/settingFrequency") {
        this.db.setUserState(chatId, 'settingFrequency');
        var message = `请输入速率`;
        this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        });
      } else if (data === "/settingSlippage") {
        this.db.setUserState(chatId, 'settingSlippage');
        var message = `请输入滑点`;
        this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
        });
      } else {
        this.bot.sendMessage(chatId, `你说的是: ${data}`);
      }
    });

    this.bot.on("polling_error", (msg) => console.log(msg));
  }

  generateSolanaWallet() {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toBase58(),
      secretKey: bs58.encode(keypair.secretKey),
    };
  }

}