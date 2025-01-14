import {
  ApiClmmConfigItem,
  ApiClmmPoolsItem,
  PoolInfoLayout,
} from "@raydium-io/raydium-sdk";
import { PublicKey } from "@solana/web3.js";

import { connection, private_connection } from "../../config";
import { formatConfigInfo } from "./formatClmmConfigs";
import { getApiClmmPoolsItemStatisticsDefault } from "./formatClmmKeys";
import { CpmmPoolInfoLayout } from "@raydium-io/raydium-sdk-v2";
import { AccountLayout } from "@solana/spl-token";
import BN from "bn.js";

async function getMintProgram(mint: PublicKey) {
  const account = await private_connection.getAccountInfo(mint);
  if (account === null) throw Error(" get id info error ");
  return account.owner;
}
async function getConfigInfo(configId: PublicKey): Promise<ApiClmmConfigItem> {
  const account = await private_connection.getAccountInfo(configId);
  if (account === null) throw Error(" get id info error ");
  return formatConfigInfo(configId, account);
}

export async function formatClmmKeysById(
  id: string
): Promise<ApiClmmPoolsItem> {
  const account = await private_connection.getAccountInfo(new PublicKey(id));
  if (account === null) throw Error(" get id info error ");
  const info = PoolInfoLayout.decode(account.data);
  
  // const poolInfo = CpmmPoolInfoLayout.decode(account.data);
  // console.log('poolInfo', poolInfo)
  // const [poolVaultAState, poolVaultBState] = await connection.getMultipleAccountsInfo([poolInfo.vaultA, poolInfo.vaultB])

  //   if (!poolVaultAState) throw new Error(`pool vaultA info not found: ${poolInfo.vaultA.toBase58()}`)
  //   if (!poolVaultBState) throw new Error(`pool vaultB info not found: ${poolInfo.vaultB.toBase58()}`)

  //   return {
  //     ...poolInfo,
  //     baseReserve: new BN(AccountLayout.decode(poolVaultAState.data).amount.toString())
  //       .sub(poolInfo.protocolFeesMintA)
  //       .sub(poolInfo.fundFeesMintA),
  //     quoteReserve: new BN(AccountLayout.decode(poolVaultBState.data).amount.toString())
  //       .sub(poolInfo.protocolFeesMintB)
  //       .sub(poolInfo.fundFeesMintB)
  //   }

  return {
    id,
    mintProgramIdA: (await getMintProgram(info.mintA)).toString(),
    mintProgramIdB: (await getMintProgram(info.mintB)).toString(),
    mintA: info.mintA.toString(),
    mintB: info.mintB.toString(),
    vaultA: info.vaultA.toString(),
    vaultB: info.vaultB.toString(),
    mintDecimalsA: info.mintDecimalsA,
    mintDecimalsB: info.mintDecimalsB,
    ammConfig: await getConfigInfo(info.ammConfig),
    rewardInfos: await Promise.all(
      info.rewardInfos
        .filter((i) => !i.tokenMint.equals(PublicKey.default))
        .map(async (i) => ({
          mint: i.tokenMint.toString(),
          programId: (await getMintProgram(i.tokenMint)).toString(),
        }))
    ),
    tvl: 0,
    day: getApiClmmPoolsItemStatisticsDefault(),
    week: getApiClmmPoolsItemStatisticsDefault(),
    month: getApiClmmPoolsItemStatisticsDefault(),
    lookupTableAccount: PublicKey.default.toString(),
  };
}
