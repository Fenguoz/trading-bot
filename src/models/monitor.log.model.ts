/** @format */

import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Basic Schema
const MonitorLog = new Schema(
  {
    monitor_name: {
      type: String,
      default: "",
      required: true,
    },
    monitor_id: {
      type: String,
      default: "",
    },
    monitor_tweet_id: {
      type: String,
      default: "",
      required: true,
    },
    chat_ids: {
      type: Array,
      default: [],
      required: true,
    },
    address: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      default: 'twiiter',
    },
  },
  {
    timestamps: true, // This option adds createdAt and updatedAt fields
  }
);

export default mongoose.model("monitorLog", MonitorLog);
