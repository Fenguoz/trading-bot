/** @format */

import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Basic Schema
const Monitor = new Schema(
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
    monitor_cursor: {
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

export default mongoose.model("monitor", Monitor);
