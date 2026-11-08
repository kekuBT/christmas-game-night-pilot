import { useEffect, useState } from "react";

/** Whether this page can be seen right now (not a background tab, window or app). */
export function pageVisible(doc: Pick<Document, "visibilityState"> | undefined = typeof document === "undefined" ? undefined : document): boolean {
  return doc === undefined || doc.visibilityState !== "hidden";
}

/** React state that follows the page's visibility. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => pageVisible());
  useEffect(() => {
    const on = () => setVisible(pageVisible());
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}
