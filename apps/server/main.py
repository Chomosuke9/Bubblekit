from __future__ import annotations

import asyncio

from bubblekit import bubble, create_app, on


def _chunk_text(text: str, size: int = 1):
    for i in range(0, len(text), size):
        yield text[i : i + size]


count: int = 0


def _cycle_name() -> str:
    global count
    count = count + 1
    str_count: str = str(count)
    return str_count


@on.message
async def on_message(ctx):
    reply = bubble(
        role="assistant",
        type="text",
    )
    response = f"Echo: {ctx.message}"
    for chunk in _chunk_text(response):
        reply.stream(chunk)
        await asyncio.sleep(0.001)
        reply.config(name=_cycle_name())

    reply.done()


@on.new_chat
def handle_new_chat(conversation_id):
    print("new_chat triggered")
    greeting = bubble(role="assistant", type="text")
    greeting.set("Halo! Ada yang bisa dibantu?")
    greeting.done()


app = create_app()
