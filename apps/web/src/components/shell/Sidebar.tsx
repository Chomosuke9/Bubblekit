import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const listViewportRef = useRef<HTMLDivElement | null>(null);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const itemHeight = 60;
  const itemGap = 4;
  const overscan = 6;

  useEffect(() => {
    setUserIdDraft(userId);
  }, [userId]);

  useEffect(() => {
    const viewport = listViewportRef.current;
    if (!viewport) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setListViewportHeight(entry.contentRect.height);
      }
    });

    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

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

  const formattedDates = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

    return new Map(
      conversations.map((conversation) => [
        conversation.id,
        formatter.format(new Date(conversation.updatedAt)),
      ]),
    );
  }, [conversations]);

  const totalItems = filteredConversations.length;
  const itemSize = itemHeight + itemGap;
  const totalHeight =
    totalItems === 0 ? 0 : totalItems * itemHeight + (totalItems - 1) * itemGap;
  const startIndex = totalItems === 0
    ? 0
    : Math.max(0, Math.floor(scrollTop / itemSize) - overscan);
  const endIndex = totalItems === 0
    ? -1
    : Math.min(
      totalItems - 1,
      Math.floor((scrollTop + listViewportHeight) / itemSize) + overscan,
    );
  const visibleConversations =
    totalItems === 0 ? [] : filteredConversations.slice(startIndex, endIndex + 1);
  const offsetY = startIndex * itemSize;

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
        <div className={isOpen ? "flex flex-col flex-1 min-h-0" : "flex flex-col flex-1 min-h-0"}>
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
            className={`grid overflow-hidden ease-in-out flex-1 min-h-0
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
            <div className="min-h-0 min-w-0 flex flex-col">
              <div className="mt-3 px-3 overflow-x-hidden flex flex-col flex-1 min-h-0">
                {/* Conversations header */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Conversations
                  </span>
                </div>

                {/* History */}
                <div
                  ref={listViewportRef}
                  onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
                  className="min-w-0 flex-1 min-h-0 overflow-y-auto"
                >
                  {conversations.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      No conversations yet.
                    </p>
                  ) : filteredConversations.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      No conversations found.
                    </p>
                  ) : (
                    <div
                      className="relative min-w-0"
                      style={{ height: `${totalHeight}px` }}
                    >
                      <div
                        className="absolute left-0 right-0 flex flex-col min-w-0 gap-1"
                        style={{ transform: `translateY(${offsetY}px)` }}
                      >
                        {visibleConversations.map((conversation) => {
                          const isSelected = conversation.id === selectedConversationId;
                          const formattedDate =
                            formattedDates.get(conversation.id) ?? "";

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
                        })}
                      </div>
                    </div>
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
