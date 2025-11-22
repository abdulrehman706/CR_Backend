import express from "express";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import { authMiddleware } from "./auth.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/* ---------------------------------------------------
   LOGIN ROUTE (Generates JWT)
---------------------------------------------------- */

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res
      .status(400)
      .json({ success: false, message: "Email & password required" });

  if (email !== process.env.ADMIN_EMAIL)
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });

  const match = await bcrypt.compare(
    password,
    await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)
  );

  if (!match)
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials" });

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

  res.json({ success: true, token });
});

/* ---------------------------------------------------
   GET CALL LOGS  (Protected)
---------------------------------------------------- */
app.get("/api/calls", authMiddleware, async (req, res) => {
  try {
    const calls = await client.calls.list({ limit: 50 });

    const formatted = calls.map((call) => ({
      sid: call.sid,
      from: call.from,
      to: call.to,
      status: call.status,
      duration: call.duration,
      startTime: call.startTime,
      endTime: call.endTime,
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ---------------------------------------------------
   GET RECORDINGS FOR A CALL  (Protected)
---------------------------------------------------- */
app.get("/api/call/:sid/recordings", authMiddleware, async (req, res) => {
  try {
    const recordings = await client.recordings.list({
      callSid: req.params.sid,
      limit: 20,
    });

    const formatted = recordings.map((r) => ({
      sid: r.sid,
      callSid: r.callSid,
      duration: r.duration,
      url: `https://api.twilio.com${r.uri.replace(".json", "")}`,
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/errors/messages
app.get("/api/errors/messages", authMiddleware, async (req, res) => {
  try {
    const messages = await client.messages.list({ limit: 100 });

    const errorMessages = messages.filter((msg) => msg.status === "failed");

    const formatted = messages.map((msg) => ({
      sid: msg.sid,
      from: msg.from,
      to: msg.to,
      status: msg.status,
      errorCode: msg.errorCode,
      body: msg.body,
      dateSent: msg.dateSent,
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
/* ---------------------------------------------------
   GET ALL RECORDINGS (Protected)
---------------------------------------------------- */
app.get("/api/recordings", authMiddleware, async (req, res) => {
  try {
    const recordings = await client.recordings.list({ limit: 50 });

    const formatted = recordings.map((r) => ({
      sid: r.sid,
      callSid: r.callSid,
      duration: r.duration,
      url: `https://api.twilio.com${r.uri.replace(".json", "")}`,
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
/* ---------------------------------------------------
   GET SINGLE RECORDING BY ID  (Protected)
---------------------------------------------------- */
app.get("/api/recording/:id", authMiddleware, async (req, res) => {
  try {
    const recording = await client.recordings(req.params.id).fetch();

    const data = {
      sid: recording.sid,
      callSid: recording.callSid,
      duration: recording.duration,
      url: `https://api.twilio.com${recording.uri.replace(".json", "")}`,
    };

    res.json({ success: true, data });
  } catch (err) {
    res.status(404).json({ success: false, error: "Recording not found" });
  }
});
/* ---------------------------------------------------
   GET TRANSCRIPT FOR SINGLE RECORDING  (Protected)
---------------------------------------------------- */
app.get("/api/transcript/:recordingId", authMiddleware, (req, res) => {
  try {
    const filePath = path.join(transcriptDir, `${req.params.recordingId}.json`);

    if (!fs.existsSync(filePath))
      return res
        .status(404)
        .json({ success: false, error: "Transcript not found" });

    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

    res.json({ success: true, data: json });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
/* ---------------------------------------------------
   GET ALL TRANSCRIPTS  (Protected)
---------------------------------------------------- */
app.get("/api/transcripts", authMiddleware, (req, res) => {
  try {
    const files = fs
      .readdirSync(transcriptDir)
      .filter((f) => f.endsWith(".json"));

    const transcripts = files.map((file) => {
      const json = JSON.parse(
        fs.readFileSync(path.join(transcriptDir, file), "utf8")
      );
      return {
        recordingId: file.replace(".json", ""),
        data: json,
      };
    });

    res.json({ success: true, count: transcripts.length, data: transcripts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ---------------------------------------------------
   GET CALL COUNTS ONLY  (Protected)
---------------------------------------------------- */
app.get("/api/calls/counts", authMiddleware, async (req, res) => {
  try {
    const calls = await client.calls.list({ limit: 500 });

    const failStatuses = ["failed", "busy", "no-answer", "canceled"];

    const successCount = calls.filter((c) => c.status === "completed").length;
    const failCount = calls.filter((c) =>
      failStatuses.includes(c.status)
    ).length;

    res.json({
      success: true,
      total: calls.length,
      successCount,
      failCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
/* ---------------------------------------------------
   START SERVER
---------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
