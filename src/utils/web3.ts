import {
    PublicKey,
} from '@solana/web3.js'
import {
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token'
import { agent, connection, private_connection } from '../config'
import { RaydiumTokenService } from '../services/raydium.token.service';
import { getCoinData } from '../pump/api';
import { TokenService } from '../services/token.metadata';
import axios from 'axios';

export const fetchTokenAccountData = async (_address: string) => {
    const address = new PublicKey(_address);
    const tokenAccountResp = await connection.getParsedTokenAccountsByOwner(address, { programId: TOKEN_PROGRAM_ID })
    const token2022Req = await connection.getParsedTokenAccountsByOwner(address, { programId: TOKEN_2022_PROGRAM_ID })

    // 整理数据 保留余额大于0的token
    const splTokenAccounts = []
    for (const tokenAccount of tokenAccountResp.value) {
        const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount
        const mint = tokenAccount.account.data.parsed.info.mint
        if (amount > 0) {
            splTokenAccounts.push({
                amount,
                mint
            })
        }
    }
    for (const tokenAccount of token2022Req.value) {
        const amount = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount
        const mint = tokenAccount.account.data.parsed.info.mint
        if (amount > 0) {
            splTokenAccounts.push({
                amount,
                mint
            })
        }
    }

    return splTokenAccounts
}

//根据mint获取token swap相关信息
export const getTokenData = async (mint: string) => {
    const info = await RaydiumTokenService.findByMint(mint)
    if (!info) {
        // Metadata
        const metadata = await TokenService.getMintMetadata(
            private_connection,
            new PublicKey(mint)
        );
        if (!metadata) {
            console.log('Not found mint token');
            return null;
        }

        const isToken2022 = metadata.program === "spl-token-2022";
        const decimals = metadata.parsed.info.decimals;

        var data = {} as any;
        data.mint = mint;
        data.decimals = decimals;
        data.isToken2022 = isToken2022;

        const coinData = await getCoinData(mint);
        if (coinData) {
            const mc = coinData["usd_market_cap"];
            const totalSupply = coinData["total_supply"];

            const priceInUsd = mc / (totalSupply / 10 ** decimals);
            //创建
            data.name = coinData["name"];
            data.symbol = coinData["symbol"];
            data.price = priceInUsd;
            data.platform = 'pumpfun'
        } else {
            const { data: poolInfoData } = await axios.get(`https://api-v3.raydium.io/pools/info/mint?mint1=${mint}&poolType=all&poolSortField=default&sortType=desc&pageSize=10&page=1`, {
                ...agent,
            })
            if (poolInfoData.success == false || poolInfoData.data.count <= 0) {
                console.log('Not found mint token');
                return null;
            }

            const poolInfo = poolInfoData.data.data[0];
            if (poolInfo.mintA.address == mint) {
                data.name = poolInfo.mintA.name
                data.symbol = poolInfo.mintA.symbol
            }
            if (poolInfo.mintB.address == mint) {
                data.name = poolInfo.mintB.name
                data.symbol = poolInfo.mintB.symbol
            }
            const solPrice = await TokenService.getSOLPrice();
            const tokenPrice = poolInfo.price / solPrice;
            data.price = 1 / tokenPrice;
            data.platform = 'raydium'
        }

        data.creation_ts = Date.now();
        await RaydiumTokenService.create(data);
        return data;
    } else {
        return info;
    }
}
