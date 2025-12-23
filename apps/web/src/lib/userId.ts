const STORAGE_KEY = "bubblekit-user-id";
const FALLBACK_USER_ID = "anonymous";

export function getUserId(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const normalized = stored?.trim() ?? "";
  if (!normalized || normalized === FALLBACK_USER_ID) {
    return "";
  }
  return normalized;
}

export function setUserId(value: string): string {
  const normalized = value.trim();
  if (typeof window !== "undefined") {
    if (normalized) {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  return normalized;
}

export function resolveUserId(value?: string | null): string {
  const normalized = value?.trim() ?? "";
  return normalized || FALLBACK_USER_ID;
}
