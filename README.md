# Bubblekit

Bubblekit is a lightweight LLM chat UI + backend starter. The repo is structured as a small monorepo so you can swap the LLM logic while keeping a ready-made frontend.

## Structure
- `apps/web` - React + Vite frontend
- `apps/server` - FastAPI backend with NDJSON streaming
- `packages/shared` - reserved for shared types/contracts

## Quick start
### Frontend
```sh
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

## Backend documentation (user-facing functions)
All functions that can be used by users exist only in the `bubblekit` module
(`apps/server/bubblekit`). Other functions are internal.

### create_app(allow_origins=None)
Creates a FastAPI app with a streaming chat endpoint.

```py
from bubblekit import create_app

app = create_app(allow_origins=["http://localhost:5173"])
```

### on.message
Registers a handler for incoming messages. The handler receives `ctx` with
`conversation_id` and `message`.

```py
from bubblekit import on, bubble

@on.message
async def handle_message(ctx):
    reply = bubble(role="assistant", type="text")
    reply.set(f"Echo: {ctx.message}")
    reply.done()
```

### on.history
Registers a handler to fetch chat history when the client requests history.

```py
from bubblekit import on, load

@on.history
def handle_history(conversation_id):
    history = db.load(conversation_id)
    return load(history)
```

### on.new_chat
Registers a handler that is called when a new chat is created (without
a `conversationId` from the client).

```py
from bubblekit import on, bubble

@on.new_chat
def handle_new_chat(conversation_id):
    greeting = bubble(role="assistant", type="text")
    greeting.set("Hello! How can I help?")
    greeting.done()
```

### bubble(...)
Creates a new bubble and sends the initial config event to the active stream.
Can only be called inside an `on.message` or `on.new_chat` handler.

Signature:
```py
bubble(
    id=None,
    role="assistant",
    type="text",
    name=...,
    icon=...,
    bubble_bg_color="auto",
    bubble_text_color="auto",
    bubble_border_color="auto",
    header_bg_color="auto",
    header_text_color="auto",
    header_border_color="auto",
    header_icon_bg_color="auto",
    header_icon_text_color="auto",
    extra=None,
)
```

```py
from bubblekit import bubble

def build_reply():
    reply = bubble(
        role="assistant",
        type="text",
        name="Assistant",
        icon="/icons/bot.svg",
        bubble_bg_color="#EAF2FF",
        bubble_text_color="#0B1D39",
        header_text_color="#2B6CB0",
        header_icon_bg_color="#D6E4FF",
    )
    reply.set("Thank you for contacting us.")
    reply.done()
```

### access_bubble(bubble_id)
Retrieves an existing bubble in the active session so it can be modified again.

```py
from bubblekit import on, bubble, access_bubble

@on.message
async def handle_message(ctx):
    reply = bubble(role="assistant", type="text")
    reply.set("Preparing an answer")

    same_reply = access_bubble(reply.id)
    same_reply.stream("... done.")
    same_reply.done()
```

### load(context)
Loads chat history into the active session and returns the format required by
the history endpoint. Input must be a list of dicts.

```py
from bubblekit import load

data = [
    {"id": "1", "role": "user", "type": "text", "content": "Hello"},
    {"id": "2", "role": "assistant", "type": "text", "content": "Hi"},
]

messages = load(data)
```

### Bubble methods
Each `bubble()` returns a `Bubble` object with the following methods.

#### bubble.set(text)
Replaces the entire bubble content.

```py
from bubblekit import bubble

def set_example():
    b = bubble(role="assistant", type="text")
    b.set("Final answer.")
    b.done()
```

#### bubble.stream(text)
Appends content gradually (streaming).

```py
import asyncio
from bubblekit import bubble

async def stream_example():
    b = bubble(role="assistant", type="text")
    for chunk in ["Hello", " ", "world"]:
        b.stream(chunk)
        await asyncio.sleep(0.02)
    b.done()
```

#### bubble.config(...)
Updates the bubble config and sends a `config` event. You may change `role`,
`type`, and other config fields (except `id`).
Signature matches `bubble()` (flat params + `extra` dict).

```py
from bubblekit import bubble

def config_example():
    b = bubble(role="assistant", type="text")
    b.config(type="tool", name="Support", icon="/icons/support.svg")
    b.set("Processing data...")
    b.done()
```

#### Flat config params
The frontend renders these config fields when present:
- `name`: display name. Defaults to `Assistant`, `User`, or `System` based on role. Set to `""`/`None` to hide.
- `icon`: local icon path (served by the frontend). Defaults to Lucide `Bot`/`User`. Set to `""`/`None` to hide.
- `bubble_*_color`: `bubble_bg_color`, `bubble_text_color`, `bubble_border_color`.
- `header_*_color`: `header_bg_color`, `header_text_color`, `header_border_color`,
  `header_icon_bg_color`, `header_icon_text_color`.
- Color params default to `"auto"` (use theme defaults).
- `extra`: optional dict of additional config fields forwarded to the UI (e.g. `badge`, `tone`).

#### bubble.done()
Marks the bubble as completed. If you forget to call it, the server will
finalize it automatically and issue a warning.

```py
from bubblekit import bubble

def done_example():
    b = bubble(role="assistant", type="text")
    b.set("Done.")
    b.done()
```

### Important notes
- `bubble()` and `access_bubble()` require an active stream, so they must be called inside `on.message` or `on.new_chat`.
- `bubble.config()` must not change `id`.
- `bubble()`/`bubble.config()` do not accept `config=` or `colors=`. Pass fields directly instead.
- If `bubble.done()` is not called, the server will finalize automatically and issue a warning.

## HTTP API (client)
The backend provides 2 main endpoints that can be used by the client.

### GET /api/conversations/{conversation_id}/messages
Fetches chat history.

```sh
curl http://localhost:8000/api/conversations/123/messages
```

### POST /api/conversations/stream
Sends a message and receives an NDJSON stream. If `conversationId` is not sent,
the server will create a new chat.

```sh
curl -N http://localhost:8000/api/conversations/stream   -H "Content-Type: application/json"   -d '{"conversationId":"123","message":"Hello"}'
```

## Streaming contract (NDJSON)
Each line is a JSON object:
- `meta`: `{ "type": "meta", "conversationId": "..." }`
- `set`: `{ "type": "set", "bubbleId": "...", "content": "..." }`
- `delta`: `{ "type": "delta", "bubbleId": "...", "content": "..." }`
- `config`: `{ "type": "config", "bubbleId": "...", "patch": { "type": "tool" } }`
- `done`: `{ "type": "done", "bubbleId": "..." }`
- `error`: `{ "type": "error", "message": "..." }`
