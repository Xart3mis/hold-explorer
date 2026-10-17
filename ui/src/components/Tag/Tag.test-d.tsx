import { TriangleAlert } from "lucide-react";
import { Tag } from "./Tag";

// Typecheck only (never run): a state color never appears without an icon, so a tag in a state
// tone that is given none must be a type error.
export const tags = [
  <Tag key="neutral">Soon</Tag>,
  <Tag key="neutral-named" tone="neutral">
    Limited
  </Tag>,
  <Tag key="neutral-icon" tone="neutral" icon={TriangleAlert}>
    Limited
  </Tag>,
  <Tag key="warning" tone="warning" icon={TriangleAlert}>
    Size mismatch
  </Tag>,
  // @ts-expect-error a warning tag needs an icon
  <Tag key="warning-bare" tone="warning">
    Size mismatch
  </Tag>,
  // @ts-expect-error a danger tag needs an icon
  <Tag key="danger-bare" tone="danger">
    Overdue
  </Tag>,
  // @ts-expect-error an info tag needs an icon
  <Tag key="info-bare" tone="info">
    Older snapshot
  </Tag>,
  // @ts-expect-error a success tag needs an icon
  <Tag key="success-bare" tone="success">
    Released
  </Tag>,
];
