const mongoose = require("mongoose");

const interviewSchedule = mongoose.Schema(
  {
    teamId: { type: String, required: true },
    batchName: { type: String, required: true },
    userId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    studentCode: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    interviewDate: { type: String, required: true },
    interviewStartTime: { type: String, required: true },
    interviewEndTime: { type: String, required: true },
    interviewRound: { type: String, required: true},
    interviewType: [{ type: String, required: true}]
  },
  { timestamps: true }
);

interviewSchedule.index(
  { studentCode: 1, companyName: 1, interviewDate: 1, interviewStartTime: 1, interviewEndTime: 1 },
  { unique: true }
);

module.exports = mongoose.model("interviews-schedule", interviewSchedule);