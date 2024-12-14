import { PublicKey } from "@solana/web3.js";
import { Twitter } from "./twitter";
import { DB } from "./db";

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
        const twitterHandles = await this.db.getMonitor();
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
                        const solanaAddresses = tweet.text.match(solanaRegex);
                        if (solanaAddresses) {
                            for (let address of solanaAddresses) {
                                if (PublicKey.isOnCurve(new PublicKey(address))) {
                                    await this.db.editMonitorLogs(username, { id: tweet.tweet_id, address: address, time: Date.now() });
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