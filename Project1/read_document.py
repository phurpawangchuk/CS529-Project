"""
read_document.py — Document & Vector Store Configuration for Lesson Quiz System

Manages the connection to OpenAI vector stores where lesson documents are uploaded.
Each lesson (1–5) maps to its own vector store ID so questions are grounded
in that specific lesson's content.

Pattern reference: 4_AgenticPatterns/tools/hostedtools.ipynb (FileSearchTool)

Setup:
    1. Upload each lesson PDF/document to OpenAI Files → Vector Stores.
    2. Copy each vector store ID into LESSON_VECTOR_STORES below (or set in .env).
    3. The generate_questions module reads from this config.
"""

import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# ---------------------------------------------------------------------------
# OpenAI client & model
# ---------------------------------------------------------------------------
client = OpenAI()
MODEL = "gpt-4o-mini"
TEMPERATURE = 0.7

AVAILABLE_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-4.1-nano",
    "o4-mini",
]

# ---------------------------------------------------------------------------
# Lesson-to-Vector-Store mapping
#
# Replace each placeholder with the vector store ID from the OpenAI dashboard
# after uploading the corresponding lesson document.
# You can also set them as environment variables:
#   LESSON_1_VECTOR_STORE_ID, LESSON_2_VECTOR_STORE_ID, etc.
# ---------------------------------------------------------------------------
LESSON_VECTOR_STORES: dict[int, str] = {
    1: os.getenv("LESSON_1_VECTOR_STORE_ID", "vs_REPLACE_WITH_LESSON_1_STORE_ID"),
    2: os.getenv("LESSON_2_VECTOR_STORE_ID", "vs_REPLACE_WITH_LESSON_2_STORE_ID"),
    3: os.getenv("LESSON_3_VECTOR_STORE_ID", "vs_REPLACE_WITH_LESSON_3_STORE_ID"),
    4: os.getenv("LESSON_4_VECTOR_STORE_ID", "vs_REPLACE_WITH_LESSON_4_STORE_ID"),
    5: os.getenv("LESSON_5_VECTOR_STORE_ID", "vs_REPLACE_WITH_LESSON_5_STORE_ID"),
}

TOTAL_LESSONS = 5
QUESTIONS_PER_LESSON = 5

def get_vector_store_id(lesson_number: int) -> str:
    """Return the vector store ID for a given lesson (1–5)."""
    if lesson_number not in LESSON_VECTOR_STORES:
        raise ValueError(
            f"Invalid lesson number {lesson_number}. Must be between 1 and {TOTAL_LESSONS}."
        )
    store_id = LESSON_VECTOR_STORES[lesson_number]
    if not store_id or "REPLACE" in store_id:
        raise ValueError(
            f"Vector Store ID for Lesson {lesson_number} is not found. "
            f"Please set LESSON_{lesson_number}_VECTOR_STORE_ID in your .env file."
        )
    return store_id


def list_configured_lessons() -> list[int]:
    """Return lesson numbers that have a real (non-placeholder) vector store ID."""
    return [
        num
        for num, sid in LESSON_VECTOR_STORES.items()
        if "REPLACE" not in sid
    ]
