const mongoose = require("mongoose");

const interviewExperience = mongoose.Schema(
  {
    teamId: { type: String, required: true, trim: true },
    batchName: { type: String, required: true, trim: true },
    userId: { type: String, required: true, trim: true },
    studentCode: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    interviewRound: { type: String, required: true, trim: true },
    interviewType: { type: String, required: true, trim: true },
    interviewerDetails: { type: String, required: true, trim: true },
    questionsAsked: { type: String, required: true, trim: true },
    codingTopicsAsked: { type: String, required: true, trim: true },
    dsaTopicsAsked: { type: String, required: true, trim: true },
    whatWentWell: { type: String, required: true, trim: true },
    whatWentWrong: { type: String, required: true, trim: true },
    extentTopicsCovered: { type: String, required: true, trim: true },
    topicsNotOrPartiallyCovered: { type: String, required: true, trim: true },
    movedToNextRoundOrAnOffer: { type: String, required: true, trim: true },
    wantToChange: { type: String, required: true, trim: true},
    assignmentOrRelevantDocLink: { type: String, required: false, trim: true },
  },
  { timestamps: true }
);

interviewExperience.index(
  { studentCode: 1, companyName: 1, interviewRound: 1 },
  { unique: true }
);

module.exports = mongoose.model("interview-experience", interviewExperience);
