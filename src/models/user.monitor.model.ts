/** @format */

import mongoose from "mongoose";
const Schema = mongoose.Schema;

const UserMonitor = new Schema(
  {
    // chat id
    chat_id: {
      type: String,
      default: "",
      required: true,
    },
    monitor_name: {
      type: String,
      default: "",
      required: true,
    },
    status: {
      type: Boolean,
      default: true, // true:running false:stopped
      required: true,
    },
  },
  {
    timestamps: true, // This option adds createdAt and updatedAt fields
  }
);

export default mongoose.model("userMonitor", UserMonitor);
