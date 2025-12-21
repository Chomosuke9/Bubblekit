import asyncio
import os
import sys
import unittest
import warnings

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from bubblekit import access_bubble, bubble, load
from bubblekit.runtime import (
    BubbleSession,
    StreamChannel,
    reset_active_context,
    set_active_context,
    warn_if_not_done,
)


class RuntimeStreamTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.session = BubbleSession("test-session")
        self.queue = asyncio.Queue()
        self.stream = StreamChannel(self.queue, asyncio.get_running_loop())
        self.token = set_active_context(self.session, stream=self.stream)
        self.session.attach_stream(self.stream)

    async def asyncTearDown(self):
        self.session.detach_stream()
        reset_active_context(self.token)

    async def test_bubble_emits_config_on_create(self):
        reply = bubble(
            id="b1",
            role="assistant",
            type="text",
            name="Support",
            icon="/icons/support.svg",
            bubble_bg_color="#111111",
            header_text_color="#222222",
        )
        event = await self.queue.get()

        self.assertEqual(event["type"], "config")
        self.assertEqual(event["bubbleId"], "b1")
        patch = event["patch"]
        self.assertEqual(patch["role"], "assistant")
        self.assertEqual(patch["type"], "text")
        self.assertEqual(patch["name"], "Support")
        self.assertEqual(patch["icon"], "/icons/support.svg")
        self.assertEqual(patch["colors"]["bubble"]["bg"], "#111111")
        self.assertEqual(patch["colors"]["header"]["text"], "#222222")

        self.assertEqual(reply.config_data["name"], "Support")

    async def test_bubble_stream_updates_state_and_emits_delta(self):
        reply = bubble(id="b2")
        await self.queue.get()

        reply.stream("Hi")
        reply.stream("!")

        event1 = await self.queue.get()
        event2 = await self.queue.get()

        self.assertEqual(event1["type"], "delta")
        self.assertEqual(event1["content"], "Hi")
        self.assertEqual(event2["type"], "delta")
        self.assertEqual(event2["content"], "!")
        self.assertEqual(reply.chat, "Hi!")

    async def test_bubble_set_replaces_content_and_emits_set(self):
        reply = bubble(id="b3")
        await self.queue.get()

        reply.set("Hello")
        event = await self.queue.get()

        self.assertEqual(event["type"], "set")
        self.assertEqual(event["content"], "Hello")
        self.assertEqual(reply.chat, "Hello")

    async def test_bubble_done_emits_once(self):
        reply = bubble(id="b4")
        await self.queue.get()

        reply.done()
        event = await self.queue.get()
        self.assertEqual(event["type"], "done")

        reply.done()
        self.assertTrue(self.queue.empty())

    async def test_bubble_config_merges_colors(self):
        reply = bubble(
            id="b5",
            bubble_bg_color="#111111",
            header_text_color="#222222",
        )
        await self.queue.get()

        reply.config(bubble_text_color="#eeeeee")
        event = await self.queue.get()

        self.assertEqual(event["type"], "config")
        self.assertEqual(event["patch"]["colors"]["bubble"], {"text": "#eeeeee"})

        colors = reply.config_data["colors"]
        self.assertEqual(colors["bubble"]["bg"], "#111111")
        self.assertEqual(colors["bubble"]["text"], "#eeeeee")
        self.assertEqual(colors["header"]["text"], "#222222")

    async def test_access_bubble_returns_existing(self):
        reply = bubble(id="b6")
        await self.queue.get()

        reply.stream("Test")
        await self.queue.get()

        accessed = access_bubble("b6")
        self.assertEqual(accessed.id, "b6")
        self.assertEqual(accessed.chat, "Test")

    async def test_finalize_pending_emits_done(self):
        reply = bubble(id="b7")
        await self.queue.get()

        pending = self.session.finalize_pending()
        event = await self.queue.get()

        self.assertEqual(pending, ["b7"])
        self.assertEqual(event["type"], "done")
        self.assertEqual(event["bubbleId"], "b7")


class RuntimeValidationTests(unittest.TestCase):
    def setUp(self):
        self.session = BubbleSession("validation-session")
        self.token = set_active_context(self.session, stream=None)

    def tearDown(self):
        reset_active_context(self.token)

    def test_load_context_builds_messages(self):
        messages = load(
            [
                {
                    "id": "m1",
                    "role": "assistant",
                    "type": "text",
                    "content": "Hi",
                    "config": {"name": "Bot"},
                    "createdAt": "now",
                }
            ]
        )

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["id"], "m1")
        self.assertEqual(messages[0]["content"], "Hi")
        self.assertEqual(messages[0]["config"]["name"], "Bot")

    def test_warn_if_not_done_emits_warning(self):
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            warn_if_not_done(["a", "b"])

        self.assertEqual(len(captured), 1)
        self.assertTrue(issubclass(captured[0].category, RuntimeWarning))


class RuntimeExtraValidationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.session = BubbleSession("extra-session")
        self.queue = asyncio.Queue()
        self.stream = StreamChannel(self.queue, asyncio.get_running_loop())
        self.token = set_active_context(self.session, stream=self.stream)
        self.session.attach_stream(self.stream)

    async def asyncTearDown(self):
        self.session.detach_stream()
        reset_active_context(self.token)

    async def test_extra_validation_rejects_non_dict(self):
        with self.assertRaises(TypeError):
            bubble(extra=["nope"])  # type: ignore[list-item]

    async def test_extra_validation_rejects_id(self):
        with self.assertRaises(ValueError):
            bubble(extra={"id": "x"})

    async def test_extra_validation_rejects_config(self):
        reply = bubble(id="b8")
        await self.queue.get()

        with self.assertRaises(ValueError):
            reply.config(extra={"config": {}})

    async def test_extra_validation_rejects_colors(self):
        reply = bubble(id="b9")
        await self.queue.get()

        with self.assertRaises(ValueError):
            reply.config(extra={"colors": {}})
