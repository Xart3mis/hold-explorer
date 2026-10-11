import type { ReactNode } from "react";
import { VisuallyHidden as RacVisuallyHidden } from "react-aria-components";

export interface VisuallyHiddenProps {
  children: ReactNode;
  /** The element to render; a `span` unless another is asked for. */
  elementType?: "span" | "div" | "p" | "h2" | "h3";
  id?: string;
  role?: "status";
}

/** Text for assistive technology that takes no room on the screen. */
export function VisuallyHidden({ children, elementType = "span", ...props }: VisuallyHiddenProps) {
  return (
    <RacVisuallyHidden elementType={elementType} {...props}>
      {children}
    </RacVisuallyHidden>
  );
}
