import { useState } from "react";
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

function Sidebar({ onNewChat }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  function toggleSidebar() {
    if (isOpen) setIsOpen(false);
    else setIsOpen(true);
  }

  return (
    <>
      {/* Sidebar */}
      <div
        className={[
          "fixed md:static z-50 left-0 bg-amber-200 h-full @container ",
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
      </div>
    </>
  );
}

export default Sidebar;
