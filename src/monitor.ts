import { Keypair, PublicKey } from "@solana/web3.js";
import { Twitter } from "./twitter";
import { DB } from "./db";
import { Swap } from "./swap";
import bs58 from 'bs58'

export interface TwitterConfig {
    appKey: string,
    appSecret: string,
    accessToken: string,
    accessSecret: string,
}

export class Monitor {
    public readonly twitter: Twitter;
    public readonly db: DB;

    // 用于记录用户推特监控信息
    public monitoredUsers: string[] = []; // 用户监控的推特用户名
    public userTwitterHandles: { [key: string | number]: string } = {};  // 存储用户 Telegram ID 和对应的推特用户名


    constructor(twitter: Twitter, db: DB) {
        this.twitter = twitter
        this.db = db;
    }

    // 监控推特用户的推文
    public async start() {
        // 获取监控的推特用户名
        const twitterHandles = await this.db.getMonitorAll();
        if (twitterHandles) {
            // 筛选出键值下数组不为空的
            this.monitoredUsers = Object.keys(twitterHandles).filter(key => twitterHandles[key].length > 0);
        }

        setInterval(async () => {
            for (let username of this.monitoredUsers) {
                try {
                    console.log(`${Date.now()} monitor: ${username} start`);
                    const tweets: any = await this.twitter.fetchTwitterUserTweets(username);
                    for (let tweet of tweets) {
                        // 检查推文中是否包含 Solana 地址（简单通过公共地址的模式进行判断）
                        const solanaRegex = /[A-Za-z0-9]{32,44}/g;
                        var solanaAddresses = tweet.text.match(solanaRegex);

                        // 测试数据
                        // var username = 'xiaomucrypto';
                        // var tweet = {
                        //     tweet_id: '1234567',
                        // };
                        // var solanaAddresses = ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];

                        //数组删除重复
                        solanaAddresses = solanaAddresses.filter((element: any, i: any) => i === solanaAddresses.indexOf(element))

                        if (solanaAddresses) {
                            for (let address of solanaAddresses) {
                                if (PublicKey.isOnCurve(new PublicKey(address))) {
                                    await this.db.editMonitorLogs(username, { id: tweet.tweet_id, address: address, time: Date.now() });
                                    console.log(`Found Solana address in tweet: ${address}`);
                                    // 执行 Raydium 交易（这里进行实际交易操作）

                                    //被监控的用户 交易地址 =》监控的用户们的地址 交易地址 =》 多任务swap 交易
                                    var users = await this.db.getMonitor(username)

                                    // 遍历用户列表，获取每个用户的推特用户名
                                    for (const user of users) {
                                        //获取用户地址私钥和配置
                                        const userConfig = await this.db.getUser(user);

                                        console.log('user', user);
                                        console.log('userConfig', userConfig);

                                        const buyer: Keypair = Keypair.fromSecretKey(bs58.decode(userConfig.walletKey));
                                        try {
                                            const txId = await Swap(buyer, address, {
                                                amount: parseFloat(userConfig.settingAmount),
                                                slippage: parseFloat(userConfig.settingSlippage),
                                                gas: parseFloat(userConfig.settingGas),
                                                tip: parseFloat(userConfig.settingTip),
                                            });
                                            // 记录交易日志
                                            await this.db.editTxLogs(user, { monitor: username, address: address, time: Date.now(), txId: txId });
                                            // 添加消息提醒
                                            await this.db.editMessageQueueList({
                                                user: user,
                                                type: 'swap-success',
                                                time: Date.now(),
                                                data: {
                                                    txId: txId,
                                                    monitor: username,
                                                    address: address,
                                                },
                                            });
                                        } catch (e) {
                                            console.error('swap error', e);

                                            var message = '';
                                            if (typeof e === "string") {
                                                message = e.toUpperCase(); // Error: XX
                                            } else if (e instanceof Error) {
                                                message = e.message // works, `e` narrowed to Error
                                            }

                                            // 添加消息提醒
                                            await this.db.editMessageQueueList({
                                                user: user,
                                                type: 'swap-error',
                                                time: Date.now(),
                                                data: {
                                                    monitor: username,
                                                    address: address,
                                                    error: message,
                                                },
                                            });
                                        }
                                    }
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

    // 验证用户是否在监控列表中
    public isUserMonitored(twitterName: string): boolean {
        return this.monitoredUsers.includes(twitterName);
    }

    // 增加用户到监控列表
    public async addUserToMonitor(userId: number | string, twitterName: string): Promise<void> {
        this.monitoredUsers.push(twitterName);
        this.userTwitterHandles[userId] = twitterName;
    }
}