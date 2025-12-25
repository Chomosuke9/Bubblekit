# Contributing Guide

Welcome! This project is a lightweight monorepo for building chat apps. Please keep changes focused and documented.

## Prerequisites
- Node.js + npm (tested with npm lockfiles in repo).
- Python 3.10+ (current `__pycache__` artifacts are from 3.13).
- uvicorn/fastapi dependencies from `apps/server/requirements.txt`.
- For the sample LangChain agent in `apps/server/main.py`, install `langchain` and `langchain-ollama` locally (not pinned in `requirements.txt`).

## Setup
1) Install frontend deps (runs in workspace root):
```sh
npm install
```
2) Run the frontend:
```sh
npm run dev
# Optionally set VITE_API_BASE_URL=http://localhost:8000
```
3) Run the backend:
```sh
cd apps/server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Optional for demo handler:
pip install langchain langchain-ollama
uvicorn main:app --reload --port 8000
```

## Workflow
- Keep commits small and descriptive (e.g., `Add tool bubble config patch`).
- Update docs when public APIs or behaviors change (especially `apps/server/bubblekit`).
- Follow existing naming conventions: Python `snake_case`/`PascalCase`, TypeScript `camelCase`/`PascalCase`.
- Avoid rewriting `README.md`; add new details to the deep-dive docs under `docs/`.

## Testing
- Backend: from `apps/server`, run `python -m unittest discover -s tests`.
- Frontend: no test runner is configured; run `npm run lint` and manual UI verification.
- For streaming checks, use `curl -N http://localhost:8000/api/conversations/stream -H 'Content-Type: application/json' -d '{"message":"ping"}'`.

## Coding Notes
- Bubble lifecycle: always call `bubble.done()` (server auto-finalizes with a warning if omitted).
- Conversation state is in-memory; avoid assuming persistence in handlers.
- Respect the optional `User-Id` header in tools and manual requests.

## Pull Requests
- Include a short summary, tests run, and screenshots/GIFs for UI changes.
- If you change the public API surface (`apps/server/bubblekit`), mention it in the PR description and update `README.md` and relevant docs.
