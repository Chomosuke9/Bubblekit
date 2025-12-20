import type { GenerateMainBarProps } from "../../types/ui";

function GenerateMainBar({ isOpened, item }: GenerateMainBarProps) {
  const Icon = item.icon;

  return (
    <button
      onClick={item.onClick}
      className={[
        "relative flex h-10 w-full items-center px-3",
        isOpened ? null : "pointer-events-none md:pointer-events-auto",
      ].join(" ")}
      aria-label={!isOpened ? item.label : undefined}
    >
      {/* Icon */}
      <span
        className={[
          "absolute top-1/2 -translate-y-1/2 transition-all ease-in-out",
          isOpened
            ? "left-3 translate-x-0 duration-150"
            : "md:left-1/2 md:-translate-x-1/2 md:duration-800 opacity-0 md:opacity-100",
        ].join(" ")}
      >
        <Icon className="shrink-0" />
      </span>

      {/* Label */}
      <span
        className={[
          "ml-8 min-w-0 overflow-hidden whitespace-nowrap text-left",
          "transition-[max-width,opacity,transform] duration-300 ease-in-out",
          isOpened
            ? "max-w-full opacity-100 translate-x-0 duration-1000"
            : "max-w-0 opacity-0 -translate-x-1 pointer-events-none",
        ].join(" ")}
      >
        <span className="block truncate">{item.label}</span>
      </span>
    </button>
  );
}

export default GenerateMainBar;
