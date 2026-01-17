import { useRef, useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { ArrowUpIcon, Loader2, Square } from "lucide-react";
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
import { isDesktopLike } from "@/lib/device";
import type { MessageInputProps } from "../../types/ui";

function MessageInput({
  onSend,
  onInterrupt,
  disabled,
  isStreaming,
  isInterrupting,
  containerRef,
}: MessageInputProps) {
  const [text, setText] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasText = text.trim().length > 0;
  const canSend = hasText && !disabled;
  const canStop = isStreaming && Boolean(onInterrupt) && !isInterrupting;
  const actionDisabled = isStreaming ? !canStop : !canSend;

  function doSend() {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    if (isDesktopLike()) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }

  return (
    <>
      {/* Message Input: Container */}
      <InputGroup
        ref={containerRef}
        className="fixed bottom-10 bg-neutral-100 dark:bg-neutral-900 rounded-2xl max-w-10/12 md:max-w-2/5 self-center overflow-y-auto max-h-40 mx-8 select-text"
      >
        {/* Textarea */}
        <InputGroupTextarea
          placeholder="Ask, Search or Chat..."
          ref={textareaRef}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && hasText && !disabled) {
              e.preventDefault();
              doSend();
            }
          }}
          value={text}
          className="overflow-y-auto"
        />
        {/* Actions */}
        <InputGroupAddon align="block-end">
          {/* Add/attachment button */}
          <InputGroupButton
            variant="outline"
            className="rounded-full"
            size="icon-xs"
            disabled={isStreaming}
          >
            <IconPlus />
          </InputGroupButton>
          {/* Mode selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <InputGroupButton variant="ghost" disabled={isStreaming}>
                Auto
              </InputGroupButton>
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
          {/* Send/Stop button */}
          <InputGroupButton
            variant={isStreaming ? "secondary" : "default"}
            className="rounded-full"
            size="icon-xs"
            disabled={actionDisabled}
            onClick={() => {
              if (isStreaming) {
                if (canStop) {
                  onInterrupt?.();
                }
                return;
              }
              doSend();
            }}
          >
            {isStreaming ? (
              isInterrupting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Square className="h-4 w-4" aria-hidden="true" />
              )
            ) : (
              <ArrowUpIcon />
            )}
            <span className="sr-only">{isStreaming ? "Stop" : "Send"}</span>
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </>
  );
}

export default MessageInput;
