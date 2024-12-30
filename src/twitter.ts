import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';

// {
//     "profile": "elonmusk",
//     "rest_id": "44196397",
//     "avatar": "https://pbs.twimg.com/profile_images/1683325380441128960/yRsRRjGO_normal.jpg",
//     "desc": "",
//     "name": "Elon Musk",
//     "friends": 425,
//     "sub_count": 156992638,
//     "id": "44196397"
// }
export interface UserParams {
    rest_id?: string;
    avatar?: string;
    name?: string;
    friends?: number;
    sub_count?: number;
    id?: string;
    status?: string;
}

export class Twitter {
    public readonly client: TwitterApi;

    constructor(config: { appKey: string; appSecret: string; accessToken: string; accessSecret: string; }) {
        this.client = new TwitterApi({
            appKey: config.appKey,
            appSecret: config.appSecret,
            accessToken: config.accessToken,
            accessSecret: config.accessSecret,
        });

    }

    // public async fetchTwitterUserTweets(username: string) {
    //     const user = await this.getUserByUsername(username);
    //     const tweets = await this.client.v2.userTimeline(user.id, { max_results: 5 });
    //     return tweets.data;
    // }

    // public async getUserByUsername(username: string) {
    //     const user = await this.client.v2.userByUsername(username);
    //     return user.data;
    // }

    protected apiHost = 'twitter-api45.p.rapidapi.com';
    protected apiKey = process.env.TWITTER_API_KEY ?? '';

    public async fetchTwitterUserTweets(username: string, cursor: string = '') {
        const { data } = await axios.get(
            `https://${this.apiHost}/timeline.php?screenname=${username}&cursor=${cursor}`,
            { headers: { 'x-rapidapi-host': this.apiHost, 'x-rapidapi-key': this.apiKey } }
        )
        return data;
    }

    public async getUserByUsername(username: string): Promise<UserParams> {
        const { data } = await axios.get(
            `https://${this.apiHost}/screenname.php?screenname=${username}`,
            { headers: { 'x-rapidapi-host': this.apiHost, 'x-rapidapi-key': this.apiKey } }
        )
        return data;
    }
}