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
import { HttpsProxyAgent } from 'https-proxy-agent'
import dotenv from 'dotenv';
import { JitoClient } from './jito'
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
  // const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // RAY
  const amount = config.amount * LAMPORTS_PER_SOL // in lamports
  const slippage = config.slippage // in percent, for this example, 0.5 means 0.5%
  const txVersion: string = 'V0' // or LEGACY

  // Example with no UUID(default)
  const jitoClient = new JitoClient('https://mainnet.block-engine.jito.wtf/api/v1', "");
  // Convert the random tip account string to a PublicKey
  const randomTipAccount = await jitoClient.getRandomTipAccount();
  const jitoTipAccount = new PublicKey(randomTipAccount);
  const jitoTipAmount = config.tip * LAMPORTS_PER_SOL; // lamports
  const priorityFee = 2000; // lamports

  const [isInputSol, isOutputSol] = [inputMint === NATIVE_MINT.toBase58(), outputMint === NATIVE_MINT.toBase58()]

  const { tokenAccounts } = await fetchTokenAccountData(buyer.publicKey)
  const inputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === inputMint)?.publicKey
  const outputTokenAcc = tokenAccounts.find((a) => a.mint.toBase58() === outputMint)?.publicKey

  if (!inputTokenAcc && !isInputSol) {
    console.error('do not have input token account')
    return
  }

  // const agent = new HttpsProxyAgent('http://127.0.0.1:1087');

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
    // httpsAgent: agent,
  })

  const { data: swapResponse } = await axios.get(
    `${API_URLS.SWAP_HOST
    }/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage}&txVersion=${txVersion}`
    , {
      // httpsAgent: agent,
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
    wallet: buyer.publicKey.toBase58(),
    wrapSol: isInputSol,
    unwrapSol: isOutputSol, // true means output mint receive sol, false means output mint received wsol
    inputAccount: isInputSol ? undefined : inputTokenAcc?.toBase58(),
    outputAccount: isOutputSol ? undefined : outputTokenAcc?.toBase58(),
  }, {
    httpsAgent: agent,
  })

  // console.log('swapTransactions', swapTransactions.data)
  const allTxBuf = swapTransactions.data.map((tx) => Buffer.from(tx.transaction, 'base64'))
  const allTransactions = allTxBuf.map((txBuf) => VersionedTransaction.deserialize(txBuf))

  for (const tx of allTransactions) {
    const transaction = tx as VersionedTransaction

    const jitpTipInstruction = SystemProgram.transfer({
      fromPubkey: buyer.publicKey,
      toPubkey: jitoTipAccount,
      lamports: jitoTipAmount,
    });

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
    message.instructions.push(jitpTipInstruction)

    // compile the message and update the transaction
    transaction.message = message.compileToV0Message(addressLookupTableAccounts)

    // sign the transaction
    transaction.sign([buyer])

    // 获取交易的序列化数据
    const serializedTx = transaction.serialize()
    console.log('serializedTx', serializedTx)

    // Uint8Array转换为Base64字符串
    const base64Tx = Buffer.from(serializedTx).toString('base64')
    console.log('base64Tx', base64Tx)

    const { result: txId } = await jitoClient.sendTxn([base64Tx, { "encoding": "base64" }]);

    return txId;
  }
}


