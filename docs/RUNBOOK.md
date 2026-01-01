# Runbook (Ops & Debugging)

Use this guide when operating or debugging Bubblekit in development.

> Note: `apps/server/main.py` is a stub that raises `UneditedServerFile` until you register handlers. Replace it with your logic before running these steps.

## Bootstrapping
1) Backend:
```sh
cd apps/server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
2) Frontend:
```sh
npm install
VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

## Health Checks
- Conversation list: `curl http://localhost:8000/api/conversations -H "User-Id: dev"`.
- History: `curl http://localhost:8000/api/conversations/test/messages -H "User-Id: dev"`.
- Streaming: 
```sh
curl -N http://localhost:8000/api/conversations/stream \
  -H "Content-Type: application/json" \
  -H "User-Id: dev" \
  -d '{"message":"ping"}'
```
Look for NDJSON lines containing `meta`, `set`, `delta`, and `done`.

## Common Issues
- **Stream stalls or 500s**: Check backend logs for exceptions in handlers. The stream emits `{type:"error"}` when handler raises; the frontend marks the active assistant bubble as errored.
- **CORS errors**: Adjust `allow_origins` in `create_app()` or pass a custom list when constructing the app.
- **Missing dependencies**: Only FastAPI/uvicorn are pinned; install the SDKs used by your handlers (e.g., OpenAI, LangChain) if imports fail.
- **State not persisting**: Conversation lists and sessions are in-memory. Restarts or multiple workers will lose data. Add persistence if needed.
- **History looks empty**: `on.history` returning `None` will surface bubbles previously sent in-session; ensure the handler returns data or replays bubbles with `bubble(...).send()`.

## Debugging Steps
- Enable verbose logging in uvicorn: `uvicorn main:app --reload --port 8000 --log-level debug`.
- Inspect active bubbles by logging `session.export_messages()` inside handlers when needed.
- To reset a conversation from a handler, call `clear_conversation()` (clears current session) or `clear_conversation(conversation_id)` for a specific session.
- Use browser devtools network tab to confirm NDJSON chunking and `User-Id` header values.

## Testing & Verification
- Backend unit tests: `cd apps/server && python -m unittest discover -s tests`.
- Frontend lint: `npm run lint`.
- Manual UI: Start both services, open Vite dev server, send messages, switch conversations, and toggle the User ID field; confirm the list refreshes and history loads.

## Operational Notes
- All state is process-local; avoid multi-instance deployments without an external store.
- Any globals you add in handler code are shared across users; prefer per-user/per-conversation storage when persisting state.
- Color/config patches must conform to the flat schema; avoid sending nested `colors`/`config` keys directly in `bubble()`/`config()`.
