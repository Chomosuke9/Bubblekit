# Runtime Internals (`apps/server/bubblekit/runtime.py`)

This file implements the Bubblekit primitives used by handlers and the HTTP layer. Use it when extending the protocol or adjusting streaming semantics.

## Core Types
- `BubbleState`: Immutable identifiers (`id`, `role`, `type`) plus mutable `content`, `config`, `created_at`, `done`.
- `BubbleSession`: Owns ordered `BubbleState` objects for a conversation. Holds an optional `StreamChannel` to emit NDJSON events.
- `StreamChannel`: Wraps an `asyncio.Queue` and event loop, allowing emits from non-running threads with `call_soon_threadsafe`.
- `SessionStore`: Map of `conversation_id -> BubbleSession`; `get_or_create` is the only entry point.
- Contexts: `MessageContext`, `HistoryContext`, `NewChatContext` (used for handler signatures and user scoping).

## Bubble Lifecycle
1) **Create template** with `bubble(..., id?, role?, type?, config fields...)`. Config is flattened; nested `colors` are constructed via `_build_config_patch`.
2) **Send** with `send()` while an active context exists (set via `set_active_context`). This:
   - Clones the template into the session, preserving `created_at` when present.
   - Emits an initial `config` event with role/type/config and marks `done=True` if no stream is active.
3) **Mutate**:
   - `set(text)`: Replace content; emits `set` if streaming.
   - `stream(text)`: Append content; emits `delta` if streaming.
   - `config(...)`: Validates `extra`, merges `colors` with `_merge_colors`, and emits `config` when streaming.
4) **Finalize** with `done()`: Emits `done` once; no-op on repeated calls. If the stream ends, `BubbleSession.finalize_pending()` calls `done()` on unfinished bubbles and triggers a warning (`warn_if_not_done`).
5) **Access existing** with `access_bubble(bubble_id)`: Requires active stream; returns a `Bubble` bound to the existing state.

## Conversation List Helpers
- `set_conversation_list(user_id, conversations)`: Normalizes `user_id` (`None`/empty → `"anonymous"`), validates required keys (`id`, `title`, `updatedAt` int ms), and stores the list.
- `get_conversation_list(user_id)`: Returns a shallow copy; callers should treat results as read-only.
- Lists are independent of `SessionStore`; they are not automatically updated when messages stream.

## Context Management
- `_active_context` is a `contextvars.ContextVar` storing `{session, stream}`.
- `set_active_context(session, stream)` returns a token; always call `reset_active_context(token)` in `finally` blocks.
- `clear_conversation(conversation_id=None, user_id=None)`:
  - With `conversation_id=None`, clears the active session (requires active context, no stream needed).
  - With `conversation_id`, clears that session directly (ignores `user_id`).

## Validation Rules & Pitfalls
- `extra` validation: `bubble()`/`bubble.config()` reject `extra` when it contains `id`, `config`, or `colors`; non-dicts raise `TypeError`.
- Color handling: Passing `"auto"` or `_UNSET` leaves colors unchanged. `_merge_colors` prevents overwriting nested bubble/header colors when partial updates arrive.
- Role/type mutation: Allowed through `config(role=..., type=...)` but `id` is fixed after creation.
- No persistence: `BubbleSession.clear()` and process restarts wipe state; `_conversation_lists` and `_sessions` are in-memory.
- Thread safety: Designed for single-process async use; external stores are needed for multi-worker deployments.
