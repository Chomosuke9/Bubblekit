# Frontend Internals (`apps/web`)

This document describes how the React/Vite UI consumes the Bubblekit API and renders bubbles.

## Entry Points
- `apps/web/src/main.tsx`: Boots React with `App` wrapped in `StrictMode`.
- `apps/web/src/App.tsx`: Central state owner and orchestrator for streaming, history fetches, and UI layout.
- `apps/web/src/lib/chatApi.ts`: Low-level API client for history, conversation list, and NDJSON parsing.

## State & Flow (`App.tsx`)
- **State**: `userId`, `conversations`, `conversationId`, `messages`, `isLoadingHistory`, `isStreaming`, `error`, theme toggle (`isDarkMode`).
- **User ID handling**: Uses `getUserId`/`setUserId`/`resolveUserId` (`localStorage` key `bubblekit-user-id`). Changing the user ID aborts active streams, clears state, and reloads the conversation list.
- **History load**: On conversation selection, fetches `GET /api/conversations/{id}/messages` via `fetchMessageHistory`. Shows a loading indicator and handles `AbortError`.
- **Streaming**:
  - Uses `streamChat` with an `AbortController`. Stores a temporary assistant bubble ID to reconcile `config/delta` events arriving without IDs.
  - `handleStreamEvent` routes `meta` (sets conversationId), `error` (marks bubble as error and aborts), and delegates `set`/`delta`/`config`/`done` to `updateMessageFromEvent`.
  - `mergeConfigPatch` mirrors backend color merging to avoid dropping existing colors when a partial patch arrives.
- **Conversation list refresh**: Invoked after streams complete and on app load via `fetchConversationList`. Scoped by `User-Id` header when provided.
- **Layout**: Sidebar + main chat panel. Auto-scroll toggled based on distance from bottom; `ResizeObserver` tracks input height to maintain padding.
- **Theme toggle**: Button in the top-right toggles `document.documentElement` `dark` class and saves to `localStorage` (`bubblekit-theme`).

## Components
- `components/chat/MessageList.tsx`: Renders messages sequentially.
- `components/chat/MessageBubble.tsx`: Applies role-based styles, optional header with icon/name, collapsible bodies for tool outputs, and color overrides from `config.colors`. Uses `MarkdownLLM` to render markdown.
- `components/chat/MessageInput.tsx`: Textarea + send button (disabled while streaming).
- `components/shell/Sidebar.tsx`: Collapsible sidebar with search placeholder, "New chat" button, conversation list with `updatedAt` formatting, and User ID form.
- `components/shell/MainBarGenerator.tsx`: Simple helper to render sidebar action items.
- `components/ui/*`: Lightweight styled wrappers around inputs/buttons/dropdowns.

## API Client (`lib/chatApi.ts`)
- `fetchMessageHistory(conversationId, { baseUrl?, signal?, userId? })`: Fetches messages; converts API payload to `Message` shape.
- `streamChat({ baseUrl?, conversationId?, message?, signal?, userId?, onEvent })`: Issues POST and parses NDJSON stream, yielding `StreamEvent` objects (`meta/set/delta/config/done/error`).
- `fetchConversationList({ baseUrl?, signal?, userId? })`: Returns ordered `ConversationSummary[]`.
- `parseStreamLines` logic buffers partial lines to ensure each NDJSON object is parsed once.

## Pitfalls & Gotchas
- Always guard aborts: `AbortController` instances are tracked to avoid leaking streams when switching conversations or user IDs.
- `mergeConfigPatch` must stay in sync with backend color merging; changing one requires changing the other.
- Conversation list and history calls rely on the `User-Id` header; empty user ID maps to `"anonymous"` on the backend.
- No virtualization: long histories may cause DOM bloat; add virtualization if needed.
- The sidebar search box is currently cosmetic; wiring it requires backend/filter logic.
