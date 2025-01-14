/** @format */

import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Basic Schema
const TxLog = new Schema(
  {
    chat_id: {
      type: String,
      default: "",
      required: true,
    },
    address: {
      type: String,
      default: "",
    },
    hash: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      default: 'monitor_auto_buy',
    },
  },
  {
    timestamps: true, // This option adds createdAt and updatedAt fields
  }
);

export default mongoose.model("txLog", TxLog);
