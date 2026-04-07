"""
settings_router.py — API endpoints for application settings.
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

import read_document

router = APIRouter(prefix="/settings", tags=["Settings"])


class SettingsUpdate(BaseModel):
    model: Optional[str] = Field(None, description="Model name to use")
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="Sampling temperature (0.0–2.0)")
    questions_per_lesson: Optional[int] = Field(None, ge=1, le=20, description="Number of questions per lesson")


@router.get("/")
def get_settings():
    """Return current application settings."""
    lessons = []
    for num, store_id in read_document.LESSON_VECTOR_STORES.items():
        configured = "REPLACE" not in store_id
        lessons.append({
            "lesson_number": num,
            "configured": configured,
            "vector_store_id": store_id if configured else None,
        })

    return {
        "model": read_document.MODEL,
        "temperature": read_document.TEMPERATURE,
        "available_models": read_document.AVAILABLE_MODELS,
        "questions_per_lesson": read_document.QUESTIONS_PER_LESSON,
        "total_lessons": read_document.TOTAL_LESSONS,
        "lessons": lessons,
    }


@router.put("/")
def update_settings(body: SettingsUpdate):
    """Update application settings."""
    if body.model is not None:
        if body.model not in read_document.AVAILABLE_MODELS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid model. Choose from: {read_document.AVAILABLE_MODELS}",
            )
        read_document.MODEL = body.model

    if body.temperature is not None:
        read_document.TEMPERATURE = body.temperature

    if body.questions_per_lesson is not None:
        read_document.QUESTIONS_PER_LESSON = body.questions_per_lesson

    return get_settings()
