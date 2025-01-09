import {
  SystemProgram,
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableAccount,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token'
import axios from 'axios'
import { API_URLS, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'
import dotenv from 'dotenv';
import { JitoClient } from './jito'
import { PumpFunSDK } from './pump/pumpfun'
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { getCoinData } from './pump/api'
import { agent } from './config';

dotenv.config();

const rpc_endpoint = process.env.RPC_ENDPOINT ?? 'https://api.mainnet-beta.solana.com';
const connection = new Connection(rpc_endpoint)

const fetchTokenAccountData = async (address: PublicKey) => {
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

export interface SwapConfig {
  amount: number,
  slippage: number,
  gas: number,
  tip: number,
}

export const Swap = async (buyer: Keypair, address: string, config: SwapConfig) => {
  const inputMint = NATIVE_MINT.toBase58()
  const outputMint = address
  const amount = config.amount * LAMPORTS_PER_SOL // in lamports
  const slippage = config.slippage // in percent, for this example, 0.5 means 0.5%
  const txVersion: string = 'V0' // or LEGACY
  const jitoTipAmount = config.tip * LAMPORTS_PER_SOL; // lamports

  const coinData = await getCoinData(outputMint);
  if (coinData) {
    const priorityFeeArr = {
      unitLimit: 100_000_000,
      unitPrice: 100_000,
    };

    const wallet = new Wallet(buyer);
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "finalized",
    });
    const sdk = new PumpFunSDK(provider);
    const buyResults = await sdk.buy(
      buyer,
      new PublicKey(outputMint),
      BigInt(amount),
      BigInt(slippage * 100),
      priorityFeeArr,
      BigInt(jitoTipAmount)
    );
    console.log('buyResults', buyResults)
    if (buyResults.success === false) {
      throw new Error('buy error:' + buyResults.error);
    }
    return buyResults.signature;
  }

  const [isInputSol, isOutputSol] = [inputMint === NATIVE_MINT.toBase58(), outputMint === NATIVE_MINT.toBase58()]

  const { tokenAccounts } = await fetchTokenAccountData(buyer.publicKey)
  const inputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === inputMint)?.publicKey
  const outputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === outputMint)?.publicKey

  if (!inputTokenAcc && !isInputSol) {
    console.error('do not have input token account')
    return
  }

  // get statistical transaction fee from api
  /**
   * vh: very high
   * h: high
   * m: medium
   */
  const { data } = await axios.get<{
    id: string
    success: boolean
    data: { default: { vh: number; h: number; m: number } }
  }>(`${API_URLS.BASE_HOST}${API_URLS.PRIORITY_FEE}`, {
    httpsAgent: agent,
  })

  const { data: swapResponse } = await axios.get(
    `${API_URLS.SWAP_HOST
    }/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage}&txVersion=${txVersion}`
    , {
      httpsAgent: agent,
    })

  if (swapResponse.success === false) {
    throw new Error('Swap error: ' + swapResponse.msg);
  }
  console.log('swapResponse', swapResponse)

  const { data: swapTransactions } = await axios.post<{
    id: string
    version: string
    success: boolean
    data: { transaction: string }[]
    msg?: string
  }>(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
    computeUnitPriceMicroLamports: String(data.data.default.h),
    swapResponse,
    txVersion,
    wallet: buyer.publicKey.toBase58(),
    wrapSol: isInputSol,
    unwrapSol: isOutputSol, // true means output mint receive sol, false means output mint received wsol
    inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
    outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
  }, {
    httpsAgent: agent,
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

    const jitoClient = new JitoClient('https://mainnet.block-engine.jito.wtf/api/v1', "");
    if (jitoTipAmount > 0) {
      // Example with no UUID(default)
      // Convert the random tip account string to a PublicKey
      const randomTipAccount = await jitoClient.getRandomTipAccount();
      const jitoTipAccount = new PublicKey(randomTipAccount);
      const priorityFee = 2000; // lamports

      const jitpTipInstruction = SystemProgram.transfer({
        fromPubkey: buyer.publicKey,
        toPubkey: jitoTipAccount,
        lamports: jitoTipAmount,
      });
      message.instructions.push(jitpTipInstruction)
    }

    // compile the message and update the transaction
    transaction.message = message.compileToV0Message(addressLookupTableAccounts)

    // sign the transaction
    transaction.sign([buyer])

    var sig = '';
    if (jitoTipAmount > 0) {
      // 获取交易的序列化数据
      const serializedTx = transaction.serialize()
      console.log('serializedTx', serializedTx)

      // Uint8Array转换为Base64字符串
      const base64Tx = Buffer.from(serializedTx).toString('base64')
      console.log('base64Tx', base64Tx)

      const { result } = await jitoClient.sendTxn([base64Tx, { "encoding": "base64" }]);
      sig = result
    } else {
      console.log(await connection.simulateTransaction(transaction, undefined));

      sig = await connection.sendTransaction(transaction, {
        skipPreflight: false,
      });
    }
    return sig;
  }
}


