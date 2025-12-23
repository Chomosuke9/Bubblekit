import type { LucideIcon } from "lucide-react";
import type { Ref } from "react";
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
  containerRef?: Ref<HTMLDivElement>;
}

export interface MessageListProps {
  messages: Message[];
}

export interface SidebarProps {
  onNewChat: () => void;
  onSelectConversation: (conversationId: string) => void;
  conversations: { id: string; title: string; updatedAt: number }[];
  selectedConversationId: string | null;
  userId: string;
  onChangeUserId: (nextUserId: string) => void;
}
