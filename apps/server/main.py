from __future__ import annotations

import asyncio

from bubblekit import bubble, create_app, on
from langchain.agents import AgentState, create_agent
from langchain_ollama import ChatOllama


def _chunk_text(text: str, size: int = 1):
    for i in range(0, len(text), size):
        yield text[i : i + size]


count: int = 0

# Memory untuk menyimpan riwayat percakapan
memory = []


llm = ChatOllama(
    model="qwen3-coder:480b-cloud",
)
agent = create_agent(llm)




@on.message
async def on_message(ctx):
    # Tambahkan pesan user ke memory
    memory.append({"role": "user", "content": ctx.message})

    reply = bubble(
        role="assistant",
        type="text",
    )

    final :str= ""
    async for chunk, meta in agent.astream(
        {"messages": memory},  # Gunakan memory sebagai riwayat percakapan
        stream_mode="messages",
    ):
        text = getattr(chunk, "content", None)

        if text:
            final += text
            reply.stream(text)




    reply.done()

    # Tambahkan respons assistant ke memory
    memory.append({"role": "assistant", "content": final})


@on.new_chat
def handle_new_chat(conversation_id):
    print("new_chat triggered")
    greeting = bubble(role="assistant", type="text")
    greeting.set("Halo! Ada yang bisa dibantu?")
    greeting.done()
    global memory
    memory=[]


app = create_app()
