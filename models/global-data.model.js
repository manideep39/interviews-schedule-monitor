const mongoose = require("mongoose");

const globalData = mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    arrayValue: [{ type: String, required: false, trim: true }],
    stringValue: { type: String, required: false, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("global-variables", globalData);
