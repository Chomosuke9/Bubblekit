// src/MessageList.tsx
import { type JSX } from "react";
import type { Message } from "../../types/Message";
import MessageBubble from "./MessageBubble";

interface MessageListProps {
    messages: Message[];
}

function MessageList({ messages }: MessageListProps): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
            ))}
        </div>
    );
}

export default MessageList;
