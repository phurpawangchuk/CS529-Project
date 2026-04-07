import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const APIS = {
  "multi-agent": {
    url: "http://localhost:8000",
    label: "Quiz Mock Master",
    hasSession: true,
  },
  "llm-chat": {
    url: "http://localhost:8001",
    label: "LLM Chat (OpenAI)",
    hasSession: false,
  },
};

const REASONING_LEVELS = ["low", "medium", "high"];

const LESSONS = [1, 2, 3];

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeApi, setActiveApi] = useState("multi-agent");
  const [reasoning, setReasoning] = useState("medium");
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.7);
  const [availableModels, setAvailableModels] = useState(["gpt-4o-mini"]);
  const [lessonConfigs, setLessonConfigs] = useState([]);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [historyLesson, setHistoryLesson] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const historyMenuRef = useRef(null);
  const messagesEndRef = useRef(null);

  const api = APIS[activeApi];
  const isLlm = activeApi === "llm-chat";
  const inQuizMode =
    selectedLesson !== null && quizQuestions.length > 0 && !quizFinished;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch settings from backend on mount
  useEffect(() => {
    fetch(`${APIS["multi-agent"].url}/settings`)
      .then((res) => res.json())
      .then((data) => {
        setModel(data.model || "gpt-4o-mini");
        setTemperature(data.temperature ?? 0.7);
        setAvailableModels(data.available_models || []);
        setLessonConfigs(data.lessons || []);
      })
      .catch(() => {});
  }, []);

  const updateSetting = (updates) => {
    fetch(`${APIS["multi-agent"].url}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
      .then((res) => res.json())
      .then((data) => {
        setModel(data.model);
        setTemperature(data.temperature);
        setLessonConfigs(data.lessons || []);
      })
      .catch(() => {});
  };

  // Close history menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (historyMenuRef.current && !historyMenuRef.current.contains(e.target)) {
        setHistoryMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const generateQuestions = async (lessonNumber) => {
    if (loading) return;
    setSelectedLesson(lessonNumber);
    setQuizQuestions([]);
    setCurrentQuestion(0);
    setScore(0);
    setQuizFinished(false);
    setMessages([
      {
        role: "user",
        content: `Generate questions for Lesson ${lessonNumber}`,
      },
    ]);
    setLoading(true);

    try {
      const res = await fetch(
        `${APIS["multi-agent"].url}/lessons/${lessonNumber}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await res.json();

      if (!res.ok) {
        const detail = data.detail;
        const errorMsg =
          typeof detail === "object" && detail.message
            ? detail.message
            : detail || "Failed to generate questions";
        throw new Error(errorMsg);
      }

      setQuizQuestions(data.questions);
      setCurrentQuestion(0);

      const questionsText = data.questions
        .map((q, i) => `**Question ${i + 1}:** ${q}`)
        .join("\n\n");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Here are 5 questions for **Lesson ${lessonNumber}**:\n\n${questionsText}\n\n---\n\nLet's start! Please answer **Question 1** below.`,
          agent: "Question Generator",
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content: `Failed to generate questions: ${err.message}`,
        },
      ]);
      setSelectedLesson(null);
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const questionNum = currentQuestion + 1;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      // Step 1: Assess the answer
      const assessRes = await fetch(
        `${APIS["multi-agent"].url}/lessons/${selectedLesson}/assess`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_number: questionNum,
            user_answer: text,
          }),
        }
      );
      const assessData = await assessRes.json();

      if (!assessRes.ok) {
        throw new Error(assessData.detail || "Failed to assess answer");
      }

      const isCorrect =
        assessData.grading_result.toUpperCase().includes("CORRECT") &&
        !assessData.grading_result.toUpperCase().includes("INCORRECT");

      if (isCorrect) {
        setScore((prev) => prev + 1);
      }

      // Step 2: Get tutor feedback
      const feedbackRes = await fetch(
        `${APIS["multi-agent"].url}/lessons/${selectedLesson}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_number: questionNum,
            user_answer: text,
            grading_result: assessData.grading_result,
          }),
        }
      );
      const feedbackData = await feedbackRes.json();

      if (!feedbackRes.ok) {
        throw new Error(feedbackData.detail || "Failed to get feedback");
      }

      const nextQ = currentQuestion + 1;
      const isLast = nextQ >= quizQuestions.length;

      let responseContent = `**${assessData.grading_result}**\n\n${feedbackData.tutor_feedback}`;

      if (isLast) {
        const finalScore = isCorrect ? score + 1 : score;
        responseContent += `\n\n---\n\n**Quiz Complete!** Your score: **${finalScore} / ${quizQuestions.length}**\n\nClick "New Chat" or select another lesson to try again.`;
        setQuizFinished(true);
      } else {
        responseContent += `\n\n---\n\nPlease answer **Question ${
          nextQ + 1
        }:** ${quizQuestions[nextQ]}`;
        setCurrentQuestion(nextQ);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: responseContent,
          agent: isLast ? "Quiz Complete" : "Tutor",
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "error", content: `Error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e) => {
    // If in quiz mode, route to quiz answer handler
    if (inQuizMode) {
      return submitAnswer(e);
    }

    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const body = { message: text };

      if (api.hasSession && sessionId) {
        body.session_id = sessionId;
      }

      // LLM Chat supports extra options
      if (isLlm) {
        body.reasoning = reasoning;
      }

      const res = await fetch(`${api.url}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.session_id) setSessionId(data.session_id);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          agent: data.agent || null,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content: `Failed to reach ${api.label}. Is the API running?`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetChat = async () => {
    if (api.hasSession && sessionId) {
      await fetch(`${api.url}/reset?session_id=${sessionId}`, {
        method: "POST",
      }).catch(() => {});
    }
    setMessages([]);
    setSessionId(null);
    setSelectedLesson(null);
    setQuizQuestions([]);
    setCurrentQuestion(0);
    setScore(0);
    setQuizFinished(false);
    setHistoryData(null);
    setHistoryLesson(null);
  };

  const fetchHistory = async (lessonNumber) => {
    if (historyLoading) return;
    setHistoryMenuOpen(false);
    setHistoryLoading(true);
    setHistoryLesson(lessonNumber);
    setHistoryData(null);
    // Clear quiz state when viewing history
    setMessages([]);
    setSelectedLesson(null);
    setQuizQuestions([]);
    setCurrentQuestion(0);
    setScore(0);
    setQuizFinished(false);

    try {
      const res = await fetch(
        `${APIS["multi-agent"].url}/lessons/${lessonNumber}/history`
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to fetch history");
      }
      setHistoryData(data);
    } catch (err) {
      setHistoryData({ error: err.message });
    } finally {
      setHistoryLoading(false);
    }
  };

  const welcomeText = isLlm
    ? "Ask anything — powered by OpenAI's Responses API. Use the controls below to set reasoning effort, instructions, or translation."
    : "An interactive chatbot that tests student understanding across 5 lesson documents. Each lesson generates 5 questions from the uploaded material and evaluates the student's answers with grading and tutor feedback.";

  const placeholderText = inQuizMode
    ? `Answer Question ${currentQuestion + 1}...`
    : "Type your message...";

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon">{"\u{1F3AF}"}</span>
          Quiz Mock Master
        </div>
        <nav className="sidebar-nav">
          {/* History */}
          <div className="sidebar-menu-item" ref={historyMenuRef}>
            <button
              className={`sidebar-menu-btn ${historyMenuOpen ? "open" : ""}`}
              onClick={() => setHistoryMenuOpen((prev) => !prev)}>
              <span className="sidebar-icon">&#128218;</span>
              <span>History</span>
              <span className={`sidebar-chevron ${historyMenuOpen ? "open" : ""}`}>&#8249;</span>
            </button>
            {historyMenuOpen && (
              <div className="sidebar-submenu">
                {LESSONS.map((num) => (
                  <button
                    key={num}
                    className={`sidebar-submenu-item ${historyLesson === num ? "active" : ""}`}
                    onClick={() => fetchHistory(num)}
                    disabled={historyLoading}>
                    <span className="sidebar-icon">&#128209;</span>
                    Lesson {num}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="sidebar-menu-item">
            <button
              className={`sidebar-menu-btn ${settingsMenuOpen ? "open" : ""}`}
              onClick={() => setSettingsMenuOpen((prev) => !prev)}>
              <span className="sidebar-icon">&#9881;</span>
              <span>Settings</span>
              <span className={`sidebar-chevron ${settingsMenuOpen ? "open" : ""}`}>&#8249;</span>
            </button>
            {settingsMenuOpen && (
              <div className="sidebar-submenu">
                <div className="sidebar-settings-group">
                  <label>Lesson Configuration</label>
                  <div className="sidebar-lesson-configs">
                    {lessonConfigs.map((lc) => (
                      <div key={lc.lesson_number} className="sidebar-lesson-config-item">
                        <span>Lesson {lc.lesson_number}</span>
                        <span className={`sidebar-config-status ${lc.configured ? "configured" : "not-configured"}`}>
                          {lc.configured ? "Configured" : "Not configured"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="sidebar-settings-group">
                  <label>Model</label>
                  <select
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      updateSetting({ model: e.target.value });
                    }}>
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="sidebar-settings-group">
                  <label>Temperature: {temperature.toFixed(1)}</label>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTemperature(val);
                      updateSetting({ temperature: val });
                    }}
                  />
                  <div className="sidebar-range-labels">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>
                <div className="sidebar-settings-group">
                  <label>Reasoning</label>
                  <div className="sidebar-reasoning-buttons">
                    {REASONING_LEVELS.map((level) => (
                      <button
                        key={level}
                        className={`sidebar-reason-btn ${reasoning === level ? "active" : ""}`}
                        onClick={() => setReasoning(level)}>
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload */}
          <button className="sidebar-menu-btn">
            <span className="sidebar-icon">{"\u{1F4E4}"}</span>
            <span>Upload</span>
          </button>
        </nav>
      </aside>

      <div className="chat-container">
        <header className="chat-header">
          <div className="header-spacer" />
          <button className="reset-btn" onClick={resetChat}>
            New Chat
          </button>
        </header>

      {/* Quiz progress bar */}
      {inQuizMode && (
        <div className="quiz-progress">
          <span>
            Lesson {selectedLesson} — Question {currentQuestion + 1} of{" "}
            {quizQuestions.length}
          </span>
          <span>Score: {score}</span>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && !historyData && (
          <div className="welcome">
            <h2>How can I help you today?</h2>
            <p>{welcomeText}</p>
            {!isLlm && (
              <div className="lesson-buttons">
                {LESSONS.map((num) => (
                  <button
                    key={num}
                    className="lesson-btn"
                    onClick={() => generateQuestions(num)}
                    disabled={loading}>
                    Lesson {num}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {historyData && historyLesson && (
          <div className="history-view">
            <div className="history-header">
              <h3>Lesson {historyLesson} — Quiz History</h3>
            </div>
            {historyData.error ? (
              <p className="history-error">{historyData.error}</p>
            ) : historyData.assessments && historyData.assessments.length > 0 ? (
              historyData.assessments.map((a, i) => {
                const fb = historyData.feedback?.[i];
                const isCorrect =
                  a.grading_result.toUpperCase().includes("CORRECT") &&
                  !a.grading_result.toUpperCase().includes("INCORRECT");
                return (
                  <div key={i} className="history-card">
                    <div className="history-q-header">
                      <span className="history-q-num">Q{a.question_number}</span>
                      <span className={`history-verdict ${isCorrect ? "correct" : "incorrect"}`}>
                        {isCorrect ? "Correct" : "Incorrect"}
                      </span>
                      <span className="history-date">
                        {new Date(a.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="history-answer">
                      <strong>Your answer:</strong> {a.user_answer}
                    </div>
                    <div className="history-grading">
                      <ReactMarkdown>{a.grading_result}</ReactMarkdown>
                    </div>
                    {fb && (
                      <div className="history-feedback">
                        <strong>Tutor Feedback:</strong>
                        <ReactMarkdown>{fb.tutor_feedback}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="history-empty">No quiz attempts yet for Lesson {historyLesson}.</p>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.agent && <span className="agent-badge">{msg.agent}</span>}
            <div className="message-content">
              {msg.role === "assistant" ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input" onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholderText}
          disabled={loading}
          autoFocus
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
    </div>
  );
}

export default App;
