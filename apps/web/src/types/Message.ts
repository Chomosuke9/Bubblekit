export type Role = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "done" | "error";

export interface BubbleColors {
  bubble?: {
    bg?: string;
    text?: string;
    border?: string;
  };
  header?: {
    text?: string;
    bg?: string;
    border?: string;
    iconBg?: string;
    iconText?: string;
  };
}

export interface BubbleConfig {
  name?: string | null;
  icon?: string | null;
  colors?: BubbleColors;
  collapsible?: boolean;
  collapsible_by_default?: boolean;
  collapsible_title?: string | null;
  collapsible_max_height?: number | string | null;
  [key: string]: unknown;
}

export interface Message {
  id: string | number;
  role: Role;
  content: string;
  type?: string;
  config?: BubbleConfig;
  createdAt?: string;
  status?: MessageStatus;
  // nanti bisa ditambah:
  // kind?: "text" | "image" | "file" | "tool";
  // imageUrl?: string;
  // dll...
}
