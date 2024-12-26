import {
    Commitment,
    Connection,
    Finality,
    Keypair,
    PublicKey,
    Transaction,
    VersionedTransaction,
  } from "@solana/web3.js";
  import { Program, Provider } from "@coral-xyz/anchor";
  import { GlobalAccount } from "./globalAccount";
  import {
    CompleteEvent,
    CreateEvent,
    CreateTokenMetadata,
    PriorityFee,
    PumpFunEventHandlers,
    PumpFunEventType,
    SetParamsEvent,
    TradeEvent,
    TransactionResult,
  } from "./types";
  import {
    createAssociatedTokenAccountInstruction,
    getAccount,
    getAssociatedTokenAddress,
  } from "@solana/spl-token";
  import { BondingCurveAccount } from "./bondingCurveAccount";
  import { BN } from "bn.js";
  import {
    DEFAULT_COMMITMENT,
    DEFAULT_FINALITY,
    buildTx,
    calculateWithSlippageBuy,
    calculateWithSlippageSell,
    getRandomInt,
    sendTx,
  } from "./util";
  import { PumpFun, IDL } from "./IDL";
  
  const PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
  
  export const GLOBAL_ACCOUNT_SEED = "global";
  export const MINT_AUTHORITY_SEED = "mint-authority";
  export const BONDING_CURVE_SEED = "bonding-curve";
  export const METADATA_SEED = "metadata";
  
  export const DEFAULT_DECIMALS = 6;
  
  export class PumpFunSDK {
    public program: Program<PumpFun>;
    public connection: Connection;
    constructor(provider?: Provider) {
      this.program = new Program<PumpFun>(IDL as PumpFun, provider);
      this.connection = this.program.provider.connection;
    }

    async buy(
        buyer: Keypair,
        mint: PublicKey,
        buyAmountSol: bigint,
        slippageBasisPoints: bigint,
        priorityFees?: PriorityFee,
        jitoTips?: bigint,
        commitment: Commitment = DEFAULT_COMMITMENT,
        finality: Finality = DEFAULT_FINALITY
      ): Promise<TransactionResult> {
        let buyTx = await this.getBuyInstructionsBySolAmount(
          buyer.publicKey,
          mint,
          buyAmountSol,
          slippageBasisPoints,
          commitment
        );
    
        let buyResults = await sendTx(
          this.connection,
          buyTx,
          buyer.publicKey,
          [buyer],
          priorityFees,
          jitoTips,
          commitment,
          finality
        );
        return buyResults;
      }


  async getBuyInstructionsBySolAmount(
    buyer: PublicKey,
    mint: PublicKey,
    buyAmountSol: bigint,
    slippageBasisPoints: bigint,
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    let bondingCurveAccount = await this.getBondingCurveAccount(
      mint,
      commitment
    );
    if (!bondingCurveAccount) {
      throw new Error(`Bonding curve account not found: ${mint.toBase58()}`);
    }

    let buyAmount = bondingCurveAccount.getBuyPrice(buyAmountSol);
    let buyAmountWithSlippage = calculateWithSlippageBuy(
      buyAmountSol,
      slippageBasisPoints
    );
    let globalAccount = await this.getGlobalAccount(commitment);

    return await this.getBuyInstructions(
      buyer,
      mint,
      globalAccount.feeRecipient,
      buyAmount,
      buyAmountWithSlippage
    );
  }

  async getBondingCurveAccount(
    mint: PublicKey,
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    const tokenAccount = await this.connection.getAccountInfo(
      this.getBondingCurvePDA(mint),
      commitment
    );
    if (!tokenAccount) {
      return null;
    }
    return BondingCurveAccount.fromBuffer(tokenAccount!.data);
  }

  getBondingCurvePDA(mint: PublicKey) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from(BONDING_CURVE_SEED), mint.toBuffer()],
      this.program.programId
    )[0];
  }


  async getGlobalAccount(commitment: Commitment = DEFAULT_COMMITMENT) {
    const [globalAccountPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(GLOBAL_ACCOUNT_SEED)],
      new PublicKey(PROGRAM_ID)
    );

    const tokenAccount = await this.connection.getAccountInfo(
      globalAccountPDA,
      commitment
    );

    return GlobalAccount.fromBuffer(tokenAccount!.data);
  }

  async getBuyInstructions(
    buyer: PublicKey,
    mint: PublicKey,
    feeRecipient: PublicKey,
    amount: bigint,
    solAmount: bigint,
    commitment: Commitment = DEFAULT_COMMITMENT
  ) {
    const associatedBondingCurve = await getAssociatedTokenAddress(
      mint,
      this.getBondingCurvePDA(mint),
      true
    );

    const associatedUser = await getAssociatedTokenAddress(mint, buyer, false);

    let transaction = new Transaction();

    try {
      await getAccount(this.connection, associatedUser, commitment);
    } catch (e) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          buyer,
          associatedUser,
          buyer,
          mint
        )
      );
    }

    transaction.add(
      await this.program.methods
        .buy(new BN(amount.toString()), new BN(solAmount.toString()))
        .accounts({
          feeRecipient: feeRecipient,
          mint: mint,
          associatedBondingCurve: associatedBondingCurve,
          associatedUser: associatedUser,
          user: buyer,
        })
        .transaction()
    );

    return transaction;
  }
  }