import { ComputeBudgetProgram, SystemProgram, Connection, Keypair, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction, TransactionMessage, TransactionInstruction, AddressLookupTableAccount, sendAndConfirmRawTransaction } from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'
import axios from 'axios'
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

export const Swap = async () => {
  const inputMint = NATIVE_MINT.toBase58()
  const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' // RAY
  // const outputMint = '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R' // RAY
  const amount = 100
  const slippage = 0.5 // in percent, for this example, 0.5 means 0.5%
  const agent = new HttpsProxyAgent('http://127.0.0.1:1087');

  const { data: quoteResponse } = await axios.get<SwapCompute>(
    `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage * 100}`
    , {
      httpsAgent: agent,
    })

  console.log('quoteResponse', quoteResponse)

  const { data: swap } = await axios.post(`https://quote-api.jup.ag/v6/swap`, {
    quoteResponse,
    // user public key to be used for the swap
    userPublicKey: owner.publicKey.toBase58(),
    // auto wrap and unwrap SOL. default is true
    wrapAndUnwrapSol: true,
  }, {
    httpsAgent: agent,
    headers: {
      'Content-Type': 'application/json'
    }
  })
  console.log('swap', swap)

  const swapTransactionBuf = Buffer.from(swap.swapTransaction, 'base64');
  var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  console.log(transaction);

  // Example with no UUID(default)
  const jitoClient = new JitoJsonRpcClient('https://mainnet.block-engine.jito.wtf/api/v1', "");
  // Convert the random tip account string to a PublicKey
  const randomTipAccount = await jitoClient.getRandomTipAccount();
  const jitoTipAccount = new PublicKey(randomTipAccount);
  const jitoTipAmount = 1000; // lamports
  const priorityFee = 1000; // lamports

  // construct the transfer instruction
  const transferInstruction = SystemProgram.transfer({
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
  message.instructions.push(transferInstruction)

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

  const { data: data2 } = await jitoClient.sendTxn([base64Tx, { "encoding": "base64" }]);

  // const { data: data2 } = await axios.post(
  //   `https://mainnet.block-engine.jito.wtf/api/v1/transactions`,
  //   {
  //     "id": 1,
  //     "jsonrpc": "2.0",
  //     "method": "sendTransaction",
  //     "params": [
  //       base64Tx,
  //       {
  //         "encoding": "base64"
  //       }
  //     ]
  //   },
  //   { headers: { 'Content-Type': 'application/json' } }
  // )

  console.log('data', data2)

  return;

}




