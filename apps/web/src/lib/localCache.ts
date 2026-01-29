import type { Message } from "@/types/Message";
import type { ConversationSummary } from "@/lib/chatApi";

const CONVERSATION_KEY = "bubblekit-conversations";
const HISTORY_PREFIX = "bubblekit-history-";

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function canUseStorage() {
  return typeof window !== "undefined" && "localStorage" in window;
}

export function saveConversations(list: ConversationSummary[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CONVERSATION_KEY, JSON.stringify(list));
}

export function loadConversations() {
  if (!canUseStorage()) return [] as ConversationSummary[];
  return safeParse<ConversationSummary[]>(
    window.localStorage.getItem(CONVERSATION_KEY),
    [],
  );
}

export function saveHistory(conversationId: string, messages: Message[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(
    `${HISTORY_PREFIX}${conversationId}`,
    JSON.stringify(messages),
  );
}

export function loadHistory(conversationId: string) {
  if (!canUseStorage()) return [] as Message[];
  return safeParse<Message[]>(
    window.localStorage.getItem(`${HISTORY_PREFIX}${conversationId}`),
    [],
  );
}
