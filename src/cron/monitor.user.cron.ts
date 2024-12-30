import cron from "node-cron";
import { Keypair, PublicKey } from "@solana/web3.js";
import { UserMonitorService } from "../services/user.monitor.service";
import { UserService } from "../services/user.service";
import { fetchTwitterUserTweets } from "../services/twitter.service";
import { MonitorService } from "../services/monitor.service";

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

const EVERY_1_MIN = "*/5 * * * * *";
export const runMonitorUserSchedule = async () => {
  const userMonitors = await UserMonitorService.find({ 'status': true });

  if (userMonitors.length > 0) {
    var _monitoredData: { [key: string]: MonitoredData } = {}

    for (let userMonitor of userMonitors) {
      const { chat_id, monitor_name } = userMonitor;
      console.log(chat_id, monitor_name);
      const frequency = await UserService.getFrequency(Number(chat_id));
      if (!_monitoredData[monitor_name]) {
        _monitoredData[monitor_name] = {
          monitorUser: monitor_name,
          userConfig: [{
            userId: Number(chat_id),
            frequency,
            lastRunTime: Date.now(),
          }]
        };
      } else {
        _monitoredData[monitor_name].userConfig.push({
          userId: Number(chat_id),
          frequency,
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
        console.log(`${Date.now()} monitor: ${_monitoredData.monitorUser} no valid user`);
        return;
      }
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

          // await this.db.editMonitorLogs(username, { id: tweet.tweet_id, address: address, time: Date.now() });
          // await this.handleMonitor(username, address, validUsers);
        }

        // 释放锁定当前推文
        twitterHandlesLock.splice(twitterHandlesLock.indexOf(tweet.tweet_id), 1);
      }
    });
  } catch (e) {
    console.log("🚀 ~ Monitor user cron job ~ Failed", e);
  }
};

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