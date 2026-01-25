import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  SearchIcon,
  SquarePen,
} from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import GenerateMainBar from "./MainBarGenerator";

import type { SidebarProps } from "../../types/ui";

function Sidebar({
  onNewChat,
  conversations,
  onSelectConversation,
  selectedConversationId,
  userId,
  onChangeUserId,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [userIdDraft, setUserIdDraft] = useState(userId);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setUserIdDraft(userId);
  }, [userId]);

  function toggleSidebar() {
    if (isOpen) setIsOpen(false);
    else setIsOpen(true);
  }

  function handleSubmitUserId(event: React.FormEvent) {
    event.preventDefault();
    onChangeUserId(userIdDraft);
  }

  function fuzzyScore(query: string, text: string) {
    if (!query) return 0;

    const normalizedQuery = query.toLowerCase();
    const normalizedText = text.toLowerCase();

    let queryIndex = 0;
    let score = 0;
    let streak = 0;

    for (let i = 0; i < normalizedText.length && queryIndex < normalizedQuery.length; i += 1) {
      if (normalizedText[i] === normalizedQuery[queryIndex]) {
        score += 1 + streak;
        streak += 1;
        queryIndex += 1;
      } else {
        streak = 0;
      }
    }

    return queryIndex === normalizedQuery.length ? score : -1;
  }

  const filteredConversations = useMemo(() => {
    const trimmed = searchTerm.trim();

    if (!trimmed) return conversations;

    return conversations
      .map((conversation) => ({
        conversation,
        score: fuzzyScore(trimmed, conversation.title),
      }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ conversation }) => conversation);
  }, [conversations, searchTerm]);

  return (
    <>
      {/* Sidebar */}
      <div
        className={[
          "fixed md:static z-50 left-0 bg-neutral-100 dark:bg-neutral-900 h-full @container flex flex-col",
          "transform transition-all duration-300 ease-in-out will-change-transform",
          isOpen ? "w-5/6 md:w-96" : "w-0 md:w-15",
        ].join(" ")}
      >
        {/* Top bar */}
        <div className="flex place-content-center items-center m-2 my-4">
          {/* Search */}
          <InputGroup
            className={[
              "flex-initial overflow-hidden",
              "transition-all duration-300 ease-in-out",
              isOpen ? "w-full opacity-100" : "w-0 opacity-0",
            ].join(" ")}
          >
            <InputGroupInput
              placeholder="Search..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>

          {/* Button */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            aria-expanded={isOpen}
            className={[
              "shrink-0 grid place-items-center h-8 w-8 md:h-12 md:w-12 object-center",
              "transform transition-all duration-300 ease-in-out will-change-transform",
              isOpen ? "translate-0 ml-4" : "translate-x-8 md:translate-0",
            ].join(" ")}
          >
            {isOpen ? (
              <PanelLeftClose size={30} />
            ) : (
              <PanelLeftOpen size={30} />
            )}
          </button>
        </div>

        {/* Main Bar */}
        {/* Sidebar: Scrollable content */}
        <div className={isOpen? "flex-1 overflow-y-scroll" : "flex-1 overflow-y-hidden"}>
          <div>
            {/* New chat */}
            <GenerateMainBar
              isOpened={isOpen}
              item={{
                icon: SquarePen,
                label: "New chat",
                onClick: onNewChat,
              }}
            />
          </div>

          {/* Conversations section */}
          <div
            className={`grid overflow-hidden ease-in-out
              ${isOpen
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0 pointer-events-none"
              }
            `}
            style={{
              transitionProperty: 'grid-template-rows, opacity',
              transitionDuration: isOpen ? '50ms, 300ms' : '0ms, 300ms',
              transitionDelay: isOpen ? '0ms, 0ms' : '300ms, 0ms',
              transitionTimingFunction: 'ease-in-out',
            }}

          >
            <div className="min-h-0 min-w-0">
              <div className="mt-3 px-3 overflow-x-hidden">
                {/* Conversations header */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Conversations
                  </span>
                </div>

                {/* History */}
                <div className="space-y-1 min-w-0">
                  {conversations.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      No conversations yet.
                    </p>
                  ) : filteredConversations.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      No conversations found.
                    </p>
                  ) : (
                    filteredConversations.map((conversation) => {
                      const isSelected = conversation.id === selectedConversationId;
                      const formattedDate = new Date(conversation.updatedAt).toLocaleString();

                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          aria-current={isSelected}
                          onClick={() => onSelectConversation(conversation.id)}
                          className={[
                            "w-full rounded-lg border px-3 py-2 text-left transition-colors h-[60px] flex flex-col justify-center",
                            "border-neutral-200 dark:border-neutral-800",
                            isSelected
                              ? "bg-neutral-200/70 dark:bg-neutral-800"
                              : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/70",
                          ].join(" ")}
                        >
                          <div className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100 leading-tight min-w-0">
                            {conversation.title}
                          </div>
                          <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400 leading-tight mt-0.5 min-w-0">
                            Updated {formattedDate}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>


        </div>

        {/* User ID section */}
        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-in-out
            ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"}
          `}
        >
          <div className="min-h-0">
            {/* User ID form */}
            <form onSubmit={handleSubmitUserId} className="p-4 pt-2">
              <label className="sr-only" htmlFor="sidebar-user-id">
                User ID
              </label>

              <InputGroup>
                <InputGroupInput
                  id="sidebar-user-id"
                  placeholder="User ID"
                  value={userIdDraft}
                  onChange={(event) => setUserIdDraft(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton type="submit">Apply</InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>
        </div>

      </div>
    </>
  );
}

export default Sidebar;
