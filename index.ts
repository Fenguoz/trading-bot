import TelegramBot from 'node-telegram-bot-api';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import * as redis from 'redis';
import { JsonDB, Config } from 'node-json-db';
import { Twitter } from './twitter';
import { Swap } from './swap';
import dotenv from 'dotenv';
dotenv.config();

// Swap();

// 第一个参数是数据库文件名。如果没有写扩展名，则默认为“.json”并自动添加。
// 第二个参数用于告诉数据库在每次推送后保存，如果设置false，则必须手动调用save()方法。
// 第三个参数是要求JsonDB以人类可读的格式保存数据库。（默认为false）
// 最后一个参数是分隔符。默认情况下为斜线（/） 
const db = new JsonDB(new Config("dataBase", true, false, '/'));

const redisHost = process.env.REDIS_HOST;
const reidsPort = process.env.REDIS_PORT;
const redisClient = redis.createClient({
  url: `redis://${redisHost}:${reidsPort}`
})
redisClient.connect()

const token = process.env.TELEGRAM_BOT_TOKEN ?? '';
const bot = new TelegramBot(token, {
  polling: true,
  request: {
    proxy: 'http://127.0.0.1:1087',
    url: "https://api.telegram.org",
  }
})

// Solana 连接
const rpc_endpoint = process.env.RPC_ENDPOINT ?? 'https://api.mainnet-beta.solana.com';
const connection = new Connection(rpc_endpoint);

// Twitter API 设置
const twitter = new Twitter({
  appKey: process.env.TWITTER_APP_KEY ?? '',
  appSecret: process.env.TWITTER_APP_SECRET ?? '',
  accessToken: process.env.TWITTER_ACCESS_TOKEN ?? '',
  accessSecret: process.env.TWITTER_ACCESS_SECRET ?? '',
});
// twitter.fetchTwitterUserTweets('elonmusk');


// 用于记录用户推特监控信息
let monitoredUsers: string[] = [];  // 用户监控的推特用户名
let userTwitterHandles: { [key: number]: string } = {};  // 存储用户 Telegram ID 和对应的推特用户名

// 生成 Solana 地址和私钥
function generateSolanaWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey.toString(),
    secretKey: Buffer.from(keypair.secretKey).toString('hex'),
  };
}

// 监控推特用户的推文
async function monitorTwitterAccounts() {
  // 获取监控的推特用户名
  const twitterHandles = await db.getData("/monitor");
  if (twitterHandles) {
    // 筛选出键值下数组不为空的
    var monitoredUsers = Object.keys(twitterHandles).filter(key => twitterHandles[key].length > 0);
  }

  setInterval(async () => {
    for (let username of monitoredUsers) {
      try {
        console.log(`${Date.now()} monitor: ${username} start`);
        const tweets: any = await twitter.fetchTwitterUserTweets(username);
        for (let tweet of tweets) {
          // 检查推文中是否包含 Solana 地址（简单通过公共地址的模式进行判断）
          const solanaRegex = /[A-Za-z0-9]{32,44}/g;
          const solanaAddresses = tweet.text.match(solanaRegex);
          if (solanaAddresses) {
            for (let address of solanaAddresses) {
              if (PublicKey.isOnCurve(new PublicKey(address))) {
                await db.push("/monitor/logs/" + username, { id: tweet.tweet_id, address: address, time: Date.now() }, false);
                console.log(`Found Solana address in tweet: ${address}`);
                // 执行 Raydium 交易（这里进行实际交易操作）
                // Swap();
              }
            }
          }
        }
        console.log(`${Date.now()} monitor: ${username} end`);
      } catch (error) {
        console.error(`Error fetching tweets for ${username}:`, error);
      }
    }
  }, 10000); // 每 10 秒检查一次
}

// 监听消息并处理相关命令
bot.on('message', async (msg) => {
  console.log('Received message:', msg);
  const chatId = msg.chat.id;
  const receivedMessage = msg.text || '';

  if (receivedMessage == '/start') {
    //判断是否已经注册
    if (await db.exists("/user/" + chatId)) {
      await db.push("/user/" + chatId, { loginTime: Date.now() }, false);
    } else {
      await db.push("/user/" + chatId, { wallet: '', loginTime: Date.now(), registerTime: Date.now() });
    }

    var message = `邀请返佣👑

每邀请一个用户都会获得10积分
用户充值的百分之10将作为返佣（sol）
充值1sol返佣0.1sol

满足0.5sol即可提现💰

你可以通过这个链接邀请好友: 👇👇
https://t.me/Aiptptest_bot?start=${chatId}`;

    var option = {
      reply_markup: {
        inline_keyboard: [[{ text: '设置', callback_data: '/setting' }, { text: '个人资料', callback_data: '/info' }, { text: '提现收益', callback_data: '/withdraw' }]]
      }
    }

    bot.sendMessage(chatId, message, option);
  } else if (receivedMessage === '/wallet') {
    //判断用户是否已生成过地址
    var user = await db.getData("/user/" + chatId);
    console.log('user', user);
    if (user.wallet) {
      var message = `你已经创建过钱包了，请勿重复创建。`;
      bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '重新创建钱包', callback_data: '/new_wallet' }]]
        }
      });
    } else {
      // 生成 Solana 钱包
      const wallet = generateSolanaWallet();

      // 将用户信息储存到本地json文件中
      await db.push("/user/" + chatId, { wallet: wallet.publicKey }, false);

      // 将用户钱包信息添加到 Redis 队列
      await redisClient.lPush('user_wallets', JSON.stringify({
        chatId: chatId,
        publicKey: wallet.publicKey,
        secretKey: wallet.secretKey,
      }));

      var message = `*务必保管好私钥，一旦删除将无法找回❗️❗️*
  
  钱包地址：${wallet.publicKey}
  私钥 ：${wallet.secretKey}`;

      bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    }
  } else if (receivedMessage.startsWith('@')) { // 用户发送 @用户名，监控推特
    const twitterName = receivedMessage.substring(1);
    console.log('twitterName', twitterName)

    //如果Db中monitor不存在，就创建一个
    if (!await db.exists("/monitor/" + twitterName)) {
      // 检查推特用户是否存在
      const user = await twitter.getUserByUsername(twitterName);
      if (user.status != "active") {
        bot.sendMessage(chatId, `推特用户 @${twitterName} 不存在`);
        return;
      }
      await db.push("/monitor/" + twitterName, [chatId], false);
    }

    // 检查用户是否已经在监控列表中
    if (await db.exists("/user_monitor/" + chatId)) {
      var data = await db.getData("/user_monitor/" + chatId);
      if (data.includes(twitterName)) {
        bot.sendMessage(chatId, `你已经在监控 @${twitterName}`);
        return;
      }
    }
    await db.push("/user_monitor/" + chatId, [twitterName], false);

    userTwitterHandles[chatId] = twitterName;
    if (!monitoredUsers.includes(twitterName)) {
      monitoredUsers.push(twitterName);
      bot.sendMessage(chatId, `开始监控推特用户 @${twitterName}`);
    } else {
      bot.sendMessage(chatId, `你已经在监控 @${twitterName}`);
    }
  }
  else {
    bot.sendMessage(chatId, `你说的是: ${receivedMessage}`);
  }
});
bot.on("callback_query", async (query) => {
  console.log('callback_query:', query);
  const { data } = query; // Extract the callback data
  const chatId = query.from.id;

  if (data === "/new_wallet") {
    const wallet = generateSolanaWallet();

    // 将用户信息储存到本地json文件中
    await db.push("/user/" + chatId, { wallet: wallet.publicKey }, false);

    // 将用户钱包信息添加到 Redis 队列
    await redisClient.lPush('user_wallets', JSON.stringify({
      chatId: chatId,
      publicKey: wallet.publicKey,
      secretKey: wallet.secretKey,
    }));

    var message = `*务必保管好私钥，一旦删除将无法找回❗️❗️*

钱包地址：${wallet.publicKey}
私钥 ：${wallet.secretKey}`;

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    });
  } else {
    bot.sendMessage(chatId, `你说的是: ${data}`);
  }
});

bot.on("polling_error", (msg) => console.log(msg));

// 启动推特监控
// monitorTwitterAccounts();
console.log('Telegram Bot is running...');
