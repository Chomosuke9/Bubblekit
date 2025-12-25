# Repository Guidelines

## Project Structure & Module Organization
- `apps/web`: React + Vite frontend.
- `apps/server`: FastAPI backend and the `bubblekit` module (public API).
- `apps/server/tests`: Python `unittest` suite.
- `packages/shared`: Reserved for shared types/contracts.
- Root configs: `package.json`, `package-lock.json`, `README.md`.

## Build, Test, and Development Commands
- Frontend dev server:
  - `npm install`
  - `npm run dev` (Vite dev server)
  - Optional: `VITE_API_BASE_URL=http://localhost:8000`
- Backend dev server:
  - `cd apps/server`
  - `python -m venv .venv && source .venv/bin/activate`
  - `pip install -r requirements.txt`
  - `uvicorn main:app --reload --port 8000`
- Backend tests:
  - `cd apps/server`
  - `python -m unittest discover -s tests`

## Coding Style & Naming Conventions
- Python: 4-space indentation, `snake_case` for functions/vars, `PascalCase` for classes.
- TypeScript/React: 2-space indentation, `camelCase` for variables, `PascalCase` for components.
- Keep public APIs inside `apps/server/bubblekit`. Update `README.md` when changing public APIs.
- Prefer small, focused helpers and reuse existing patterns (e.g., config normalization).

## Testing Guidelines
- Backend uses `unittest` in `apps/server/tests` with files named `test_*.py`.
- Add tests for behavior changes in `bubblekit` and API handlers.
- No frontend test framework is configured; verify UI changes manually in `apps/web`.

## Commit & Pull Request Guidelines
- No strict commit convention observed; use short, descriptive summaries (present tense).
- Keep commits scoped (e.g., “Fix history serialization in bubblekit”).
- PRs should include:
  - Summary of changes
  - Tests run (or note if not run)
  - Screenshots/GIFs for UI changes

## Security & Configuration Tips
- Store secrets outside the repo (env vars, `.env` not committed).
- Use `User-Id` header when testing multi-user flows.
