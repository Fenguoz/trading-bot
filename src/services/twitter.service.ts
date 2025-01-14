import axios from 'axios';
import { TWITTER_API_KEY } from '../config';

const apiHost = 'twitter-api45.p.rapidapi.com';

export const fetchTwitterUserTweets = async (username: string, cursor: string = '') => {
  const { data } = await axios.get(
    `https://${apiHost}/timeline.php?screenname=${username}&cursor=${cursor}`,
    { headers: { 'x-rapidapi-host': apiHost, 'x-rapidapi-key': TWITTER_API_KEY } }
  )
  return data;
}
export const getUserByUsername = async (username: string) => {
  const { data } = await axios.get(
    `https://${apiHost}/screenname.php?screenname=${username}`,
    { headers: { 'x-rapidapi-host': apiHost, 'x-rapidapi-key': TWITTER_API_KEY } }
  )
  return data;
}