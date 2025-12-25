# Bubblekit Architecture

This doc explains how Bubblekit is wired end-to-end so new contributors can orient quickly before touching code.

## Big Picture
- **Frontend (`apps/web`)**: React + Vite chat UI. Talks to the backend via REST + NDJSON streaming, renders bubbles with configurable colors/headers, and stores the dev-only `User-Id` override in `localStorage`.
- **Backend (`apps/server`)**: FastAPI app produced by `bubblekit.create_app()`. Exposes conversation list/history endpoints and a streaming chat endpoint. Runtime state is kept in memory (no database).
- **Handlers (`apps/server/main.py`)**: Project-specific callbacks for `on.message`, `on.history`, and `on.new_chat`. The current sample handler streams from a LangChain `ChatOllama` agent and keeps a global `memory` list.
- **Runtime (`apps/server/bubblekit/runtime.py`)**: Manages sessions, bubbles, and NDJSON event emission. Provides helpers (`bubble`, `access_bubble`, `set_conversation_list`, etc.) that handlers call.

```mermaid
graph TD
  subgraph Client
    U[User]
    UI[React UI\napps/web]
  end
  subgraph Backend
    API[FastAPI app\ncreate_app()]
    Runtime[Bubble runtime\napps/server/bubblekit/runtime.py]
    Handlers[App handlers\napps/server/main.py]
    Agent[LangChain ChatOllama\n(agent.astream)]
    Store[In-memory stores\nSessionStore + conversation lists]
  end

  U --> UI
  UI -->|GET /api/conversations| API
  UI -->|GET /api/conversations/{id}/messages| API
  UI -->|POST /api/conversations/stream\nNDJSON response| API
  API --> Runtime
  Runtime --> Handlers
  Handlers --> Agent
  Runtime --> Store
  Store --> Runtime
  API --> UI
```

## Happy Path (Request/Stream)
```mermaid
sequenceDiagram
  participant User
  participant UI as Frontend (apps/web)
  participant API as FastAPI /api/conversations/stream
  participant Runtime as Bubble runtime
  participant Handler as on.message (apps/server/main.py)
  participant Agent as LangChain ChatOllama

  User->>UI: Type message + Send
  UI->>API: POST /api/conversations/stream\n{conversationId?, message}
  API->>Runtime: session = get_or_create(conversationId)
  API->>Handler: invoke on.message(MessageContext)
  Handler->>Runtime: bubble(...).send()
  Handler->>Agent: agent.astream({"messages": memory})
  Agent-->>Handler: stream chunks
  Handler->>Runtime: bubble.stream(...)\nbubble.done()
  Runtime-->>UI: NDJSON events\n(meta?, set/delta/config/done)
  API-->>UI: Stream closes; UI refreshes\nconversation list
```

## Data Model (In Memory)
```mermaid
classDiagram
  class SessionStore {
    _sessions: dict[str, BubbleSession]
    get_or_create(conversation_id)
  }
  class BubbleSession {
    conversation_id: str
    _bubbles: dict[str, BubbleState]
    _order: list[str]
    attach_stream(); finalize_pending(); export_messages(); clear()
  }
  class BubbleState {
    id: str
    role: str
    type: str
    content: str
    config: dict
    created_at: str?
    done: bool
  }
  class ConversationList {
    _conversation_lists[user_id] -> [{id,title,updatedAt}]
    set_conversation_list(); get_conversation_list()
  }

  SessionStore "1" --> "*" BubbleSession
  BubbleSession "1" --> "*" BubbleState
  ConversationList <.. SessionStore : separate store\n(keyed by user_id)
```

## Components & Boundaries
- **HTTP/NDJSON contract**: Defined in `apps/server/bubblekit/server.py`. Events are `meta`, `set`, `delta`, `config`, `done`, `error`. Conversation list/history endpoints honor an optional `User-Id` header (falls back to `"anonymous"`).
- **Streaming safety**: `bubble.send()`/`access_bubble()` require an active stream context (managed via `contextvars`). `bubble.done()` is auto-called when the stream ends, with a warning emitted for unfinished bubbles.
- **State**: Conversations and conversation lists are in-memory only. Restarting the server or scaling horizontally drops state.
- **Frontend state**: `App.tsx` stores conversations, messages, and user ID in React state; `chatApi.ts` parses NDJSON chunks and merges `config` patches so color/header updates display correctly.

## Deployment Notes
- Default dev ports: FastAPI on `:8000` (see `uvicorn main:app --reload --port 8000`), Vite on `:5173`.
- CORS defaults to localhost origins in `create_app(allow_origins=...)`.
- Sample handler depends on `langchain` + `langchain-ollama` for `ChatOllama`; these are not pinned in `requirements.txt` and must be installed separately to run the demo logic.
