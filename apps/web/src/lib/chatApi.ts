import type { BubbleConfig, Message } from "@/types/Message";

export type StreamEvent =
  | { type: "meta"; conversationId: string }
  | { type: "set"; bubbleId?: string; content: string }
  | { type: "delta"; bubbleId?: string; content: string }
  | { type: "config"; bubbleId?: string; patch: Record<string, unknown> }
  | { type: "done"; bubbleId?: string; messageId?: string }
  | { type: "error"; message: string };

interface FetchHistoryOptions {
  baseUrl?: string;
  signal?: AbortSignal;
}

interface StreamChatOptions {
  baseUrl?: string;
  conversationId?: string;
  message?: string;
  signal?: AbortSignal;
  onEvent: (event: StreamEvent) => void;
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
  const response = await fetch(url, { signal: options.signal });

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
  onEvent,
}: StreamChatOptions) {
  const url = buildUrl(baseUrl, "/api/conversations/stream");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = parseStreamLines(buffer, onEvent);
  }

  const trimmed = buffer.trim();
  if (trimmed) {
    onEvent(JSON.parse(trimmed) as StreamEvent);
  }
}
