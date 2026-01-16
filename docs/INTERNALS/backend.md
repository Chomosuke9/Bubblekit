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
    - Attaches a `StreamChannel` to the session and starts an NDJSON `StreamingResponse` (all events include `streamId` + `seq`).
    - When `conversationId` is missing, emits `{type:"meta",conversationId}` first and calls `on.new_chat_handler`.
    - Calls `on.message_handler(MessageContext)` if a non-empty `message` is provided.
    - Emits stream-level control (`started`, `progress`, `heartbeat`), enforces first-event timeout (30s) and idle timeout (60s; heartbeat every 15s).
    - Emits terminal control with `reason` (`done`, `interrupted`, `error`) and finalizes pending bubbles (`done` events) before closing.
  - `POST /api/streams/{stream_id}/cancel`:
    - Idempotent best-effort stop for an active stream. Cancels the handler task and emits `interrupted` terminal control.
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
- `started`: stream-level start marker.
- `progress`: `{ "type": "progress", "stage": "processing" }` (handlers may emit additional stages).
- `heartbeat`: `{ "type": "heartbeat" }` every 15s.
- `meta`: `{ "type": "meta", "conversationId": "..." }` (only on server-created IDs).
- `config`: `{ "type": "config", "bubbleId": "...", "patch": {...} }` (includes role/type and merged config).
- `set`: `{ "type": "set", "bubbleId": "...", "content": "..." }`.
- `delta`: `{ "type": "delta", "bubbleId": "...", "content": "..." }`.
- `done`: `{ "type": "done", "bubbleId": "..." }` (bubble-level).
- `done`: `{ "type": "done", "reason": "normal" }` (stream-level terminal).
- `interrupted`: `{ "type": "interrupted", "reason": "client_cancel|idle_timeout|disconnect" }`.
- `error`: `{ "type": "error", "message": "...", "reason": "handler_error|upstream_error|..." }` emitted from the stream task on exceptions.

## Handler Wiring (`apps/server/main.py`)
- The tracked file raises `UneditedServerFile` until you replace it with your own handlers (LLM/tool orchestration, persistence, etc.).
- Register `on.new_chat`, `on.message`, and optionally `on.history` to integrate with your provider. Tests patch the `on` registry directly.
- Use helpers like `set_conversation_list`, `clear_conversation`, and `bubble(...).send()` inside your handlers as needed.

## Invariants & Pitfalls
- `bubble.send()` / `access_bubble()` require an active context; calling them outside an endpoint will raise.
- `bubble.config()` refuses `extra` keys `id`, `config`, or `colors` to prevent schema confusion.
- `_conversation_lists` is not thread-safe; any globals you add in handlers will also be shared.
- Missing `bubble.done()` is auto-finalized but triggers a warning (`warn_if_not_done`).
- History endpoint returns sent bubbles when the handler returns `None`—this is how saved session bubbles surface without explicit payloads.
