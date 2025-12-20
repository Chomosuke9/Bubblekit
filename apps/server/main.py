from __future__ import annotations

import asyncio

from bubblekit import bubble, create_app, on


def _chunk_text(text: str, size: int = 20):
    for i in range(0, len(text), size):
        yield text[i : i + size]


@on.message
async def on_message(ctx):
    reply = bubble(role="assistant", type="text")
    response = f"Echo: {ctx.message}"
    for chunk in _chunk_text(response):
        reply.stream(chunk)
        await asyncio.sleep(0.03)

    reply.done()


@on.new_chat
def handle_new_chat(conversation_id):
    greeting = bubble(role="assistant", type="text")
    greeting.set("Halo! Ada yang bisa dibantu?")
    greeting.done()


app = create_app()
