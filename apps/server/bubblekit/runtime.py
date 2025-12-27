from __future__ import annotations

import asyncio
import contextvars
import uuid
import warnings
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, TypedDict, NotRequired, cast

class BubblePayload(TypedDict, total=False):
    id: NotRequired[str | int | None]
    role: NotRequired[str | None]
    type: NotRequired[str | None]
    content: NotRequired[str | None]
    config: NotRequired[dict[str, Any] | None]
    createdAt: NotRequired[str | None]


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
    collapsible: Any = _UNSET,
    collapsible_title: Any = _UNSET,
    collapsible_max_height: Any = _UNSET,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    patch: Dict[str, Any] = {}

    if name is not _UNSET:
        patch["name"] = name
    if icon is not _UNSET:
        patch["icon"] = icon
    if collapsible is not _UNSET:
        patch["collapsible"] = collapsible
    if collapsible_title is not _UNSET:
        patch["collapsible_title"] = collapsible_title
    if collapsible_max_height is not _UNSET:
        patch["collapsible_max_height"] = collapsible_max_height

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


def _state_to_message(state: BubbleState) -> Dict[str, Any]:
    return {
        "id": state.id,
        "role": state.role,
        "content": state.content,
        "type": state.type,
        "config": dict(state.config),
        "createdAt": state.created_at,
    }


def json_bubble_to_openai(message: Any) -> Dict[str, str]:
    if not isinstance(message, dict):
        raise TypeError("json_bubble_to_openai: message must be a dict.")

    raw_role = message.get("role")
    role_value = "assistant" if raw_role is None else str(raw_role).strip()
    if not role_value:
        role_value = "assistant"

    raw_content = message.get("content")
    content_value = "" if raw_content is None else str(raw_content)

    return {"role": role_value, "content": content_value}


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

    def has_stream(self) -> bool:
        return self._stream is not None

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

    def export_messages(self) -> List[Dict[str, Any]]:
        return [_state_to_message(self._bubbles[bubble_id]) for bubble_id in self._order]


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
    user_id: str


@dataclass
class HistoryContext:
    conversation_id: str
    user_id: str


@dataclass
class NewChatContext:
    conversation_id: str
    user_id: str


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
_conversation_lists: Dict[str, List[Dict[str, Any]]] = {}
_active_context: contextvars.ContextVar[Optional[SessionContext]] = (
    contextvars.ContextVar(
        "bubblekit_active_context",
        default=None,
    )
)


def _normalize_user_id(user_id: Optional[str]) -> str:
    if user_id is None:
        return "anonymous"
    user_id_str = str(user_id).strip()
    return user_id_str or "anonymous"


def set_active_context(session: BubbleSession, stream: Optional[StreamChannel]):
    return _active_context.set(SessionContext(session=session, stream=stream))


def reset_active_context(token) -> None:
    _active_context.reset(token)


def _validate_conversation_item(item: Dict[str, Any], index: int) -> Dict[str, Any]:
    if not isinstance(item, dict):
        raise TypeError(f"Conversation {index} must be a dict.")

    for field_name in ("id", "title", "updatedAt"):
        if field_name not in item:
            raise ValueError(f"Conversation {index} missing required field: {field_name}")

    raw_id = item["id"]
    if raw_id is None:
        raise ValueError(f"Conversation {index} id cannot be None.")
    conv_id = str(raw_id)

    title = item["title"]
    if not isinstance(title, str):
        raise TypeError(f"Conversation {index} title must be a string.")

    updated_at = item["updatedAt"]
    if not isinstance(updated_at, int) or isinstance(updated_at, bool):
        raise TypeError(f"Conversation {index} updatedAt must be an integer (unix ms).")

    normalized: Dict[str, Any] = {
        "id": conv_id,
        "title": title,
        "updatedAt": updated_at,
    }

    for key, value in item.items():
        if key in normalized:
            continue
        normalized[key] = value

    return normalized


def set_conversation_list(
    user_id: Optional[str], conversations: Sequence[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    user_key = _normalize_user_id(user_id)

    if not isinstance(conversations, Sequence) or isinstance(conversations, (str, bytes)):
        raise TypeError("conversations must be a list/sequence of dicts.")

    normalized_list = [
        _validate_conversation_item(item, index) for index, item in enumerate(conversations)
    ]

    _conversation_lists[user_key] = normalized_list
    return list(normalized_list)


def get_conversation_list(user_id: Optional[str]) -> List[Dict[str, Any]]:
    user_key = _normalize_user_id(user_id)
    stored = _conversation_lists.get(user_key, [])
    return [dict(item) for item in stored]


def clear_conversation(
    conversation_id: Optional[str] = None, user_id: Optional[str] = None
) -> None:
    if conversation_id is None:
        ctx = _get_active_context(require_stream=False)
        ctx.session.clear()
        return

    _ = user_id
    session = _store.get_or_create(str(conversation_id))
    session.clear()


def _get_active_context(require_stream: bool) -> SessionContext:
    ctx = _active_context.get()
    if ctx is None:
        raise RuntimeError("No active session context.")
    if require_stream and ctx.stream is None:
        raise RuntimeError("No active stream for this context.")
    return ctx


def _emit_if_stream(session: BubbleSession, event: Dict[str, Any]) -> None:
    if session.has_stream():
        session.emit(event)


def create_history(*, id: Any, title: Any, updatedAt: Any, **extra: Any) -> Dict[str, Any]:
    conv_id = str(id)
    if not conv_id:
        raise ValueError("create_history: id cannot be empty.")
    if title is None or not isinstance(title, str):
        raise TypeError("create_history: title must be a string.")
    normalized_title = title.strip()
    if not normalized_title:
        raise ValueError("create_history: title cannot be empty.")
    if not isinstance(updatedAt, int) or isinstance(updatedAt, bool):
        raise TypeError("create_history: updatedAt must be an integer (unix ms).")

    payload: Dict[str, Any] = {
        "id": conv_id,
        "title": normalized_title,
        "updatedAt": updatedAt,
    }
    for key, value in extra.items():
        if key in payload:
            continue
        payload[key] = value
    return payload


class Bubble:
    def __init__(
        self,
        state: BubbleState,
        session: Optional[BubbleSession] = None,
        *,
        id_fixed: bool = True,
    ) -> None:
        self._state = state
        self._session = session
        self._id_fixed = id_fixed

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

    def set(self, text: str) -> Bubble:
        content = "" if text is None else str(text)
        self._state.content = content
        if self._session is not None and self._session.has_stream():
            self._session.emit({"type": "set", "bubbleId": self.id, "content": content})
        return self

    def stream(self, text: str) -> Bubble:
        chunk = "" if text is None else str(text)
        self._state.content += chunk
        if self._session is not None and self._session.has_stream():
            self._session.emit({"type": "delta", "bubbleId": self.id, "content": chunk})
        return self



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
        collapsible: Any = _UNSET,
        collapsible_title: Any = _UNSET,
        collapsible_max_height: Any = _UNSET,
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
                collapsible=collapsible,
                collapsible_title=collapsible_title,
                collapsible_max_height=collapsible_max_height,
                extra=extra,
            )
        )
        self._apply_config(patch, emit=self._session is not None)

    def done(self) -> Bubble:
        if self._state.done:
            return self
        self._state.done = True
        if self._session is not None and self._session.has_stream():
            self._session.emit({"type": "done", "bubbleId": self.id})
        return self

    def send(self) -> Bubble:
        if self._session is not None:
            raise RuntimeError("Bubble already sent.")

        ctx = _get_active_context(require_stream=False)
        has_stream = ctx.session.has_stream()
        bubble_id = self._state.id if self._id_fixed else _new_id()
        state = ctx.session.create_bubble(
            bubble_id, role=self._state.role, bubble_type=self._state.type
        )
        state.created_at = self._state.created_at
        if not has_stream:
            state.done = True

        instance = Bubble(state, ctx.session, id_fixed=True)
        init_patch = {"role": self._state.role, "type": self._state.type}
        if self._state.config:
            init_patch.update(dict(self._state.config))
        instance._apply_config(init_patch, emit=has_stream)

        if self._state.content:
            instance.set(self._state.content)
        if self._state.done and has_stream:
            instance.done()

        return instance

    def to_openai(self) -> Dict[str, str]:
        return {"role": self._state.role, "content": self._state.content}

    def to_json_bubble(self) -> Dict[str, Any]:
        return _state_to_message(self._state)

    @classmethod
    def from_json_bubble(cls, payload: Any) -> Bubble:
        if not isinstance(payload, dict):
            raise TypeError("Bubble.from_json_bubble: payload must be a dict.")

        payload_t = cast(BubblePayload, payload)

        raw_id = payload_t.get("id")
        bubble_id = _new_id() if raw_id is None or not str(raw_id).strip() else str(raw_id)

        raw_role = payload_t.get("role")
        role_value = "assistant" if raw_role is None else str(raw_role).strip()
        if not role_value:
            role_value = "assistant"

        raw_type = payload_t.get("type")
        type_value = "text" if raw_type is None else str(raw_type).strip()
        if not type_value:
            type_value = "text"

        raw_content = payload_t.get("content")
        content_value = "" if raw_content is None else str(raw_content)

        config_value: dict[str, Any] = {}
        raw_config = payload_t.get("config")
        if isinstance(raw_config, dict):
            config_value = dict(raw_config)
            config_value.pop("role", None)
            config_value.pop("type", None)

        raw_created_at = payload_t.get("createdAt")
        created_at_value = None if raw_created_at is None else str(raw_created_at)

        state = BubbleState(
            id=bubble_id,
            role=role_value,
            type=type_value,
            content=content_value,
            config=config_value,
            created_at=created_at_value,
        )
        return cls(state, session=None, id_fixed=True)

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

        if emit and event_patch and self._session is not None and self._session.has_stream():
            self._session.emit(
                {"type": "config", "bubbleId": self.id, "patch": event_patch}
            )




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
    collapsible: Any = _UNSET,
    collapsible_title: Any = _UNSET,
    collapsible_max_height: Any = _UNSET,
    extra: Optional[Dict[str, Any]] = None,
) -> Bubble:
    extra = _validate_extra_config_fields(extra, "bubble()")

    bubble_id = str(id) if id is not None else _new_id()
    role_value = "assistant" if role is None else str(role)
    type_value = "text" if type is None else str(type)
    state = BubbleState(id=bubble_id, role=role_value, type=type_value)
    instance = Bubble(state, session=None, id_fixed=id is not None)

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
            collapsible=collapsible,
            collapsible_title=collapsible_title,
            collapsible_max_height=collapsible_max_height,
            extra=extra,
        )
    )
    instance._apply_config(init_patch, emit=False)
    return instance


def access_bubble(bubble_id: str) -> Bubble:
    ctx = _get_active_context(require_stream=True)
    state = ctx.session.get_bubble(bubble_id)
    return Bubble(state, ctx.session, id_fixed=True)


def warn_if_not_done(bubble_ids: List[str]) -> None:
    if not bubble_ids:
        return
    warnings.warn(
        "Bubblekit: auto-finalized bubbles without done(): " + ", ".join(bubble_ids),
        RuntimeWarning,
        stacklevel=2,
    )
