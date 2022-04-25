const path = require("path");
require("dotenv").config();
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");
const express = require("express");
const { google } = require("googleapis");

const Team = require("./models/team.model");
const InterviewSchedule = require("./models/interview-schedule.model");
const serviceKeyFile = require("./service-key-file.json");

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  KEY,
  PORT,
  MONGODB_URI,
  SCOPES,
  GOOGLE_PRIVATE_KEY,
  GOOGLE_CLIENT_EMAIL,
  GOOGLE_PROJECT_NUMBER,
  GOOGLE_CALENDAR_ID,
} = process.env;

const jwtClient = new google.auth.JWT(
  GOOGLE_CLIENT_EMAIL,
  null,
  GOOGLE_PRIVATE_KEY,
  SCOPES
);

const calendar = google.calendar({
  version: "v3",
  project: GOOGLE_PROJECT_NUMBER,
  auth: jwtClient,
});

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
      } = view;
      await InterviewSchedule.create({
        teamId: team.id,
        userId: user.id,
        name: values["student-name"]["student-name"].value,
        studentCode: values.studentCode.studentCode.value,
        email: values.email.email.value,
        companyName:
          values["company-name"]["company-name"].selected_option.value,
        interviewDate: values["interview-date"]["interview-date"].selected_date,
        interviewStartTime:
          values["interview-start-time"]["interview-start-time"].selected_time,
        interviewEndTime:
          values["interview-end-time"]["interview-end-time"].selected_time,
      });
      res.status(200).json({ response_action: "clear" });
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

app.get("/", (req, res) => {
  calendar.events.list(
    {
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    },
    (error, result) => {
      if (error) {
        res.send(JSON.stringify({ error: error }));
      } else {
        if (result.data.items.length) {
          res.send(JSON.stringify({ events: result.data.items }));
        } else {
          res.send(JSON.stringify({ message: "No upcoming events found." }));
        }
      }
    }
  );
});

app.get("/createEvent", (req, res) => {
  var event = {
    summary: "My first event!",
    location: "Hyderabad,India",
    description: "First event with nodeJS!",
    start: {
      dateTime: "2022-05-25T09:00:00-07:00",
      timeZone: "Asia/Dhaka",
    },
    end: {
      dateTime: "2022-05-25T10:00:00-07:00",
      timeZone: "Asia/Dhaka",
    },
    attendees: [],
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 10 },
      ],
    },
  };

  const auth = new google.auth.GoogleAuth({
    keyFile:
      "/Users/manideep/masai-school/interviews-schedule-monitor/service-key-file.json",
    scopes: "https://www.googleapis.com/auth/calendar",
  });
  auth.getClient().then((a) => {
    calendar.events.insert(
      {
        auth: a,
        calendarId: GOOGLE_CALENDAR_ID,
        resource: event,
      },
      function (err, event) {
        if (err) {
          console.log(
            "There was an error contacting the Calendar service: " + err
          );
          return;
        }
        console.log("Event created: %s", event.data);
        res.jsonp("Event successfully created!");
      }
    );
  });
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
