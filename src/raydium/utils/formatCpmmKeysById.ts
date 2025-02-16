import { PublicKey } from "@solana/web3.js";
import { connection, private_connection } from "../../config";
import {
  CpmmConfigInfoLayout,
  CpmmPoolInfoLayout,
  CpmmRpcData,
  fetchMultipleMintInfos,
  getMultipleAccountsInfoWithCustomFlags,
  getPdaObservationId,
  getPdaPoolAuthority,
  toApiV3Token,
  toFeeConfig
} from "@raydium-io/raydium-sdk-v2";
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import Decimal from "decimal.js";

export async function getRpcPoolInfo(poolId: string, fetchConfigInfo?: boolean): Promise<CpmmRpcData> {
  return (await getRpcPoolInfos([poolId], fetchConfigInfo))[poolId];
}

export async function getRpcPoolInfos(
  poolIds: string[],
  fetchConfigInfo?: boolean,
): Promise<{
  [poolId: string]: CpmmRpcData;
}> {
  const accounts = await getMultipleAccountsInfoWithCustomFlags(
    connection,
    poolIds.map((i) => ({ pubkey: new PublicKey(i) })),
  );
  const poolInfos: { [poolId: string]: ReturnType<typeof CpmmPoolInfoLayout.decode> & { programId: PublicKey } } = {};

  const needFetchConfigId = new Set<string>();
  const needFetchVaults: PublicKey[] = [];

  for (let i = 0; i < poolIds.length; i++) {
    const item = accounts[i];
    if (item.accountInfo === null) throw Error("fetch pool info error: " + String(poolIds[i]));
    const rpc = CpmmPoolInfoLayout.decode(item.accountInfo.data);
    poolInfos[String(poolIds[i])] = {
      ...rpc,
      programId: item.accountInfo.owner,
    };
    needFetchConfigId.add(String(rpc.configId));

    needFetchVaults.push(rpc.vaultA, rpc.vaultB);
  }

  const configInfo: { [configId: string]: ReturnType<typeof CpmmConfigInfoLayout.decode> } = {};

  if (fetchConfigInfo) {
    const configIds = [...needFetchConfigId];
    const configState = await getMultipleAccountsInfoWithCustomFlags(
      connection,
      configIds.map((i) => ({ pubkey: new PublicKey(i) })),
    );

    for (let i = 0; i < configIds.length; i++) {
      const configItemInfo = configState[i].accountInfo;
      if (configItemInfo === null) throw Error("fetch pool config error: " + configIds[i]);
      configInfo[configIds[i]] = CpmmConfigInfoLayout.decode(configItemInfo.data);
    }
  }

  const vaultInfo: { [vaultId: string]: BN } = {};

  const vaultAccountInfo = await getMultipleAccountsInfoWithCustomFlags(
    connection,
    needFetchVaults.map((i) => ({ pubkey: new PublicKey(i) })),
  );

  for (let i = 0; i < needFetchVaults.length; i++) {
    const vaultItemInfo = vaultAccountInfo[i].accountInfo;
    if (vaultItemInfo === null) throw Error("fetch vault info error: " + needFetchVaults[i]);

    vaultInfo[String(needFetchVaults[i])] = new BN(AccountLayout.decode(vaultItemInfo.data).amount.toString());
  }

  const returnData: { [poolId: string]: CpmmRpcData } = {};

  for (const [id, info] of Object.entries(poolInfos)) {
    const baseReserve = vaultInfo[info.vaultA.toString()].sub(info.protocolFeesMintA).sub(info.fundFeesMintA);
    const quoteReserve = vaultInfo[info.vaultB.toString()].sub(info.protocolFeesMintB).sub(info.fundFeesMintB);
    returnData[id] = {
      ...info,
      baseReserve,
      quoteReserve,
      vaultAAmount: vaultInfo[info.vaultA.toString()],
      vaultBAmount: vaultInfo[info.vaultB.toString()],
      configInfo: configInfo[info.configId.toString()],
      poolPrice: new Decimal(quoteReserve.toString()).div(new Decimal(10).pow(info.mintDecimalB)).div(new Decimal(baseReserve.toString()).div(new Decimal(10).pow(info.mintDecimalA))),
    };
  }

  return returnData;
}

export async function formatCpmmKeysById(
  poolId: string
) {
  try {
    const rpcData = await getRpcPoolInfo(poolId, true);

    const mintInfos = await fetchMultipleMintInfos({
      connection: connection,
      mints: [rpcData.mintA, rpcData.mintB],
    });

    const mintA = toApiV3Token({
      address: rpcData.mintA.toBase58(),
      decimals: rpcData.mintDecimalA,
      programId: rpcData.mintProgramA.toBase58(),
      extensions: {
        feeConfig: mintInfos[rpcData.mintA.toBase58()].feeConfig
          ? toFeeConfig(mintInfos[rpcData.mintA.toBase58()].feeConfig)
          : undefined,
      },
    });
    const mintB = toApiV3Token({
      address: rpcData.mintB.toBase58(),
      decimals: rpcData.mintDecimalB,
      programId: rpcData.mintProgramB.toBase58(),
      extensions: {
        feeConfig: mintInfos[rpcData.mintB.toBase58()].feeConfig
          ? toFeeConfig(mintInfos[rpcData.mintB.toBase58()].feeConfig)
          : undefined,
      },
    });

    const lpMint = toApiV3Token({
      address: rpcData.mintLp.toBase58(),
      decimals: rpcData.lpDecimals,
      programId: TOKEN_PROGRAM_ID.toBase58(),
    });

    const configInfo = {
      id: rpcData.configId.toBase58(),
      index: rpcData.configInfo!.index,
      protocolFeeRate: rpcData.configInfo!.protocolFeeRate.toNumber(),
      tradeFeeRate: rpcData.configInfo!.tradeFeeRate.toNumber(),
      fundFeeRate: rpcData.configInfo!.fundFeeRate.toNumber(),
      createPoolFee: rpcData.configInfo!.createPoolFee.toString(),
    };

    return {
      programId: rpcData.programId.toBase58(),
      id: poolId,
      mintA,
      mintB,
      openTime: rpcData.openTime.toString(),
      vault: { A: rpcData.vaultA.toBase58(), B: rpcData.vaultB.toBase58() },
      authority: getPdaPoolAuthority(rpcData.programId).publicKey.toBase58(),
      mintLp: lpMint,
      config: configInfo,
      observationId: getPdaObservationId(rpcData.programId, new PublicKey(poolId)).publicKey.toBase58(),
    }
  } catch (e) {
    return undefined as any;
  }

}
