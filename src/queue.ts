import TelegramBot from "node-telegram-bot-api";
import { DB } from "./db";


export class Queue {
    public readonly bot: TelegramBot;
    public readonly db: DB;
    private runKey: number = 0;

    constructor(bot: TelegramBot, db: DB) {
        this.bot = bot;
        this.db = db;
    }

    async start() {
        this.runKey = await this.db.getMessageQueueRunKey();

        setInterval(() => {
            this.executeTasks();
        }, 1000); // 每秒检查一次任务是否需要执行
    }

    private async executeTasks() {
        var data = await this.db.getMessageQueueByKey(this.runKey);
        if (data) {
            var message = '';
            switch (data.type) {
                case "swap-success":
                    // 时间 监控用户 用户地址 交易哈希
                    message = `[✅] 监控用户：${data.data.monitor}

地址为：*${data.data.address}*
[✅] 兑换成功，交易哈希为：*${data.data.txId}*`;
                    break;
                case "swap-error":
                    message = `[✅] 监控用户：${data.data.monitor}

地址为：*${data.data.address}*
[❌] 兑换失败，错误信息为：*${data.data.error}*`;
                    break;
                default:
                    message = '未知类型';
                    break;
            }

            this.bot.sendMessage(data.user, message, {
                parse_mode: 'Markdown',
            });

            this.runKey++;
            this.db.editMessageQueueRunKey(this.runKey);
        }
    }
}