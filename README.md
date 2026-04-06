# Lesson Quiz MockMaster

An AI-powered quiz assessment system that generates quiz questions from lesson documents, grades student answers, and provides detailed tutor feedback using OpenAI Agents.

## Prerequisites

- Python 3.10+
- [UV](https://docs.astral.sh/uv/) package manager
- Node.js 18+ and npm

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/phurpawangchuk/CS529-Project.git
cd CS529-Project
```

### 2. Create the environment file

Copy the example and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_DEFAULT_MODEL=gpt-4o-mini
SERPER_API_KEY=your_serper_api_key_here
LESSON_1_VECTOR_STORE_ID=paste_here_lesson_1_vector_store_id
LESSON_2_VECTOR_STORE_ID=paste_here_lesson_2_vector_store_id
LESSON_3_VECTOR_STORE_ID=paste_here_lesson_3_vector_store_id
```

### 3. Install Python dependencies

```bash
uv sync
pip install -r Project1/requirements.txt
```

## Running the Application

### Backend (FastAPI)

```bash
cd Project1
uv run uvicorn api.main:app --reload
```

The API will be available at:
- http://127.0.0.1:8000
- Swagger docs: http://127.0.0.1:8000/docs

### Frontend (React)

In a separate terminal:

```bash
cd Project1/ui
npm install
npm start
```

The UI will open at http://localhost:3000.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Health check |
| `POST /read-document` | Read and parse a lesson document |
| `POST /generate-questions` | Generate quiz questions for a lesson |
| `POST /quiz-assessment` | Grade student answers |
| `POST /assessment-result` | Get detailed tutor feedback |

## Project Structure

```
Project1/
├── api/                  # FastAPI routers
│   ├── main.py           # App entry point
│   ├── read_document_router.py
│   ├── generate_questions_router.py
│   ├── quiz_assessment_router.py
│   └── assessment_result_router.py
├── ui/                   # React frontend
│   ├── src/
│   └── package.json
├── generate_questions.py # Question generation agent
├── quiz_assessment.py    # Quiz grading agent
├── assessment_result.py  # Tutor feedback agent
├── quiz_chatbot.py       # CLI chatbot interface
├── read_document.py      # Document reader
└── lesson_quiz_overview.ipynb  # Jupyter notebook demo
```

## Notes

- Do not commit real API keys. The `.env` file is git-ignored.
- The backend must be running for the frontend to work.
- If using a Jupyter notebook, select the project's Python environment as the kernel.
