import { type CSSProperties, type JSX, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, ChevronRight, User } from "lucide-react";
import type { BubbleConfig, BubbleColors } from "../../types/Message";
import type { MessageBubbleProps } from "../../types/ui";
import MarkdownLLM from "./MarkdownLLM";

const HEADER_BASE_CLASS =
  "flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400";
const ICON_BASE_CLASS =
  "flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100";

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeLabel(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return String(value);
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIcon(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMaxHeight(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

function getDefaultName(role: string) {
  if (role === "user") return "User";
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  return role || "Assistant";
}

function getColors(config?: BubbleConfig) {
  if (!config || typeof config.colors !== "object" || !config.colors) return {};
  return config.colors as BubbleColors;
}

function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
  const isUser = message.role === "user";
  const rawConfig = message.config;
  const config =
    rawConfig && typeof rawConfig === "object"
      ? (rawConfig as BubbleConfig)
      : undefined;
  const defaultName = getDefaultName(message.role);
  const hasName = config ? hasOwn(config, "name") : false;
  const hasIcon = config ? hasOwn(config, "icon") : false;
  const name = hasName ? normalizeLabel(config?.name) : defaultName;
  const iconUrl = hasIcon ? normalizeIcon(config?.icon) : null;
  const showIcon = hasIcon ? iconUrl !== null : true;
  const showName = name !== null;
  const headerIsHidden = config?.header_is_hidden === true;
  const showHeader = !headerIsHidden && (showIcon || showName);
  const isTool = message.type === "tool";
  const isCollapsible = config?.collapsible === true;
  const collapsibleTitle =
    isCollapsible
      ? normalizeLabel(config?.collapsible_title) ?? (isTool ? "Tool Output" : null)
      : null;
  const collapsibleMaxHeight = isCollapsible
    ? normalizeMaxHeight(config?.collapsible_max_height)
    : null;
  const collapsibleByDefault =
    isCollapsible && config?.collapsible_by_default !== false;
  const [isCollapsed, setIsCollapsed] = useState(collapsibleByDefault);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const colors = getColors(config);
  const bubbleColors = colors.bubble;
  const headerColors = colors.header;
  const bubbleStyle: CSSProperties = {};
  const headerStyle: CSSProperties = {};
  const iconStyle: CSSProperties = {};
  const contentStyle: CSSProperties = {};
  const DefaultIcon = isUser ? User : Bot;

  useEffect(() => {
    setIsCollapsed(collapsibleByDefault);
  }, [collapsibleByDefault, message.id]);

  useEffect(() => {
    if (!isCollapsible) return;
    const el = contentRef.current;
    if (!el) return;
    setMeasuredHeight(el.scrollHeight);
  }, [isCollapsible, message.content, collapsibleMaxHeight, message.id]);

  if (bubbleColors?.bg) bubbleStyle.backgroundColor = bubbleColors.bg;
  if (bubbleColors?.text) bubbleStyle.color = bubbleColors.text;
  if (bubbleColors?.border) bubbleStyle.borderColor = bubbleColors.border;

  if (headerColors?.bg) headerStyle.backgroundColor = headerColors.bg;
  if (headerColors?.text) headerStyle.color = headerColors.text;
  if (headerColors?.border) headerStyle.borderColor = headerColors.border;

  if (headerColors?.iconBg) iconStyle.backgroundColor = headerColors.iconBg;
  if (headerColors?.iconText) iconStyle.color = headerColors.iconText;

  const headerHasSurface = Boolean(headerColors?.bg || headerColors?.border);
  const headerHasBorder = Boolean(headerColors?.border);
  const toolClass = isTool
    ? "border-dashed border-neutral-300/70 bg-neutral-50/80 text-neutral-700 dark:border-neutral-700/70 dark:bg-neutral-900/50 dark:text-neutral-200"
    : "";
  const bubblePaddingY = headerIsHidden ? "py-0" : "py-2";

  if (isCollapsible) {
    const expandedMaxHeight =
      collapsibleMaxHeight ??
      (measuredHeight != null ? measuredHeight : "9999px");
    contentStyle.maxHeight = isCollapsed ? 0 : expandedMaxHeight;
    contentStyle.opacity = isCollapsed ? 0 : 1;
    contentStyle.overflow = isCollapsed
      ? "hidden"
      : collapsibleMaxHeight != null
        ? "auto"
        : "visible";
    contentStyle.transition = "max-height 200ms ease-in-out, opacity 200ms ease-in-out";
    contentStyle.pointerEvents = isCollapsed ? "none" : "auto";
  }

  return (
    <div
      className={[
        "flex",
        isUser ? "justify-end" : "justify-start",
        headerIsHidden ? "mb-1" : "mb-3",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Bubble column wrapper */}
      <div
        className={
          [
            "flex",
            isUser ? "max-w-4/5" : "max-w-full",
            "flex-col",
            isUser ? "items-end" : "items-start",
            headerIsHidden ? "gap-0" : "gap-1",
          ]
            .filter(Boolean)
            .join(" ")
        }
      >
        {/* Header */}
        {showHeader && (
          <div
            className={[
              HEADER_BASE_CLASS,
              headerHasSurface ? "rounded-full px-2 py-1" : "",
              headerHasBorder ? "border" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={headerStyle}
          >
            {/* Header: Icon */}
            {showIcon && (
              <span className={ICON_BASE_CLASS} style={iconStyle}>
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt={name ?? defaultName}
                    className="h-4 w-4 object-contain"
                  />
                ) : (
                  <DefaultIcon className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
            )}
            {/* Header: Name */}
            {showName && <span>{name}</span>}
          </div>
        )}
        {/* Bubble body */}
        <div
          className={[
            isUser
              ? "px-3 rounded-lg border border-transparent bg-neutral-200 text-sm text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100 wrap-break-words max-w-full"
              : "px-3 rounded-lg border border-transparent bg-neutral-100 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 wrap-break-words max-w-full",
            bubblePaddingY,
            toolClass,
          ]
            .filter(Boolean)
            .join(" ")}
          style={bubbleStyle}
        >
          {isCollapsible && (
            <button
              type="button"
              className={[
                headerIsHidden ? "my-1" : "mb-2",
                "flex w-full items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? "Expand bubble content" : "Collapse bubble content"}
              onClick={() => setIsCollapsed((prev) => !prev)}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              {collapsibleTitle && <span>{collapsibleTitle}</span>}
            </button>
          )}
          <div
            ref={contentRef}
            style={contentStyle}
            aria-hidden={isCollapsible ? isCollapsed : false}
          >
            <MarkdownLLM
              markdown={
                typeof message.content === "string"
                  ? message.content
                  : String(message.content ?? "")
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
