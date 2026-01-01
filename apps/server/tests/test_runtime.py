import asyncio
import os
import sys
import unittest
import warnings

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from bubblekit import access_bubble, bubble, clear_conversation, create_history, json_bubble_to_openai
from bubblekit.runtime import (
    Bubble,
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
        ).send()
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

    async def test_collapsible_default_is_true_and_configurable(self):
        reply = bubble(id="b1-collapse", collapsible=True).send()
        event = await self.queue.get()
        patch = event["patch"]
        self.assertTrue(patch["collapsible"])
        self.assertTrue(patch["collapsible_by_default"])
        self.assertTrue(reply.config_data["collapsible_by_default"])

        reply.config(collapsible_by_default=False)
        update = await self.queue.get()
        self.assertFalse(update["patch"]["collapsible_by_default"])
        self.assertFalse(reply.config_data["collapsible_by_default"])

    async def test_bubble_stream_updates_state_and_emits_delta(self):
        reply = bubble(id="b2").send()
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
        reply = bubble(id="b3").send()
        await self.queue.get()

        reply.set("Hello")
        event = await self.queue.get()

        self.assertEqual(event["type"], "set")
        self.assertEqual(event["content"], "Hello")
        self.assertEqual(reply.chat, "Hello")

    async def test_bubble_done_emits_once(self):
        reply = bubble(id="b4").send()
        await self.queue.get()

        reply.done()
        event = await self.queue.get()
        self.assertEqual(event["type"], "done")

        reply.done()
        self.assertTrue(self.queue.empty())

    async def test_send_emits_prefilled_content(self):
        draft = bubble(id="b4-prefill")
        draft.set("Prefilled")

        reply = draft.send()
        event1 = await self.queue.get()
        event2 = await self.queue.get()

        self.assertEqual(event1["type"], "config")
        self.assertEqual(event2["type"], "set")
        self.assertEqual(event2["content"], "Prefilled")

    async def test_bubble_config_merges_colors(self):
        reply = bubble(
            id="b5",
            bubble_bg_color="#111111",
            header_text_color="#222222",
        ).send()
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
        reply = bubble(id="b6").send()
        await self.queue.get()

        reply.stream("Test")
        await self.queue.get()

        accessed = access_bubble("b6")
        self.assertEqual(accessed.id, "b6")
        self.assertEqual(accessed.chat, "Test")

    async def test_finalize_pending_emits_done(self):
        reply = bubble(id="b7").send()
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

    def test_create_history_normalizes_conversation(self):
        history = create_history(id="c1", title="Hello", updatedAt=123)

        self.assertEqual(history["id"], "c1")
        self.assertEqual(history["title"], "Hello")
        self.assertEqual(history["updatedAt"], 123)

    def test_clear_conversation_clears_active_session(self):
        bubble(role="assistant", type="text").set("Hi").send()
        self.assertEqual(len(self.session.export_messages()), 1)

        clear_conversation()
        self.assertEqual(len(self.session.export_messages()), 0)

    def test_send_allowed_without_stream(self):
        draft = bubble(role="assistant", type="text")
        draft.set("prefill")

        sent = draft.send()

        self.assertEqual(sent.chat, "prefill")

        # Should not raise when updating without stream
        sent.stream(" more")
        sent.done()

        self.assertEqual(sent.chat, "prefill more")

    def test_bubble_to_openai_returns_role_and_content(self):
        reply = bubble(role="user")
        reply.set("Hello")

        self.assertEqual(
            reply.to_openai(),
            {"role": "user", "content": "Hello"},
        )

    def test_bubble_json_roundtrip(self):
        draft = bubble(id="jb1", role="assistant", type="text", name="Support")
        draft.set("Saved")
        payload = draft.to_json_bubble()

        restored = Bubble.from_json_bubble(payload)
        self.assertEqual(restored.to_json_bubble(), payload)

    def test_bubble_from_json_defaults(self):
        restored = Bubble.from_json_bubble({})
        payload = restored.to_json_bubble()

        self.assertEqual(
            list(payload.keys()),
            ["id", "role", "content", "type", "config", "createdAt"],
        )
        self.assertTrue(isinstance(payload["id"], str))
        self.assertEqual(len(payload["id"]), 32)
        self.assertEqual(payload["role"], "assistant")
        self.assertEqual(payload["type"], "text")
        self.assertEqual(payload["content"], "")
        self.assertEqual(payload["config"], {})
        self.assertIsNone(payload["createdAt"])

    def test_json_bubble_to_openai_defaults(self):
        self.assertEqual(json_bubble_to_openai({}), {"role": "assistant", "content": ""})
        self.assertEqual(
            json_bubble_to_openai({"role": "user"}),
            {"role": "user", "content": ""},
        )
        self.assertEqual(
            json_bubble_to_openai({"content": "Hi"}),
            {"role": "assistant", "content": "Hi"},
        )

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

        with self.assertRaises(ValueError):
            reply.config(extra={"config": {}})

    async def test_extra_validation_rejects_colors(self):
        reply = bubble(id="b9")

        with self.assertRaises(ValueError):
            reply.config(extra={"colors": {}})
