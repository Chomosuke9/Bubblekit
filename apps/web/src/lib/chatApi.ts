import type { BubbleConfig, Message } from "@/types/Message";

export type StreamEvent =
  | { type: "meta"; conversationId: string; streamId?: string; seq?: number }
  | { type: "started"; conversationId?: string; streamId: string; seq?: number }
  | { type: "heartbeat"; streamId?: string; seq?: number }
  | { type: "progress"; stage?: string; streamId?: string; seq?: number }
  | { type: "set"; bubbleId?: string; content: string; streamId?: string; seq?: number }
  | { type: "delta"; bubbleId?: string; content: string; streamId?: string; seq?: number }
  | { type: "config"; bubbleId?: string; patch: Record<string, unknown>; streamId?: string; seq?: number }
  | { type: "done"; bubbleId?: string; messageId?: string; reason?: string; streamId?: string; seq?: number }
  | { type: "interrupted"; reason?: string; streamId?: string; seq?: number }
  | { type: "error"; message: string; reason?: string; streamId?: string; seq?: number };

interface FetchHistoryOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  userId?: string;
}

interface StreamChatOptions {
  baseUrl?: string;
  conversationId?: string;
  message?: string;
  signal?: AbortSignal;
  userId?: string;
  onEvent: (event: StreamEvent) => void;
}

interface FetchConversationListOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  userId?: string;
}

interface CancelStreamOptions {
  baseUrl?: string;
  streamId: string;
  userId?: string;
  signal?: AbortSignal;
}

interface ApiMessage {
  id: string | number;
  role: Message["role"];
  content: string;
  type?: string;
  config?: BubbleConfig;
  createdAt?: string;
}

interface ApiHistoryResponse {
  conversationId: string;
  messages: ApiMessage[];
}

interface ApiConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

interface ApiConversationResponse {
  conversations: ApiConversationSummary[];
}

export type ConversationSummary = ApiConversationSummary;

function buildUrl(baseUrl: string | undefined, path: string) {
  const base = (baseUrl ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

function parseStreamLines(
  buffer: string,
  onEvent: (event: StreamEvent) => void,
) {
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    onEvent(JSON.parse(trimmed) as StreamEvent);
  }

  return remainder;
}

export async function fetchMessageHistory(
  conversationId: string,
  options: FetchHistoryOptions = {},
) {
  const url = buildUrl(
    options.baseUrl,
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      ...(options.userId ? { "User-Id": options.userId } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`History request failed: ${response.status}`);
  }

  const data = (await response.json()) as ApiHistoryResponse;
  return {
    conversationId: data.conversationId,
    messages: data.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      type: message.type,
      config: message.config,
      createdAt: message.createdAt,
    })),
  };
}

export async function streamChat({
  baseUrl,
  conversationId,
  message,
  signal,
  userId,
  onEvent,
}: StreamChatOptions) {
  const url = buildUrl(baseUrl, "/api/conversations/stream");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "User-Id": userId } : {}),
    },
    body: JSON.stringify({
      conversationId,
      message,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Stream request failed: ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Stream response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      buffer = parseStreamLines(buffer, onEvent);
    }

    if (done) {
      buffer += decoder.decode();
      break;
    }
  }

  buffer = parseStreamLines(buffer, onEvent);
  const trimmed = buffer.trim();
  if (trimmed) {
    onEvent(JSON.parse(trimmed) as StreamEvent);
  }
}

export async function fetchConversationList(
  options: FetchConversationListOptions = {},
) {
  const url = buildUrl(options.baseUrl, "/api/conversations");
  const response = await fetch(url, {
    signal: options.signal,
    headers: {
      ...(options.userId ? { "User-Id": options.userId } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Conversation list request failed: ${response.status}`);
  }

  const data = (await response.json()) as ApiConversationResponse;
  return data.conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  }));
}

export async function cancelStream(options: CancelStreamOptions) {
  const url = buildUrl(
    options.baseUrl,
    `/api/streams/${encodeURIComponent(options.streamId)}/cancel`,
  );

  const response = await fetch(url, {
    method: "POST",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      ...(options.userId ? { "User-Id": options.userId } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Cancel request failed: ${response.status}`);
  }

  return response.json() as Promise<{ status: string }>;
}
