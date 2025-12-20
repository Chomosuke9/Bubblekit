from __future__ import annotations

import asyncio
import inspect
import json
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .runtime import (
    MessageContext,
    StreamChannel,
    _new_id,
    _store,
    on,
    reset_active_context,
    set_active_context,
    warn_if_not_done,
)


class ChatStreamRequest(BaseModel):
    conversationId: Optional[str] = None
    message: str


def create_app(
    *,
    allow_origins: Optional[list[str]] = None,
) -> FastAPI:
    app = FastAPI()

    origins = allow_origins or [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/conversations/{conversation_id}/messages")
    async def get_messages(conversation_id: str):
        session = _store.get_or_create(conversation_id)
        token = set_active_context(session, stream=None)
        try:
            handler = on.history_handler
            if handler is None:
                return {"conversationId": conversation_id, "messages": []}

            result = handler(conversation_id)
            if inspect.isawaitable(result):
                result = await result

            messages = result or []
            return {"conversationId": conversation_id, "messages": messages}
        finally:
            reset_active_context(token)

    @app.post("/api/conversations/stream")
    async def stream_chat(payload: ChatStreamRequest):
        conversation_id = payload.conversationId or _new_id()
        session = _store.get_or_create(conversation_id)
        queue: asyncio.Queue = asyncio.Queue()
        stream_channel = StreamChannel(queue, asyncio.get_running_loop())
        end_signal = object()

        async def run_handler() -> None:
            try:
                if payload.conversationId is None and on.new_chat_handler is not None:
                    result = on.new_chat_handler(conversation_id)
                    if inspect.isawaitable(result):
                        await result

                if on.message_handler is None:
                    return

                ctx = MessageContext(
                    conversation_id=conversation_id,
                    message=str(payload.message),
                )
                result = on.message_handler(ctx)
                if inspect.isawaitable(result):
                    await result
            except Exception as exc:  # pragma: no cover - stream error path
                stream_channel.emit({"type": "error", "message": str(exc)})
            finally:
                pending = session.finalize_pending()
                warn_if_not_done(pending)
                queue.put_nowait(end_signal)

        async def event_stream():
            token = set_active_context(session, stream=stream_channel)
            session.attach_stream(stream_channel)

            if payload.conversationId is None:
                stream_channel.emit({"type": "meta", "conversationId": conversation_id})

            handler_task = asyncio.create_task(run_handler())
            try:
                while True:
                    event = await queue.get()
                    if event is end_signal:
                        break
                    yield json.dumps(event) + "\n"
            except asyncio.CancelledError:
                if not handler_task.done():
                    handler_task.cancel()
                raise
            finally:
                if not handler_task.done():
                    handler_task.cancel()
                try:
                    await handler_task
                except asyncio.CancelledError:
                    pass
                session.detach_stream()
                stream_channel.close()
                reset_active_context(token)

        return StreamingResponse(event_stream(), media_type="application/x-ndjson")

    return app
