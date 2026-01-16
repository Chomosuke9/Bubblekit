import { useCallback, useEffect, useRef, useState } from "react";
import MessageInput from "./components/chat/MessageInput";
import MessageList from "./components/chat/MessageList";
import type { Message } from "./types/Message";
import Sidebar from "./components/shell/Sidebar";
import {
  fetchConversationList,
  fetchMessageHistory,
  cancelStream,
  streamChat,
  type ConversationSummary,
  type StreamEvent,
} from "@/lib/chatApi";
import { isDesktopLike } from "@/lib/device";
import { Moon, Sun } from "lucide-react";
import { getUserId, resolveUserId, setUserId } from "@/lib/userId";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const FIRST_EVENT_TIMEOUT_MS = 30_000;
const IDLE_TIMEOUT_MS = 60_000;

function mergeConfigPatch(
  current: Message["config"] | undefined,
  patch: Record<string, unknown>,
) {
  const next: Record<string, unknown> = { ...(current ?? {}) };

  if ("colors" in patch) {
    const incomingColors = patch.colors;
    if (incomingColors && typeof incomingColors === "object") {
      const currentColors =
        next.colors && typeof next.colors === "object"
          ? (next.colors as Record<string, unknown>)
          : {};
      const incoming = incomingColors as Record<string, unknown>;
      const mergedColors: Record<string, unknown> = { ...currentColors };

      if ("bubble" in incoming) {
        const incomingBubble = incoming.bubble;
        if (incomingBubble && typeof incomingBubble === "object") {
          const currentBubble =
            currentColors.bubble && typeof currentColors.bubble === "object"
              ? (currentColors.bubble as Record<string, unknown>)
              : {};
          mergedColors.bubble = {
            ...currentBubble,
            ...(incomingBubble as Record<string, unknown>),
          };
        } else {
          mergedColors.bubble = incomingBubble;
        }
      }

      if ("header" in incoming) {
        const incomingHeader = incoming.header;
        if (incomingHeader && typeof incomingHeader === "object") {
          const currentHeader =
            currentColors.header && typeof currentColors.header === "object"
              ? (currentColors.header as Record<string, unknown>)
              : {};
          mergedColors.header = {
            ...currentHeader,
            ...(incomingHeader as Record<string, unknown>),
          };
        } else {
          mergedColors.header = incomingHeader;
        }
      }

      for (const [key, value] of Object.entries(incoming)) {
        if (key === "bubble" || key === "header") continue;
        mergedColors[key] = value;
      }

      next.colors = mergedColors;
    } else {
      next.colors = incomingColors;
    }
  }

  for (const [key, value] of Object.entries(patch)) {
    if (key === "colors") continue;
    next[key] = value;
  }

  return next as Message["config"];
}

function App() {
  const [userId, setUserIdState] = useState<string>(() => getUserId());
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInterrupting, setIsInterrupting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const conversationListAbortRef = useRef<AbortController | null>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const idleTimeoutRef = useRef<number | null>(null);
  const firstEventTimeoutRef = useRef<number | null>(null);
  const skipHistoryRef = useRef(false);
  const didInitChatRef = useRef(false);
  const didSkipAbortRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [inputHeight, setInputHeight] = useState(0);
  const [edgeSpace, setEdgeSpace] = useState(64);

  const clearIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current != null) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const clearFirstEventTimer = useCallback(() => {
    if (firstEventTimeoutRef.current != null) {
      window.clearTimeout(firstEventTimeoutRef.current);
      firstEventTimeoutRef.current = null;
    }
  }, []);

  const finishStream = useCallback(() => {
    clearIdleTimer();
    clearFirstEventTimer();
    activeStreamIdRef.current = null;
    setIsStreaming(false);
    setIsInterrupting(false);
  }, [clearFirstEventTimer, clearIdleTimer]);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimer();
    idleTimeoutRef.current = window.setTimeout(() => {
      setError("Streaming dihentikan karena idle.");
      finishStream();
      streamAbortRef.current?.abort();
    }, IDLE_TIMEOUT_MS);
  }, [clearIdleTimer, finishStream]);

  const startFirstEventTimer = useCallback(() => {
    clearFirstEventTimer();
    firstEventTimeoutRef.current = window.setTimeout(() => {
      setError("Streaming timeout: tidak ada respons awal.");
      finishStream();
      streamAbortRef.current?.abort();
    }, FIRST_EVENT_TIMEOUT_MS);
  }, [clearFirstEventTimer, finishStream]);

  const markStreamActivity = useCallback(() => {
    clearFirstEventTimer();
    resetIdleTimer();
  }, [clearFirstEventTimer, resetIdleTimer]);

  const bottomSpace = Math.max(128, inputHeight + edgeSpace);
  const autoScrollThreshold = Math.max(80, bottomSpace);

  useEffect(() => {
    return () => {
      if (import.meta.env.DEV && !didSkipAbortRef.current) {
        didSkipAbortRef.current = true;
        return;
      }
      clearIdleTimer();
      clearFirstEventTimer();
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      conversationListAbortRef.current?.abort();
      conversationListAbortRef.current = null;
    };
  }, [clearFirstEventTimer, clearIdleTimer]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const stored = window.localStorage.getItem("bubblekit-theme");
    const shouldUseDark =
      stored === "dark"
        ? true
        : stored === "light"
          ? false
          : root.classList.contains("dark");

    root.classList.toggle("dark", shouldUseDark);
    setIsDarkMode(shouldUseDark);
  }, []);

  function toggleDarkMode() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.add("theme-transition");
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    window.localStorage.setItem("bubblekit-theme", next ? "dark" : "light");
    setIsDarkMode(next);
    window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 200);
  }

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
    const target = inputContainerRef.current;
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

  const focusMessageInput = useCallback(() => {
    if (!isDesktopLike()) return;

    const textarea = inputContainerRef.current?.querySelector("textarea");
    if (!textarea) return;

    requestAnimationFrame(() => {
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange?.(length, length);
    });
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
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }

    const controller = new AbortController();
    setIsLoadingHistory(true);
    setError(null);

    fetchMessageHistory(conversationId, {
      baseUrl: API_BASE,
      userId: resolveUserId(userId),
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
  }, [conversationId, messages.length, userId]);

  const cancelActiveStream = useCallback(
    async () => {
      const streamId = activeStreamIdRef.current;
      if (streamId) {
        try {
          await cancelStream({
            baseUrl: API_BASE,
            streamId,
            userId: resolveUserId(userId),
          });
        } catch {
          // best-effort cancel; ignore errors
        }
      }
      streamAbortRef.current?.abort();
    },
    [userId],
  );

  const getEventId = useCallback((event: StreamEvent) => {
    if ("bubbleId" in event && event.bubbleId) {
      return event.bubbleId;
    }
    if ("messageId" in event && event.messageId) {
      return event.messageId;
    }
    return undefined;
  }, []);

  const updateMessageFromEvent = useCallback(
    (
      event: StreamEvent,
      eventId: string | undefined,
      fallbackId?: string,
    ) => {
      if (
        event.type !== "set" &&
        event.type !== "delta" &&
        event.type !== "config" &&
        event.type !== "done"
      ) {
        return;
      }

      setMessages((prev) => {
        let next = prev;
        let targetIndex = -1;

        if (eventId) {
          targetIndex = prev.findIndex((msg) => msg.id === eventId);
        }

        if (targetIndex === -1 && fallbackId) {
          const fallbackIndex = prev.findIndex((msg) => msg.id === fallbackId);
          if (fallbackIndex !== -1) {
            next = [...prev];
            targetIndex = fallbackIndex;
            if (eventId && next[targetIndex].id !== eventId) {
              next[targetIndex] = { ...next[targetIndex], id: eventId };
            }
          }
        }

        if (targetIndex === -1) {
          if (!eventId) return prev;
          next = [
            ...prev,
            { id: eventId, role: "assistant", content: "", status: "streaming" },
          ];
          targetIndex = next.length - 1;
        } else if (next === prev) {
          next = [...prev];
        }

        const msg = next[targetIndex];

        switch (event.type) {
          case "set":
            next[targetIndex] = { ...msg, content: event.content };
            break;
          case "delta":
            next[targetIndex] = {
              ...msg,
              content: msg.content + event.content,
            };
            break;
          case "config": {
            const patch = event.patch ?? {};
            const role =
              typeof patch.role === "string"
                ? (patch.role as Message["role"])
                : msg.role;
            const bubbleType =
              typeof patch.type === "string" ? patch.type : msg.type;
            const { role: _role, type: _type, ...rest } =
              patch as Record<string, unknown>;

            next[targetIndex] = {
              ...msg,
              role,
              type: bubbleType,
              config: mergeConfigPatch(msg.config, rest),
            };
            break;
          }
          case "done":
            next[targetIndex] = { ...msg, status: "done" };
            break;
          default:
            break;
        }

        return next;
      });
    },
    [],
  );

  const handleStreamEvent = useCallback(
    (
      event: StreamEvent,
      fallbackId: string | undefined,
      controller: AbortController,
    ) => {
      if ("streamId" in event && event.streamId && !activeStreamIdRef.current) {
        activeStreamIdRef.current = event.streamId;
      }
      if (
        event.type === "heartbeat" ||
        event.type === "progress" ||
        event.type === "started"
      ) {
        markStreamActivity();
        return;
      }

      const eventId = getEventId(event);

      if (event.type === "meta" && event.conversationId) {
        setConversationId(event.conversationId);
        markStreamActivity();
        return;
      }

      if (event.type === "interrupted") {
        markStreamActivity();
        finishStream();
        return;
      }

      if (event.type === "error") {
        markStreamActivity();
        setError(event.message);
        finishStream();
        setMessages((prev) => {
          const targetId = eventId ?? fallbackId;
          if (!targetId) return prev;
          return prev.map((msg) =>
            msg.id === targetId ? { ...msg, status: "error" } : msg,
          );
        });
        controller.abort();
        return;
      }

      if (event.type === "done" && !event.bubbleId) {
        markStreamActivity();
        finishStream();
        return;
      }

      markStreamActivity();

      updateMessageFromEvent(event, eventId, fallbackId);
    },
    [finishStream, getEventId, markStreamActivity, updateMessageFromEvent],
  );

  const refreshConversationList = useCallback(
    async (overrideUserId?: string) => {
      conversationListAbortRef.current?.abort();
      const controller = new AbortController();
      conversationListAbortRef.current = controller;
      const activeUserId = resolveUserId(overrideUserId ?? userId);

      try {
        const list = await fetchConversationList({
          baseUrl: API_BASE,
          signal: controller.signal,
          userId: activeUserId,
        });
        if (!controller.signal.aborted) {
          setConversations(list);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        if (conversationListAbortRef.current === controller) {
          conversationListAbortRef.current = null;
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    void refreshConversationList();
    return () => {
      conversationListAbortRef.current?.abort();
      conversationListAbortRef.current = null;
    };
  }, [refreshConversationList]);

  const handleChangeUserId = useCallback(
    (nextUserId: string) => {
      const normalized = setUserId(nextUserId);
      setUserIdState(normalized);
      void cancelActiveStream();
      finishStream();
      setIsLoadingHistory(false);
      setConversationId(null);
      setMessages([]);
      setConversations([]);
      setError(null);
      shouldAutoScrollRef.current = true;
      skipHistoryRef.current = false;
      void refreshConversationList(normalized);
    },
    [cancelActiveStream, finishStream, refreshConversationList],
  );

  const handleSelectConversation = useCallback((nextConversationId: string) => {
    void cancelActiveStream();
    finishStream();
    setIsLoadingHistory(false);
    setConversationId(nextConversationId);
    setMessages([]);
    setError(null);
    shouldAutoScrollRef.current = true;
    skipHistoryRef.current = false;
  }, [cancelActiveStream, finishStream]);

  const startNewChat = useCallback(
    async (options?: { focusInput?: boolean }) => {
      const shouldFocusInput = options?.focusInput === true;

      await cancelActiveStream();
      finishStream();
      setIsLoadingHistory(false);
      setError(null);
      setConversationId(null);
      setMessages([]);
      shouldAutoScrollRef.current = true;
      skipHistoryRef.current = true;

      if (shouldFocusInput) {
        focusMessageInput();
      }

      const controller = new AbortController();
      streamAbortRef.current = controller;
      setIsStreaming(true);
      setIsInterrupting(false);
      activeStreamIdRef.current = null;
      startFirstEventTimer();
      resetIdleTimer();

      try {
        await streamChat({
          baseUrl: API_BASE,
          userId: resolveUserId(userId),
          signal: controller.signal,
          onEvent: (event) => {
            handleStreamEvent(event, undefined, controller);
          },
        });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError("Streaming gagal. Coba lagi.");
        }
      } finally {
        if (streamAbortRef.current === controller) {
          streamAbortRef.current = null;
          finishStream();
        }
        void refreshConversationList();
      }
    },
    [
      cancelActiveStream,
      focusMessageInput,
      handleStreamEvent,
      refreshConversationList,
      resetIdleTimer,
      startFirstEventTimer,
      userId,
      finishStream,
    ],
  );

  useEffect(() => {
    if (didInitChatRef.current) return;
    if (conversationId || messages.length > 0 || isStreaming) return;
    didInitChatRef.current = true;
    void startNewChat();
  }, [conversationId, isStreaming, messages.length, startNewChat]);

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

    await cancelActiveStream();
    const controller = new AbortController();
    streamAbortRef.current = controller;
    setIsStreaming(true);
    setIsInterrupting(false);
    activeStreamIdRef.current = null;
    startFirstEventTimer();
    resetIdleTimer();

    try {
      await streamChat({
        baseUrl: API_BASE,
        conversationId: conversationId ?? undefined,
        message: trimmed,
        signal: controller.signal,
        userId: resolveUserId(userId),
        onEvent: (event) => {
          handleStreamEvent(event, assistantId, controller);
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
        finishStream();
      }
      void refreshConversationList();
    }
  }

  const handleInterrupt = useCallback(() => {
    if (!isStreaming || isInterrupting) return;
    setIsInterrupting(true);
    void cancelActiveStream();
  }, [cancelActiveStream, isInterrupting, isStreaming]);

  return (
    <div className="h-dvh w-full flex overflow-hidden select-none">
      {/* Toggle Theme */}
      <button
        type="button"
        onClick={toggleDarkMode}
        className="fixed right-4 top-4 z-50 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
      >
        {isDarkMode ? <Moon/> : <Sun/> }
      </button>
      {/* Sidebar */}
      <Sidebar
        onNewChat={() => startNewChat({ focusInput: true })}
        conversations={conversations}
        onSelectConversation={handleSelectConversation}
        selectedConversationId={conversationId}
        userId={userId}
        onChangeUserId={handleChangeUserId}
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
        <div className="fixed z-0 bottom-0 from-neutral-50 dark:from-neutral-950 to-100% bg-linear-0 w-full h-1/12"></div>
        <div className="fixed z-0 top-0 from-neutral-50 dark:from-neutral-950 to-100% bg-linear-180 w-full h-1/12"></div>
        {/* Chat */}
        <div
          className="mx-auto flex flex-col px-8 max-w-5xl select-text"
          style={{ paddingTop: edgeSpace, paddingBottom: bottomSpace }}
        >
          {isLoadingHistory && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Loading history...
            </div>
          )}
          {error && (
            <div className="text-sm text-neutral-600 dark:text-neutral-300">
              {error}
            </div>
          )}
          {/* Bubble */}
          <MessageList messages={messages} />
          {/* Input */}
          <MessageInput
            onSend={handleSend}
            onInterrupt={handleInterrupt}
            disabled={isStreaming}
            isStreaming={isStreaming}
            isInterrupting={isInterrupting}
            containerRef={inputContainerRef}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
