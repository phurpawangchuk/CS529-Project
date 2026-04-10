"""
generate_questions.py — Quiz Question Generator Agent

Uses FileSearchTool against lesson-specific vector stores to generate
5 study questions (with reference answers) grounded in each lesson document.

Pattern reference: 4_AgenticPatterns/tools/hostedtools.ipynb (FileSearchTool)
"""

import json
import os
import re
import sqlite3

from agents import Agent, Runner, trace, FileSearchTool

from read_document import (
    MODEL,
    QUESTIONS_PER_LESSON,
    get_vector_store_id,
)

# ---------------------------------------------------------------------------
# SQLite database setup
# ---------------------------------------------------------------------------
DB_PATH = os.path.join(os.path.dirname(__file__), "quiz_sessions.db")


def _get_connection() -> sqlite3.Connection:
    """Return a connection to the SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db():
    """Create tables if they don't exist."""
    conn = _get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_number INTEGER NOT NULL,
            question_number INTEGER NOT NULL,
            question TEXT NOT NULL,
            reference_answer TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(lesson_number, question_number)
        );

        CREATE TABLE IF NOT EXISTS assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_number INTEGER NOT NULL,
            question_number INTEGER NOT NULL,
            user_answer TEXT NOT NULL,
            grading_result TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lesson_number INTEGER NOT NULL,
            question_number INTEGER NOT NULL,
            user_answer TEXT NOT NULL,
            tutor_feedback TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()


_init_db()

# ---------------------------------------------------------------------------
# In-memory session cache (backed by SQLite)
# ---------------------------------------------------------------------------
SESSION: dict[int, dict] = {}


def _load_session_from_db(lesson_number: int) -> dict | None:
    """Load questions for a lesson from SQLite into SESSION cache."""
    conn = _get_connection()
    rows = conn.execute(
        "SELECT question, reference_answer, question_number "
        "FROM questions WHERE lesson_number = ? ORDER BY question_number",
        (lesson_number,),
    ).fetchall()
    conn.close()
    if not rows:
        return None
    data = {
        "questions": [row["question"] for row in rows],
        "reference_answers": [row["reference_answer"] for row in rows],
    }
    SESSION[lesson_number] = data
    return data


def _save_questions_to_db(lesson_number: int, questions: list[str], reference_answers: list[str]):
    """Persist generated questions and reference answers to SQLite."""
    conn = _get_connection()
    # Replace old questions for this lesson
    conn.execute("DELETE FROM questions WHERE lesson_number = ?", (lesson_number,))
    for i, (q, a) in enumerate(zip(questions, reference_answers), start=1):
        conn.execute(
            "INSERT INTO questions (lesson_number, question_number, question, reference_answer) "
            "VALUES (?, ?, ?, ?)",
            (lesson_number, i, q, a),
        )
    conn.commit()
    conn.close()


def save_assessment(lesson_number: int, question_number: int, user_answer: str, grading_result: str):
    """Store a grading result in the database."""
    conn = _get_connection()
    conn.execute(
        "INSERT INTO assessments (lesson_number, question_number, user_answer, grading_result) "
        "VALUES (?, ?, ?, ?)",
        (lesson_number, question_number, user_answer, grading_result),
    )
    conn.commit()
    conn.close()


def save_feedback(lesson_number: int, question_number: int, user_answer: str, tutor_feedback: str):
    """Store tutor feedback in the database."""
    conn = _get_connection()
    conn.execute(
        "INSERT INTO feedback (lesson_number, question_number, user_answer, tutor_feedback) "
        "VALUES (?, ?, ?, ?)",
        (lesson_number, question_number, user_answer, tutor_feedback),
    )
    conn.commit()
    conn.close()


def get_assessment_history(lesson_number: int) -> list[dict]:
    """Retrieve all assessment records for a lesson."""
    conn = _get_connection()
    rows = conn.execute(
        "SELECT question_number, user_answer, grading_result, created_at "
        "FROM assessments WHERE lesson_number = ? ORDER BY created_at",
        (lesson_number,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_feedback_history(lesson_number: int) -> list[dict]:
    """Retrieve all feedback records for a lesson."""
    conn = _get_connection()
    rows = conn.execute(
        "SELECT question_number, user_answer, tutor_feedback, created_at "
        "FROM feedback WHERE lesson_number = ? ORDER BY created_at",
        (lesson_number,),
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


# ---------------------------------------------------------------------------
# Prompt & instruction constants
# ---------------------------------------------------------------------------
# QUESTION_GENERATOR_INSTRUCTIONS = (
#     "You are an expert quiz creator. Your job is to generate study questions "
#     "from the uploaded lesson materials using the file search tool. "
#     "Rules:\n"
#     "  - Only use facts found via the file search tool; never invent information.\n"
#     "  - Cover different sections or key concepts from the lesson.\n"
#     "  - Return a single JSON object with exactly two keys:\n"
#     '      "questions"          — array of 5 question strings\n'
#     '      "reference_answers"  — array of 5 concise ideal-answer strings\n'
#     "  - Number questions implicitly by array index (1..5).\n"
#     "  - Output raw JSON only — no markdown fences, no extra text."
# )

QUESTION_GENERATOR_INSTRUCTIONS = (
    "You are an expert quiz generator. Create quiz questions only from the uploaded lesson materials using the file search tool. "
    "Do not invent or assume any information. Cover different sections or key concepts from the lesson. "
    "Return exactly one raw JSON object with these 4 keys only: "
    '"questions", "answers", "types", "options". '
    '"questions" must be an array of 5 items. '
    '"answers" must be an array of 5 items. '
    '"types" must be an array of 5 items, where each item is exactly one of: "multiple_choice", "fill_keyword", "true_or_false". '
    '"options" must be an array of 5 items aligned by index with the questions. '
    "For a multiple_choice question: provide exactly 4 options in options[index], and the answer must match exactly one of those options. "
    "For a fill_keyword question: the question must contain exactly one blank written as '____', options[index] must be an empty array, and the answer must be the missing main keyword. "
    "For a true_or_false question: options[index] must be an empty array, and the answer must be exactly 'true' or 'false'. "
    "Number questions implicitly by array index. Output raw JSON only with no markdown fences, labels, or extra text."
)

GENERATE_QUIZ_PROMPT = (
    "Generate exactly {n} distinct questions that test understanding of this lesson. "
    "Cover different sections or concepts when possible. "
    "Return only the JSON object as specified in your instructions."
)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def extract_json_object(text: str) -> dict:
    """Extract the first JSON object from model output."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError("No JSON object found in model output.")
    return json.loads(match.group(0))


# ---------------------------------------------------------------------------
# Build a quiz-generator agent for a specific lesson
# ---------------------------------------------------------------------------
def build_question_generator_agent(lesson_number: int) -> Agent:
    """Create a quiz generator agent wired to the lesson's vector store."""
    vector_store_id = get_vector_store_id(lesson_number)
    return Agent(
        name=f"lesson_{lesson_number}_question_generator",
        instructions=QUESTION_GENERATOR_INSTRUCTIONS,
        model=MODEL,
        tools=[
            FileSearchTool(vector_store_ids=[vector_store_id]),
        ],
    )


# ---------------------------------------------------------------------------
# Generate questions for a lesson
# ---------------------------------------------------------------------------
async def generate_lesson_questions(lesson_number: int) -> dict:
    """
    Generate 5 questions + reference answers for the given lesson.

    Returns dict with keys 'questions' and 'reference_answers'.
    Also stores the result in SESSION[lesson_number].
    """
    agent = build_question_generator_agent(lesson_number)
    prompt = GENERATE_QUIZ_PROMPT.format(n=QUESTIONS_PER_LESSON)

    with trace(f"lesson_{lesson_number}_quiz_generation"):
        result = await Runner.run(agent, prompt)

    data = extract_json_object(result.final_output)

    print(data)

    questions = data.get("questions", [])
    references = data.get("answers", [])
    types = data.get("types", [])
    options = data.get("options", [])

    if len(questions) != QUESTIONS_PER_LESSON or len(references) != QUESTIONS_PER_LESSON:
        raise ValueError(
            f"Expected {QUESTIONS_PER_LESSON} questions and references; "
            f"got {len(questions)} / {len(references)}"
        )

    SESSION[lesson_number] = {
        "questions": questions,
        "answers": references,
        "types": types,
        "options": options
    }

    # Persist to SQLite
    _save_questions_to_db(lesson_number, questions, references)

    return data


def get_lesson_session(lesson_number: int) -> dict:
    """Retrieve stored questions/answers for a lesson. Checks cache then DB."""
    if lesson_number not in SESSION:
        # Try loading from SQLite
        data = _load_session_from_db(lesson_number)
        if data is None:
            raise ValueError(
                f"Questions for Lesson {lesson_number} have not been generated yet. "
                "Run generate_lesson_questions() first."
            )
    return SESSION[lesson_number]
