"""
generate_questions.py — Quiz Question Generator Agent

Uses FileSearchTool against lesson-specific vector stores to generate
5 study questions (with reference answers) grounded in each lesson document.

Pattern reference: 4_AgenticPatterns/tools/hostedtools.ipynb (FileSearchTool)
"""

import json
import re

from agents import Agent, Runner, trace, FileSearchTool

from read_document import (
    MODEL,
    QUESTIONS_PER_LESSON,
    get_vector_store_id,
)

# ---------------------------------------------------------------------------
# Session store — holds generated questions & reference answers per lesson
# ---------------------------------------------------------------------------
SESSION: dict[int, dict] = {}
# Structure after generation:
#   SESSION[lesson_number] = {
#       "questions": ["Q1", ..., "Q5"],
#       "reference_answers": ["A1", ..., "A5"],
#   }


# ---------------------------------------------------------------------------
# Prompt & instruction constants
# ---------------------------------------------------------------------------
QUESTION_GENERATOR_INSTRUCTIONS = (
    "You are an expert quiz creator. Your job is to generate study questions "
    "from the uploaded lesson materials using the file search tool. "
    "Rules:\n"
    "  - Only use facts found via the file search tool; never invent information.\n"
    "  - Cover different sections or key concepts from the lesson.\n"
    "  - Return a single JSON object with exactly two keys:\n"
    '      "questions"          — array of 5 question strings\n'
    '      "reference_answers"  — array of 5 concise ideal-answer strings\n'
    "  - Number questions implicitly by array index (1..5).\n"
    "  - Output raw JSON only — no markdown fences, no extra text."
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
    questions = data.get("questions", [])
    references = data.get("reference_answers", [])

    if len(questions) != QUESTIONS_PER_LESSON or len(references) != QUESTIONS_PER_LESSON:
        raise ValueError(
            f"Expected {QUESTIONS_PER_LESSON} questions and references; "
            f"got {len(questions)} / {len(references)}"
        )

    SESSION[lesson_number] = {
        "questions": questions,
        "reference_answers": references,
    }
    return data


def get_lesson_session(lesson_number: int) -> dict:
    """Retrieve stored questions/answers for a lesson. Raises if not generated yet."""
    if lesson_number not in SESSION:
        raise ValueError(
            f"Questions for Lesson {lesson_number} have not been generated yet. "
            "Run generate_lesson_questions() first."
        )
    return SESSION[lesson_number]
