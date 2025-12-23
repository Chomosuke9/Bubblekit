const STORAGE_KEY = "bubblekit-user-id";
const FALLBACK_USER_ID = "anonymous";

export function getUserId(): string {
  if (typeof window === "undefined") return FALLBACK_USER_ID;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  const normalized = stored?.trim();
  return normalized ? normalized : FALLBACK_USER_ID;
}

export function setUserId(value: string): string {
  const normalized = value.trim() || FALLBACK_USER_ID;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, normalized);
  }
  return normalized;
}
