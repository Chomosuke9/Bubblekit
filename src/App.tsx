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
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text,
          sender: "bot",
        },
      ]);
    }, 500);
  }

  return (
    <div className="h-screen w-screen flex">
      {/* Sidebar */}
      <div className="left-0 bg-amber-200 w-2xs h-full hidden">sidebar</div>
      {/* Main */}
      <div className=" flex-1 overflow-y-scroll">
        {/* Blur */}
        <div className="fixed bottom-0 from-white to-100% bg-linear-0 w-full h-16"></div>
        {/* Chat */}
        <div className="mx-auto flex flex-col p-8 ">
          {/* Bubble */}
          <MessageList messages={messages} />
          {/* Input */}
          <MessageInput onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}

export default App;
