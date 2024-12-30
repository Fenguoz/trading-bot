import { Commitment, Connection, PublicKey } from "@solana/web3.js";
import 'dotenv/config';

export const MONGODB_URL = process.env.MONGODB_URL || "mongodb://127.0.0.1:27017/growtrade";
export const REDIS_URI = process.env.REDIS_URI || "redis://localhost:6379";
export const TELEGRAM_BOT_API_TOKEN = process.env.TELEGRAM_BOT_API_TOKEN;

export const BIRDEYE_API_URL = "https://public-api.birdeye.so";
export const BIRDEYE_API_KEY = process.env.BIRD_EYE_API || "";
export const REQUEST_HEADER = {
  'accept': 'application/json',
  'x-chain': 'solana',
  'X-API-KEY': BIRDEYE_API_KEY,
};

export const MAINNET_RPC = process.env.MAINNET_RPC || "https://api.mainnet-beta.solana.com";
export const PRIVATE_RPC_ENDPOINT = process.env.PRIVATE_RPC_ENDPOINT || "https://api.mainnet-beta.solana.com";
export const RPC_WEBSOCKET_ENDPOINT = process.env.RPC_WEBSOCKET_ENDPOINT || "ws://api.mainnet-beta.solana.com";
export const COMMITMENT_LEVEL = 'finalized' as Commitment;
export const connection = new Connection(MAINNET_RPC, COMMITMENT_LEVEL);
export const private_connection = new Connection(PRIVATE_RPC_ENDPOINT, COMMITMENT_LEVEL);

export const MAX_WALLET = 5;
export const MAX_CHECK_JITO = 20
export const JITO_UUID = process.env.JITO_UUID || "";

export const RESERVE_WALLET = new PublicKey("B474hx9ktA2pq48ctLm9QXJpfitg59AWwMEQRn7YhyB7");
export const RAYDIUM_PASS_TIME = 5 * 60 * 60 * 1000; // 5 * 24  3days * 24h * 60mins * 60 seconds * 1000 millisecons
export const RAYDIUM_AMM_URL = 'https://api.raydium.io/v2/main/pairs'
export const RAYDIUM_CLMM_URL = 'https://api.raydium.io/v2/ammV3/ammPools'
export const PNL_SHOW_THRESHOLD_USD = 0.00000005;

export const TWITTER_API_KEY = process.env.TWITTER_API_KEY || "";
