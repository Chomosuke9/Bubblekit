export function isDesktopLike(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(pointer: fine)").matches &&
    window.matchMedia("(hover: hover)").matches
  );
}
