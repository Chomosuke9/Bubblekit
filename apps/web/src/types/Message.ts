export type Role = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "done" | "error";

export interface Message {
  id: string | number;
  role: Role;
  content: string;
  type?: string;
  config?: Record<string, unknown>;
  createdAt?: string;
  status?: MessageStatus;
  // nanti bisa ditambah:
  // kind?: "text" | "image" | "file" | "tool";
  // imageUrl?: string;
  // dll...
}
