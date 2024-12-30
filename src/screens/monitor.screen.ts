import TelegramBot from "node-telegram-bot-api";
import { UserMonitorService } from "../services/user.monitor.service";
import { ADD_MONITOR } from "../bot.opts";
import { MsgLogService } from "../services/msglog.service";
import { UserService } from "../services/user.service";
import { sendUsernameRequiredNotification } from "./common.screen";
import { MonitorService } from "../services/monitor.service";
import { getUserByUsername } from "../services/twitter.service";

export const MonitorScreenHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message
) => {
  try {
    const { id: chat_id } = msg.chat;
    const frequency = await UserService.getFrequency(chat_id);

    const caption = `<b>LeekTrade</b>\n\n` +
      `<b>您当前监控速率: ${frequency} </b>\n\n` +
      `速率：是指每隔几秒查询一次\n` +
      `查询一次1积分\n` +
      `例如 4 就是每隔4秒查询一次\n` +
      `速率越低查询的频率越高建议4~6\n\n` +
      `监控点击下面的按钮进行修改`;

    const reply_markup = await getReplyOptionsForMonitor(
      chat_id,
    );

    await bot.sendMessage(chat_id, caption, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup
    });

  } catch (e) {
    console.log("~MonitorScreenHandler~", e);
  }
};

export const addMonitorHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message
) => {
  try {
    const chat_id = msg.chat.id;
    const username = msg.chat.username;
    const user = await UserService.findOne({ username });
    if (!user) return;

    const sentMessage = await bot.sendMessage(chat_id, ADD_MONITOR, {
      parse_mode: "HTML",
      reply_markup: {
        force_reply: true,
      },
    });

    await MsgLogService.create({
      username,
      wallet_address: user.wallet_address,
      chat_id,
      msg_id: sentMessage.message_id,
      parent_msgid: msg.message_id,
    });
  } catch (e) {
    console.log("~ setCustomFeeScreenHandler ~", e);
  }
};

export const setMonitorHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  monitor_string: string,
  reply_message_id: number
) => {
  try {
    const { id: chat_id, username } = msg.chat;
    if (!username) {
      await sendUsernameRequiredNotification(bot, msg);
      return;
    }

    var monitor_name = monitor_string;
    var type = "twitter";

    //如果是推特链接，则获取用户名
    if (monitor_string.includes("x.com")) {
      const username = monitor_string.split("/")[3];
      monitor_name = username;
    }
    console.log("~ monitor_name ~", monitor_name);

    //如果Db中monitor不存在，就创建一个
    const monitor = await MonitorService.findOne({ monitor_name });
    if (!monitor) {
      // 检查推特用户是否存在
      try {
        const user = await getUserByUsername(monitor_name);
        if (user.status != "active") {
          bot.sendMessage(chat_id, `推特用户 @${monitor_name} 不存在`);
          return;
        }
        await MonitorService.create({
          monitor_name,
          type,
        });
      } catch (e) {
        bot.sendMessage(chat_id, `网络异常，请稍后重试`);
        return;
      }
    }

    const userMonitor = await UserMonitorService.findOne({ chat_id, monitor_name });
    // 判断是否存在
    if (userMonitor) {
      bot.sendMessage(chat_id, `你已经在监控 @${monitor_name}`);
      return;
    }

    await UserMonitorService.create({
      chat_id,
      monitor_name,
      status: true,
    });

    // //更新推特光标
    // await this.monitor.getUserTwitterHandles(monitor_name, true)
    // if (!this.monitor.isUserMonitored(chatId, monitor_name)) {
    //   await this.monitor.addUserFromMonitor(chatId, monitor_name);
    // }

    const sentSuccessMsg = await bot.sendMessage(
      chat_id,
      "✅ 监控成功",
    );
    const reply_markup = await getReplyOptionsForMonitor(
      chat_id,
    );

    //获取父ID
    const log = await MsgLogService.findOne({
      chat_id,
      msg_id: reply_message_id,
    });
    console.log("~ reply_message_id ~", reply_message_id);
    console.log("~ message_id ~", msg.message_id);
    console.log("~ log ~", log);

    setTimeout(() => {
      bot.deleteMessage(chat_id, sentSuccessMsg.message_id);
    }, 3000);

    setTimeout(() => {
      bot.deleteMessage(chat_id, reply_message_id);
      bot.deleteMessage(chat_id, msg.message_id);

      if (log && log.parent_msgid) {
        bot.editMessageReplyMarkup(reply_markup, {
          message_id: log.parent_msgid,
          chat_id: chat_id,
        });
      }

    }, 2000);
  } catch (e) {
    console.log("~ setMonitorHandler ~", e);
  }
};

export const getReplyOptionsForMonitor = async (
  chat_id: number,
) => {

  //获取用户监控列表
  const userMonitors = await UserMonitorService.find({ chat_id });

  const reply_markup = {
    inline_keyboard: [
      ...userMonitors.map((userMonitor) => {
        const { chat_id, monitor_name, status } = userMonitor;
        return [
          {
            text: `${status ? "🟢" : "🔴"} ${monitor_name}`,
            callback_data: JSON.stringify({
              command: `monitor_${monitor_name}`,
            }),
          },
          {
            text: `${status ? "📌 关闭" : "🪄 开启"}`,
            callback_data: JSON.stringify({
              command: `usemonitor_${monitor_name}`,
            }),
          },
          {
            text: `❌ 删除`,
            callback_data: JSON.stringify({
              command: `delmonitor_${monitor_name}`,
            }),
          },
        ];
      }),
      [
        {
          text: "💳 添加监控",
          callback_data: JSON.stringify({
            command: "add_monitor",
          }),
        },
        {
          text: `🛠 设置`,
          callback_data: JSON.stringify({
            command: "settings",
          }),
        },
      ],
      [
        {
          text: `❌ 关闭`,
          callback_data: JSON.stringify({
            command: "dismiss_message",
          }),
        },
      ],
    ],
  };

  return reply_markup;
};

export const useMonitorHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  monitor_name: string,
) => {
  try {
    const { id: chat_id } = msg.chat;
    const userMonitor = await UserMonitorService.findOne({ chat_id, monitor_name });
    if (!userMonitor) return;

    await UserMonitorService.updateOne({
      id: userMonitor.id,
      status: !userMonitor.status
    });

    const reply_markup = await getReplyOptionsForMonitor(
      chat_id,
    );
    bot.editMessageReplyMarkup(reply_markup, {
      message_id: msg.message_id,
      chat_id: chat_id,
    });
  } catch (e) {
    console.log("~ useMonitorHandler ~", e);
  }
};

export const delMonitorHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  monitor_name: string,
) => {
  try {
    const { id: chat_id } = msg.chat;
    const userMonitor = await UserMonitorService.deleteOne({ chat_id, monitor_name });
    if (!userMonitor) return;

    const reply_markup = await getReplyOptionsForMonitor(
      chat_id,
    );
    bot.editMessageReplyMarkup(reply_markup, {
      message_id: msg.message_id,
      chat_id: chat_id,
    });
  } catch (e) {
    console.log("~ useMonitorHandler ~", e);
  }
};