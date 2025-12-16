type MenuProps = {
  className?: string;
};

function Menu({ className = "" }: MenuProps) {
  return (
    <div
      className={[
        "fixed p-4 z-60 left-0 top-0 bg-transparent h-full w-[calc(100vw*5/6)] md:w-[calc(100vw*1/6)] transform transition-width duration-300 ease-in-out will-change-transform",
        className,
      ].join(" ")}
    >
      {/* Header */}
      <div className="mb-4">
        <div className="text-lg font-semibold">My Sidebar</div>
        <div className="text-xs text-zinc-700">v0.1 • placeholder</div>
      </div>

      {/* Search (dummy) */}
      <div className="mb-4">
        <input
          placeholder="Search..."
          className="w-full rounded-lg border border-zinc-300 bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </div>

      {/* Main menu */}
      <nav className="flex flex-col gap-1">
        {[
          ["Chat", "💬"],
          ["Projects", "📁"],
          ["Notes", "📝"],
          ["Files", "📎"],
          ["Settings", "⚙️"],
        ].map(([label, icon]) => (
          <button
            key={label}
            type="button"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-black/10"
          >
            <span className="text-base">{icon}</span>
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </nav>

      {/* Divider */}
      <div className="my-4 h-px bg-black/10" />

      {/* Secondary */}
      <div className="flex flex-col gap-1">
        {[
          ["Invite friends", "➕"],
          ["Help", "❓"],
          ["Feedback", "🗣️"],
        ].map(([label, icon]) => (
          <button
            key={label}
            type="button"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-black/10"
          >
            <span className="text-base">{icon}</span>
            <span className="font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Bottom user card */}
      <div className="mt-auto rounded-xl border border-black/10 bg-white/50 p-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-black/20" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">fhg ruu</div>
            <div className="truncate text-xs text-zinc-700">
              user@example.com
            </div>
          </div>
        </div>

        <button
          type="button"
          className="mt-3 w-full rounded-lg bg-black/10 px-3 py-2 text-sm font-medium hover:bg-black/15"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

export default Menu;
