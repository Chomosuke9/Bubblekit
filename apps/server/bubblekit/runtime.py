from __future__ import annotations

import asyncio
import contextvars
import uuid
import warnings
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, overload


def _new_id() -> str:
    return uuid.uuid4().hex


_UNSET = object()
_COLOR_AUTO = "auto"

ColorValue = Optional[str]


def _is_unset_color(value: Any) -> bool:
    return value is _UNSET or value == _COLOR_AUTO


def _merge_colors(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(existing)
    for key, value in incoming.items():
        if key in ("bubble", "header"):
            if isinstance(value, dict):
                current = merged.get(key)
                if isinstance(current, dict):
                    merged[key] = {**current, **value}
                else:
                    merged[key] = dict(value)
            else:
                merged[key] = value
        else:
            merged[key] = value
    return merged


def _build_config_patch(
    *,
    name: Any = _UNSET,
    icon: Any = _UNSET,
    bubble_bg_color: Any = _COLOR_AUTO,
    bubble_text_color: Any = _COLOR_AUTO,
    bubble_border_color: Any = _COLOR_AUTO,
    header_bg_color: Any = _COLOR_AUTO,
    header_text_color: Any = _COLOR_AUTO,
    header_border_color: Any = _COLOR_AUTO,
    header_icon_bg_color: Any = _COLOR_AUTO,
    header_icon_text_color: Any = _COLOR_AUTO,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    patch: Dict[str, Any] = {}

    if name is not _UNSET:
        patch["name"] = name
    if icon is not _UNSET:
        patch["icon"] = icon

    colors: Dict[str, Any] = {}
    bubble: Dict[str, Any] = {}
    if not _is_unset_color(bubble_bg_color):
        bubble["bg"] = bubble_bg_color
    if not _is_unset_color(bubble_text_color):
        bubble["text"] = bubble_text_color
    if not _is_unset_color(bubble_border_color):
        bubble["border"] = bubble_border_color
    if bubble:
        colors["bubble"] = bubble

    header: Dict[str, Any] = {}
    if not _is_unset_color(header_bg_color):
        header["bg"] = header_bg_color
    if not _is_unset_color(header_text_color):
        header["text"] = header_text_color
    if not _is_unset_color(header_border_color):
        header["border"] = header_border_color
    if not _is_unset_color(header_icon_bg_color):
        header["iconBg"] = header_icon_bg_color
    if not _is_unset_color(header_icon_text_color):
        header["iconText"] = header_icon_text_color
    if header:
        colors["header"] = header

    if colors:
        patch["colors"] = colors

    if extra:
        patch.update(extra)

    return patch


def _validate_extra_config_fields(
    extra: Optional[Dict[str, Any]], source: str
) -> Optional[Dict[str, Any]]:
    if extra is None:
        return None
    if not isinstance(extra, dict):
        raise TypeError(f"{source} extra must be a dict.")
    if "id" in extra:
        raise ValueError(f"{source} cannot update id.")
    if "config" in extra:
        raise ValueError(f"{source} does not accept config=. Pass fields directly.")
    if "colors" in extra:
        raise ValueError(
            f"{source} does not accept colors=. Use bubble_*_color/header_*_color."
        )
    return extra


@dataclass
class BubbleState:
    id: str
    role: str
    type: str
    content: str = ""
    config: Dict[str, Any] = field(default_factory=dict)
    created_at: Optional[str] = None
    done: bool = False


class StreamChannel:
    def __init__(self, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
        self._queue = queue
        self._loop = loop
        self._closed = False

    def emit(self, event: Dict[str, Any]) -> None:
        if self._closed:
            return
        try:
            running_loop = asyncio.get_running_loop()
        except RuntimeError:
            running_loop = None

        if running_loop is self._loop:
            self._queue.put_nowait(event)
        else:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, event)

    def close(self) -> None:
        self._closed = True


class BubbleSession:
    def __init__(self, conversation_id: str) -> None:
        self.conversation_id = conversation_id
        self._bubbles: Dict[str, BubbleState] = {}
        self._order: List[str] = []
        self._stream: Optional[StreamChannel] = None

    def attach_stream(self, stream: StreamChannel) -> None:
        if self._stream is not None:
            raise RuntimeError("Stream already active for this session.")
        self._stream = stream

    def detach_stream(self) -> None:
        self._stream = None

    def emit(self, event: Dict[str, Any]) -> None:
        if self._stream is None:
            raise RuntimeError("No active stream for this session.")
        self._stream.emit(event)

    def create_bubble(self, bubble_id: str, role: str, bubble_type: str) -> BubbleState:
        if bubble_id in self._bubbles:
            raise ValueError(f"Bubble id already exists: {bubble_id}")
        state = BubbleState(id=bubble_id, role=role, type=bubble_type)
        self._bubbles[bubble_id] = state
        self._order.append(bubble_id)
        return state

    def add_bubble_state(self, state: BubbleState) -> None:
        if state.id in self._bubbles:
            raise ValueError(f"Bubble id already exists: {state.id}")
        self._bubbles[state.id] = state
        self._order.append(state.id)

    def get_bubble(self, bubble_id: str) -> BubbleState:
        try:
            return self._bubbles[bubble_id]
        except KeyError as exc:
            raise KeyError(f"Bubble not found: {bubble_id}") from exc

    def clear(self) -> None:
        self._bubbles.clear()
        self._order.clear()

    def pending_bubbles(self) -> List[BubbleState]:
        return [state for state in self._bubbles.values() if not state.done]

    def finalize_pending(self) -> List[str]:
        pending = self.pending_bubbles()
        for state in pending:
            state.done = True
            self.emit({"type": "done", "bubbleId": state.id})
        return [state.id for state in pending]


class SessionStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, BubbleSession] = {}

    def get_or_create(self, conversation_id: str) -> BubbleSession:
        session = self._sessions.get(conversation_id)
        if session is None:
            session = BubbleSession(conversation_id)
            self._sessions[conversation_id] = session
        return session


@dataclass
class SessionContext:
    session: BubbleSession
    stream: Optional[StreamChannel]


@dataclass
class MessageContext:
    conversation_id: str
    message: str


class HandlerRegistry:
    def __init__(self) -> None:
        self.message_handler = None
        self.history_handler = None
        self.new_chat_handler = None

    def message(self, func):
        self.message_handler = func
        return func

    def history(self, func):
        self.history_handler = func
        return func

    def new_chat(self, func):
        self.new_chat_handler = func
        return func


on = HandlerRegistry()
_store = SessionStore()
_active_context: contextvars.ContextVar[Optional[SessionContext]] = (
    contextvars.ContextVar(
        "bubblekit_active_context",
        default=None,
    )
)


def set_active_context(session: BubbleSession, stream: Optional[StreamChannel]):
    return _active_context.set(SessionContext(session=session, stream=stream))


def reset_active_context(token) -> None:
    _active_context.reset(token)


def _get_active_context(require_stream: bool) -> SessionContext:
    ctx = _active_context.get()
    if ctx is None:
        raise RuntimeError("No active session context.")
    if require_stream and ctx.stream is None:
        raise RuntimeError("No active stream for this context.")
    return ctx


class Bubble:
    def __init__(self, state: BubbleState, session: BubbleSession) -> None:
        self._state = state
        self._session = session

    @property
    def id(self) -> str:
        return self._state.id

    @property
    def chat(self) -> str:
        return self._state.content

    @property
    def role(self) -> str:
        return self._state.role

    @property
    def type(self) -> str:
        return self._state.type

    @property
    def config_data(self) -> Dict[str, Any]:
        return dict(self._state.config)

    def set(self, text: str) -> None:
        content = "" if text is None else str(text)
        self._state.content = content
        self._session.emit({"type": "set", "bubbleId": self.id, "content": content})

    def stream(self, text: str) -> None:
        chunk = "" if text is None else str(text)
        self._state.content += chunk
        self._session.emit({"type": "delta", "bubbleId": self.id, "content": chunk})

    @overload
    def config(
        self,
        *,
        role: Optional[str] = ...,
        type: Optional[str] = ...,
        name: Optional[str] = ...,
        icon: Optional[str] = ...,
        bubble_bg_color: ColorValue = "auto",
        bubble_text_color: ColorValue = "auto",
        bubble_border_color: ColorValue = "auto",
        header_bg_color: ColorValue = "auto",
        header_text_color: ColorValue = "auto",
        header_border_color: ColorValue = "auto",
        header_icon_bg_color: ColorValue = "auto",
        header_icon_text_color: ColorValue = "auto",
        extra: Optional[Dict[str, Any]] = ...,
    ) -> None: ...

    def config(
        self,
        *,
        role: Any = _UNSET,
        type: Any = _UNSET,
        name: Any = _UNSET,
        icon: Any = _UNSET,
        bubble_bg_color: Any = _COLOR_AUTO,
        bubble_text_color: Any = _COLOR_AUTO,
        bubble_border_color: Any = _COLOR_AUTO,
        header_bg_color: Any = _COLOR_AUTO,
        header_text_color: Any = _COLOR_AUTO,
        header_border_color: Any = _COLOR_AUTO,
        header_icon_bg_color: Any = _COLOR_AUTO,
        header_icon_text_color: Any = _COLOR_AUTO,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        extra = _validate_extra_config_fields(extra, "bubble.config()")

        patch: Dict[str, Any] = {}
        if role is not _UNSET:
            patch["role"] = role
        if type is not _UNSET:
            patch["type"] = type

        patch.update(
            _build_config_patch(
                name=name,
                icon=icon,
                bubble_bg_color=bubble_bg_color,
                bubble_text_color=bubble_text_color,
                bubble_border_color=bubble_border_color,
                header_bg_color=header_bg_color,
                header_text_color=header_text_color,
                header_border_color=header_border_color,
                header_icon_bg_color=header_icon_bg_color,
                header_icon_text_color=header_icon_text_color,
                extra=extra,
            )
        )
        self._apply_config(patch, emit=True)

    def done(self) -> None:
        if self._state.done:
            return
        self._state.done = True
        self._session.emit({"type": "done", "bubbleId": self.id})

    def _apply_config(self, patch: Dict[str, Any], emit: bool) -> None:
        if not patch:
            return
        patch_copy = dict(patch)
        role = patch_copy.pop("role", None)
        bubble_type = patch_copy.pop("type", None)

        event_patch: Dict[str, Any] = {}

        if role is not None:
            self._state.role = str(role)
            event_patch["role"] = self._state.role

        if bubble_type is not None:
            self._state.type = str(bubble_type)
            event_patch["type"] = self._state.type

        if patch_copy:
            incoming_patch = dict(patch_copy)
            incoming_colors = patch_copy.get("colors")
            existing_colors = self._state.config.get("colors")
            if isinstance(incoming_colors, dict) and isinstance(existing_colors, dict):
                patch_copy["colors"] = _merge_colors(existing_colors, incoming_colors)

            self._state.config.update(patch_copy)
            event_patch.update(incoming_patch)

        if emit and event_patch:
            self._session.emit(
                {"type": "config", "bubbleId": self.id, "patch": event_patch}
            )


@overload
def bubble(
    *,
    id: Optional[str] = None,
    role: str = "assistant",
    type: str = "text",
    name: Optional[str] = ...,
    icon: Optional[str] = ...,
    bubble_bg_color: ColorValue = "auto",
    bubble_text_color: ColorValue = "auto",
    bubble_border_color: ColorValue = "auto",
    header_bg_color: ColorValue = "auto",
    header_text_color: ColorValue = "auto",
    header_border_color: ColorValue = "auto",
    header_icon_bg_color: ColorValue = "auto",
    header_icon_text_color: ColorValue = "auto",
    extra: Optional[Dict[str, Any]] = ...,
) -> Bubble: ...


def bubble(
    *,
    id: Optional[str] = None,
    role: str = "assistant",
    type: str = "text",
    name: Any = _UNSET,
    icon: Any = _UNSET,
    bubble_bg_color: Any = _COLOR_AUTO,
    bubble_text_color: Any = _COLOR_AUTO,
    bubble_border_color: Any = _COLOR_AUTO,
    header_bg_color: Any = _COLOR_AUTO,
    header_text_color: Any = _COLOR_AUTO,
    header_border_color: Any = _COLOR_AUTO,
    header_icon_bg_color: Any = _COLOR_AUTO,
    header_icon_text_color: Any = _COLOR_AUTO,
    extra: Optional[Dict[str, Any]] = None,
) -> Bubble:
    extra = _validate_extra_config_fields(extra, "bubble()")

    ctx = _get_active_context(require_stream=True)
    bubble_id = id or _new_id()
    role_value = "assistant" if role is None else str(role)
    type_value = "text" if type is None else str(type)
    state = ctx.session.create_bubble(
        bubble_id, role=role_value, bubble_type=type_value
    )
    instance = Bubble(state, ctx.session)

    init_patch = {"role": role_value, "type": type_value}
    init_patch.update(
        _build_config_patch(
            name=name,
            icon=icon,
            bubble_bg_color=bubble_bg_color,
            bubble_text_color=bubble_text_color,
            bubble_border_color=bubble_border_color,
            header_bg_color=header_bg_color,
            header_text_color=header_text_color,
            header_border_color=header_border_color,
            header_icon_bg_color=header_icon_bg_color,
            header_icon_text_color=header_icon_text_color,
            extra=extra,
        )
    )
    instance._apply_config(init_patch, emit=True)
    return instance


def access_bubble(bubble_id: str) -> Bubble:
    ctx = _get_active_context(require_stream=True)
    state = ctx.session.get_bubble(bubble_id)
    return Bubble(state, ctx.session)


def load(context: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ctx = _get_active_context(require_stream=False)
    ctx.session.clear()

    messages: List[Dict[str, Any]] = []
    for item in context:
        if not isinstance(item, dict):
            raise ValueError("Each context item must be a dict.")

        bubble_id = str(item.get("id") or _new_id())
        role_value = item.get("role")
        type_value = item.get("type")
        content_value = item.get("content")

        role = str(role_value) if role_value is not None else "assistant"
        bubble_type = str(type_value) if type_value is not None else "text"
        content = "" if content_value is None else str(content_value)
        config = dict(item.get("config") or {})
        created_at = item.get("createdAt")

        state = BubbleState(
            id=bubble_id,
            role=role,
            type=bubble_type,
            content=content,
            config=config,
            created_at=created_at,
            done=True,
        )
        ctx.session.add_bubble_state(state)

        messages.append(
            {
                "id": bubble_id,
                "role": role,
                "content": content,
                "type": bubble_type,
                "config": config,
                "createdAt": created_at,
            }
        )

    return messages


def warn_if_not_done(bubble_ids: List[str]) -> None:
    if not bubble_ids:
        return
    warnings.warn(
        "Bubblekit: auto-finalized bubbles without done(): " + ", ".join(bubble_ids),
        RuntimeWarning,
        stacklevel=2,
    )
