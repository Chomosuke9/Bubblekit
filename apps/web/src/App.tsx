import { useEffect, useRef, useState } from "react";
import MessageInput from "./components/chat/MessageInput";
import MessageList from "./components/chat/MessageList";
import type { Message } from "./types/Message";
import Sidebar from "./components/shell/Sidebar";
import { fetchMessageHistory, streamChat } from "@/lib/chatApi";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function App() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [inputHeight, setInputHeight] = useState(0);
  const [edgeSpace, setEdgeSpace] = useState(64);

  const bottomSpace = Math.max(128, inputHeight + edgeSpace);
  const autoScrollThreshold = Math.max(80, bottomSpace);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateEdgeSpace = () => {
      const viewportHeight = window.innerHeight || 0;
      const nextEdgeSpace = Math.max(64, Math.round(viewportHeight / 12) + 16);
      setEdgeSpace(nextEdgeSpace);
    };

    updateEdgeSpace();
    window.addEventListener("resize", updateEdgeSpace);
    return () => window.removeEventListener("resize", updateEdgeSpace);
  }, []);

  useEffect(() => {
    const target = inputRef.current;
    if (!target) return;

    const updateHeight = () => {
      const nextHeight = Math.round(target.getBoundingClientRect().height);
      setInputHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const frame = requestAnimationFrame(() => {
      const target = scrollRef.current;
      if (!target) return;
      target.scrollTo({ top: target.scrollHeight, behavior: "smooth" });
    });

    return () => cancelAnimationFrame(frame);
  }, [isStreaming, messages, bottomSpace]);

  useEffect(() => {
    if (!conversationId || messages.length > 0) return;

    const controller = new AbortController();
    setIsLoadingHistory(true);
    setError(null);

    fetchMessageHistory(conversationId, {
      baseUrl: API_BASE,
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          shouldAutoScrollRef.current = true;
          setMessages(data.messages);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Gagal memuat riwayat pesan.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [conversationId, messages.length]);

  async function handleSend(text: string) {
    if (isStreaming) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setError(null);
    shouldAutoScrollRef.current = true;

    const idBase = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const assistantId = `local-${idBase}-assistant`;
    const userMessage: Message = {
      id: `local-${idBase}-user`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    streamAbortRef.current?.abort();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setIsStreaming(true);

    try {
      await streamChat({
        baseUrl: API_BASE,
        conversationId: conversationId ?? undefined,
        message: trimmed,
        signal: controller.signal,
        onEvent: (event) => {
          const eventId =
            "bubbleId" in event && event.bubbleId
              ? event.bubbleId
              : "messageId" in event && event.messageId
                ? event.messageId
                : undefined;

          const updateAssistant = (
            updater: (message: Message) => Message,
          ) => {
            setMessages((prev) => {
              const hasEventId = eventId
                ? prev.some((msg) => msg.id === eventId)
                : false;
              const targetId = hasEventId ? eventId : assistantId;

              return prev.map((msg) => {
                if (msg.id !== targetId) return msg;
                const updated = updater(msg);
                if (eventId && msg.id !== eventId) {
                  return { ...updated, id: eventId };
                }
                return updated;
              });
            });
          };

          if (event.type === "meta" && event.conversationId) {
            setConversationId(event.conversationId);
            return;
          }

          if (event.type === "set") {
            updateAssistant((msg) => ({ ...msg, content: event.content }));
            return;
          }

          if (event.type === "delta") {
            updateAssistant((msg) => ({
              ...msg,
              content: msg.content + event.content,
            }));
            return;
          }

          if (event.type === "config") {
            updateAssistant((msg) => {
              const patch = event.patch ?? {};
              const role =
                typeof patch.role === "string"
                  ? (patch.role as Message["role"])
                  : msg.role;
              const bubbleType =
                typeof patch.type === "string" ? patch.type : msg.type;
              const { role: _role, type: _type, ...rest } =
                patch as Record<string, unknown>;

              return {
                ...msg,
                role,
                type: bubbleType,
                config: { ...(msg.config ?? {}), ...rest },
              };
            });
            return;
          }

          if (event.type === "done") {
            updateAssistant((msg) => ({
              ...msg,
              status: "done",
            }));
            return;
          }

          if (event.type === "error") {
            setError(event.message);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId ? { ...msg, status: "error" } : msg,
              ),
            );
            controller.abort();
          }
        },
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError("Streaming gagal. Coba lagi.");
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? { ...msg, status: "error" } : msg,
          ),
        );
      }
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
        setIsStreaming(false);
      }
    }
  }

  return (
    <div className="h-screen w-screen flex ">
      {/* Sidebar */}
      <Sidebar
        onNewChat={() => {
          streamAbortRef.current?.abort();
          streamAbortRef.current = null;
          setIsStreaming(false);
          setError(null);
          setConversationId(null);
          setMessages([]);
        }}
      />
      {/* Main */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const target = scrollRef.current;
          if (!target) return;
          const distance =
            target.scrollHeight - target.scrollTop - target.clientHeight;
          shouldAutoScrollRef.current = distance < autoScrollThreshold;
        }}
        className="flex-1 min-w-0 overflow-y-scroll transition-width duration-300 ease-in-out"
      >
        {/* Blur */}
        <div className="fixed z-0 bottom-0 from-white to-100% bg-linear-0 w-full h-1/12"></div>
        <div className="fixed z-0 top-0 from-white to-100% bg-linear-180 w-full h-1/12"></div>
        {/* Chat */}
        <div
          className="mx-auto flex flex-col px-8 max-w-5xl"
          style={{ paddingTop: edgeSpace, paddingBottom: bottomSpace }}
        >
          {isLoadingHistory && (
            <div className="text-sm text-gray-500">Memuat riwayat...</div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
          {/* Bubble */}
          <MessageList messages={messages} />
          {/* Input */}
          <MessageInput
            onSend={handleSend}
            disabled={isStreaming}
            containerRef={inputRef}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
