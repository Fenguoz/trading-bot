import cron from "node-cron";
import { PublicKey } from "@solana/web3.js";
import { UserMonitorService } from "../services/user.monitor.service";
import { UserService } from "../services/user.service";
import { fetchTwitterUserTweets } from "../services/twitter.service";
import { MonitorService } from "../services/monitor.service";
import { runMultitasking } from "../utils/task";
import { autoBuyHandler } from "../screens/trade.screen";
import { UserTradeSettingService } from "../services/user.trade.setting.service";
import { TokenService } from "../services/token.metadata";
import TelegramBot from "node-telegram-bot-api";
import { MonitorLogService } from "../services/monitor.log.service";

interface MonitoredData {
  monitorUser: string,
  userConfig: [
    {
      userId: number,
      frequency: number,
      lastRunTime: number,
    }
  ]
}

var monitoredData: MonitoredData[] = []; // 存储用户的监控任务
var currentTime: number; // 当前时间（每秒更新）
var twitterHandlesLock: string[] = [];
var bot: TelegramBot;

const EVERY_1_MIN = "*/1 * * * * *";
export const runMonitorUserSchedule = async (telegramBot: TelegramBot) => {
  bot = telegramBot;
  const userMonitors = await UserMonitorService.find({ 'status': true });

  if (userMonitors.length > 0) {
    var _monitoredData: { [key: string]: MonitoredData } = {}

    for (let userMonitor of userMonitors) {
      const { chat_id, monitor_name } = userMonitor;
      console.log(chat_id, monitor_name);

      //判断是否开启自动购买
      const user = await UserService.findOne({ chat_id });
      if (!user || !user.auto_buy) {
        continue;
      }
      const frequency = user.frequency ?? '4';
      if (!_monitoredData[monitor_name]) {
        _monitoredData[monitor_name] = {
          monitorUser: monitor_name,
          userConfig: [{
            userId: Number(chat_id),
            frequency: Number(frequency),
            lastRunTime: Date.now(),
          }]
        };
      } else {
        _monitoredData[monitor_name].userConfig.push({
          userId: Number(chat_id),
          frequency: Number(frequency),
          lastRunTime: Date.now(),
        });
      }
    }

    monitoredData = Object.values(_monitoredData);
  }

  try {
    cron
      .schedule(EVERY_1_MIN, () => {
        currentTime = Date.now();
        monitorUser();
      })
      .start();
  } catch (error) {
    console.error(
      `Error running the Schedule Job for fetching the chat data: ${error}`
    );
  }
};

const monitorUser = async () => {
  try {
    // 遍历所有用户和他们的任务配置
    monitoredData.forEach(async (_monitoredData) => {
      //验证当前有效用户
      var validUsers: number[] = [];

      _monitoredData.userConfig.forEach((_userConfig) => {
        const elapsed = currentTime - _userConfig.lastRunTime;

        // 如果当前时间与任务的间隔时间匹配，则执行任务
        if (elapsed >= (_userConfig.frequency * 1000)) {
          validUsers.push(_userConfig.userId);

          //扣除用户积分
          //...

          _userConfig.lastRunTime = currentTime; // 更新任务的最后执行时间
        }
      });

      // 没有有效用户
      if (validUsers.length == 0) {
        // console.log(`${Date.now()} monitor: ${_monitoredData.monitorUser} no valid user`);
        return;
      }
      console.log('monitor', _monitoredData.monitorUser);
      console.log('validUsers', validUsers);

      //根据速率优先级排序
      //...

      // 执行监控
      var username = _monitoredData.monitorUser;
      console.log(`${Date.now()} monitor: ${username} start`);
      const { timeline: tweets, monitor_tweet_id: latestTweetId } = await getUserTwitterHandles(username);
      console.log('tweets', tweets);

      for (let tweet of tweets) {
        // 判断当前推文是否执行 被锁
        if (twitterHandlesLock.includes(tweet.tweet_id)) {
          console.log(`${Date.now()} monitor: ${username} tweet ${tweet.tweet_id} is locked`);
          continue;
        }
        // 检查当前推文是否已经处理过
        if (latestTweetId && tweet.tweet_id <= latestTweetId) {
          return;
        }

        // 锁定当前推文
        twitterHandlesLock.push(tweet.tweet_id);

        // 检查推文中是否包含 Solana 地址（简单通过公共地址的模式进行判断）
        const solanaRegex = /[A-Za-z0-9]{32,44}/g;
        var solanaAddresses = tweet.text.match(solanaRegex);
        if (!solanaAddresses) {
          continue;
        }

        //数组删除重复
        solanaAddresses = solanaAddresses.filter((element: any, i: any) => i === solanaAddresses.indexOf(element))
        if (!solanaAddresses) {
          continue;
        }
        for (let address of solanaAddresses) {
          // 检查地址是否为有效的 Solana 地址
          if (!PublicKey.isOnCurve(new PublicKey(address))) {
            continue;
          }

          await MonitorLogService.create({
            monitor_name: username,
            monitor_tweet_id: tweet.tweet_id,
            chat_ids: validUsers,
            address: address,
            type: 'twiiter',
          });
          await handleMonitor(username, address, validUsers);
        }

        // 释放锁定当前推文
        twitterHandlesLock.splice(twitterHandlesLock.indexOf(tweet.tweet_id), 1);
      }
    });
  } catch (e) {
    console.log("🚀 ~ Monitor user cron job ~ Failed", e);
  }
};

// 处理监控
export const handleMonitor = async (username: string, address: string, validUsers: number[]) => {
  console.log(`Found Solana address in tweet: ${address}`);

  var tasks = [];
  for (const chat_id of validUsers) {
    tasks.push(() => handleSwap(chat_id, username, address));
  }

  await runMultitasking(Array.from(tasks), 8)
    .then(async (results) => {
      console.log(`${Date.now()} Monitor ${username} address ${address}:`, results)
    })
    .catch((error) => console.error('Error during tasks execution:', error));
}

// 处理交易
export const handleSwap = async (chat_id: number, username: string, mint: string) => {
  // 获取用户地址私钥和配置
  const user = await UserService.findOne({ chat_id });
  if (!user) {
    return false;
  }

  const slippageSetting = await UserTradeSettingService.getSlippage(chat_id); // , mint
  const gasSetting = await UserTradeSettingService.getGas(chat_id);
  const { slippage } = slippageSetting;
  const gasvalue = UserTradeSettingService.getGasValue(gasSetting);
  const solbalance = await TokenService.getSOLBalance(user.wallet_address);
  const autoBuyAmount = parseFloat(user.auto_buy_amount);
  try {
    await autoBuyHandler(
      bot,
      user,
      mint,
      autoBuyAmount,
      solbalance,
      gasvalue,
      slippage
    );
    return true;
  } catch (e) {
    console.log("~ handleSwap ~", e);
    return false;
  }
}

export const getUserTwitterHandles = async (username: string, isRefresh: boolean = false) => {
  const monitor = await MonitorService.findOne({ monitor_name: username });
  if (!monitor) {
    return { timeline: [], monitor_tweet_id: 0 };
  }
  const { id, monitor_cursor } = monitor;
  const data: any = await fetchTwitterUserTweets(username, monitor_cursor);
  if (data.timeline.length > 0) {
    // 更新用户的 cursor
    if (isRefresh) {
      await MonitorService.updateOne({
        id,
        monitor_cursor: data.prev_cursor,
        monitor_tweet_id: data.timeline[0].tweet_id,
      });
    } else {
      await MonitorService.updateOne({
        id,
        monitor_cursor: data.prev_cursor,
      });
    }
  }

  return {
    timeline: data.timeline,
    monitor_tweet_id: monitor.monitor_tweet_id,
  }
}

// 验证用户是否在监控列表中
export const isUserMonitored = async (userId: number, twitterName: string): Promise<boolean> => {
  // 检查用户是否在监控列表中
  for (const _monitoredData of monitoredData) {
    if (_monitoredData.monitorUser === twitterName) {
      for (const _userConfig of _monitoredData.userConfig) {
        if (_userConfig.userId === userId) {
          return true;
        }
      }
    }
  }
  return false;
}

// 移除用户从监控列表中
export const removeUserFromMonitor = async (userId: number, twitterName: string): Promise<void> => {
  for (const _monitoredData of monitoredData) {
    if (_monitoredData.monitorUser === twitterName) {
      for (const _userConfig of _monitoredData.userConfig) {
        if (_userConfig.userId === userId) {
          _monitoredData.userConfig.splice(_monitoredData.userConfig.indexOf(_userConfig), 1);
          break;
        }
      }
    }
  }
}

// 移除用户从所有监控列表中
export const removeUserFromMonitorAll = async (userId: number): Promise<void> => {
  for (const _monitoredData of monitoredData) {
    for (const _userConfig of _monitoredData.userConfig) {
      if (_userConfig.userId === userId) {
        _monitoredData.userConfig.splice(_monitoredData.userConfig.indexOf(_userConfig), 1);
        break;
      }
    }
  }
}

//根据用户开启监控
export const addUserMonitor = async (chat_id: number): Promise<void> => {
  const userMonitors = await UserMonitorService.find({ chat_id, status: true });
  if (userMonitors.length > 0) {
    for (const userMonitor of userMonitors) {
      const { monitor_name } = userMonitor;

      if (await isUserMonitored(chat_id, monitor_name)) {
        continue;
      }
      await addUserFromMonitor(chat_id, monitor_name);
    }
  }
}

// 增加用户到监控列表
export const addUserFromMonitor = async (chat_id: number, twitterName: string): Promise<void> => {
  var flag = false;
  const frequency = await UserService.getFrequency(chat_id);
  for (const _monitoredData of monitoredData) {
    if (_monitoredData.monitorUser === twitterName) {
      _monitoredData.userConfig.push({
        userId: chat_id,
        frequency,
        lastRunTime: Date.now(),
      });
      flag = true;
    }
  }
  if (!flag) {
    monitoredData.push({
      monitorUser: twitterName,
      userConfig: [{
        userId: chat_id,
        frequency,
        lastRunTime: Date.now(),
      }],
    });
  }
}