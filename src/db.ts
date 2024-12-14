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
        if (!await this.db.exists("/user/" + userKey + "/state")) {
            return null;
        }
        return await this.db.getData("/user/" + userKey + "/state");
    }

    public async monitorExists(userKey: string | number) {
        return await this.db.exists("/monitor/" + userKey);
    }
    public async getMonitor() {
        return await this.db.getData("/monitor");
    }
    public async editMonitor(username: string, params: any) {
        return await this.db.push("/monitor/" + username, params, false);
    }

    public async userMonitorExists(userKey: string | number) {
        return await this.db.exists("/user_monitor/" + userKey);
    }
    public async getUserMonitor(userKey: string | number) {
        return await this.db.getData("/user_monitor/" + userKey);
    }
    public async editUserMonitor(userKey: string | number, params: any) {
        return await this.db.push("/user_monitor/" + userKey, params, false);
    }

    public async editMonitorLogs(username: string, params: any) {
        return await this.db.push("/monitor/logs/" + username, params, false);
    }
}