# Design & Trade-offs

This document captures the notable design decisions in Bubblekit so contributors understand why things look the way they do and what to watch out for when extending them.

## Goals
- Provide a minimal LLM chat stack with a pluggable backend handler surface (`on.message`, `on.history`, `on.new_chat`).
- Keep the streaming contract simple (NDJSON over HTTP) so the frontend and backend remain loosely coupled.
- Offer a lightweight UI that renders bubbles with configurable metadata/colors without enforcing a heavy design system.

## Key Decisions
- **NDJSON over HTTP instead of WebSockets**: Keeps infra simple and works with standard reverse proxies. Trade-off: no server-to-client push outside the request lifecycle.
- **In-memory session + conversation list stores**: `SessionStore` and `_conversation_lists` keep runtime state without a database. Trade-offs: non-persistent, single-process only, and not safe for horizontal scaling. Add a backing store before production use.
- **Context-driven bubble API**: `bubble.send()`/`access_bubble()` require an active session context (`contextvars`) to guard against cross-request leakage. Trade-off: handlers must run inside the request lifecycle; background tasks need explicit context wiring.
- **Config patching and color merging**: `bubble.config()` merges nested `colors` patches to avoid overwriting existing palette choices. The frontend mirrors this merge in `mergeConfigPatch(...)`. Trade-off: callers must avoid sending full color payloads when only partial updates are needed.
- **User scoping via `User-Id` header**: Conversation lists are keyed by a normalized user ID that defaults to `"anonymous"`. Trade-off: caller is responsible for sending the header; there is no auth built in.
- **Sample agent uses LangChain ChatOllama**: Demonstrates streaming integration via `agent.astream(...)`. Trade-off: requires `langchain` + `langchain-ollama` installed locally and uses a global `memory` list (shared across users/sessions in the demo).
- **Frontend state-first design**: React state in `App.tsx` owns conversations, messages, streaming status, and error handling. AbortControllers guard against stale fetches. Trade-off: no global state manager; lifting state higher may be needed as the UI grows.
- **Manual theme toggle**: Stored in `localStorage` (`bubblekit-theme`) and applied to `document.documentElement`. Trade-off: no system-preference auto-sync beyond initial load.

## Known Limitations / Future Considerations
- **Persistence & multi-instance**: Add database-backed message history and conversation lists, and move session state to a shared store or WebSocket gateway if scaling out.
- **Concurrency safety**: The runtime assumes single-threaded event loops; shared globals in `apps/server/main.py` (e.g., `memory`) can race if reused concurrently.
- **Validation**: The HTTP API trusts handler output; consider adding Pydantic models for history payloads.
- **Observability**: There is no structured logging or tracing yet; add middleware and log correlation around conversation IDs.
