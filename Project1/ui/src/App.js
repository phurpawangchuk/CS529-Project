import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./App.css";

const APIS = {
  "multi-agent": { url: "http://localhost:8000", label: "Quiz Mock Master", hasSession: true },
  "llm-chat": { url: "http://localhost:8001", label: "LLM Chat (OpenAI)", hasSession: false },
};

const REASONING_LEVELS = ["low", "medium", "high"];
const LANGUAGES = ["", "French", "Spanish", "Dzongkha", "Hindi", "Chinese", "Japanese", "Korean", "German"];

const LESSONS = [1, 2, 3];

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeApi, setActiveApi] = useState("multi-agent");
  const [reasoning, setReasoning] = useState("medium");
  const [translateTo, setTranslateTo] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const messagesEndRef = useRef(null);

  const api = APIS[activeApi];
  const isLlm = activeApi === "llm-chat";
  const inQuizMode = selectedLesson !== null && quizQuestions.length > 0 && !quizFinished;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const generateQuestions = async (lessonNumber) => {
    if (loading) return;
    setSelectedLesson(lessonNumber);
    setQuizQuestions([]);
    setCurrentQuestion(0);
    setScore(0);
    setQuizFinished(false);
    setMessages([
      { role: "user", content: `Generate questions for Lesson ${lessonNumber}` },
    ]);
    setLoading(true);

    try {
      const res = await fetch(`${APIS["multi-agent"].url}/lessons/${lessonNumber}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to generate questions");
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
        { role: "error", content: `Failed to generate questions: ${err.message}` },
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
      const assessRes = await fetch(`${APIS["multi-agent"].url}/lessons/${selectedLesson}/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_number: questionNum,
          user_answer: text,
        }),
      });
      const assessData = await assessRes.json();

      if (!assessRes.ok) {
        throw new Error(assessData.detail || "Failed to assess answer");
      }

      const isCorrect = assessData.grading_result.toUpperCase().includes("CORRECT")
        && !assessData.grading_result.toUpperCase().includes("INCORRECT");

      if (isCorrect) {
        setScore((prev) => prev + 1);
      }

      // Step 2: Get tutor feedback
      const feedbackRes = await fetch(`${APIS["multi-agent"].url}/lessons/${selectedLesson}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question_number: questionNum,
          user_answer: text,
          grading_result: assessData.grading_result,
        }),
      });
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
        responseContent += `\n\n---\n\nPlease answer **Question ${nextQ + 1}:** ${quizQuestions[nextQ]}`;
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
        if (translateTo) body.translate_to = translateTo;
        if (instructions.trim()) body.instructions = instructions.trim();
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
        { role: "error", content: `Failed to reach ${api.label}. Is the API running?` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const resetChat = async () => {
    if (api.hasSession && sessionId) {
      await fetch(`${api.url}/reset?session_id=${sessionId}`, { method: "POST" }).catch(() => {});
    }
    setMessages([]);
    setSessionId(null);
    setSelectedLesson(null);
    setQuizQuestions([]);
    setCurrentQuestion(0);
    setScore(0);
    setQuizFinished(false);
  };

  const switchApi = (key) => {
    if (key === activeApi) return;
    setActiveApi(key);
    setMessages([]);
    setSessionId(null);
    setSelectedLesson(null);
    setQuizQuestions([]);
    setCurrentQuestion(0);
    setScore(0);
    setQuizFinished(false);
  };

  const welcomeText = isLlm
    ? "Ask anything — powered by OpenAI's Responses API. Use the controls below to set reasoning effort, instructions, or translation."
    : "An interactive chatbot that tests student understanding across 5 lesson documents. Each lesson generates 5 questions from the uploaded material and evaluates the student's answers with grading and tutor feedback.";

  const placeholderText = inQuizMode
    ? `Answer Question ${currentQuestion + 1}...`
    : "Type your message...";

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>{api.label}</h1>
        <div className="header-actions">
          <div className="api-toggle">
            {Object.entries(APIS).map(([key, val]) => (
              <button
                key={key}
                className={`toggle-btn ${activeApi === key ? "active" : ""}`}
                onClick={() => switchApi(key)}
              >
                {val.label}
              </button>
            ))}
          </div>
          <button className="reset-btn" onClick={resetChat}>New Chat</button>
        </div>
      </header>

      {/* LLM Chat controls */}
      {isLlm && (
        <div className="llm-controls">
          <div className="control-group">
            <label>Reasoning</label>
            <div className="reasoning-buttons">
              {REASONING_LEVELS.map((level) => (
                <button
                  key={level}
                  className={`reason-btn ${reasoning === level ? "active" : ""}`}
                  onClick={() => setReasoning(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <div className="control-group">
            <label>Translate to</label>
            <select value={translateTo} onChange={(e) => setTranslateTo(e.target.value)}>
              <option value="">None</option>
              {LANGUAGES.filter(Boolean).map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          <div className="control-group instructions-group">
            <label>Instructions (developer role)</label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder='e.g. "Talk like a pirate" or "Respond in bullet points"'
            />
          </div>
        </div>
      )}

      {/* Quiz progress bar */}
      {inQuizMode && (
        <div className="quiz-progress">
          <span>Lesson {selectedLesson} — Question {currentQuestion + 1} of {quizQuestions.length}</span>
          <span>Score: {score}</span>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
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
                    disabled={loading}
                  >
                    Lesson {num}
                  </button>
                ))}
              </div>
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
              <span></span><span></span><span></span>
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
        <button type="submit" disabled={loading || !input.trim()}>Send</button>
      </form>
    </div>
  );
}

export default App;
