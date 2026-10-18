import { useEffect, useState } from "react";

/**
 * Whether the text of an element is cut by its box, kept true to the element's size, to its
 * text, and to the fonts. A box of a fixed width, such as the label column of a bar row, keeps
 * its size when its text changes or when the web font arrives after the first measure, so each of
 * those measures it again as well. Pass the text the element shows.
 */
export function useIsCut(element: React.RefObject<HTMLElement | null>, text: string): boolean {
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setCut(node.scrollWidth > node.clientWidth);
    };
    const sizes = new ResizeObserver(measure);
    sizes.observe(node);
    // The box is observed from now on; the text it shows now is measured once more here.
    measure();
    // A font set that has none of this (a test's document) has nothing to wait for.
    const fonts = (document as Partial<Pick<Document, "fonts">>).fonts;
    fonts?.addEventListener("loadingdone", measure);
    return () => {
      sizes.disconnect();
      fonts?.removeEventListener("loadingdone", measure);
    };
  }, [element, text]);
  return cut;
}
