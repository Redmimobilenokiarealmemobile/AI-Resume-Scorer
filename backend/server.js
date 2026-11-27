require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdf = require("pdf-parse");
const Groq = require("groq-sdk");
const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// =================================
// 1. App Configuration
// =================================

const app = express();
const PORT = process.env.PORT || 5000;
const MODEL_NAME = "openai/gpt-oss-20b";

// =================================
// 2. Middleware
// =================================

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log("REQUEST RECEIVED:", req.method, req.url);
    next();
});



// =================================
// 3. Environment Validation
// =================================

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY missing in .env");
}

// =================================
// 4. Groq Configuration
// =================================

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// =================================
// 5. SQLite Database
// =================================

const db = new Database(
  path.join(__dirname, "resume.db")
);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS resume_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    job_description TEXT,
    score REAL,
    ats_score REAL,
    match_percentage REAL,
    result TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Users Table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

console.log("SQLite Database Connected Successfully!");

// =================================
// 6. PDF Upload Configuration
// =================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/pdf" &&
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed!"));
    }
  }
});

// =================================
// USER REGISTER API
// =================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters"
      });
    }

    const existingUser = db.prepare(
      "SELECT id FROM users WHERE email = ?"
    ).get(email.toLowerCase().trim());

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db.prepare(`
      INSERT INTO users (name, email, password)
      VALUES (?, ?, ?)
    `).run(
      name.trim(),
      email.toLowerCase().trim(),
      hashedPassword
    );

    res.status(201).json({
      success: true,
      message: "Registration successful",
      userId: result.lastInsertRowid
    });

  } catch (error) {
    console.error("Register Error:", error);

    res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
});


// =================================
// USER LOGIN API
// =================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required"
      });
    }

    const user = db.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).get(email.toLowerCase().trim());

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const isMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error("Login Error:", error);

    res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
});

// LOGOUT API

app.post("/api/auth/logout", (req, res) => {
  res.json({
    success:true,
    message:"Logout successful"
  });
});

// =================================
// 7. Home Route
// =================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "AI Resume Scorer Backend Running!",
    provider: "Groq",
    model: MODEL_NAME,
    database: "SQLite"
  });
});

// =================================
// 8. Resume Analysis Function
// =================================

async function analyzeResume(resumeText, jobDescription = "") {

  const prompt = `
You are a professional AI Resume Analyzer.

Analyze the resume and job description.

RESUME:
${resumeText.substring(0, 12000)}

JOB DESCRIPTION:
${jobDescription || "Evaluate for an entry-level software developer role."}

Return ONLY valid JSON:

{
  "score": 0,
  "ats_score": 0,
  "match_percentage": 0,
  "matched_skills": [],
  "strengths": [],
  "weaknesses": [],
  "suggestions": [],
  "skills_found": [],
  "missing_skills": [],
  "summary": ""
}

RULES:
- score must be between 0 and 10.
- ats_score must be between 0 and 100.
- match_percentage must be between 0 and 100.
- All scores must be numbers.
- All arrays must contain strings.
- Never invent skills or experience.
- Give practical suggestions.
- Return JSON only.
`;

  const completion = await groq.chat.completions.create({

    model: MODEL_NAME,

    messages: [
      {
        role: "system",
        content: "You are an expert resume analyzer. Return only valid JSON."
      },
      {
        role: "user",
        content: prompt
      }
    ],

    temperature: 0.2,
    max_completion_tokens: 2048,

    response_format: {
      type: "json_object"
    }

  });

  const text = completion.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("Empty response from Groq");
  }

  const result = JSON.parse(text);

  const arrayFields = [
    "matched_skills",
    "strengths",
    "weaknesses",
    "suggestions",
    "skills_found",
    "missing_skills"
  ];

  for (const field of arrayFields) {
    if (!Array.isArray(result[field])) {
      throw new Error(`Invalid field: ${field}`);
    }

    result[field] = result[field].filter(
      item => typeof item === "string"
    );
  }

  const scoreFields = [
    "score",
    "ats_score",
    "match_percentage"
  ];

  for (const field of scoreFields) {
    result[field] = Number(result[field]);

    const maximum = field === "score" ? 10 : 100;

    if (
      !Number.isFinite(result[field]) ||
      result[field] < 0 ||
      result[field] > maximum
    ) {
      throw new Error(`Invalid score: ${field}`);
    }
  }

  if (typeof result.summary !== "string") {
    throw new Error("Invalid summary");
  }

  return result;
}

// =================================
// 9. Resume Analysis API
// =================================

app.post(
  [
    "/analyze",
    "/api/resume/analyze",
    "/api/resume/match"
  ],

  upload.single("resume"),

  async (req, res) => {

    try {

      console.log("Resume Analysis Request Received");

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Please upload your resume PDF!"
        });
      }

      console.log("Uploaded:", req.file.originalname);

      const pdfData = await pdf(req.file.buffer);

      const resumeText = pdfData.text;

      if (!resumeText || resumeText.trim().length < 20) {
        return res.status(400).json({
          success: false,
          message: "Could not extract text from PDF!"
        });
      }

      const jobDescription =
        req.body.jobDescription ||
        req.body.job_description ||
        "";

      console.log("Sending resume to Groq...");

      const result = await analyzeResume(
        resumeText,
        jobDescription
      );

      // Save analysis in SQLite

      const statement = db.prepare(`
        INSERT INTO resume_analyses (
          filename,
          job_description,
          score,
          ats_score,
          match_percentage,
          result
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const saved = statement.run(
        req.file.originalname,
        jobDescription,
        result.score,
        result.ats_score,
        result.match_percentage,
        JSON.stringify(result)
      );

      console.log("Analysis Saved in SQLite!");
      console.log("Resume Analysis Successful!");

      return res.json({
        success: true,
        message: "Resume analyzed successfully!",
        id: saved.lastInsertRowid,
        provider: "Groq",
        ...result
      });

    } catch (error) {

      console.error("Analysis Error:", error);

      const status = Number(
        error.status || error.statusCode
      );

      const safeStatus = [
        400, 401, 403, 404, 413, 429, 500, 502, 503
      ].includes(status) ? status : 500;

      return res.status(safeStatus).json({
        success: false,
        message: "Resume analysis failed!",
        error: error.message
      });

    }

  }
);

// =================================
// 10. Resume History API
// =================================

app.get("/api/resume/history", (req, res) => {

  try {

    const history = db.prepare(`
      SELECT
        id,
        filename,
        job_description,
        score,
        ats_score,
        match_percentage,
        created_at
      FROM resume_analyses
      ORDER BY id DESC
    `).all();

    res.json({
      success: true,
      total: history.length,
      history
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Could not fetch resume history",
      error: error.message
    });

  }

});

// =================================
// 11. Get Single Resume Analysis
// =================================

app.get("/api/resume/history/:id", (req, res) => {

  try {

    const record = db.prepare(`
      SELECT * FROM resume_analyses WHERE id = ?
    `).get(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Resume record not found"
      });
    }

    res.json({
      success: true,
      ...record,
      result: JSON.parse(record.result)
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

});

// =================================
// Clear Resume History API
// =================================

// =================================
// Clear Resume History API
// =================================

app.delete("/api/resume/history", (req, res) => {
  try {
    const result = db.prepare(
      "DELETE FROM resume_analyses"
    ).run();

    console.log("Resume history cleared!");

    res.json({
      success: true,
      message: "Resume history cleared successfully!",
      deleted: result.changes
    });

  } catch (error) {
    console.error("Clear History Error:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =================================
// 12. Error Handler
// =================================

app.use((error, req, res, next) => {

  console.error("Server Error:", error.message);

  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Something went wrong!"
  });

});

// =================================
// 13. Start Server
// =================================

app.listen(PORT, () => {

  console.log("--------------------------------");
  console.log("AI RESUME SCORER BACKEND");
  console.log("AI Provider: Groq");
  console.log("Model:", MODEL_NAME);
  console.log("Database: SQLite");
  console.log(`Server running at http://localhost:${PORT}`);
  console.log("--------------------------------");

});