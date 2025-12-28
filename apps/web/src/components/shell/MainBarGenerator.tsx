import type { GenerateMainBarProps } from "../../types/ui";

function GenerateMainBar({ isOpened, item }: GenerateMainBarProps) {
  const Icon = item.icon;
  return (
    <button
      onClick={item.onClick}
      className={[
        "group flex h-10 w-full items-center justify-start",
        "transition-all duration-130 ease-in-out",
        isOpened ? "px-3" : "px-[calc(50%-12px)] pointer-events-none md:pointer-events-auto duration-700 ease-in",
        "hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 rounded-md"
      ].join(" ")}
      aria-label={!isOpened ? item.label : undefined}
    >
      <div className="flex shrink-0 items-center justify-center w-6 h-6 z-10">
        <Icon className="w-5 h-5" />
      </div>
      <div
        className={[
          "overflow-hidden whitespace-nowrap",
          "transition-all duration-300 ease-in-out",
          isOpened
            ? "max-w-[200px] opacity-100 ml-3"
            : "max-w-0 opacity-0 ml-0"
        ].join(" ")}
      >
        <span className={[
          "block text-sm font-medium",
          "transition-transform duration-300 ease-in-out",
          isOpened ? "translate-x-0" : "-translate-x-2"
        ].join(" ")}>
          {item.label}
        </span>
      </div>
    </button>
  );
}

export default GenerateMainBar;
