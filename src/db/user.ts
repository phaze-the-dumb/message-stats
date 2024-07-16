import mongoose from "mongoose";

let schema = new mongoose.Schema({
  _id: String,
  avatar: String,
  username: String,

  messageCreateCount: Number,
  messageDeleteCount: Number,
  messageEditCount: Number,

  wins: Number
});

export default mongoose.model("Users", schema);