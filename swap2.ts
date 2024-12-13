import {
  ComputeBudgetProgram,
  SystemProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  AddressLookupTableAccount,
} from '@solana/web3.js'
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token'
import axios from 'axios'
import { API_URLS, parseTokenAccountResp } from '@raydium-io/raydium-sdk-v2'
import bs58 from 'bs58'
import { HttpsProxyAgent } from 'https-proxy-agent'
import dotenv from 'dotenv';
import { JitoJsonRpcClient } from './jito'
dotenv.config();

interface SwapCompute {
  id: string
  success: true
  version: 'V0' | 'V1'
  openTime?: undefined
  msg: undefined
  data: {
    swapType: 'BaseIn' | 'BaseOut'
    inputMint: string
    inputAmount: string
    outputMint: string
    outputAmount: string
    otherAmountThreshold: string
    slippageBps: number
    priceImpactPct: number
    routePlan: {
      poolId: string
      inputMint: string
      outputMint: string
      feeMint: string
      feeRate: number
      feeAmount: string
    }[]
  }
}

const rpc_endpoint = process.env.RPC_ENDPOINT ?? 'https://api.mainnet-beta.solana.com';
const connection = new Connection(rpc_endpoint)
const testSecretKey = process.env.TEST_SECRET_KEY ?? '';
const owner: Keypair = Keypair.fromSecretKey(bs58.decode(testSecretKey));

const fetchTokenAccountData = async () => {
  const solAccountResp = await connection.getAccountInfo(owner.publicKey)
  const tokenAccountResp = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID })
  const token2022Req = await connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_2022_PROGRAM_ID })
  const tokenAccountData = parseTokenAccountResp({
    owner: owner.publicKey,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Req.value],
    },
  })
  return tokenAccountData
}

export const Swap = async () => {
  const inputMint = NATIVE_MINT.toBase58()
  const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // RAY
  // const outputMint = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' // RAY
  const amount = 100
  const slippage = 0.5 // in percent, for this example, 0.5 means 0.5%
  const txVersion: string = 'V0' // or LEGACY
  const isV0Tx = txVersion === 'V0'

  const [isInputSol, isOutputSol] = [inputMint === NATIVE_MINT.toBase58(), outputMint === NATIVE_MINT.toBase58()]

  const { tokenAccounts } = await fetchTokenAccountData()
  const inputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === inputMint)?.publicKey
  const outputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === outputMint)?.publicKey

  if (!inputTokenAcc && !isInputSol) {
    console.error('do not have input token account')
    return
  }

  const agent = new HttpsProxyAgent('http://127.0.0.1:1087');

  // Example with no UUID(default)
  const jitoClient = new JitoJsonRpcClient('https://mainnet.block-engine.jito.wtf/api/v1', "");
  // Convert the random tip account string to a PublicKey
  const randomTipAccount = await jitoClient.getRandomTipAccount();
  const jitoTipAccount = new PublicKey(randomTipAccount);
  const jitoTipAmount = 1000; // lamports
  const priorityFee = 2000; // lamports

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

  const { data: swapResponse } = await axios.get<SwapCompute>(
    `${API_URLS.SWAP_HOST
    }/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 100
    }&txVersion=${txVersion}`
    , {
      httpsAgent: agent,
    })
  console.log('swapResponse', swapResponse)

  const { data: swapTransactions } = await axios.post<{
    id: string
    version: string
    success: boolean
    data: { transaction: string }[]
  }>(`${API_URLS.SWAP_HOST}/transaction/swap-base-in`, {
    computeUnitPriceMicroLamports: String(data.data.default.h),
    swapResponse,
    txVersion,
    wallet: owner.publicKey.toBase58(),
    wrapSol: isInputSol,
    unwrapSol: isOutputSol, // true means output mint receive sol, false means output mint received wsol
    inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
    outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
  }, {
    httpsAgent: agent,
  })

  // console.log('swapTransactions', swapTransactions.data)
  const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'))
  const allTransactions = allTxBuf.map((txBuf) =>
    isV0Tx ? VersionedTransaction.deserialize(txBuf) : Transaction.from(txBuf)
  )

  let idx = 0
  if (!isV0Tx) {
    console.log('done')
    // for (const tx of allTransactions) {
    //   console.log(`${++idx} transaction sending...`)
    //   const transaction = tx as Transaction
    //   transaction.sign(owner)
    //   const txId = await sendAndConfirmTransaction(connection, transaction, [owner], { skipPreflight: true })
    //   console.log(`${++idx} transaction confirmed, txId: ${txId}`)
    // }
  } else {
    for (const tx of allTransactions) {
      idx++

      const transaction = tx as VersionedTransaction

      const jitpTipInstruction = SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: jitoTipAccount,
        lamports: jitoTipAmount,
      });

      const priorityInstruction = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: priorityFee,
      });

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
      message.instructions.push(jitpTipInstruction)

      // compile the message and update the transaction
      transaction.message = message.compileToV0Message(addressLookupTableAccounts)

      // sign the transaction
      transaction.sign([owner])

      // 获取交易的序列化数据
      const serializedTx = transaction.serialize()
      console.log('serializedTx', serializedTx)

      // Uint8Array转换为Base64字符串
      const base64Tx = Buffer.from(serializedTx).toString('base64')
      console.log('base64Tx', base64Tx)

      const { result: txId } = await jitoClient.sendTxn([base64Tx, { "encoding": "base64" }]);

      console.log('txId', txId)
    }
  }
}




