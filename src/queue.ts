import TelegramBot from "node-telegram-bot-api";
import { DB } from "./db";


export class Queue {
    public readonly bot: TelegramBot;
    public readonly db: DB;

    constructor(bot: TelegramBot, db: DB) {
        this.bot = bot;
        this.db = db;
    }

    async start() {
        setInterval(() => {
            this.executeTasks();
        }, 1000); // 每秒检查一次任务是否需要执行
    }

    private async executeTasks() {
        var data = await this.db.getMessageQueueAll();
        if (data) {
            Object.values(data).forEach(async (v: any) => {
                await this.db.delMessageQueue(v.time);

                var message = '';
                switch (v.type) {
                    case "swap-success":
                        message = `[✅] 监控用户: *${v.data.monitor}*

地址为：*${v.data.address}*
[✅] 兑换成功，交易哈希为：*${v.data.txId}*`;
                        break;
                    case "swap-error":
                        message = `[✅] 监控用户: *${v.data.monitor}*

地址为：*${v.data.address}*
[❌] 兑换失败，错误信息为：*${v.data.error}*`;
                        break;
                    default:
                        message = '未知类型';
                        break;
                }

                await this.bot.sendMessage(v.user, message, {
                    parse_mode: 'Markdown',
                });
            });
        }
    }
}