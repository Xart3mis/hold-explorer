import { BarRow } from "./BarRow";

// Typecheck only (never run): a row is a button or it is not. A row that can be pressed has an
// action, and a static row has none and is never in the active filter.
export const rows = [
  <BarRow key="pressable" label="Civil" value="1,515" fraction={1} onPress={() => undefined} />,
  <BarRow
    key="selected"
    label="Civil"
    value="1,515"
    fraction={1}
    isSelected
    onPress={() => undefined}
  />,
  <BarRow key="static" isStatic label="Civil" value="1,515" fraction={1} />,
  // @ts-expect-error a static row takes no action
  <BarRow
    key="static-pressed"
    isStatic
    label="Civil"
    value="1,515"
    fraction={1}
    onPress={() => undefined}
  />,
  // @ts-expect-error a static row is never in the active filter
  <BarRow key="static-selected" isStatic label="Civil" value="1,515" fraction={1} isSelected />,
  // @ts-expect-error a row that can be pressed needs its action
  <BarRow key="bare" label="Civil" value="1,515" fraction={1} />,
];
