import type { JSX } from "react";
import type { Message } from "../../types/Message";

interface MessageBubbleProps {
    message: Message;
}

function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
    const isUser = message.sender === "user";

    return (
        <div
            className={
                isUser ? "flex justify-end mb-2" : "flex justify-start mb-2"
            }
        >
            <div
                className={
                    isUser
                        ? "px-3 py-2 rounded-lg bg-blue-600 text-sm max-w-xs text-white"
                        : "px-3 py-2 rounded-lg bg-[#1F1F1F] text-sm max-w-xs text-gray-100"
                }
            >
                {message.text}
            </div>
        </div>
    );
}

export default MessageBubble;
