import TelegramBot from 'node-telegram-bot-api';
import { Keypair, Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TwitterApi } from 'twitter-api-v2';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Market } from '@project-serum/serum';
import * as redis from 'redis';
import { JsonDB, Config } from 'node-json-db';

// 第一个参数是数据库文件名。如果没有写扩展名，则默认为“.json”并自动添加。
// 第二个参数用于告诉数据库在每次推送后保存，如果设置false，则必须手动调用save()方法。
// 第三个参数是要求JsonDB以人类可读的格式保存数据库。（默认为false）
// 最后一个参数是分隔符。默认情况下为斜线（/） 
const db = new JsonDB(new Config("dataBase", true, false, '/'));

const redisClient = redis.createClient({
  url: 'redis://localhost:6379'
})
redisClient.connect()

// 替换为你的 Telegram Bot API Token
const token = '7080776148:AAFmsp1SOQqk3mZHDxK8CSGgaikBHg7Bl2A';
const bot = new TelegramBot(token, {
  polling: true,
  request: {
    proxy: 'http://127.0.0.1:1087',
    url: "https://api.telegram.org",
  }
})

// Solana 连接
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Twitter API 设置
const twitterClient = new TwitterApi({
  appKey: 'YOUR_TWITTER_API_KEY',
  appSecret: 'YOUR_TWITTER_API_SECRET',
  accessToken: '1082839400235626497-DqsvWbawh27tt9U4sRhwzR9DBOlHO8',
  accessSecret: 'bMrKQCpTUpJyKHjkaRp6XqbFGtRHULNrgWBJUVoY1SRDv',
});

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

// 获取推特用户的最新推文
async function fetchTwitterUserTweets(username: string) {
  const user = await twitterClient.v2.userByUsername(username);
  const tweets = await twitterClient.v2.userTimeline(user.data.id, { max_results: 5 });
  return tweets.data;
}

// 监控推特用户的推文
function monitorTwitterAccounts() {
  setInterval(async () => {
    for (let username of monitoredUsers) {
      try {
        const tweets: any = await fetchTwitterUserTweets(username);
        for (let tweet of tweets) {
          // 检查推文中是否包含 Solana 地址（简单通过公共地址的模式进行判断）
          const solanaRegex = /[A-Za-z0-9]{32,44}/g;
          const solanaAddresses = tweet.text.match(solanaRegex);
          if (solanaAddresses) {
            for (let address of solanaAddresses) {
              if (PublicKey.isOnCurve(new PublicKey(address))) {
                console.log(`Found Solana address in tweet: ${address}`);
                // 执行 Raydium 交易（这里进行实际交易操作）
                // await executeRaydiumSwap(address);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching tweets for ${username}:`, error);
      }
    }
  }, 10000); // 每 10 秒检查一次
}

// // 执行 Raydium Swap
// async function executeRaydiumSwap(address: string) {
//   console.log(`Executing Raydium Swap to buy 1 SOL using the address: ${address}`);

//   // 设置市场地址（根据 Raydium 相关市场配置修改）
//   const marketAddress = new PublicKey('RAYDIUM_MARKET_ADDRESS');  // Raydium 市场的地址
//   const market = await Market.load(connection, marketAddress, {}, TOKEN_PROGRAM_ID);

//   // 设置需要交易的 Token 对：例如 USDC -> SOL
//   const baseMintAddress = new PublicKey('USDC_MINT_ADDRESS');
//   const quoteMintAddress = new PublicKey('SOL_MINT_ADDRESS');

//   // 创建交易的相关账户
//   const payer = Keypair.generate();
//   const fromTokenAccount = await getOrCreateAssociatedTokenAccount(payer, baseMintAddress);
//   const toTokenAccount = await getOrCreateAssociatedTokenAccount(payer, quoteMintAddress);

//   // 创建交易指令
//   const transaction = new Transaction();
//   const price = 1;  // 假设我们交换 1 USDC
//   const instruction = await market.makePlaceOrderInstruction(
//     payer.publicKey,
//     {
//       side: 'buy',
//       price: price,
//       size: 1,  // 交换 1 SOL
//       orderType: 'limit',
//       clientId: Math.floor(Math.random() * 1000000),  // 随机的 client ID
//     }
//   );
//   transaction.add(instruction);

//   // 发送交易
//   const signature = await connection.sendTransaction(transaction, [payer], { skipPreflight: false, preflightCommitment: 'confirmed' });
//   console.log(`Swap transaction sent: ${signature}`);
// }

// // 获取或创建关联的 Solana 代币账户
// async function getOrCreateAssociatedTokenAccount(payer: Keypair, mintAddress: PublicKey) {
//   const associatedTokenAddress = await PublicKey.findProgramAddress(
//     [payer.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintAddress.toBuffer()],
//     ASSOCIATED_TOKEN_PROGRAM_ID
//   );

//   // 检查是否已经有这个账户
//   const accountInfo = await connection.getAccountInfo(associatedTokenAddress[0]);
//   if (accountInfo === null) {
//     // 如果没有账户，创建新的账户
//     const transaction = new Transaction().add(
//       SystemProgram.createAccount({
//         fromPubkey: payer.publicKey,
//         newAccountPubkey: associatedTokenAddress[0],
//         lamports: await connection.getMinimumBalanceForRentExemption(ACCOUNT_LAYOUT.span),
//         space: ACCOUNT_LAYOUT.span,
//         programId: TOKEN_PROGRAM_ID,
//       }),
//       Token.createInitAccountInstruction(
//         TOKEN_PROGRAM_ID,
//         mintAddress,
//         associatedTokenAddress[0],
//         payer.publicKey
//       )
//     );

//     await connection.sendTransaction(transaction, [payer], { skipPreflight: false, preflightCommitment: 'confirmed' });
//   }
//   return associatedTokenAddress[0];
// }

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
    const twitterHandle = receivedMessage.substring(1);
    console.log('twitterHandle', twitterHandle)

    // 检查用户是否已经在监控列表中
    if (await db.exists("/user_monitor/" + twitterHandle)) {
      var data = await db.getData("/user_monitor/" + twitterHandle);
      if (data.includes(chatId)) {
        bot.sendMessage(chatId, `你已经在监控 @${twitterHandle}`);
        return;
      } else {
        await db.push("/user_monitor/" + twitterHandle, chatId, false);
      }
    } else {
      // 检查推特用户是否存在
      const user = await twitterClient.v2.userByUsername(twitterHandle);
      console.log(user, 'user')
      if (!user) {
        bot.sendMessage(chatId, `推特用户 @${twitterHandle} 不存在`);
        return;
      }

      await db.push("/monitor/" + twitterHandle, { name: twitterHandle }, false);
      await db.push("/user_monitor/" + twitterHandle, chatId, false);
    }

    userTwitterHandles[chatId] = twitterHandle;
    if (!monitoredUsers.includes(twitterHandle)) {
      monitoredUsers.push(twitterHandle);
      bot.sendMessage(chatId, `开始监控推特用户 @${twitterHandle}`);
    } else {
      bot.sendMessage(chatId, `你已经在监控 @${twitterHandle}`);
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
