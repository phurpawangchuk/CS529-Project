# CS529 AI Engineering Course Materials

This folder contains lesson demos, sample code, and project materials for the CS529 AI Engineering course.

## Before You Start

Make sure you have these installed:

- Python 3.10 or above
- Cursor IDE or VS Code
- UV package manager
- Node.js (needed only for some projects)

## Environment File

This project does not include real API keys.

Create a `.env` file from `.env.example` and add your own values.

Example:

.env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_DEFAULT_MODEL=gpt-4o-mini
SERPER_API_KEY=your_serper_api_key_here

bash
   uv sync


## Project Folders
- 1_Pythonfoundations – Python basics and introductory materials
- 2_HelloLLMChat – simple LLM chat examples
- 3_HelloAgents – basic agent examples
- 4_AgenticPatterns – common agent design patterns
- 5_PythonScripts – supporting Python scripts
- 6_meomorymgt – memory and session examples
- 7_crewai_project – CrewAI-based examples
- 8_MCP_project – MCP-related examples
- 9_deployment – deployment examples

## Notes
- Do not store real API keys in shared files.
- Some projects may require additional setup depending on the lesson.
- If a notebook asks for a kernel, choose your Python environment for this project.

## Running the Code
- After setup, open the required lesson folder and run the example files as instructed in class.

## If something does not run:
- confirm .env is created correctly
- make sure dependencies are installed
- check that your API key is valid
- verify that the correct Python environment is selected