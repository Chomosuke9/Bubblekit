from __future__ import annotations

import asyncio

from bubblekit import bubble, create_app, on, set_conversation_list, load
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

data = [
    {"id": "1", "role": "user", "type": "text", "content": "Hello"},
    {"id": "2", "role": "assistant", "type": "text", "content": "Hi"},
]


@on.message
async def on_message(ctx):
    # Tambahkan pesan user ke memory
    memory.append({"role": "user", "content": ctx.message})

    reply = bubble(
        role="assistant",
        type="text",
        bubble_bg_color="#00000000",
        bubble_border_color="#00000000",

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
def handle_new_chat(conversation_id, user_id):
    print("new_chat triggered")
    print("conversation_id : ", conversation_id, "\nuser id : ", user_id)
    greeting = bubble(role="assistant", type="text")
    greeting.set("Halo! Ada yang bisa dibantu?")
    greeting.done()
    set_conversation_list(
        user_id,
        [
            {"id": "c1", "title": "Welcome", "updatedAt": 1719541358000},
            {"id": "c2", "title": "Support", "updatedAt": 1719542358000},
        ],
    )
    global memory
    memory=[]

@on.history
def handle_history_click(conversation_id, user_id):
    print("conversation_id : ", conversation_id, "\nuser_id : ", user_id)
    message = load(data)
    return message



app = create_app()
