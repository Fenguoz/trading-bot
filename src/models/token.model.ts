/** @format */

import mongoose from "mongoose";
const Schema = mongoose.Schema;


// Token Schema
const Token = new Schema(
  {
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
  },
  {
    timestamps: true, // This option adds createdAt and updatedAt fields
  }
);

// Create compound index for username, wallet_address, and nonce
export default mongoose.model("token", Token);
