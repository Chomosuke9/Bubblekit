import { useState } from "react";
import MessageInput from "./components/ui/MessageInput";
import MessageList from "./components/ui/MessageList";
import type { Message } from "./types/Message";
import Sidebar from "./components/ui/Sidebar";

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
    <div className="h-screen w-screen flex ">
      {/* Sidebar */}
      <Sidebar
        onNewChat={() => {
          setMessages([]);
        }}
      />
      {/* Main */}
      <div className="flex-1 min-w-0 overflow-y-scroll transition-width duration-300 ease-in-out">
        {/* Blur */}
        <div className="fixed z-0 bottom-0 from-white to-100% bg-linear-0 w-full h-1/12"></div>
        <div className="fixed z-0 top-0 from-white to-100% bg-linear-180 w-full h-1/12"></div>
        {/* Chat */}
        <div className="mx-auto flex flex-col p-8 max-w-5xl ">
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
