import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import "./App.css";

const API_URL = "http://localhost:5000";

function App() {
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("dashboard");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Authentication States

const [isLoggedIn, setIsLoggedIn] = useState(
  !!localStorage.getItem("token")
);

const [authMode, setAuthMode] = useState("login");
const [authName, setAuthName] = useState("");
const [authEmail, setAuthEmail] = useState("");
const [authPassword, setAuthPassword] = useState("");
const [authError, setAuthError] = useState("");
const [authLoading, setAuthLoading] = useState(false);

// Authentication Function

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");

    if (!authEmail.trim() || !authPassword) {
      setAuthError("Please enter email and password");
      return;
    }

    if (authMode === "register" && !authName.trim()) {
      setAuthError("Please enter your name");
      return;
    }

    setAuthLoading(true);

    try {
      const endpoint =
        authMode === "register"
          ? "/api/auth/register"
          : "/api/auth/login";

      const body =
        authMode === "register"
          ? {
              name: authName,
              email: authEmail,
              password: authPassword
            }
          : {
              email: authEmail,
              password: authPassword
            };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Authentication failed");
      }

      if (authMode === "register") {
        setAuthMode("login");
        setAuthPassword("");
        setAuthError("Registration successful! Please login.");
      } else {
        localStorage.setItem("token", data.token);
        setIsLoggedIn(true);
        setAuthPassword("");
        setAuthError("");
        await loadHistory();
      }

    } catch (err) {
      setAuthError(err.message || "Something went wrong");
    } finally {
      setAuthLoading(false);
    }
  };
  
// =================================
  // LOGOUT FUNCTION
  // =================================

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
    } catch (error) {
      console.error("Logout Error:", error);
    }

    localStorage.removeItem("token");

    setIsLoggedIn(false);
    setHistory([]);
    setResult(null);
    setFile(null);
    setJobDescription("");
    setError("");
    setAuthPassword("");
    setAuthEmail("");
    setActiveSection("dashboard");
  };


  // =================================
  // 1. Load History From SQLite
  // =================================

  const loadHistory = async () => {
    setHistoryLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/resume/history`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Could not load resume history"
        );
      }

      const formattedHistory = data.history.map((item) => ({
        id: item.id,
        fileName: item.filename,
        date: item.created_at,
        score: item.score,
        ats_score: item.ats_score,
        match_percentage: item.match_percentage,
        summary: item.summary || "Analysis completed successfully."
      }));

      setHistory(formattedHistory);

    } catch (err) {
      console.error("History Loading Error:", err);
      setError(err.message || "Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // =================================
  // 2. Sidebar Navigation
  // =================================

  const handleNavigation = (section) => {
    setActiveSection(section);

    const sectionIds = {
      dashboard: "dashboard",
      upload: "upload-section",
      job: "job-description",
      result: "analysis-result",
      history: "analysis-history"
    };

    const element = document.getElementById(
      sectionIds[section]
    );

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: section === "job" ? "center" : "start"
      });
    }

    if (section === "history") {
      loadHistory();
    }
  };

  // =================================
  // 3. Resume Analysis
  // =================================

  const handleAnalyze = async () => {
    if (!file) {
      alert("Please select your PDF resume!");
      return;
    }

    if (!jobDescription.trim()) {
      alert("Please enter Job Description!");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();

      formData.append("resume", file);
      formData.append("jobDescription", jobDescription);

      const response = await fetch(
        `${API_URL}/api/resume/analyze`,
        {
          method: "POST",
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          data.message ||
          "Resume analysis failed!"
        );
      }

      setResult(data);

      // Reload saved history from SQLite
      await loadHistory();

      console.log("Resume Analysis Successful!", data);

      setActiveSection("result");

      setTimeout(() => {
        document
          .getElementById("analysis-result")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      }, 100);

    } catch (err) {
      console.error("FRONTEND ERROR:", err);
      setError(err.message || "Something went wrong!");
    } finally {
      setLoading(false);
    }
  };

  // =================================
  // 4. Clear SQLite History
  // =================================

  const handleClearHistory = async () => {
    if (history.length === 0) {
      alert("History is already empty!");
      return;
    }

    const confirmDelete = window.confirm(
      "Are you sure you want to delete all analysis history?"
    );

    if (!confirmDelete) return;

    try {
      const response = await fetch(
        `${API_URL}/api/resume/history`,
        {
          method: "DELETE"
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Could not delete history"
        );
      }

      await loadHistory();

      alert(
        `History deleted successfully! ${data.deleted} records removed.`
      );

    } catch (err) {
      console.error("CLEAR HISTORY ERROR:", err);
      alert("Clear History Failed: " + err.message);
    }
  };

  // =================================
  // 5. Download PDF Report
  // =================================

  const handleDownloadPDF = () => {
    if (!result) {
      alert("Please analyze your resume first!");
      return;
    }

    try {
      const doc = new jsPDF();

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const maxWidth = pageWidth - margin * 2;

      let y = 20;

      const addPageIfNeeded = (height = 10) => {
        if (y + height > pageHeight - 15) {
          doc.addPage();
          y = 20;
        }
      };

      const addHeading = (heading) => {
        addPageIfNeeded(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(heading, margin, y);
        y += 8;
      };

      const addText = (text) => {
        const lines = doc.splitTextToSize(
          String(text || "Not available"),
          maxWidth
        );

        lines.forEach((line) => {
          addPageIfNeeded(6);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);
          doc.text(line, margin, y);
          y += 6;
        });

        y += 2;
      };

      const addList = (heading, items) => {
        addHeading(heading);

        if (!Array.isArray(items) || items.length === 0) {
          addText("No information available.");
          return;
        }

        items.forEach((item) => {
          addText("- " + item);
        });

        y += 3;
      };

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);

      doc.text(
        "AI RESUME SCORER REPORT",
        margin,
        y
      );

      y += 12;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      doc.text(
        "Generated: " + new Date().toLocaleDateString(),
        margin,
        y
      );

      y += 12;

      addHeading("RESUME SCORES");

      addText(`Resume Score: ${result.score ?? "N/A"}/10`);
      addText(`ATS Score: ${result.ats_score ?? "N/A"}%`);
      addText(`Job Match: ${result.match_percentage ?? "N/A"}%`);

      addHeading("AI SUMMARY");
      addText(result.summary);

      addList("MATCHED SKILLS", result.matched_skills);
      addList("SKILLS FOUND", result.skills_found);
      addList("MISSING SKILLS", result.missing_skills);
      addList("STRENGTHS", result.strengths);
      addList("WEAKNESSES", result.weaknesses);
      addList("IMPROVEMENT SUGGESTIONS", result.suggestions);

      const totalPages = doc.internal.getNumberOfPages();

      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);

        doc.text(
          `AI Resume Scorer | Page ${i} of ${totalPages}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
      }

      doc.save("AI-Resume-Analysis-Report.pdf");

    } catch (err) {
      console.error("PDF DOWNLOAD ERROR:", err);
      alert("PDF download failed. Please try again.");
    }
  };

  // =================================
  // 6. Reset
  // =================================

  const handleReset = () => {
    setFile(null);
    setJobDescription("");
    setResult(null);
    setError("");
    setActiveSection("upload");

    const input = document.getElementById("resume-upload");

    if (input) {
      input.value = "";
    }

    document
      .getElementById("upload-section")
      ?.scrollIntoView({
        behavior: "smooth"
      });
  };

  // =================================
  // 7. Progress Bar Helper
  // =================================

  const getProgress = (value, max = 100) => {
    const number = Number(value);

    if (!Number.isFinite(number)) return 0;

    return Math.min(
      100,
      Math.max(0, (number / max) * 100)
    );
  };

  // =================================
  // LOGIN / REGISTER SCREEN
  // =================================

  if (!isLoggedIn) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>AI Resume Scorer</h1>
          <p>Smart Career Assistant</p>

          <h2>
            {authMode === "login" ? "Welcome Back!" : "Create Account"}
          </h2>

          <form onSubmit={handleAuth}>
            {authMode === "register" && (
              <input
                type="text"
                placeholder="Full Name"
                value={authName}
                onChange={(e) => setAuthName(e.target.value)}
              />
            )}

            <input
              type="email"
              placeholder="Email Address"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />

            {authError && <p>{authError}</p>}

            <button type="submit" disabled={authLoading}>
              {authLoading
                ? "Please wait..."
                : authMode === "login"
                ? "Login"
                : "Register"}
            </button>
          </form>

          <p>
            {authMode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}
          </p>

          <button
            type="button"
            onClick={() => {
              setAuthMode(
                authMode === "login" ? "register" : "login"
              );
              setAuthError("");
            }}
          >
            {authMode === "login" ? "Create Account" : "Login"}
          </button>
        </div>
      </div>
    );
  }

  // =================================
  // 8. Main UI
  // =================================

   return(
    <div className="app-layout">

      {/* Sidebar */}

      <aside className="sidebar">

        <div className="sidebar-brand">
          <div className="brand-icon">AI</div>

          <div>
            <h2>Resume Scorer</h2>
            <p>Smart Career Assistant</p>
          </div>
        </div>

        <div className="sidebar-menu">

          <p className="menu-heading">MAIN MENU</p>

          {[
            ["dashboard", "▦", "Dashboard"],
            ["upload", "↑", "Upload Your Resume"],
            ["job", "▤", "Job Description"],
            ["result", "▥", "Analysis Result"],
            ["history", "◷", "Analysis History"]
          ].map(([section, icon, label]) => (
            <button
              key={section}
              className={`sidebar-link ${
                activeSection === section ? "active" : ""
              }`}
              onClick={() => handleNavigation(section)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}

        </div>

        <div className="sidebar-footer">
          <button
  type="button"
  className="logout-btn"
  onClick={handleLogout}
>
  Logout
</button>
          <p>AI Resume Scorer</p>
          <span>Build your career with AI</span>
        </div>

      </aside>

      {/* Main Content */}

      <main className="main-content">

        {/* Dashboard */}

        <section
          id="dashboard"
          className="dashboard-header"
        >
          <div>
            <p className="welcome-text">
              WELCOME TO YOUR WORKSPACE
            </p>

            <h1>AI Resume Scorer</h1>

            <p className="header-description">
              Analyze your resume with AI and match it
              with your target job description.
            </p>
          </div>

          <div className="header-badge">
            <span>●</span> AI Powered
          </div>
        </section>

        {/* Upload Section */}

        <section
          id="upload-section"
          className="upload-section"
        >

          <div className="section-title">
            <div className="section-icon">↑</div>

            <div>
              <h2>Upload Your Resume</h2>
              <p>Upload your resume in PDF format.</p>
            </div>
          </div>

          <label htmlFor="resume-upload">
            Select Resume (PDF)
          </label>

          <input
            id="resume-upload"
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setResult(null);
              setError("");
            }}
          />

          {file && (
            <p className="selected-file">
              Selected File: <strong>{file.name}</strong>
            </p>
          )}

          <div
            id="job-description"
            className="job-description-area"
          >

            <div className="section-title">
              <div className="section-icon">▤</div>

              <div>
                <h2>Job Description</h2>
                <p>Paste the job requirements below.</p>
              </div>
            </div>

            <textarea
              rows="7"
              placeholder="Paste Job Description here..."
              value={jobDescription}
              onChange={(e) =>
                setJobDescription(e.target.value)
              }
            />

          </div>

          <div className="button-group">

            <button
              className="analyze-btn"
              onClick={handleAnalyze}
              disabled={loading}
            >
              {loading ? "Analyzing..." : "Analyze Resume"}
            </button>

            <button
              type="button"
              className="reset-btn"
              onClick={handleReset}
              disabled={loading}
            >
              Reset
            </button>

          </div>

        </section>

        {/* Loading */}

        {loading && (
          <div className="loading">
            <h3>AI is analyzing your resume...</h3>
            <p>Please wait. Do not refresh the page.</p>
          </div>
        )}

        {/* Error */}

        {error && (
          <div className="error">
            <h3>Analysis Error</h3>
            <p>{error}</p>
          </div>
        )}

        {/* Analysis Results */}

        <section
          id="analysis-result"
          className="result-section"
        >

          <div className="result-heading">
            <div>
              <p className="welcome-text">
                YOUR PERFORMANCE
              </p>

              <h2>Resume Analysis Result</h2>
            </div>
          </div>

          {result ? (
            <>

              {/* Score Cards */}

              <div className="score-cards">

                {[
                  {
                    title: "Resume Score",
                    value: `${result.score ?? "N/A"}/10`,
                    progress: getProgress(result.score, 10),
                    className: "resume-progress",
                    label: "Score"
                  },
                  {
                    title: "ATS Score",
                    value: `${result.ats_score ?? "N/A"}%`,
                    progress: getProgress(result.ats_score),
                    className: "ats-progress",
                    label: "Score"
                  },
                  {
                    title: "Job Match",
                    value: `${result.match_percentage ?? "N/A"}%`,
                    progress: getProgress(result.match_percentage),
                    className: "match-progress",
                    label: "Match"
                  }
                ].map((item) => (
                  <div className="score-card" key={item.title}>
                    <h3>{item.title}</h3>
                    <h2>{item.value}</h2>

                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${item.className}`}
                        style={{
                          width: `${item.progress}%`
                        }}
                      />
                    </div>

                    <p>
                      {item.progress}% {item.label}
                    </p>
                  </div>
                ))}

              </div>

              {/* AI Summary */}

              <div className="result-card">
                <h3>AI Summary</h3>
                <p>{result.summary}</p>
              </div>

              {/* Skill and Analysis Lists */}

              {[
                ["Matched Skills", result.matched_skills],
                ["Skills Found in Resume", result.skills_found],
                ["Missing Skills", result.missing_skills],
                ["Strengths", result.strengths],
                ["Weaknesses", result.weaknesses],
                ["Improvement Suggestions", result.suggestions]
              ].map(([heading, items]) => (
                <div className="result-card" key={heading}>
                  <h3>{heading}</h3>

                  {Array.isArray(items) && items.length > 0 ? (
                    <ul>
                      {items.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No information available.</p>
                  )}
                </div>
              ))}

              {/* Download PDF */}

              <div className="result-card download-card">
                <h3>Your Resume Report is Ready</h3>

                <p>
                  Your AI resume analysis report is ready to download.
                </p>

                <button
                  className="download-btn"
                  onClick={handleDownloadPDF}
                >
                  Download PDF Report
                </button>
              </div>

            </>
          ) : (
            <div className="empty-result">
              <div className="empty-result-icon">▥</div>

              <h3>Your analysis will appear here</h3>

              <p>
                Upload your resume and enter a job description.
                Then click Analyze Resume to see your results.
              </p>
            </div>
          )}

        </section>

        {/* =================================
            Analysis History - SQLite
        ================================= */}

        <section
          id="analysis-history"
          className="history-section"
        >

          <div className="history-heading">

            <div>
              <p className="welcome-text">
                YOUR PREVIOUS REPORTS
              </p>

              <h2>Analysis History</h2>

              <p>
                View your previously analyzed resumes.
              </p>
            </div>

            <button
              className="clear-history-btn"
              onClick={handleClearHistory}
              disabled={
                history.length === 0 || historyLoading
              }
            >
              Clear History
            </button>

          </div>

          {historyLoading ? (
            <div className="empty-history">
              <h3>Loading History...</h3>
              <p>Please wait.</p>
            </div>
          ) : history.length > 0 ? (

            <div className="history-list">

              {history.map((item) => (
                <div
                  className="history-card"
                  key={item.id}
                >

                  <div className="history-card-header">

                    <div>
                      <h3>{item.fileName}</h3>
                      <p>{item.date}</p>
                    </div>

                    <span className="history-status">
                      Analyzed
                    </span>

                  </div>

                  <div className="history-scores">

                    <div>
                      <span>Resume Score</span>
                      <strong>{item.score}/10</strong>
                    </div>

                    <div>
                      <span>ATS Score</span>
                      <strong>{item.ats_score}%</strong>
                    </div>

                    <div>
                      <span>Job Match</span>
                      <strong>{item.match_percentage}%</strong>
                    </div>

                  </div>

                  <div className="history-summary">
                    <strong>AI Summary</strong>
                    <p>{item.summary}</p>
                  </div>

                </div>
              ))}

            </div>

          ) : (

            <div className="empty-history">

              <div className="empty-result-icon">◷</div>

              <h3>No Analysis History Yet</h3>

              <p>
                Your completed resume analyses will appear here.
              </p>

            </div>

          )}

        </section>

        {/* Footer */}

        <footer className="main-footer">
          AI Resume Scorer | Smart Resume Analysis
        </footer>

      </main>

    </div>
  );
}

export default App;