"""
read_document_router.py — API endpoints for lesson & vector store configuration.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, HTTPException

from read_document import (
    LESSON_VECTOR_STORES,
    TOTAL_LESSONS,
    QUESTIONS_PER_LESSON,
    get_vector_store_id,
    list_configured_lessons,
)

router = APIRouter(prefix="/lessons", tags=["Lessons"])


@router.get("/")
def get_all_lessons():
    """List all lessons and their configuration status."""
    lessons = []
    for num, store_id in LESSON_VECTOR_STORES.items():
        configured = "REPLACE" not in store_id
        lessons.append({
            "lesson_number": num,
            "configured": configured,
            "vector_store_id": store_id if configured else None,
        })
    return {
        "total_lessons": TOTAL_LESSONS,
        "questions_per_lesson": QUESTIONS_PER_LESSON,
        "configured_lessons": list_configured_lessons(),
        "lessons": lessons,
    }


@router.get("/{lesson_number}")
def get_lesson(lesson_number: int):
    """Get configuration details for a specific lesson."""
    try:
        store_id = get_vector_store_id(lesson_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "lesson_number": lesson_number,
        "vector_store_id": store_id,
        "questions_per_lesson": QUESTIONS_PER_LESSON,
    }
