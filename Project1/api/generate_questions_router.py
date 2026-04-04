"""
generate_questions_router.py — API endpoint to generate quiz questions for a lesson.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, HTTPException

from generate_questions import (
    generate_lesson_questions,
    get_lesson_session,
    SESSION,
)

router = APIRouter(prefix="/lessons", tags=["Generate Questions"])


@router.post("/{lesson_number}/generate")
async def generate_questions(lesson_number: int):
    """Generate 5 quiz questions + reference answers for a lesson from its document."""
    try:
        data = await generate_lesson_questions(lesson_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "lesson_number": lesson_number,
        "questions": data["questions"],
        "reference_answers": data["reference_answers"],
    }


@router.get("/{lesson_number}/questions")
def get_questions(lesson_number: int):
    """Retrieve previously generated questions for a lesson (without reference answers)."""
    try:
        session = get_lesson_session(lesson_number)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {
        "lesson_number": lesson_number,
        "questions": session["questions"],
    }
