from __future__ import annotations

import asyncio
import inspect
import json
from typing import Optional

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .runtime import (
    HistoryContext,
    MessageContext,
    NewChatContext,
    StreamChannel,
    _new_id,
    _store,
    get_conversation_list,
    on,
    reset_active_context,
    set_active_context,
    warn_if_not_done,
)


class ChatStreamRequest(BaseModel):
    conversationId: Optional[str] = None
    message: Optional[str] = None


def _extract_user_id(user_id: Optional[str]) -> str:
    if user_id is None or not isinstance(user_id, str):
        return "anonymous"
    normalized = user_id.strip()
    return normalized or "anonymous"


def _call_history_handler(handler, conversation_id: str, user_id: str):
    params = [
        p
        for p in inspect.signature(handler).parameters.values()
        if p.kind
        in (
            inspect.Parameter.POSITIONAL_ONLY,
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
        )
    ]

    if len(params) >= 2:
        return handler(conversation_id, user_id)

    if len(params) == 1:
        param = params[0]
        annotation = param.annotation
        is_history_ctx = annotation is HistoryContext or getattr(annotation, "__name__", None) == "HistoryContext" or annotation == "HistoryContext"
        if is_history_ctx or param.name in {"ctx", "context"}:
            ctx = HistoryContext(conversation_id=conversation_id, user_id=user_id)
            return handler(ctx)

    return handler(conversation_id)


def _call_new_chat_handler(handler, conversation_id: str, user_id: str):
    params = [
        p
        for p in inspect.signature(handler).parameters.values()
        if p.kind
        in (
            inspect.Parameter.POSITIONAL_ONLY,
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
        )
    ]

    if len(params) >= 2:
        return handler(conversation_id, user_id)

    if len(params) == 1:
        param = params[0]
        annotation = param.annotation
        is_ctx = annotation is NewChatContext or getattr(annotation, "__name__", None) == "NewChatContext" or annotation == "NewChatContext"
        if is_ctx or param.name in {"ctx", "context"}:
            ctx = NewChatContext(conversation_id=conversation_id, user_id=user_id)
            return handler(ctx)

    return handler(conversation_id)


def create_app(
    *,
    allow_origins: Optional[list[str]] = None,
) -> FastAPI:
    app = FastAPI()

    origins = allow_origins or [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://100.64.0.1:5173",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/conversations")
    async def get_conversations(
        user_id_header: Optional[str] = Header(default=None, alias="User-Id"),
    ):
        user_id = _extract_user_id(user_id_header)
        return {"conversations": get_conversation_list(user_id)}

    @app.get("/api/conversations/{conversation_id}/messages")
    async def get_messages(
        conversation_id: str,
        user_id_header: Optional[str] = Header(default=None, alias="User-Id"),
    ):
        user_id = _extract_user_id(user_id_header)
        session = _store.get_or_create(conversation_id)
        token = set_active_context(session, stream=None)
        try:
            handler = on.history_handler
            if handler is None:
                return {"conversationId": conversation_id, "messages": []}

            result = _call_history_handler(handler, conversation_id, user_id)
            if inspect.isawaitable(result):
                result = await result

            messages = result or []
            return {"conversationId": conversation_id, "messages": messages}
        finally:
            reset_active_context(token)

    @app.post("/api/conversations/stream")
    async def stream_chat(
        payload: ChatStreamRequest,
        user_id_header: Optional[str] = Header(default=None, alias="User-Id"),
    ):
        user_id = _extract_user_id(user_id_header)
        conversation_id = payload.conversationId or _new_id()
        session = _store.get_or_create(conversation_id)
        queue: asyncio.Queue = asyncio.Queue()
        stream_channel = StreamChannel(queue, asyncio.get_running_loop())
        end_signal = object()

        async def run_handler() -> None:
            try:
                if payload.conversationId is None and on.new_chat_handler is not None:
                    result = _call_new_chat_handler(on.new_chat_handler, conversation_id, user_id)
                    if inspect.isawaitable(result):
                        await result

                message_text = None
                if payload.message is not None:
                    message_text = str(payload.message)

                if on.message_handler is None:
                    return
                if message_text is None or not message_text.strip():
                    return

                ctx = MessageContext(
                    conversation_id=conversation_id,
                    message=message_text,
                    user_id=user_id,
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
