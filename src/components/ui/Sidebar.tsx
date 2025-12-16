import { useState } from "react";
import Menu from "./SidebarMenu";

function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  function toggleSidebar() {
    if (isOpen) setIsOpen(false);
    else setIsOpen(true);
  }

  return (
    <>
      {/* Button */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        aria-expanded={isOpen}
        className="fixed left-4 top-4 z-60 grid h-12 w-12 place-items-center rounded-full bg-zinc-800/70 backdrop-blur border border-zinc-700"
      >
        <span className="block h-0.5 w-6 rounded bg-white" />
        <span className="mt-1.5 block h-0.5 w-6 rounded bg-white" />
      </button>

      {/* Sidebar */}
      <div
        className={[
          "fixed md:static z-50 left-0 bg-amber-200 h-full",
          "transform transition-width duration-300 ease-in-out will-change-transform",
          isOpen ? "w-5/6 md:w-1/6" : " w-0",
        ].join(" ")}
      >
        <Menu className={isOpen ? "translate-0" : "-translate-x-full"} />
      </div>
    </>
  );
}

export default Sidebar;
