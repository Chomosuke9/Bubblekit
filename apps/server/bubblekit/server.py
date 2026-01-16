from __future__ import annotations

import asyncio
import contextlib
import inspect
import json
from dataclasses import dataclass
from typing import Any, Dict, Optional, Sequence

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .runtime import (
    HistoryContext,
    MessageContext,
    NewChatContext,
    StreamChannel,
    Bubble,
    _new_id,
    _store,
    get_conversation_list,
    on,
    reset_active_context,
    set_active_context,
    warn_if_not_done,
)


HEARTBEAT_SECONDS = 15
IDLE_TIMEOUT_SECONDS = 60
FIRST_EVENT_TIMEOUT_SECONDS = 30


@dataclass
class ActiveStream:
    stream_id: str
    conversation_id: str
    session: Any
    queue: asyncio.Queue
    stream_channel: StreamChannel
    end_signal: object
    handler_task: Optional[asyncio.Task] = None
    reason: str = "done"
    reason_detail: Optional[str] = None
    error_message: Optional[str] = None
    closed: bool = False

    def set_reason(
        self,
        reason: str,
        *,
        detail: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        if self.closed and self.reason != "done":
            return
        if self.reason != "done" and self.reason != reason:
            return
        self.reason = reason
        if detail is not None:
            self.reason_detail = detail
        if error_message is not None:
            self.error_message = error_message

    def close(self, reason: Optional[str] = None) -> bool:
        if self.closed:
            return False

        if reason:
            self.set_reason(reason)

        pending = self.session.finalize_pending()
        warn_if_not_done(pending)

        terminal_event: Dict[str, Any]
        if self.reason == "error":
            terminal_event = {
                "type": "error",
                "message": self.error_message or "stream error",
                "reason": self.reason_detail or "error",
            }
        elif self.reason == "interrupted":
            terminal_event = {
                "type": "interrupted",
                "reason": self.reason_detail or "interrupted",
            }
        else:
            terminal_event = {
                "type": "done",
                "reason": self.reason_detail or "normal",
            }

        self.stream_channel.emit(terminal_event)
        self.queue.put_nowait(self.end_signal)
        self.closed = True
        return True

    def cancel_handler(self) -> None:
        if self.handler_task and not self.handler_task.done():
            self.handler_task.cancel()


_active_streams: Dict[str, ActiveStream] = {}


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


def _normalize_history_messages(messages):
    if messages is None:
        return []
    if not isinstance(messages, Sequence) or isinstance(messages, (str, bytes)):
        raise TypeError("History handler must return a list of dicts or Bubble objects.")

    normalized = []
    for item in messages:
        if isinstance(item, Bubble):
            normalized.append(item.to_json_bubble())
            continue
        if isinstance(item, dict):
            normalized.append(dict(item))
            continue
        raise TypeError("History items must be dicts or Bubble objects.")

    return normalized


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
        allow_credentials=True,

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

            if result is None:
                messages = session.export_messages()
                return {"conversationId": conversation_id, "messages": messages}

            messages = _normalize_history_messages(result)
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
        stream_id = _new_id()
        session = _store.get_or_create(conversation_id)
        queue: asyncio.Queue = asyncio.Queue()
        stream_channel = StreamChannel(queue, asyncio.get_running_loop(), stream_id)
        end_signal = object()
        active = ActiveStream(
            stream_id=stream_id,
            conversation_id=conversation_id,
            session=session,
            queue=queue,
            stream_channel=stream_channel,
            end_signal=end_signal,
        )
        _active_streams[stream_id] = active

        async def run_handler() -> None:
            try:
                if payload.conversationId is None and on.new_chat_handler is not None:
                    result = _call_new_chat_handler(
                        on.new_chat_handler, conversation_id, user_id
                    )
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
                active.set_reason(
                    "error",
                    detail="handler_error",
                    error_message=str(exc),
                )
            finally:
                queue.put_nowait(end_signal)

        async def send_heartbeat():
            try:
                while not active.closed:
                    await asyncio.sleep(HEARTBEAT_SECONDS)
                    if active.closed:
                        break
                    stream_channel.emit({"type": "heartbeat"})
            except asyncio.CancelledError:
                return

        async def event_stream():
            token = set_active_context(session, stream=stream_channel)
            session.attach_stream(stream_channel)
            first_event_seen = False

            try:
                if payload.conversationId is None:
                    stream_channel.emit({"type": "meta", "conversationId": conversation_id})
                stream_channel.emit({"type": "started", "conversationId": conversation_id})
                stream_channel.emit({"type": "progress", "stage": "processing"})

                handler_task = asyncio.create_task(run_handler())
                active.handler_task = handler_task
                heartbeat_task = asyncio.create_task(send_heartbeat())

                while True:
                    try:
                        timeout = (
                            FIRST_EVENT_TIMEOUT_SECONDS
                            if not first_event_seen
                            else IDLE_TIMEOUT_SECONDS
                        )
                        event = await asyncio.wait_for(queue.get(), timeout=timeout)
                    except asyncio.TimeoutError:
                        active.set_reason("interrupted", detail="idle_timeout")
                        active.close("interrupted")
                        continue

                    first_event_seen = True
                    if event is end_signal:
                        if not active.closed:
                            active.close()
                            continue
                        break
                    yield json.dumps(event) + "\n"

                if not active.closed:
                    active.close()

                await asyncio.gather(handler_task, return_exceptions=True)
                heartbeat_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await heartbeat_task
            except asyncio.CancelledError:
                active.set_reason("interrupted", detail="client_abort")
                active.close("interrupted")
                active.cancel_handler()
                raise
            finally:
                session.detach_stream()
                stream_channel.close()
                reset_active_context(token)
                _active_streams.pop(stream_id, None)

        return StreamingResponse(
            event_stream(),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.post("/api/streams/{stream_id}/cancel")
    async def cancel_stream(stream_id: str):
        stream = _active_streams.get(stream_id)
        if stream is None:
            return {"status": "not_found"}

        stream.set_reason("interrupted", detail="client_cancel")
        stream.close("interrupted")
        stream.cancel_handler()
        return {"status": "ok"}

    return app
