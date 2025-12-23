import { useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { ArrowUpIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import type { MessageInputProps } from "../../types/ui";
const isDesktopLike = () =>
  window.matchMedia("(pointer: fine)").matches &&
  window.matchMedia("(hover: hover)").matches;



function MessageInput({ onSend, disabled, containerRef }: MessageInputProps) {
  const [text, setText] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function doSend() {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    if (isDesktopLike()) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      })
    };
  }

  return (
    <>
      {/* Message Input: Container */}
      <InputGroup
      ref={containerRef}
      className="fixed bottom-10 bg-neutral-100 dark:bg-neutral-900 rounded-2xl max-w-10/12 md:max-w-2/5 self-center overflow-y-auto max-h-40 mx-8"
    >
      {/* Textarea */}
      <InputGroupTextarea
        placeholder="Ask, Search or Chat..."
        ref={textareaRef}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim() && !disabled) {
            e.preventDefault();
            doSend();
          }
        }}
        value={text}
        className="overflow-y-auto "
      />
      {/* Actions */}
      <InputGroupAddon align="block-end">
        {/* Add/attachment button */}
        <InputGroupButton
          variant="outline"
          className="rounded-full"
          size="icon-xs"
        >
          <IconPlus />
        </InputGroupButton>
        {/* Mode selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <InputGroupButton variant="ghost">Auto</InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="[--radius:0.95rem]"
          >
            <DropdownMenuItem>Auto</DropdownMenuItem>
            <DropdownMenuItem>Agent</DropdownMenuItem>
            <DropdownMenuItem>Manual</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Spacer */}
        <InputGroupText className="ml-auto"></InputGroupText>
        {/* Divider */}
        <Separator orientation="vertical" className="h-4!" />
        {/* Send button */}
        <InputGroupButton
          variant="default"
          className="rounded-full"
          size="icon-xs"
          disabled={!text.trim() || disabled}
          onClick={() => {
            doSend();
          }}
        >
          <ArrowUpIcon />
          <span className="sr-only">Send</span>
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    </>
  );
}

export default MessageInput;
