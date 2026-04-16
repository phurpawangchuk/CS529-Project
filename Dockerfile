# ---- Stage 1: Build React frontend ----
FROM node:20-slim AS frontend-build

WORKDIR /app/ui
COPY Project1/ui/package.json Project1/ui/package-lock.json* ./
RUN npm ci --production=false

COPY Project1/ui/ ./
# Empty string means "same origin" — API calls go to the same host
ENV REACT_APP_API_BASE=""
RUN npm run build

# ---- Stage 2: Python backend + static frontend ----
FROM python:3.11-slim

# HF Spaces expects port 7860
ENV PORT=7860
WORKDIR /app

# Install Python dependencies
COPY Project1/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY Project1/*.py ./
COPY Project1/api/ ./api/

# Copy built React app
COPY --from=frontend-build /app/ui/build ./ui/build

# Expose the port HF Spaces expects
EXPOSE 7860

# Start the FastAPI server
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "7860"]
