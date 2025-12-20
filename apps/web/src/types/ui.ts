import type { LucideIcon } from "lucide-react";
import type { Message } from "./Message";

export interface MainBarProps {
  icon: LucideIcon;
  label: string;
  alwaysShow?: boolean;
  onClick: () => void;
}

export interface GenerateMainBarProps {
  isOpened: boolean;
  item: MainBarProps;
}

export interface MessageBubbleProps {
  message: Message;
}

export interface MessageInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export interface MessageListProps {
  messages: Message[];
}

export interface SidebarProps {
  onNewChat: () => void;
}
