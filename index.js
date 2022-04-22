const path = require("path");

require("dotenv").config();
const cors = require("cors");

const axios = require("axios");
const mongoose = require("mongoose");
const express = require("express");
const app = express();

const Team = require("./models/team.model");

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(cors());

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, KEY, PORT, MONGODB_URI } =
  process.env;

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
        callback_id,
        state: { values },
      } = view;

      if (callback_id === "lecture_feedback") {
        res.status(200).json({ response_action: "clear" });
      }
    } else {
      const { accessToken, companies } = await Team.findOne({
        teamId: team.id,
      });

      let interviewScheduleForm = require("./forms/interview-schedule.json");

      interviewScheduleForm.view.blocks[3].element.options = companies.map(
        (lead) => ({
          text: {
            type: "plain_text",
            text: `${lead.charAt(0).toUpperCase() + lead.slice(1)}`,
            emoji: true,
          },
          value: `${lead.trim().toLowerCase().replace(/ /g, "-")}`,
        })
      );

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

      return res.send('ok');
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
  } catch (err) {
    res.status(500).send(`Something went wrong: ${err}`);
  }
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
