# Backend Internals

This document explains how the FastAPI app and handlers cooperate. Read this alongside the source for exact details.

## Modules & Entrypoints
- `apps/server/main.py`: Demo handler implementations. Registers callbacks on the global `on` registry.
- `apps/server/bubblekit/server.py`: Builds the FastAPI app and wires HTTP/stream endpoints.
- `apps/server/bubblekit/runtime.py`: Session store, bubble lifecycle, and handler registry.

## FastAPI Surface (`bubblekit.server`)
- `create_app(allow_origins=None)`: Returns a FastAPI app with CORS enabled (defaults to localhost origins). Key routes:
  - `GET /api/conversations` → returns `{ conversations: [...] }` from `_conversation_lists` keyed by normalized `User-Id` (or `"anonymous"`).
  - `GET /api/conversations/{conversation_id}/messages`:
    - Activates a `BubbleSession` without a stream (allows calling `bubble(...).send()` to populate history).
    - Invokes `on.history_handler` with either `(conversation_id, user_id)` or a single `HistoryContext` param.
    - Accepts history items as dicts or `Bubble` objects; the latter are normalized to dicts.
  - `POST /api/conversations/stream`:
    - Normalizes `conversationId` (creates one via `_new_id` when missing) and `User-Id`.
    - Attaches a `StreamChannel` to the session and starts an NDJSON `StreamingResponse`.
    - When `conversationId` is missing, emits `{type:"meta",conversationId}` first and calls `on.new_chat_handler`.
    - Calls `on.message_handler(MessageContext)` if a non-empty `message` is provided.
    - On exit, finalizes pending bubbles (`done` events) and emits warnings for unfinished ones.
- Handler invocation helpers (`_call_history_handler`, `_call_new_chat_handler`) preserve backward compatibility with positional args or context objects.

## Runtime Primitives (`bubblekit.runtime`)
- `HandlerRegistry on`: Holds `message_handler`, `history_handler`, `new_chat_handler`.
- `SessionStore _store`: Map of `conversation_id -> BubbleSession`.
- `BubbleSession`: Tracks bubble states and order, attaches/detaches `StreamChannel`, finalizes pending bubbles.
- `StreamChannel`: Thin wrapper over `asyncio.Queue` for emitting events from threads or async tasks.
- `Bubble`: Represents a bubble template or bound instance. Key methods:
  - `send()`: Binds to the active session (requires context). Emits initial `config` and optional `set` content.
  - `set()/stream()`: Update content and emit `set`/`delta` when a stream is active.
  - `config(...)`: Validates config, merges colors, and emits `config` patches when streamed.
  - `done()`: Marks completion and emits `done`; auto-called at stream shutdown if missing.
- Conversation list helpers:
  - `set_conversation_list(user_id, conversations)`: Validates `{id,title,updatedAt}` and stores per normalized `user_id`.
  - `get_conversation_list(user_id)`: Returns a shallow copy to avoid accidental mutation.
- Context management:
  - `set_active_context(session, stream)` / `reset_active_context(token)`: Use `contextvars` to guard per-request state.
  - `access_bubble(bubble_id)`: Retrieves an existing bubble in the active stream; raises when no stream is active.

## Event Contract (NDJSON)
- `meta`: `{ "type": "meta", "conversationId": "..." }` (only on server-created IDs).
- `config`: `{ "type": "config", "bubbleId": "...", "patch": {...} }` (includes role/type and merged config).
- `set`: `{ "type": "set", "bubbleId": "...", "content": "..." }`.
- `delta`: `{ "type": "delta", "bubbleId": "...", "content": "..." }`.
- `done`: `{ "type": "done", "bubbleId": "..." }`.
- `error`: `{ "type": "error", "message": "..." }` emitted from the stream task on exceptions.

## Demo Handlers (`apps/server/main.py`)
- **Global state**: `memory` (list of `{role, content}`) shared across all users/conversations. Resets on `on.new_chat`.
- **LLM agent**: `ChatOllama(model="qwen3-coder:480b-cloud")` via `langchain_ollama`; streamed with `agent.astream({"messages": memory}, stream_mode="messages")`.
- **on.new_chat**: Sends a greeting bubble (`"Halo! Ada yang bisa dibantu?"`), seeds a stub conversation list via `set_conversation_list`, and resets `memory`.
- **on.message**:
  - Appends the incoming user message to `memory`.
  - Creates a translucent assistant bubble and streams agent chunks into it, concatenating them into `final`.
  - Appends the assistant response to `memory` when done.
- **on.history**: Clears the active session, prints context, and sends two bubbles inline. Currently ignores persistent storage.

## Invariants & Pitfalls
- `bubble.send()` / `access_bubble()` require an active context; calling them outside an endpoint will raise.
- `bubble.config()` refuses `extra` keys `id`, `config`, or `colors` to prevent schema confusion.
- `_conversation_lists` and `memory` are not thread-safe; concurrent requests can interleave updates.
- Missing `bubble.done()` is auto-finalized but triggers a warning (`warn_if_not_done`).
- History endpoint returns sent bubbles when the handler returns `None`—this is how saved session bubbles surface without explicit payloads.
