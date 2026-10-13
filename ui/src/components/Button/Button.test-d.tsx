import { Download } from "lucide-react";
import { Button } from "./Button";

// Typecheck only (never run): a button that can become pending says whether it keeps the room of
// the spinner free, or its width would change when the spinner arrives. A button with an icon
// needs no room, because the spinner takes the place of the icon.
export const buttons = [
  <Button key="plain">Import</Button>,
  <Button key="room" reservesPendingSpace>
    Import
  </Button>,
  <Button key="pending-room" reservesPendingSpace isPending={false}>
    Import
  </Button>,
  <Button key="pending-no-room" reservesPendingSpace={false} isPending>
    Import
  </Button>,
  <Button key="pending-icon" icon={Download} isPending>
    Export
  </Button>,
  <Button key="inert" isInert>
    Import
  </Button>,
  // @ts-expect-error a button without an icon that can become pending says whether it keeps room
  <Button key="pending-bare" isPending>
    Import
  </Button>,
  // @ts-expect-error the same when it is told that it is not pending now
  <Button key="pending-false-bare" isPending={false}>
    Import
  </Button>,
];
