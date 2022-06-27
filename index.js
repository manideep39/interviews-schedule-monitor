const path = require("path");
require("dotenv").config();
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");
const express = require("express");
const { google } = require("googleapis");

const Team = require("./models/team.model");
const InterviewSchedule = require("./models/interview-schedule.model");
const InterviewExperience = require("./models/interview-experience.model");
const GlobalData = require("./models/global-data.model");

const serviceKeyFile = require("./service-key.json");

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  KEY,
  PORT,
  MONGODB_URI,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_CLIENT_EMAIL,
  SUBJECT,
} = process.env;

const auth = new google.auth.JWT({
  email: GOOGLE_CLIENT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/calendar"],
  subject: SUBJECT,
});

const calendar = google.calendar({ version: "v3", auth });

const app = express();

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(cors());

app.listen(PORT || 3000, () => {
  try {
    mongoose.connect(
      MONGODB_URI,
      { useNewUrlParser: true, useUnifiedTopology: true },
      () => console.log("Mongoose is connected")
    );
  } catch (e) {
    console.log("could not connect");
  }
  console.log(`listening on port ${PORT}`);
});

app.get("/health-check", async (req, res) => {
  return res.send("ok");
});

app.get("/callback", generateAccessToken, async (req, res) => {
  try {
    const slackData = req.slackData;
    const {
      team: { id: teamId, name },
      access_token: accessToken,
    } = slackData;

    const oldTeam = await Team.find({ teamId }).lean();
    if (!oldTeam.length) {
      await Team.create({ teamId, name, accessToken });
    } else {
      await Team.findOneAndUpdate({ teamId }, { accessToken });
    }

    res.send("success");
  } catch (err) {
    res.status(500).send(`Something went wrong: ${err}`);
  }
});

app.post("/slack/interactive-endpoint", async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload);
    const { callback_id, trigger_id, team, type, view, user } = payload;
    if (type === "view_submission") {
      const {
        state: { values },
        callback_id,
      } = view;
      if (callback_id === "interview_schedule") {
        try {
          const name = values["student-name"]["student-name"].value;
          const studentCode = values.studentCode.studentCode.value;
          const email = values.email.email.value;
          const companyName =
            values["company-name"]["company-name"].selected_option.value;
          const interviewDate =
            values["interview-date"]["interview-date"].selected_date;
          const interviewStartTime =
            values["interview-start-time"]["interview-start-time"]
              .selected_time;
          const interviewEndTime =
            values["interview-end-time"]["interview-end-time"].selected_time;
          const interviewRound =
            values["interview-round"]["interview-round"].selected_option.value;
          const interviewType =
            values["interview-type"]["interview-type"].selected_option.value;
          const { calendarId } = await Team.findOne({
            teamId: team.id,
          });

          const response = await InterviewSchedule.create({
            teamId: team.id,
            userId: user.id,
            batchName: team.domain,
            name,
            studentCode,
            email,
            companyName,
            interviewDate,
            interviewStartTime,
            interviewEndTime,
            interviewRound,
            interviewType,
          });

          calendar.events.insert(
            {
              calendarId: calendarId || SUBJECT,
              sendUpdates: "all",
              requestBody: {
                summary: `${name}; ${studentCode}; ${
                  companyName.charAt(0).toUpperCase() + companyName.slice(1)
                }`,
                description: `Round: ${interviewRound}; Type: ${interviewType};`,
                start: {
                  dateTime: `${interviewDate}T${interviewStartTime}:00`,
                  timeZone: "Asia/Kolkata",
                },
                end: {
                  dateTime: `${interviewDate}T${interviewEndTime}:00`,
                  timeZone: "Asia/Kolkata",
                },
                attendees: [{ email }],
                reminders: {
                  useDefault: false,
                  overrides: [
                    { method: "email", minutes: 24 * 60 },
                    { method: "popup", minutes: 10 },
                  ],
                },
              },
            },
            (err, res) => {
              if (err)
                return console.error(
                  "The Calendar API returned an error: " + err
                );
            }
          );
        } catch (error) {
          console.error(
            "Interview schedule submission error: " + error.message
          );
        }
      } else if (callback_id === "interview_experience") {
        try {
          const studentCode =
            values.studentCode.studentCode.value.toLowerCase();
          const email = values.email.email.value.toLowerCase();
          const companyName =
            values["company-name"]["company-name"].selected_option.value;
          const interviewRound =
            values["interview-round"]["interview-round"].selected_option.value;
          const interviewType =
            values["interview-type"]["interview-type"].selected_option.value;
          const interviewerDetails =
            values.interviewerDetails.interviewerDetails.value;
          const questionsAsked = values.questionsAsked.questionsAsked.value;
          const codingTopicsAsked =
            values.codingTopicsAsked.codingTopicsAsked.selected_options
              .map((item) => item.value)
              .join(",");
          const dsaTopicsAsked =
            values.dsaTopicsAsked.dsaTopicsAsked.selected_options
              .map((item) => item.value)
              .join(",");
          const whatWentWell = values.whatWentWell.whatWentWell.value;
          const whatWentWrong = values.whatWentWrong.whatWentWrong.value;
          const extentTopicsCovered =
            values.extentTopicsCovered.extentTopicsCovered.selected_option
              .value;
          const topicsNotOrPartiallyCovered =
            values.topicsNotOrPartiallyCovered.topicsNotOrPartiallyCovered
              .value;
          const movedToNextRoundOrAnOffer =
            values.movedToNextRoundOrAnOffer.movedToNextRoundOrAnOffer
              .selected_option.value;
          const wantToChange = values.wantToChange.wantToChange.value;
          const assignmentOrRelevantDocLink =
            values.assignmentOrRelevantDocLink.assignmentOrRelevantDocLink
              .value;

          await InterviewExperience.create({
            teamId: team.id,
            userId: user.id,
            batchName: team.domain,
            studentCode,
            email,
            companyName,
            interviewRound,
            interviewType,
            interviewerDetails,
            questionsAsked,
            codingTopicsAsked,
            dsaTopicsAsked,
            whatWentWell,
            whatWentWrong,
            extentTopicsCovered,
            topicsNotOrPartiallyCovered,
            movedToNextRoundOrAnOffer,
            wantToChange,
            assignmentOrRelevantDocLink,
          });
        } catch (error) {
          console.error(
            "Interview experience submission error: " + error.message
          );
        }
      }
      res.status(200).json({ response_action: "clear" });
    } else if (type === "shortcut") {
      const { accessToken, companies } = await Team.findOne({
        teamId: team.id,
      });
      const interviewTypes = await GlobalData.find({
        name: "interviewTypes",
      }).lean();
      if (callback_id === "interview_ experience") {
        const codingTopics = await GlobalData.find({
          name: "codingTopics",
        }).lean();
        const dsaTopics = await GlobalData.find({ name: "dsaTopics" }).lean();

        let interviewExperienceForm = require("./forms/interview-experience.json");

        interviewExperienceForm.view.blocks[2].element.options = companies.map(
          (ele) => ({
            text: {
              type: "plain_text",
              text: `${ele.charAt(0).toUpperCase() + ele.slice(1)}`,
              emoji: true,
            },
            value: `${ele.trim()}`,
          })
        );
        interviewExperienceForm.view.blocks[4].element.options =
          interviewTypes[0].arrayValue.map((ele) => ({
            text: {
              type: "plain_text",
              text: `${ele.charAt(0).toUpperCase() + ele.slice(1)}`,
              emoji: true,
            },
            value: `${ele.trim().toLowerCase().replace(/ /g, "-")}`,
          }));
        interviewExperienceForm.view.blocks[7].element.options =
          codingTopics[0].arrayValue.map((ele) => ({
            text: {
              type: "plain_text",
              text: `${ele.charAt(0).toUpperCase() + ele.slice(1)}`,
              emoji: true,
            },
            value: `${ele.trim().toLowerCase().replace(/ /g, "-")}`,
          }));
        interviewExperienceForm.view.blocks[8].element.options =
          dsaTopics[0].arrayValue.map((ele) => ({
            text: {
              type: "plain_text",
              text: `${ele.charAt(0).toUpperCase() + ele.slice(1)}`,
              emoji: true,
            },
            value: `${ele.trim().toLowerCase().replace(/ /g, "-")}`,
          }));

        interviewExperienceForm.trigger_id = trigger_id;
        const response = await axios({
          method: "post",
          url: "https://slack.com/api/views.open",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json; charset=utf-8",
          },
          data: interviewExperienceForm,
        });
      } else if (callback_id === "interview_schedule") {
        let interviewScheduleForm = require("./forms/interview-schedule.json");

        interviewScheduleForm.view.blocks[3].element.options = companies.map(
          (ele) => ({
            text: {
              type: "plain_text",
              text: `${ele.charAt(0).toUpperCase() + ele.slice(1)}`,
              emoji: true,
            },
            value: `${ele.trim().toLowerCase()}`,
          })
        );
        interviewScheduleForm.view.blocks[8].element.options =
          interviewTypes[0].arrayValue.map((ele) => ({
            text: {
              type: "plain_text",
              text: `${ele.charAt(0).toUpperCase() + ele.slice(1)}`,
              emoji: true,
            },
            value: `${ele.trim()}`,
          }));
        interviewScheduleForm.trigger_id = trigger_id;
        const response = await axios({
          method: "post",
          url: "https://slack.com/api/views.open",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/json; charset=utf-8",
          },
          data: interviewScheduleForm,
        });
      }
      return res.send("ok");
    }
  } catch (e) {
    console.error(e);
  }
});

app.post("/companies", async (req, res) => {
  try {
    const { companies, key, teamId } = req.body;

    if (key != KEY) {
      return res.status(403).send("You are not authorized. Wrong key.");
    }

    const { companies: existingCompanies } = await Team.findOne({ teamId }, { companies: 1 });
    const slackDropdownLimit = 100;

    if (existingCompanies.length + companies.length > slackDropdownLimit) {
      res.status(400).send(`Not Updated!. Addding new companies will cross the limit of ${slackDropdownLimit} iteam in slack dropdown list. 
      Try deleting some companies in database or try adding fewer iteams. Currently you can add ${slackDropdownLimit - existingCompanies.length} companies only.`);
    } else {
      await Team.findOneAndUpdate(
        { teamId },
        {
          $addToSet: {
            companies: {
              $each: companies.map((e) => e.trim().toLowerCase()),
            },
          },
        }
      );
  
      res.status(200).send("Updated!");
    }
  } catch (err) {
    res.status(500).send(`Something went wrong: ${err}`);
  }
});

app.get("/interviews-schedule/:date", async (req, res) => {
  try {
    const interviewsSchedule = await InterviewSchedule.find({
      interviewDate: req.params.date,
    }).lean();
    res.status(200).json(interviewsSchedule);
  } catch (error) {
    res.status(500).send(`Something went wrong: ${err}`);
  }
});

app.patch("/teams/:teamId/calendar", async (req, res) => {
  const { calendarId, key } = req.body;
  const teamId = req.params.teamId;
  if (key != KEY) {
    return res.status(403).send("You are not authorized. Wrong key.");
  }
  try {
    await Team.findOneAndUpdate({ teamId }, { calendarId });
    res.status(200).send("Updated!");
  } catch (error) {
    res.status(500).send(`Something went wrong: ${err}`);
  }
});

app.post("/global-data/:name", async (req, res) => {
  const name = req.params.name;
  const { arrayValue = [], stringValue = "", key } = req.body;
  if (key != KEY) {
    return res.status(403).send("You are not authorized. Wrong key.");
  }
  const globalVariables = await GlobalData.find({ name }).lean();
  if (!globalVariables.length) {
    await GlobalData.create({ name, arrayValue, stringValue });
  } else {
    await GlobalData.findOneAndUpdate(
      { name },
      {
        $addToSet: {
          arrayValue: {
            $each: arrayValue.map((e) => e.trim().toLowerCase()),
          },
        },
        stringValue,
      }
    );
  }

  res.status(200).send("Updated!");
});

async function generateAccessToken(req, res, next) {
  const code = req.query.code;
  const url = "https://slack.com/api/oauth.v2.access";
  const requestBody = new URLSearchParams(
    Object.entries({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
    })
  ).toString();
  const { data } = await postData(url, requestBody);
  req.slackData = data;

  next();
}

// Example POST method implementation:
async function postData(url = "", data = "") {
  // Default options are marked with *
  const response = await axios({
    url,
    method: "post",
    mode: "cors", // no-cors, *cors, same-origin
    credentials: "same-origin", // include, *same-origin, omit
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    redirect: "follow", // manual, *follow, error
    referrerPolicy: "no-referrer", // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
    data, // body data type must match "Content-Type" header
  });
  return response; // parses JSON response into native JavaScript objects
}
