# Developer Guide (Deep Dive / Internals)

Use this guide to go from zero to productive with Bubblekit. It links to deeper internals docs for module-level details.

## Mental Model
- Bubblekit = **FastAPI backend + React/Vite frontend** for streaming chat.
- Backend exposes REST endpoints for conversation list/history and an NDJSON streaming endpoint for chat. Handlers in `apps/server/main.py` decide how to respond.
- Runtime utilities in `apps/server/bubblekit/runtime.py` manage sessions, bubbles, and event emission; handlers call `bubble()`, `access_bubble()`, `set_conversation_list()`, etc.
- Frontend (`apps/web/src/App.tsx`) consumes NDJSON events, merges config patches, and renders message bubbles with optional headers/icons/colors.

## Getting Started
0) Replace `apps/server/main.py` (it raises `UneditedServerFile` by default) with your handlers. See the README for a minimal echo example.
1) Install deps:
```sh
npm install             # frontend deps
cd apps/server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```
2) Run backend: `uvicorn main:app --reload --port 8000` (from `apps/server`).
3) Run frontend: `npm run dev` (from repo root; Vite on :5173). Optionally set `VITE_API_BASE_URL=http://localhost:8000`.

## End-to-End Flow (Happy Path)
1) User enters text in the UI.
2) Frontend sends `POST /api/conversations/stream` with `{ conversationId?, message }` and optional `User-Id` header.
3) Backend creates or reuses a `BubbleSession`, optionally emits a `meta` event with the new conversation ID, invokes `on.new_chat` (when `conversationId` is missing), then `on.message`.
4) Handler uses `bubble(...).send()` to create bubbles, streams content via `bubble.stream(...)`, and finishes with `bubble.done()`.
5) NDJSON events (`meta`, `config`, `set`, `delta`, `done`, `error`) stream back; `apps/web/src/lib/chatApi.ts` parses them and the UI updates state.
6) After streaming, the UI refreshes the conversation list via `GET /api/conversations` (optionally scoped by `User-Id`).

See `ARCHITECTURE.md` for diagrams and data model.

## Core Concepts
- **Conversation**: Identified by `conversationId`. Session state is stored in-memory per ID (`SessionStore`), not persisted.
- **Bubble**: Server-side unit with `id`, `role`, `type`, `content`, and config. Creates NDJSON events understood by the UI. Created via `bubble(...)`; send inside an active stream to emit events.
- **Conversation list**: Stored in `_conversation_lists` keyed by normalized user ID; set via `set_conversation_list(user_id, list)`, read via `/api/conversations`.
- **Handlers**: Register with `on.message`, `on.history`, `on.new_chat` in `apps/server/main.py`. Receive `MessageContext`, `HistoryContext`, or `NewChatContext`.

## Backend Internals (high level)
- `apps/server/bubblekit/server.py`: Builds FastAPI app, normalizes `User-Id`, and streams NDJSON. Also handles history requests and converts `Bubble` templates to plain dicts.
- `apps/server/bubblekit/runtime.py`: Implements `Bubble`, `BubbleSession`, `SessionStore`, config merging, and context management. Auto-finalizes pending bubbles at stream end.
- `apps/server/main.py`: Entry point where you register handlers on `on`. The tracked file intentionally raises `UneditedServerFile` until you replace it with your own logic (LLM/tool integration, persistence, etc.). Tests patch the registry directly.
- For module-by-module details, see `docs/INTERNALS/backend.md` and `docs/INTERNALS/runtime.md`.

## Frontend Internals (high level)
- `apps/web/src/App.tsx`: Holds conversation/message state, manages AbortControllers for fetch/stream, auto-scrolls when streaming, and handles dark mode (`localStorage`).
- `apps/web/src/lib/chatApi.ts`: Fetch helpers for history/list and NDJSON parsing for streams. Merges trailing chunks to deliver discrete events.
- `apps/web/src/components/chat/*`: Render bubbles (`MessageBubble` with collapsible/tool styling and color overrides) and inputs.
- See `docs/INTERNALS/frontend.md` for deeper notes.

## API Quick Reference
- `GET /api/conversations` → `{ conversations: [{id,title,updatedAt}] }` (scoped by optional `User-Id`).
- `GET /api/conversations/{conversationId}/messages` → `{ conversationId, messages: [...] }`. History handler can return `Bubble` templates or dicts.
- `POST /api/conversations/stream` → NDJSON stream of events. Body: `{ conversationId?, message? }`. Emits `meta` when a new conversation is created.
- Streaming events: `meta`, `set`, `delta`, `config`, `done`, `error` (see `docs/INTERNALS/backend.md` for shapes).

## Configuration
- `VITE_API_BASE_URL`: Frontend env var for API base URL (defaults to same origin).
- `create_app(allow_origins=...)`: Configure CORS origins; defaults to localhost dev origins.
- Provider/model configuration lives in your handler code; there is no default LLM dependency.

## Error Handling & Logging
- Stream errors emit `{ "type": "error", "message": "..." }` and abort the stream. UI marks the current assistant bubble as `error`.
- Missing `bubble.done()` triggers a warning (`warn_if_not_done`) and auto-finalization at stream end.
- History handler errors raise to FastAPI; there is no structured logging yet—use `uvicorn` logs and add middleware as needed.

## Testing & Verification
- Backend: `python -m unittest discover -s tests` from `apps/server`. Tests cover bubble lifecycle, config merging, and handler invocation semantics.
- Frontend: `npm run lint` and manual UI checks. Verify stream handling with the dev server running against the backend.

## Performance/Scaling Considerations
- All state is in-memory; restarting the backend clears conversations and lists. For multi-instance, externalize session/conversation storage and add sticky routing or WebSocket infra.
- Streaming is sequential per request; if you keep shared globals in handlers, guard them or move to per-user/per-conversation stores before production.
- The UI renders the full message list; virtualize if conversations get large.

## Debugging Tips
- Use `curl -N` to inspect the raw NDJSON stream:
```sh
curl -N http://localhost:8000/api/conversations/stream \
  -H "Content-Type: application/json" \
  -H "User-Id: dev" \
  -d '{"message": "ping"}'
```
- If the frontend shows blank history, check the browser console for fetch errors and ensure `VITE_API_BASE_URL` points to the backend.
- If colors/names do not render, confirm handler patches use the flat config fields and avoid nested `colors=`/`config=` keys (validation rejects them).

## Where to Go Next
- Deep internals: `docs/INTERNALS/*`
- Architecture diagrams: `ARCHITECTURE.md`
- Design decisions: `DESIGN.md`
- Ops/debugging: `docs/RUNBOOK.md`
