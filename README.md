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
`apps/server/main.py` intentionally raises an exception until you wire your own
handlers. Replace its contents with something like this before starting
uvicorn:

```py
from bubblekit import bubble, create_app, on

app = create_app()


@on.new_chat
def handle_new_chat(conversation_id, user_id):
    bubble(role="assistant", type="text").set("Hello!").send().done()


@on.message
def handle_message(ctx):
    reply = bubble(role="assistant", type="text").send()
    reply.set(f"Echo: {ctx.message}")
    reply.done()
```

Then install backend deps (add your own model SDKs if needed) and run:

```sh
cd apps/server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### One-command dev (backend + frontend)
From repo root, run both servers together (uses `uvicorn` + `npm run dev`):
```sh
python main.py --reload --host 0.0.0.0 --port 8000 --frontend-port 5173
```
Make sure `apps/server/main.py` has been replaced with your handlers (the stub raises `UneditedServerFile`).
Use `--no-frontend` to skip the Vite dev server.

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
`conversation_id`, `user_id`, and `message`.

```py
from bubblekit import on, bubble

@on.message
async def handle_message(ctx):
    reply = bubble(role="assistant", type="text").send()
    reply.set(f"Echo: {ctx.message}")
    reply.done()
```

### on.history
Registers a handler to fetch chat history when the client requests history.

```py
from bubblekit import on, create_history

@on.history
def handle_history(conversation_id):
    rows = db.load(conversation_id)
    return rows
```

The return value can be a list of dicts or a list of `Bubble` templates.
Use `bubblekit.create_history(...)` to build conversation list entries for
`set_conversation_list(...)`:

```py
from bubblekit import create_history, set_conversation_list

history = [
    create_history(id="c1", title="Welcome", updatedAt=1719541358000),
    create_history(id="c2", title="Support", updatedAt=1719542358000),
]
set_conversation_list(user_id, history)
```

Handlers can also receive the requesting user id. Use either two positional
parameters `(conversation_id, user_id)` or annotate a single parameter with
`HistoryContext` (or name it `ctx`) to receive `ctx.conversation_id` and
`ctx.user_id`.

### on.new_chat
Registers a handler that is called when a new chat is created (without
a `conversationId` from the client).

```py
from bubblekit import on, bubble

@on.new_chat
def handle_new_chat(conversation_id, user_id):
    greeting = bubble(role="assistant", type="text").send()
    greeting.set("Hello! How can I help?")
    greeting.done()
```

Handlers can also receive the requesting user id. Use either two positional
parameters `(conversation_id, user_id)` or annotate a single parameter with
`NewChatContext` (or name it `ctx`) to receive `ctx.conversation_id` and
`ctx.user_id`.

### set_conversation_list(user_id, conversations) / get_conversation_list(user_id)
Store or read the in-memory conversation list for a user. The store is keyed by
`user_id` (falls back to `"anonymous"`). Each conversation entry requires
`id`, `title`, and `updatedAt` (unix ms integer). The backend preserves the
order you provide.

```py
from bubblekit import set_conversation_list

set_conversation_list(
    "user-123",
    [
        {"id": "c1", "title": "Welcome", "updatedAt": 1719541358000},
        {"id": "c2", "title": "Support", "updatedAt": 1719542358000},
    ],
)
```

### clear_conversation(conversation_id=None, user_id=None)
Clears the stored messages for a conversation. When called without arguments,
clears the active session (the one invoking the handler).

```py
from bubblekit import clear_conversation

@on.message
def handle_message(ctx):
    clear_conversation()
```

### bubble(...)
Creates a new bubble template. It does not emit any events until you call
`send()`. Templates can be created anywhere, while `send()` requires an active
stream (inside `on.message` or `on.new_chat`).

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
    collapsible=...,
    collapsible_title=...,
    collapsible_max_height=...,
    extra=None,
)
```

```py
from bubblekit import bubble

def build_reply():
    draft = bubble(
        role="assistant",
        type="text",
        name="Assistant",
        icon="/icons/bot.svg",
        bubble_bg_color="#EAF2FF",
        bubble_text_color="#0B1D39",
        header_text_color="#2B6CB0",
        header_icon_bg_color="#D6E4FF",
    )
    draft.set("Thank you for contacting us.")
    reply = draft.send()
    reply.done()
```

### access_bubble(bubble_id)
Retrieves an existing bubble in the active session so it can be modified again.

```py
from bubblekit import on, bubble, access_bubble

@on.message
async def handle_message(ctx):
    reply = bubble(role="assistant", type="text").send()
    reply.set("Preparing an answer")

    same_reply = access_bubble(reply.id)
    same_reply.stream("... done.")
    same_reply.done()
```

### Bubble methods
Each `bubble()` returns a `Bubble` object with the following methods.

#### bubble.send()
Sends the template to the active stream and returns a bound `Bubble`.
The original template stays unbound and can be reused.

```py
from bubblekit import bubble

def send_example():
    draft = bubble(role="assistant", type="text")
    draft.set("Final answer.")
    reply = draft.send()
    reply.done()
```

#### bubble.set(text)
Replaces the entire bubble content. If the bubble has been sent, emits a `set`
event; otherwise it only updates the template content.

```py
from bubblekit import bubble

def set_example():
    b = bubble(role="assistant", type="text").send()
    b.set("Final answer.")
    b.done()
```

#### bubble.stream(text)
Appends content gradually. If the bubble has been sent, emits a `delta` event.

```py
import asyncio
from bubblekit import bubble

async def stream_example():
    b = bubble(role="assistant", type="text").send()
    for chunk in ["Hello", " ", "world"]:
        b.stream(chunk)
        await asyncio.sleep(0.02)
    b.done()
```

#### bubble.config(...)
Updates the bubble config and emits a `config` event if the bubble has been
sent. You may change `role`, `type`, and other config fields (except `id`).
Signature matches `bubble()` (flat params + `extra` dict).

```py
from bubblekit import bubble

def config_example():
    b = bubble(role="assistant", type="text").send()
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
- `collapsible`: enable collapsible UI when set to `true`.
- `collapsible_title`: label shown in the collapsible header.
- `collapsible_max_height`: max height for collapsible content when `collapsible` is `true`
  (number = px, string = CSS value).
- Color params default to `"auto"` (use theme defaults).
- `extra`: optional dict of additional config fields forwarded to the UI (e.g. `badge`, `tone`).

#### bubble.done()
Marks the bubble as completed. If you forget to call it, the server will
finalize it automatically and issue a warning.

```py
from bubblekit import bubble

def done_example():
    b = bubble(role="assistant", type="text").send()
    b.set("Done.")
    b.done()
```

#### create_history(...)
Normalizes a dict (matching the shown fields) into the history payload expected
by `/api/conversations/{id}/messages`. Use it when returning custom history data.

#### bubble.to_openai()
Returns an OpenAI-style message dict (`{"role": "...", "content": "..."}`).

```py
from bubblekit import bubble

def openai_example():
    draft = bubble(role="assistant")
    draft.set("Hello!")
    return draft.to_openai()
```

### Important notes
- `bubble()` can be created anywhere; `bubble.send()` and `access_bubble()` require an active stream (inside `on.message` or `on.new_chat`).
- `bubble.config()` must not change `id`.
- `bubble()`/`bubble.config()` do not accept `config=` or `colors=`. Pass fields directly instead.
- If `bubble.done()` is not called, the server will finalize automatically and issue a warning.

## HTTP API (client)
The backend provides endpoints that can be used by the client. Requests that
need user scoping accept an optional `User-Id` header; when omitted the server
uses `"anonymous"`.

### GET /api/conversations
Fetches the stored conversation list for the requesting user. The response
preserves the backend order.

```sh
curl http://localhost:8000/api/conversations \
  -H "User-Id: user-123"
```

Response shape:

```json
{
  "conversations": [
    { "id": "123", "title": "Welcome", "updatedAt": 1719541358000 }
  ]
}
```

### GET /api/conversations/{conversation_id}/messages
Fetches chat history.

```sh
curl http://localhost:8000/api/conversations/123/messages \
  -H "User-Id: user-123"
```

### POST /api/conversations/stream
Sends a message and receives an NDJSON stream. If `conversationId` is not sent,
the server will create a new chat.

```sh
curl -N http://localhost:8000/api/conversations/stream   -H "Content-Type: application/json"   -H "User-Id: user-123"   -d '{"conversationId":"123","message":"Hello"}'
```

## Streaming contract (NDJSON)
Each line is a JSON object:
- `meta`: `{ "type": "meta", "conversationId": "..." }`
- `set`: `{ "type": "set", "bubbleId": "...", "content": "..." }`
- `delta`: `{ "type": "delta", "bubbleId": "...", "content": "..." }`
- `config`: `{ "type": "config", "bubbleId": "...", "patch": { "type": "tool" } }`
- `done`: `{ "type": "done", "bubbleId": "..." }`
- `error`: `{ "type": "error", "message": "..." }`

The web UI includes a User ID input in the sidebar (hidden when collapsed) to
update the `User-Id` header during development. The value is saved to
`localStorage` and reused across requests.

## Developer docs
- Deep dive guide: `docs/DEVELOPER_GUIDE.md`
- Architecture: `ARCHITECTURE.md`
- Internals: `docs/INTERNALS/`
- Ops/Runbook: `docs/RUNBOOK.md`
