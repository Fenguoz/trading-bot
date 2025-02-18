/** @format */

import mongoose from "mongoose";
const Schema = mongoose.Schema;

const AmmPoolKeysSchema = new Schema(
  {
    id: {
      type: String,
      default: "",
    },
    baseMint: {
      type: String,
      default: "",
    },
    quoteMint: {
      type: String,
      default: "",
    },
    lpMint: {
      type: String,
      default: "",
    },
    baseDecimals: {
      type: Number,
      default: 0,
    },
    quoteDecimals: {
      type: Number,
      default: 0,
    },
    lpDecimals: {
      type: Number,
      default: 0,
    },
    version: {
      type: Number,
      default: 0,
    },
    programId: {
      type: String,
      default: "",
    },
    authority: {
      type: String,
      default: "",
    },
    openOrders: {
      type: String,
      default: "",
    },
    targetOrders: {
      type: String,
      default: "",
    },
    baseVault: {
      type: String,
      default: "",
    },
    quoteVault: {
      type: String,
      default: "",
    },
    withdrawQueue: {
      type: String,
      default: "",
    },
    lpVault: {
      type: String,
      default: "",
    },
    marketVersion: {
      type: Number,
      default: 0,
    },
    marketProgramId: {
      type: String,
      default: "",
    },
    marketId: {
      type: String,
      default: "",
    },
    marketAuthority: {
      type: String,
      default: "",
    },
    marketBaseVault: {
      type: String,
      default: "",
    },
    marketQuoteVault: {
      type: String,
      default: "",
    },
    marketBids: {
      type: String,
      default: "",
    },
    marketAsks: {
      type: String,
      default: "",
    },
    marketEventQueue: {
      type: String,
      default: "",
    },
    lookupTableAccount: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const ApiClmmConfigItemSchema = new Schema(
  {
    id: {
      type: String,
      default: "",
    },
    index: {
      type: Number,
      default: 0,
    },
    protocolFeeRate: {
      type: Number,
      default: 0,
    },
    tradeFeeRate: {
      type: Number,
      default: 0,
    },
    tickSpacing: {
      type: Number,
      default: 0,
    },
    fundFeeRate: {
      type: Number,
      default: 0,
    },
    fundOwner: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const ApiClmmPoolsItemStatisticSchema = new Schema(
  {
    volume: {
      type: Number,
      default: 0,
    },
    volumeFee: {
      type: Number,
      default: 0,
    },
    feeA: {
      type: Number,
      default: 0,
    },
    feeB: {
      type: Number,
      default: 0,
    },
    feeApr: {
      type: Number,
      default: 0,
    },
    rewardApr: {
      A: {
        type: Number,
        default: 0,
      },
      B: {
        type: Number,
        default: 0,
      },
      C: {
        type: Number,
        default: 0,
      },
    },
    apr: {
      type: Number,
      default: 0,
    },
    priceMin: {
      type: Number,
      default: 0,
    },
    priceMax: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const RewardInfoSchema = new Schema(
  {
    mint: {
      type: String,
      default: "",
    },
    programId: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const clmmPoolKeys = new Schema({
  id: {
    type: String,
    default: "",
  },
  mintProgramIdA: {
    type: String,
    default: "",
  },
  mintProgramIdB: {
    type: String,
    default: "",
  },
  mintA: {
    type: String,
    default: "",
  },
  mintB: {
    type: String,
    default: "",
  },
  vaultA: {
    type: String,
    default: "",
  },
  vaultB: {
    type: String,
    default: "",
  },
  mintDecimalsA: {
    type: Number,
    default: 0,
  },
  mintDecimalsB: {
    type: Number,
    default: 0,
  },
  ammConfig: {
    type: ApiClmmConfigItemSchema,
  },
  rewardInfos: {
    type: [RewardInfoSchema],
    default: [],
  },
  tvl: {
    type: Number,
    default: 0,
  },
  day: {
    type: ApiClmmPoolsItemStatisticSchema,
  },
  week: {
    type: ApiClmmPoolsItemStatisticSchema,
  },
  month: {
    type: ApiClmmPoolsItemStatisticSchema,
  },
  lookupTableAccount: {
    type: String,
    default: "",
  },
});

const ApiMintASchema = new Schema(
  {
    address: {
      type: String,
      default: "",
    },
    programId: {
      type: String,
      default: "",
    },
    decimals: {
      type: String,
      default: "",
    },
    extensions: {
      type: new Schema(
        {
          feeConfig: {
            type: String,
            default: "",
          },
        },
        { _id: false }
      )
    },
  },
  { _id: false }
);
const ApiMintBSchema = new Schema(
  {
    address: {
      type: String,
      default: "",
    },
    programId: {
      type: String,
      default: "",
    },
    decimals: {
      type: String,
      default: "",
    },
    extensions: {
      type: new Schema(
        {
          feeConfig: {
            type: String,
            default: "",
          },
        },
        { _id: false }
      )
    },
  },
  { _id: false }
);
const ApiMintLpSchema = new Schema(
  {
    address: {
      type: String,
      default: "",
    },
    programId: {
      type: String,
      default: "",
    },
    decimals: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);
const ApiVaultSchema = new Schema(
  {
    A: {
      type: String,
      default: "",
    },
    B: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);
const ApiConfigSchema = new Schema(
  {
    id: {
      type: String,
      default: "",
    },
    index: {
      type: String,
      default: "",
    },
    protocolFeeRate: {
      type: Number,
      default: 0,
    },
    tradeFeeRate: {
      type: Number,
      default: 0,
    },
    fundFeeRate: {
      type: Number,
      default: 0,
    },
    createPoolFee: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const cpmmPoolKeys = new Schema(
  {
    programId: {
      type: String,
      default: "",
    },
    id: {
      type: String,
      default: "",
    },
    mintA: {
      type: ApiMintASchema,
    },
    mintB: {
      type: ApiMintBSchema,
    },
    openTime: {
      type: String,
      default: "",
    },
    vault: {
      type: ApiVaultSchema
    },
    authority: {
      type: String,
      default: "",
    },
    mintLp: {
      type: ApiMintLpSchema
    },
    config: {
      type: ApiConfigSchema
    },
    observationId: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

// Token Schema
const Token = new Schema(
  {
    name: {
      type: String,
      default: "",
    },
    symbol: {
      type: String,
      default: "",
    },
    poolId: {
      type: String,
      default: "",
    },
    version: {
      type: Number,
      required: true,
    },
    mintA: {
      type: String,
      default: "",
    },
    mintB: {
      type: String,
      default: "",
    },
    ammKeys: {
      type: AmmPoolKeysSchema,
    },
    clmmKeys: {
      type: clmmPoolKeys,
    },
    cpmmKeys: {
      type: cpmmPoolKeys,
    },
    creation_ts: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true, // This option adds createdAt and updatedAt fields
  }
);

// Create compound index for username, wallet_address, and nonce
export default mongoose.model("token", Token);
