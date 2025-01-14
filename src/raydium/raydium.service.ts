import {
  ApiClmmPoolsItem,
  jsonInfo2PoolKeys,
  Clmm,
  TokenAccount,
  SPL_ACCOUNT_LAYOUT,
  fetchMultipleMintInfos,
  Percent,
  Token,
  TokenAmount,
  Liquidity,
  LiquidityPoolKeys,
  TOKEN_PROGRAM_ID,
  MAINNET_PROGRAM_ID as PROGRAMIDS,
  ApiPoolInfoV4,
  LiquidityPoolInfo,
  LiquidityPoolStatus,
} from "@raydium-io/raydium-sdk";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  AddressLookupTableAccount,
  Connection,
} from "@solana/web3.js";
import bs58 from "bs58";

import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { agent, connection, private_connection } from "../config";
import { RaydiumTokenService } from "../services/raydium.token.service";
import { getSignature } from "../utils/get.signature";
import { JitoBundleService, tipAccounts } from "../services/jito.bundle";
import { FeeService } from "../services/fee.service";
import { formatClmmKeysById } from "./utils/formatClmmKeysById";
import { formatAmmKeysById } from "./utils/formatAmmKeysById";

import { default as BN, min } from "bn.js";
import { TokenService } from "../services/token.metadata";
import { QuoteRes } from "../services/jupiter.service";
import { UserTradeSettingService } from "../services/user.trade.setting.service";
import { getKeyPairFromPrivateKey } from "../pump/utils";
import { API_URLS, parseTokenAccountResp } from "@raydium-io/raydium-sdk-v2";
import axios from "axios";

export const getPriceInSOL = async (tokenAddress: string): Promise<number> => {
  try {
    const tokenPrice = await TokenService.getSPLPrice(tokenAddress);
    const solPrice = await TokenService.getSOLPrice();
    const priceInSol = tokenPrice / solPrice;
    return priceInSol;
  } catch (e) {
    // If an error occurs, return a default value (e.g., 0)
    return 0;
  }
};

export const calcAmountOut = async (
  connection: Connection,
  inMint: PublicKey,
  inDecimal: number,
  outMint: PublicKey,
  outDecimal: number,
  poolId: string,
  rawAmountIn: number,
  isAmm: boolean,
  ammKeys?: any,
  clmmKeys?: any
) => {
  let inAmount = rawAmountIn > 0 ? rawAmountIn : 10000;
  let outAmount = 0;
  let priceImpactPct = 0;
  let priceInSol = 0;

  const slippage = new Percent(100); // 100% slippage
  const currencyIn = new Token(TOKEN_PROGRAM_ID, inMint, inDecimal);
  const amountIn = new TokenAmount(currencyIn, inAmount, false);
  const currencyOut = new Token(TOKEN_PROGRAM_ID, outMint, outDecimal);
  console.log("AMM", isAmm, Date.now());
  if (isAmm) {
    const targetPoolInfo = ammKeys
      ? JSON.parse(JSON.stringify(ammKeys))
      : await syncAmmPoolKeys(poolId);
    if (!targetPoolInfo) {
      console.log("🚀 cannot find the target pool", poolId);
      return;
    }
    const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
    // const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });

    const baseReserve = await connection.getTokenAccountBalance(
      new PublicKey(targetPoolInfo.baseVault)
    );
    const quoteReserve = await connection.getTokenAccountBalance(
      new PublicKey(targetPoolInfo.quoteVault)
    );
    const poolInfo: LiquidityPoolInfo = {
      status: new BN(LiquidityPoolStatus.Swap),
      baseDecimals: targetPoolInfo.baseDecimals,
      quoteDecimals: targetPoolInfo.quoteDecimals,
      lpDecimals: targetPoolInfo.lpDecimals,
      baseReserve: new BN(baseReserve.value.amount),
      quoteReserve: new BN(quoteReserve.value.amount),
      lpSupply: new BN("0"),
      startTime: new BN("0"),
    };

    const { amountOut, priceImpact, currentPrice } = Liquidity.computeAmountOut(
      {
        poolKeys,
        poolInfo,
        amountIn,
        currencyOut,
        slippage,
      }
    );

    const decimalsDiff =
      currentPrice.baseCurrency.decimals - currentPrice.quoteCurrency.decimals;
    if (
      (currentPrice.baseCurrency as Token).mint.toBase58() ===
      NATIVE_MINT.toBase58()
    ) {
      priceInSol =
        Number(currentPrice.denominator) /
        Number(currentPrice.numerator) /
        10 ** decimalsDiff;
      console.log(
        "F=>PriceInSOL & OutAmount",
        currentPrice.numerator.toString(),
        currentPrice.denominator.toString()
      );
    } else {
      priceInSol =
        (Number(currentPrice.numerator) / Number(currentPrice.denominator)) *
        10 ** decimalsDiff;
      console.log(
        "S=>PriceInSOL & OutAmount",
        currentPrice.numerator.toString(),
        currentPrice.denominator.toString()
      );
    }

    outAmount = Number(amountOut.numerator) / Number(amountOut.denominator);
    priceImpactPct =
      (100 * Number(priceImpact.numerator)) / Number(priceImpact.denominator);
  } else {
    const clmmPools: ApiClmmPoolsItem[] = [
      clmmKeys
        ? JSON.parse(JSON.stringify(clmmKeys))
        : await syncClmmPoolKeys(poolId),
    ];
    const { [poolId]: clmmPoolInfo } = await Clmm.fetchMultiplePoolInfos({
      connection,
      poolKeys: clmmPools,
      chainTime: new Date().getTime() / 1000,
    });

    const tickCache = await Clmm.fetchMultiplePoolTickArrays({
      connection,
      poolKeys: [clmmPoolInfo.state],
      batchRequest: true,
    });

    const { amountOut, priceImpact, currentPrice } =
      Clmm.computeAmountOutFormat({
        poolInfo: clmmPoolInfo.state,
        tickArrayCache: tickCache[poolId],
        amountIn,
        slippage,
        currencyOut,
        epochInfo: await connection.getEpochInfo(),
        token2022Infos: await fetchMultipleMintInfos({
          connection,
          mints: [
            ...clmmPools
              .map((i) => [
                { mint: i.mintA, program: i.mintProgramIdA },
                { mint: i.mintB, program: i.mintProgramIdB },
              ])
              .flat()
              .filter((i) => i.program === TOKEN_2022_PROGRAM_ID.toString())
              .map((i) => new PublicKey(i.mint)),
          ],
        }),
        catchLiquidityInsufficient: true,
      });
    const decimalsDiff =
      currentPrice.baseCurrency.decimals - currentPrice.quoteCurrency.decimals;
    if (
      (currentPrice.baseCurrency as Token).mint.toBase58() ===
      NATIVE_MINT.toBase58()
    ) {
      priceInSol =
        Number(currentPrice.denominator) /
        Number(currentPrice.numerator) /
        10 ** decimalsDiff;
      console.log(
        "FF=>PriceInSOL & OutAmount",
        currentPrice.numerator.toString(),
        currentPrice.denominator.toString()
      );
    } else {
      priceInSol =
        (Number(currentPrice.numerator) / Number(currentPrice.denominator)) *
        10 ** decimalsDiff;
      console.log(
        "SS=>PriceInSOL & OutAmount",
        currentPrice.numerator.toString(),
        currentPrice.denominator.toString()
      );
    }

    outAmount =
      Number(amountOut.amount.numerator) / Number(amountOut.amount.denominator);
    priceImpactPct =
      (100 * Number(priceImpact.numerator)) / Number(priceImpact.denominator);
  }
  console.log("1PriceInSOL & OutAmount", priceInSol, outAmount);
  return {
    inputMint: inMint.toString(),
    inAmount: rawAmountIn,
    outputMint: outMint.toString(),
    outAmount,
    priceImpactPct,
    priceInSol,
  };
};

export class RaydiumSwapService {
  constructor() { }

  async swapToken(
    pk: string,
    inputMint: string,
    outputMint: string,
    decimal: number,
    _amount: number,
    _slippage: number,
    gasFee: number,
    isFeeBurn: boolean,
    chat_id: number,
    isToken2022: boolean
  ) {
    try {
      const buyer = await getKeyPairFromPrivateKey(pk);

      const amount = _amount * LAMPORTS_PER_SOL // in lamports
      const slippage = _slippage // in percent, for this example, 0.5 means 0.5%
      const txVersion: string = 'V0' // or LEGACY

      // JitoFee
      const jitoFeeSetting = await UserTradeSettingService.getJitoFee(chat_id);
      const jitoFeeValue =
        UserTradeSettingService.getJitoFeeValue(jitoFeeSetting);
      console.log('jitoFeeValue', jitoFeeValue)
      const jitoTipAmount = jitoFeeValue * LAMPORTS_PER_SOL; // lamports

      const [isInputSol, isOutputSol] = [inputMint === NATIVE_MINT.toBase58(), outputMint === NATIVE_MINT.toBase58()]

      const { tokenAccounts } = await fetchTokenAccountData(buyer.publicKey)
      const inputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === inputMint)?.publicKey
      const outputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === outputMint)?.publicKey

      if (!inputTokenAcc && !isInputSol) {
        console.error('do not have input token account')
        return
      }

      const gasSetting = await UserTradeSettingService.getGas(chat_id);
      const _gasvalue = UserTradeSettingService.getGasValue(gasSetting);
      const gasvalue = _gasvalue * LAMPORTS_PER_SOL // in lamports
      console.log('gasvalue', gasvalue)

      const { data: swapResponse } = await axios.get(
        `${API_URLS.SWAP_HOST
        }/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage}&txVersion=${txVersion}`
        , {
          ...agent,
        })

      console.log('swapResponse', swapResponse)
      if (swapResponse.success === false) {
        throw new Error('Swap error: ' + swapResponse.msg);
      }

      const { data: swapTransactions } = await axios.post<{
        id: string
        version: string
        success: boolean
        data: { transaction: string }[]
        msg?: string
      }>(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
        computeUnitPriceMicroLamports: String(gasvalue),
        // computeUnitPriceMicroLamports: String(data.data.default.h),
        swapResponse,
        txVersion,
        wallet: buyer.publicKey.toBase58(),
        wrapSol: isInputSol,
        unwrapSol: isOutputSol, // true means output mint receive sol, false means output mint received wsol
        inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
        outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
      }, {
        ...agent,
      })

      if (swapTransactions.success === false) {
        throw new Error('Swap tx error: ' + swapTransactions.msg);
      }

      const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'))
      const allTransactions = allTxBuf.map((txBuf) => VersionedTransaction.deserialize(txBuf))

      for (const tx of allTransactions) {
        const transaction = tx as VersionedTransaction

        // const priorityInstruction = ComputeBudgetProgram.setComputeUnitPrice({
        //   microLamports: priorityFee,
        // });

        // get address lookup table accounts
        const addressLookupTableAccounts = await Promise.all(
          transaction.message.addressTableLookups.map(async (lookup) => {
            return new AddressLookupTableAccount({
              key: lookup.accountKey,
              state: AddressLookupTableAccount.deserialize(await connection.getAccountInfo(lookup.accountKey).then((res) => {
                if (!res) throw new Error('no data')
                return res.data;
              })),
            })
          }))
        // console.log(addressLookupTableAccounts)
        // decompile transaction message and add transfer instruction
        var message = TransactionMessage.decompile(transaction.message, { addressLookupTableAccounts: addressLookupTableAccounts })
        // message.instructions.push(priorityInstruction)

        if (jitoTipAmount > 0) {
          // Example with no UUID(default)
          // Convert the random tip account string to a PublicKey
          const priorityFee = 2000; // lamports

          const jitpTipInstruction = SystemProgram.transfer({
            fromPubkey: buyer.publicKey,
            toPubkey: new PublicKey(tipAccounts[0]),
            lamports: jitoTipAmount,
          });
          message.instructions.push(jitpTipInstruction)
        }

        // compile the message and update the transaction
        transaction.message = message.compileToV0Message(addressLookupTableAccounts)

        // sign the transaction
        transaction.sign([buyer])

        const rawTransaction = transaction.serialize();

        const jitoBundleInstance = new JitoBundleService();

        let bundleId;
        const signature = await jitoBundleInstance.sendTransaction(rawTransaction);

        console.log(`https://solscan.io/tx/${signature}`);

        const quoteAmount = swapResponse.data.outputAmount;
        const quote = { inAmount: amount, outAmount: quoteAmount };
        return {
          quote,
          signature,
          total_fee_in_sol: '',
          total_fee_in_token: '',
          bundleId,
        };
      }

    } catch (error) {
      console.log(" - Swap Raydium token is failed", error);
    }
  }
}

export const fetchTokenAccountData = async (address: PublicKey) => {
  const solAccountResp = await connection.getAccountInfo(address)
  const tokenAccountResp = await connection.getTokenAccountsByOwner(address, { programId: TOKEN_PROGRAM_ID })
  const token2022Req = await connection.getTokenAccountsByOwner(address, { programId: TOKEN_2022_PROGRAM_ID })
  const tokenAccountData = parseTokenAccountResp({
    owner: address,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  })
  return tokenAccountData
}

export async function getWalletTokenAccount(
  connection: Connection,
  wallet: PublicKey
): Promise<TokenAccount[]> {
  const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
    programId: TOKEN_PROGRAM_ID,
  });
  return walletTokenAccount.value.map((i) => ({
    pubkey: i.pubkey,
    programId: i.account.owner,
    accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
  }));
}

export const calculateMicroLamports = (gasvalue: number, cu: number) => {
  const microlamports = ((gasvalue - 0.000005) * (10 ** 15 / cu)).toFixed(0);
  return Number(microlamports);
};

export const syncAmmPoolKeys = async (poolId: string) => {
  console.log("syncAmmPoolKeys");
  // const tokenInfo = await RaydiumTokenService.findLastOne({
  //   poolId: poolId
  // });
  // if (tokenInfo) {
  // if (tokenInfo.ammKeys) return tokenInfo.ammKeys;
  const poolKeys = await formatAmmKeysById(poolId);
  const filter = { poolId };
  const data = { ammKeys: poolKeys };
  await RaydiumTokenService.findOneAndUpdate({ filter, data });
  return poolKeys;
  // }
};

export const syncClmmPoolKeys = async (poolId: string) => {
  console.log("syncClmmPoolKeys");

  // const tokenInfo = await RaydiumTokenService.findLastOne({
  //   poolId: poolId
  // });
  // if (tokenInfo) {
  //   if (tokenInfo.clmmKeys) return tokenInfo.clmmKeys;
  const poolKeys = await formatClmmKeysById(poolId);
  const filter = { poolId };
  const data = { clmmKeys: poolKeys };
  await RaydiumTokenService.findOneAndUpdate({ filter, data });
  return poolKeys;
  // }
};

export const getPoolInfoByMint = async (mint: string) => {
  console.log("getPoolId");

  const { data: poolInfoData } = await axios.get(`https://api-v3.raydium.io/pools/info/mint?mint1=${mint}&poolType=all&poolSortField=default&sortType=desc&pageSize=10&page=1`, {
    ...agent,
  })
  if (poolInfoData.success == false || poolInfoData.data.count <= 0) {
    throw new Error('Not found Pool');
  }

  const poolInfo = poolInfoData.data.data[0];
  let name;
  let symbol;
  const isAmm = poolInfo.type == 'Concentrated' ? true : false;
  const poolId = poolInfo.id
  if (poolInfo.mintA.address == mint) {
    name = poolInfo.mintA.name
    symbol = poolInfo.mintA.symbol
  }
  if (poolInfo.mintB.address == mint) {
    name = poolInfo.mintB.name
    symbol = poolInfo.mintB.symbol
  }

  const data = {
    name,
    symbol,
    mint,
    isAmm,
    poolId,
    creation_ts: Date.now(),
  };
  console.log('data', data)
  await RaydiumTokenService.create(data);
  return data;
};
