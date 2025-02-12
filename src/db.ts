import { JsonDB, Config } from 'node-json-db';

export class DB {
    public db: JsonDB;

    // 第一个参数是数据库文件名。如果没有写扩展名，则默认为“.json”并自动添加。
    // 第二个参数用于告诉数据库在每次推送后保存，如果设置false，则必须手动调用save()方法。
    // 第三个参数是要求JsonDB以人类可读的格式保存数据库。（默认为false）
    // 最后一个参数是分隔符。默认情况下为斜线（/） 
    constructor(filePath: string, autoload = true, saveOnPush = false, separator = '/') {
        this.db = new JsonDB(new Config(filePath, autoload, saveOnPush, separator));
    }

    public async userExists(userKey: string | number) {
        return await this.db.exists("/user/" + userKey);
    }
    public async getUser(userKey: string | number) {
        return await this.db.getData("/user/" + userKey);
    }
    public async editUser(userKey: string | number, params: any, isNew: boolean = false) {
        return await this.db.push("/user/" + userKey, params, isNew);
    }
    public async setUserState(userKey: string | number, params: any) {
        return await this.db.push("/user/" + userKey + "/state", params, false);
    }
    public async getUserState(userKey: string | number) {
        return await this.db.getData("/user/" + userKey + "/state");
    }

    public async monitorExists(userKey: string | number) {
        return await this.db.exists("/monitor/" + userKey);
    }
    public async getMonitorAll() {
        if (!await this.db.exists("/monitor")) {
            return [];
        }
        return await this.db.getData("/monitor");
    }
    public async getMonitor(username: string) {
        if (!await this.db.exists("/monitor/" + username)) {
            return [];
        }
        return await this.db.getData("/monitor/" + username);
    }
    public async editMonitor(username: string, params: any, override: boolean = false) {
        return await this.db.push("/monitor/" + username, params, override);
    }
    public async getMonitorCursor(username: string) {
        if (!await this.db.exists("/monitor_cursor/" + username)) {
            return '';
        }
        return await this.db.getData("/monitor_cursor/" + username);
    }
    public async editMonitorCursor(username: string, params: any) {
        return await this.db.push("/monitor_cursor/" + username, params);
    }
    public async getMonitorTwitterCursor(username: string) {
        if (!await this.db.exists("/monitor_twitter_cursor/" + username)) {
            return '';
        }
        return await this.db.getData("/monitor_twitter_cursor/" + username);
    }
    public async editMonitorTwitterCursor(username: string, params: any) {
        return await this.db.push("/monitor_twitter_cursor/" + username, params);
    }

    public async userMonitorExists(userKey: string | number) {
        return await this.db.exists("/user_monitor/" + userKey);
    }
    public async getUserMonitor(userKey: string | number) {
        return await this.db.getData("/user_monitor/" + userKey);
    }
    public async editUserMonitor(userKey: string | number, params: any, override: boolean = false) {
        return await this.db.push("/user_monitor/" + userKey, params, override);
    }

    public async editMonitorLogs(username: string, params: any) {
        return await this.db.push("/monitor_logs/" + username, params, false);
    }

    public async editTxLogs(userKey: string | number, params: any) {
        return await this.db.push("/tx_logs/" + userKey, params, false);
    }

    public async editMessageQueue(key: string | number, params: any) {
        return await this.db.push("/message_queue/" + key, params, false);
    }
    public async delMessageQueue(key: string | number) {
        return await this.db.delete("/message_queue/" + key);
    }
    public async getMessageQueueAll() {
        return await this.db.getData("/message_queue");
    }
}