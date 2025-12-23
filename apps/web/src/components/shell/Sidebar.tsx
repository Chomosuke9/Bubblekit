import type React from "react";
import { useEffect, useState } from "react";
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

  return (
    <>
      {/* Sidebar */}
      <div
        className={[
          "fixed md:static z-50 left-0 bg-neutral-100 dark:bg-neutral-900 h-full @container flex flex-col",
          "transform transition-all duration-300 ease-in-out will-change-transform",
          isOpen ? "w-5/6 md:w-96" : "w-0 md:w-20",
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
            <InputGroupInput placeholder="Search..." />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupAddon align="inline-end">
              <InputGroupButton>Search</InputGroupButton>
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
        <div className="flex-1 overflow-y-auto">
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
            className={`grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-in-out
              ${isOpen
                ? "grid-rows-[1fr] opacity-100 translate-y-0"
                : "grid-rows-[0fr] opacity-0 -translate-y-1 pointer-events-none"
              }
            `}
          >
            <div className="min-h-0">
              <div className="mt-3 px-3 overflow-x-hidden">
                {/* Conversations header */}
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Conversations
                  </span>
                </div>

                {/* History */}
                <div className="space-y-1">
                  {conversations.length === 0 ? (
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">
                      No conversations yet.
                    </p>
                  ) : (
                    conversations.map((conversation) => {
                      const isSelected = conversation.id === selectedConversationId;
                      const formattedDate = new Date(conversation.updatedAt).toLocaleString();

                      return (
                        <button
                          key={conversation.id}
                          type="button"
                          aria-current={isSelected}
                          onClick={() => onSelectConversation(conversation.id)}
                          className={[
                            "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                            "border-neutral-200 dark:border-neutral-800",
                            isSelected
                              ? "bg-neutral-200/70 dark:bg-neutral-800"
                              : "hover:bg-neutral-200/60 dark:hover:bg-neutral-800/70",
                          ].join(" ")}
                        >
                          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                            {conversation.title}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
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
          className={`grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-in-out
            ${isOpen ? "grid-rows-[1fr] opacity-100 translate-y-0" : "grid-rows-[0fr] opacity-0 -translate-y-1 pointer-events-none"}
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
