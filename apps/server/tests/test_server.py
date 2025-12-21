import asyncio
import json
import os
import sys
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from bubblekit import bubble, create_app
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
            greeting = bubble(role="assistant", type="text")
            greeting.set("Hello")
            greeting.done()

        def message_handler(ctx):
            reply = bubble(role="assistant", type="text")
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
            reply = bubble(role="assistant", type="text")
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
