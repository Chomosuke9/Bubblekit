from __future__ import annotations

import asyncio

from bubblekit import bubble, create_app, on
from langchain.agents import create_agent
from langchain_ollama import ChatOllama


def _chunk_text(text: str, size: int = 1):
    for i in range(0, len(text), size):
        yield text[i : i + size]


count: int = 0


llm = ChatOllama(
    model="qwen3-coder:480b-cloud",
)
agent = create_agent(llm)


def iter_text_from_content_blocks(content_blocks):
    """
    content_blocks bisa berupa:
    - list[dict] seperti [{'type':'text','text':'Hello'}]
    - list kosong []
    """
    if not content_blocks:
        return
    for b in content_blocks:
        if isinstance(b, dict) and b.get("type") == "text":
            t = b.get("text")
            if t:
                yield t


def stream_text_tokens_only(agent, inputs):
    for msg, meta in agent.stream(inputs, stream_mode="messages"):
        # opsional: hanya token dari model utama
        if meta.get("langgraph_node") != "model":
            continue

        blocks = getattr(msg, "content_blocks", None)

        # kasus seperti contoh Anda: [{'type':'text','text':'Hello'}], lalu berikutnya [{'type':'text','text':'! I'}], dst
        if isinstance(blocks, list):
            for t in iter_text_from_content_blocks(blocks):
                yield t
            continue

        # fallback kalau implementasi chunk pakai .content string
        content = getattr(msg, "content", None)
        if isinstance(content, str) and content:
            yield content


@on.message
async def on_message(ctx):
    reply = bubble(
        role="assistant",
        type="text",
    )
    input = {"messages": [{"role": "user", "content": ctx.message}]}

    # yang ini bisa stream karena ada asyncio.sleep
    # for t in stream_text_tokens_only(agent, input):
    #    reply.stream(t)
    #    await asyncio.sleep(0.001)

    # yang ini entah mengapa tidak bisa stream dan hanya bisa mengirim hasil stream yang sudah selesai
    # for t in stream_text_tokens_only(agent, input)
    #    reply.stream(t)

    reply.done()


@on.new_chat
def handle_new_chat(conversation_id):
    print("new_chat triggered")
    greeting = bubble(role="assistant", type="text")
    greeting.set("Halo! Ada yang bisa dibantu?")
    greeting.done()


app = create_app()
