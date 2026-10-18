import { useEffect, useState } from "react";

/** Whether the text of an element is cut by its box, kept true to the element's size. */
export function useIsCut(element: React.RefObject<HTMLElement | null>): boolean {
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const sizes = new ResizeObserver(() => {
      setCut(node.scrollWidth > node.clientWidth);
    });
    sizes.observe(node);
    return () => {
      sizes.disconnect();
    };
  }, [element]);
  return cut;
}
