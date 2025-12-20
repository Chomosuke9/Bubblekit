import type { JSX } from "react";
import type { MessageBubbleProps } from "../../types/ui";

function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
  const isUser = message.role === "user";

  return (
    <div
      className={isUser ? "flex justify-end mb-2" : "flex justify-start mb-2"}
    >
      <div
        className={
          isUser
            ? "px-3 py-2 rounded-lg bg-blue-600 text-sm text-white max-w-4/5 whitespace-pre-wrap wrap-break-word"
            : "px-3 py-2 rounded-lg bg-[#1F1F1F] text-sm text-gray-100 max-w-4/5 whitespace-pre-wrap wrap-break-word"
        }
      >
        {message.content}
      </div>
    </div>
  );
}

export default MessageBubble;
