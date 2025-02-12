import { Keypair, PublicKey } from "@solana/web3.js";
import { Twitter } from "./twitter";
import { DB } from "./db";
import { Swap } from "./swap";
import bs58 from 'bs58'
import { runMultitasking } from './utils/task';

export interface TwitterConfig {
    appKey: string,
    appSecret: string,
    accessToken: string,
    accessSecret: string,
}

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

export class Monitor {
    public readonly twitter: Twitter;
    public readonly db: DB;

    // 用于记录用户推特监控信息
    public monitoredUsers: string[] = []; // 用户监控的推特用户名
    private currentTime: number; // 当前时间（每秒更新）
    public monitoredData: MonitoredData[] = []; // 存储用户的监控任务
    public userTwitterHandles: { [key: string | number]: string } = {};  // 存储用户 Telegram ID 和对应的推特用户名

    // 编辑推特ID唯一锁
    private twitterHandlesLock: string[] = [];

    constructor(twitter: Twitter, db: DB) {
        this.twitter = twitter
        this.db = db;
        this.currentTime = Date.now();
    }

    // 监控推特用户的推文
    async start() {
        // 获取监控的推特用户名
        const twitterHandles = await this.db.getMonitorAll();
        if (twitterHandles) {
            //整理存储用户的监控任务数据
            for (const key in twitterHandles) {
                if (twitterHandles.hasOwnProperty(key)) {
                    const userIds = twitterHandles[key];
                    var userConfig: any = [];
                    for (const userId of userIds) {
                        var user = await this.db.getUser(userId);

                        userConfig.push({
                            userId: userId,
                            frequency: user.settingFrequency,
                            lastRunTime: Date.now(),
                        });
                    }
                    this.monitoredData.push({
                        monitorUser: key,
                        userConfig: userConfig,
                    });
                }
            }
        }

        setInterval(() => {
            this.currentTime = Date.now();
            this.executeTasks();
        }, 1000); // 每秒检查一次任务是否需要执行
    }

    // 执行任务
    private executeTasks() {
        // 遍历所有用户和他们的任务配置
        this.monitoredData.forEach(async (_monitoredData) => {
            //验证当前有效用户
            var validUsers: number[] = [];

            _monitoredData.userConfig.forEach((_userConfig) => {
                const elapsed = this.currentTime - _userConfig.lastRunTime;

                // 如果当前时间与任务的间隔时间匹配，则执行任务
                if (elapsed >= (_userConfig.frequency * 1000)) {
                    validUsers.push(_userConfig.userId);

                    //扣除用户积分
                    //...

                    _userConfig.lastRunTime = this.currentTime; // 更新任务的最后执行时间
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
            const tweets: any = await this.getUserTwitterHandles(username);
            console.log('tweets', tweets);
            var latestTweetId = await this.db.getMonitorTwitterCursor(username);
            for (let tweet of tweets) {
                // 判断当前推文是否执行 被锁
                if (this.twitterHandlesLock.includes(tweet.tweet_id)) {
                    console.log(`${Date.now()} monitor: ${username} tweet ${tweet.tweet_id} is locked`);
                    continue;
                }
                // 检查当前推文是否已经处理过
                if (latestTweetId && tweet.tweet_id <= latestTweetId) {
                    return;
                }

                // 锁定当前推文
                this.twitterHandlesLock.push(tweet.tweet_id);

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

                    await this.db.editMonitorLogs(username, { id: tweet.tweet_id, address: address, time: Date.now() });
                    await this.handleMonitor(username, address, validUsers);
                }

                // 释放锁定当前推文
                this.twitterHandlesLock.splice(this.twitterHandlesLock.indexOf(tweet.tweet_id), 1);
            }
        });
    }

    // 验证用户是否在监控列表中
    public isUserMonitored(userId: number, twitterName: string): boolean {
        // 检查用户是否在监控列表中
        for (const _monitoredData of this.monitoredData) {
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
    public async removeUserFromMonitor(userId: number, twitterName: string): Promise<void> {
        for (const _monitoredData of this.monitoredData) {
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
    public async removeUserFromMonitorAll(userId: number): Promise<void> {
        for (const _monitoredData of this.monitoredData) {
            for (const _userConfig of _monitoredData.userConfig) {
                if (_userConfig.userId === userId) {
                    _monitoredData.userConfig.splice(_monitoredData.userConfig.indexOf(_userConfig), 1);
                    break;
                }
            }
        }
    }

    // 增加用户到监控列表
    public async addUserFromMonitor(userId: number, twitterName: string): Promise<void> {
        var flag = false;
        const user = await this.db.getUser(userId);
        for (const _monitoredData of this.monitoredData) {
            if (_monitoredData.monitorUser === twitterName) {
                _monitoredData.userConfig.push({
                    userId: userId,
                    frequency: user.settingFrequency,
                    lastRunTime: Date.now(),
                });
                flag = true;
            }
        }
        if (!flag) {
            this.monitoredData.push({
                monitorUser: twitterName,
                userConfig: [{
                    userId: userId,
                    frequency: user.settingFrequency,
                    lastRunTime: Date.now(),
                }],
            });
        }
    }

    // 处理监控
    public async handleMonitor(username: string, address: string, validUsers: (string | number)[]) {
        console.log(`Found Solana address in tweet: ${address}`);

        var tasks = [];
        for (const user of validUsers) {
            tasks.push(() => this.handleSwap(user, username, address));
        }

        await runMultitasking(Array.from(tasks), 8)
            .then(async (results) => {
                console.log(`${Date.now()} Monitor ${username} address ${address}:`, results)
            })
            .catch((error) => console.error('Error during tasks execution:', error));
    }

    // 处理交易
    public async handleSwap(user: (string | number), username: string, address: string) {
        //获取用户地址私钥和配置
        const userConfig = await this.db.getUser(user);
        const buyer: Keypair = Keypair.fromSecretKey(bs58.decode(userConfig.walletKey));

        try {
            const txId = await Swap(buyer, address, {
                amount: parseFloat(userConfig.settingAmount),
                slippage: parseFloat(userConfig.settingSlippage),
                gas: parseFloat(userConfig.settingGas),
                tip: parseFloat(userConfig.settingTip),
            });

            const timestamp = Date.now();
            // 记录交易日志
            await this.db.editTxLogs(user, { monitor: username, address: address, time: timestamp, txId: txId });
            // 添加消息提醒
            await this.db.editMessageQueue(timestamp, {
                user: user,
                type: 'swap-success',
                time: timestamp,
                data: {
                    txId: txId,
                    monitor: username,
                    address: address,
                },
            });

            return `user: ${user} txId: ${txId} `;
        } catch (e) {
            console.error('swap error', e);

            var message = '';
            if (typeof e === "string") {
                message = e.toUpperCase(); // Error: XX
            } else if (e instanceof Error) {
                message = e.message // works, `e` narrowed to Error
            }

            const timestamp = Date.now();
            // 添加消息提醒
            await this.db.editMessageQueue(timestamp, {
                user: user,
                type: 'swap-error',
                time: timestamp,
                data: {
                    monitor: username,
                    address: address,
                    error: message,
                },
            });
            return `user: ${user} error: ${message} `;
        }
    }

    async getUserTwitterHandles(username: string, isRefresh: boolean = false) {
        const cursor = await this.db.getMonitorCursor(username);
        const data: any = await this.twitter.fetchTwitterUserTweets(username, cursor);
        if (data.timeline.length > 0) {
            await this.db.editMonitorCursor(username, data.prev_cursor)
            if (isRefresh) {
                await this.db.editMonitorTwitterCursor(username, data.timeline[0].tweet_id)
            }
        }
        return data.timeline;
    }
}