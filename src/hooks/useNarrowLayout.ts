import { useEffect, useState } from "react";

export function useNarrowLayout(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsNarrow(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener?.("change", sync);
    mediaQuery.addListener?.(sync);
    return () => {
      mediaQuery.removeEventListener?.("change", sync);
      mediaQuery.removeListener?.(sync);
    };
  }, []);

  return isNarrow;
}
