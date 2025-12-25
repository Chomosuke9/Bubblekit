import asyncio
import json
import json
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from bubblekit import HistoryContext, NewChatContext, bubble, create_app, set_conversation_list
from bubblekit.runtime import on
from bubblekit.server import ChatStreamRequest


def _get_route(app, path, method):
    for route in app.router.routes:
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return route
    raise AssertionError(f"Route not found: {method} {path}")


async def _collect_events(response):
    chunks = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunk = chunk.decode()
        chunks.append(chunk)
    payload = "".join(chunks)
    lines = [line for line in payload.splitlines() if line.strip()]
    return [json.loads(line) for line in lines]


class ServerStreamTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = create_app()
        self._original_message = on.message_handler
        self._original_new_chat = on.new_chat_handler
        self._original_history = on.history_handler

    async def asyncTearDown(self):
        on.message_handler = self._original_message
        on.new_chat_handler = self._original_new_chat
        on.history_handler = self._original_history

    async def test_stream_emits_meta_and_handlers(self):
        def new_chat_handler(conversation_id):
            greeting = bubble(role="assistant", type="text").send()
            greeting.set("Hello")
            greeting.done()

        def message_handler(ctx):
            reply = bubble(role="assistant", type="text").send()
            reply.set(f"Echo: {ctx.message}")
            reply.done()

        on.new_chat_handler = new_chat_handler
        on.message_handler = message_handler

        route = _get_route(self.app, "/api/conversations/stream", "POST")
        response = await route.endpoint(
            ChatStreamRequest(conversationId=None, message="Ping")
        )
        events = await _collect_events(response)

        types = [event.get("type") for event in events]
        self.assertIn("meta", types)
        self.assertIn("set", types)
        self.assertIn("done", types)

        contents = [event.get("content") for event in events if event.get("type") == "set"]
        self.assertIn("Hello", contents)
        self.assertIn("Echo: Ping", contents)

    async def test_stream_skips_new_chat_for_existing_conversation(self):
        called = {"new_chat": False}

        def new_chat_handler(conversation_id):
            called["new_chat"] = True

        def message_handler(ctx):
            reply = bubble(role="assistant", type="text").send()
            reply.set("Hi")
            reply.done()

        on.new_chat_handler = new_chat_handler
        on.message_handler = message_handler

        route = _get_route(self.app, "/api/conversations/stream", "POST")
        response = await route.endpoint(
            ChatStreamRequest(conversationId="existing", message="Test")
        )
        events = await _collect_events(response)

        self.assertFalse(called["new_chat"])
        self.assertNotIn("meta", [event.get("type") for event in events])
        self.assertIn("Hi", [event.get("content") for event in events if event.get("type") == "set"])

    async def test_conversation_list_endpoint_preserves_order(self):
        set_conversation_list(
            "alice",
            [
                {"id": "c1", "title": "First", "updatedAt": 100},
                {"id": "c2", "title": "Second", "updatedAt": 200},
            ],
        )

        route = _get_route(self.app, "/api/conversations", "GET")
        payload = await route.endpoint(user_id_header="alice")

        self.assertEqual(
            [conv["id"] for conv in payload.get("conversations", [])],
            ["c1", "c2"],
        )

    async def test_history_handler_receives_user_id_context(self):
        received = {}

        def history_handler(ctx: HistoryContext):
            received["ctx"] = (ctx.conversation_id, ctx.user_id)
            return []

        on.history_handler = history_handler

        route = _get_route(self.app, "/api/conversations/{conversation_id}/messages", "GET")
        await route.endpoint(conversation_id="abc", user_id_header="user-123")

        self.assertEqual(received.get("ctx"), ("abc", "user-123"))

    async def test_history_handler_two_params_backward_compatible(self):
        received = {}

        def history_handler(conversation_id, user_id):
            received["args"] = (conversation_id, user_id)
            return []

        on.history_handler = history_handler

        route = _get_route(self.app, "/api/conversations/{conversation_id}/messages", "GET")
        await route.endpoint(conversation_id="abc", user_id_header=None)

        self.assertEqual(received.get("args"), ("abc", "anonymous"))

    async def test_history_handler_accepts_bubble_templates(self):
        def history_handler(conversation_id):
            draft = bubble(role="assistant", type="text")
            draft.set("Saved")
            return [draft]

        on.history_handler = history_handler

        route = _get_route(self.app, "/api/conversations/{conversation_id}/messages", "GET")
        payload = await route.endpoint(conversation_id="abc", user_id_header="user-123")

        messages = payload.get("messages", [])
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["role"], "assistant")
        self.assertEqual(messages[0]["content"], "Saved")

    async def test_history_handler_returns_sent_bubbles_when_none(self):
        def history_handler(conversation_id):
            bubble(role="assistant", type="text").set("From send").send()

        on.history_handler = history_handler

        route = _get_route(self.app, "/api/conversations/{conversation_id}/messages", "GET")
        payload = await route.endpoint(conversation_id="abc", user_id_header="user-123")

        messages = payload.get("messages", [])
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["content"], "From send")

    async def test_new_chat_handler_receives_user_id_context(self):
        received = {}

        def new_chat_handler(ctx: NewChatContext):
            received["ctx"] = (ctx.conversation_id, ctx.user_id)

        on.new_chat_handler = new_chat_handler

        route = _get_route(self.app, "/api/conversations/stream", "POST")
        response = await route.endpoint(
            ChatStreamRequest(conversationId=None, message=None),
            user_id_header="user-123",
        )
        await _collect_events(response)

        conversation_id, user_id = received.get("ctx", (None, None))
        self.assertTrue(conversation_id)
        self.assertEqual(user_id, "user-123")

    async def test_new_chat_handler_two_params_backward_compatible(self):
        received = {}

        def new_chat_handler(conversation_id, user_id):
            received["args"] = (conversation_id, user_id)

        on.new_chat_handler = new_chat_handler

        route = _get_route(self.app, "/api/conversations/stream", "POST")
        response = await route.endpoint(
            ChatStreamRequest(conversationId=None, message=None),
            user_id_header=None,
        )
        await _collect_events(response)

        conversation_id, user_id = received.get("args", (None, None))
        self.assertTrue(conversation_id)
        self.assertEqual(user_id, "anonymous")
