# Bubblekit

Bubblekit is a lightweight LLM chat UI + backend starter. The repo is structured as a small monorepo so you can swap the LLM logic while keeping a ready-made frontend.

## Structure
- `apps/web` - React + Vite frontend
- `apps/server` - FastAPI backend with NDJSON streaming
- `packages/shared` - reserved for shared types/contracts

## Quick start
### Frontend
```sh
cd apps/web
npm install
npm run dev
```

Set the API base URL for local dev:
```sh
VITE_API_BASE_URL=http://localhost:8000
```

### Backend
```sh
cd apps/server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Backend SDK usage
Bubblekit exposes a small server SDK so you only write handlers.

```py
from bubblekit import on, bubble, load, create_app

@on.message
async def on_message(ctx):
    b = bubble(role="assistant", type="text")
    for chunk in ctx.message.split():
        b.stream(chunk + " ")
    b.done()

@on.history
def on_history(conversation_id):
    context = db.load(conversation_id)
    return load(context)

app = create_app()
```

Bubble methods:
- `bubble.set(text)` replaces content.
- `bubble.stream(text)` appends.
- `bubble.config(**patch)` merges config and emits style changes.
- `bubble.done()` marks the bubble idle (auto-finalized if omitted).
- `access_bubble(id)` edits another bubble in the active session.

## Streaming contract (NDJSON)
Each line is a JSON object:
- `meta`: `{ "type": "meta", "conversationId": "..." }`
- `set`: `{ "type": "set", "bubbleId": "...", "content": "..." }`
- `delta`: `{ "type": "delta", "bubbleId": "...", "content": "..." }`
- `config`: `{ "type": "config", "bubbleId": "...", "patch": { "type": "tool" } }`
- `done`: `{ "type": "done", "bubbleId": "..." }`
- `error`: `{ "type": "error", "message": "..." }`
