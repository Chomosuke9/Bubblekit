# FAQ

**How do I add an LLM/provider?**  
`apps/server/main.py` is intentionally empty and raises `UneditedServerFile` until you wire handlers. Register `on.message`/`on.new_chat` and call your preferred SDK (OpenAI, LangChain, etc.), then install those dependencies in the backend venv.

**Where is data stored? Is it persistent?**  
All state is in memory (`SessionStore` in `bubblekit.runtime` and `_conversation_lists`). Restarting the server or running multiple workers will lose or split state. Add a database or shared cache before production use.

**How do conversation lists differ from sessions?**  
Conversation lists live in `_conversation_lists` keyed by `User-Id`; sessions live in `_store` keyed by `conversationId`. Lists are not auto-updated by streams—you must call `set_conversation_list(...)` yourself.

**Do I need to call `bubble.done()`?**  
Yes—call it to mark completion. The runtime auto-finalizes pending bubbles at stream end and emits a warning (`warn_if_not_done`) to help catch misses.

**Can history handlers return `Bubble` objects?**  
Yes. Returning `Bubble` templates (not sent) is supported; the server normalizes them to dicts. Returning `None` makes the server fall back to the session’s sent bubbles.

**Why is the User ID input in the sidebar?**  
The `User-Id` header scopes conversation lists/history for multi-user dev testing. Leaving it blank defaults to `"anonymous"` on the backend.

**How do I add a new message type or tool output?**  
Use `bubble(type="tool", collapsible=True, collapsible_title="...")` to render tool-like bubbles. The frontend forwards `config.extra` fields to `MessageBubble`; extend rendering there if you add new semantics.

**Streaming shows gibberish or partial lines. What to check?**  
Ensure the backend emits valid JSON per line and the frontend `parseStreamLines` is kept unchanged. If you adjust the protocol, update both `bubblekit.server` and `chatApi.ts`.
