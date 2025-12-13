import { useState } from "react";
import MessageInput from "./components/ui/MessageInput";
import MessageList from "./components/ui/MessageList";
import type { Message } from "./types/Message";

function App() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 1,
            text: "Halo! Ada yang bisa saya bantu hari ini?",
            sender: "bot",
        },
    ]);

    function handleSend(text: string) {
        setMessages((prev) => [
            ...prev,
            {
                id: Date.now(),
                text,
                sender: "user",
            },
        ]);
    }

    return (
        <div className="min-h-screen p-4">
            <div className="mx-auto flex flex-col p-4">
                <div className="flex-1 overflow-y-auto mb-4">
                    <MessageList messages={messages} />
                </div>

                <MessageInput onSend={handleSend} />
            </div>
        </div>
    );
}

export default App;
