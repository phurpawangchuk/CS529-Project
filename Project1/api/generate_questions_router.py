"""
generate_questions_router.py — API endpoint to generate quiz questions for a lesson.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, HTTPException
from openai import NotFoundError

from generate_questions import (
    generate_lesson_questions,
    get_lesson_session,
    get_assessment_history,
    get_feedback_history,
)

router = APIRouter(prefix="/lessons", tags=["Generate Questions"])


@router.post("/{lesson_number}/generate")
async def generate_questions(lesson_number: int):
    """Generate 5 quiz questions + reference answers for a lesson from its document."""
    try:
        data = await generate_lesson_questions(lesson_number)
    except ValueError as e:
        error_msg = str(e)
        if "Vector Store ID" in error_msg and "not found" in error_msg:
            raise HTTPException(status_code=400, detail={"vector_id": error_msg})
        raise HTTPException(status_code=400, detail=error_msg)
    except NotFoundError as e:
        raise HTTPException(
            status_code=404,
            detail={"message": f"Vector Store ID for Lesson {lesson_number} is not found on OpenAI Storage. Please check your LESSON_{lesson_number}_VECTOR_STORE_ID in .env file."},
        )
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


@router.get("/{lesson_number}/history")
def get_lesson_history(lesson_number: int):
    """Retrieve all stored assessments and feedback for a lesson."""
    return {
        "lesson_number": lesson_number,
        "assessments": get_assessment_history(lesson_number),
        "feedback": get_feedback_history(lesson_number),
    }
