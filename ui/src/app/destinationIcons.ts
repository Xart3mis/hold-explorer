// The icon of each destination, beside the list in destinations.ts: the sidebar and the command
// palette draw a destination with it.
import {
  ChartBarDecreasing,
  Flag,
  History,
  LayoutGrid,
  List,
  Settings,
  SlidersHorizontal,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { DestinationId } from "./destinations";

/** The icon of each destination, from the one outline set. */
export const destinationIcons: Record<DestinationId, LucideIcon> = {
  overview: LayoutGrid,
  breakdown: ChartBarDecreasing,
  lines: List,
  blockers: Waypoints,
  history: History,
  people: Users,
  "follow-up": Flag,
  rules: SlidersHorizontal,
  settings: Settings,
};
