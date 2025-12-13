import React, { useState } from "react";
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

interface MessageInputProps {
    onSend: (text: string) => void;
}

function MessageInput({ onSend }: MessageInputProps) {
    const [text, setText] = useState<string>("");

    function handleSubmit(event: React.FormEvent<HTMLTextAreaElement>) {
        event.preventDefault();

        const trimmed = text.trim();
        if (!trimmed) return;

        onSend(trimmed);
        setText("");
    }

    return (
        <InputGroup className="fixed bottom-0 right-0 left-0 bg-white rounded-full">
            <InputGroupTextarea
                placeholder="Ask, Search or Chat..."
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                    // Enter = kirim, Shift+Enter = baris baru
                    if (e.key === "Enter" && !e.shiftKey && !(text == "")) {
                        onSend(text);
                        setText("");
                    }
                }}
                onSubmit={(e) => {
                    handleSubmit(e);
                }}
                className="overflow-y-auto "
            />
            <InputGroupAddon align="block-end">
                <InputGroupButton
                    variant="outline"
                    className="rounded-full"
                    size="icon-xs"
                >
                    <IconPlus />
                </InputGroupButton>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <InputGroupButton variant="ghost">
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
                <InputGroupText className="ml-auto"></InputGroupText>
                <Separator orientation="vertical" className="h-4!" />
                <InputGroupButton
                    variant="default"
                    className="rounded-full"
                    size="icon-xs"
                    disabled={!text.trim()}
                >
                    <ArrowUpIcon />
                    <span className="sr-only">Send</span>
                </InputGroupButton>
            </InputGroupAddon>
        </InputGroup>
    );

    /*
    return (
        <form onSubmit={handleSubmit} className="flex gap-2">
            <input
                className="flex-1 px-3 py-2 rounded bg-[#1F1F1F] text-sm text-gray-100"
                value={text}
                onChange={handleChange}
                placeholder="Tulis pesan..."
            />
            <button
                type="submit"
                className="px-3 py-2 rounded bg-blue-600 text-sm"
            >
                Kirim
            </button>
        </form>
    );
*/
}

export default MessageInput;
