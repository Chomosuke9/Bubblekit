import type { CSSProperties, JSX } from "react";
import { Bot, User } from "lucide-react";
import type { BubbleConfig, BubbleColors } from "../../types/Message";
import type { MessageBubbleProps } from "../../types/ui";

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
  const showHeader = showIcon || showName;
  const colors = getColors(config);
  const bubbleColors = colors.bubble;
  const headerColors = colors.header;
  const bubbleStyle: CSSProperties = {};
  const headerStyle: CSSProperties = {};
  const iconStyle: CSSProperties = {};
  const DefaultIcon = isUser ? User : Bot;

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

  return (
    <div
      className={isUser ? "flex justify-end mb-3" : "flex justify-start mb-3"}
    >
      <div
        className={
          isUser
            ? "flex max-w-4/5 flex-col items-end gap-1"
            : "flex max-w-4/5 flex-col items-start gap-1"
        }
      >
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
            {showName && <span>{name}</span>}
          </div>
        )}
        <div
          className={
            isUser
              ? "px-3 py-2 rounded-lg border border-transparent bg-neutral-200 text-sm text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100 whitespace-pre-wrap break-all"
              : "px-3 py-2 rounded-lg border border-transparent bg-neutral-100 text-sm text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 whitespace-pre-wrap break-all"
          }
          style={bubbleStyle}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
