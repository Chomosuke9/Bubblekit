// src/MessageList.tsx
import { type JSX } from "react";
import type { MessageListProps } from "../../types/ui";
import MessageBubble from "./MessageBubble";

function MessageList({ messages }: MessageListProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {/* Message list container */}
      {/* Messages */}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}

export default MessageList;
