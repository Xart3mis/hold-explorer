// The component gallery: every base component in every variant and state, for looking at.
// Development only. It is served by `pnpm dev` at /gallery.html and is not part of the build.
//
//   /gallery.html                              both themes side by side, with a density switch
//   /gallery.html?frame=1&theme=light          one theme alone, as a page of its own
//   /gallery.html?frame=1&theme=dark&density=compact
import { Check, Download, Plus, Trash2, X } from "lucide-react";
import { StrictMode, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "react-aria-components";
import "../app/i18n";
import { locale } from "../app/i18n";
import "../design/fonts.css";
import "../design/tokens.css";
import "../app.css";
import {
  BarRow,
  BarRowGroup,
  Button,
  Checkbox,
  DataTable,
  DropZone,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Notice,
  PageHeader,
  Progress,
  Select,
  Skeleton,
  StatTile,
  StatTileGroup,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextField,
  ToastRegion,
  Tooltip,
  useToast,
  VisuallyHidden,
  type ButtonVariant,
  type DataTableColumn,
} from "../components";
import selectStyles from "../components/Select/Select.module.css";
import { Toast } from "../components/ToastRegion/ToastRegion";
import tooltipStyles from "../components/Tooltip/Tooltip.module.css";
import { applyTheme } from "../design/theme";
import styles from "./gallery.module.css";

type ThemeName = "dark" | "light";
type Density = "comfortable" | "compact";

const params = new URLSearchParams(window.location.search);
const density: Density = params.get("density") === "compact" ? "compact" : "comfortable";

// The mark that the build check looks for: this page must never be part of the app.
document.documentElement.dataset.page = "hx-dev-gallery";

/**
 * Shows its child in a state that needs a pointer or a keyboard, by setting the attribute the
 * component styles from. `target` picks an element inside the child; the child itself otherwise.
 */
function Forced({
  state,
  target,
  children,
}: {
  state: string | readonly string[];
  target?: string;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const names = [state].flat().map((name) => `data-${name}`);
    // A table or a tab list builds its rows after the first render, so the state is set again
    // whenever the content changes.
    const force = () => {
      const found = target ? element.querySelector(target) : element.firstElementChild;
      for (const name of names)
        if (found && !found.hasAttribute(name)) found.setAttribute(name, "true");
    };
    force();
    const changes = new MutationObserver(force);
    changes.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: names,
    });
    return () => {
      changes.disconnect();
    };
  }, [state, target]);
  return (
    <div ref={host} className={styles.forced}>
      {children}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.note}>{note}</p>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

/** One specimen with the name of its state under it. */
function Specimen({ name, children, wide }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={styles.specimen} data-wide={wide ? "" : undefined}>
      <div className={styles.specimenBody}>{children}</div>
      <figcaption className={styles.caption}>{name}</figcaption>
    </figure>
  );
}

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      {label === undefined ? null : <span className={styles.rowLabel}>{label}</span>}
      <div className={styles.rowBody}>{children}</div>
    </div>
  );
}

const variants: readonly ButtonVariant[] = ["primary", "secondary", "quiet", "danger"];

function Buttons() {
  return (
    <Section
      title="Button"
      note="Four variants. Hover, pressed, and focus are forced; the last two columns are real."
    >
      {variants.map((variant) => (
        <Row key={variant} label={variant}>
          <Specimen name="Default">
            <Button variant={variant}>Import</Button>
          </Specimen>
          <Specimen name="Hover">
            <Forced state="hovered">
              <Button variant={variant}>Import</Button>
            </Forced>
          </Specimen>
          <Specimen name="Pressed">
            <Forced state="pressed">
              <Button variant={variant}>Import</Button>
            </Forced>
          </Specimen>
          <Specimen name="Focus">
            <Forced state="focus-visible">
              <Button variant={variant}>Import</Button>
            </Forced>
          </Specimen>
          <Specimen name="Disabled">
            <Button variant={variant} isDisabled>
              Import
            </Button>
          </Specimen>
          <Specimen name="Pending">
            <Button variant={variant} isPending>
              Import
            </Button>
          </Specimen>
          <Specimen name="With icon">
            <Button variant={variant} icon={variant === "danger" ? Trash2 : Download}>
              {variant === "danger" ? "Delete" : "Export"}
            </Button>
          </Specimen>
          <Specimen name="Icon, pending">
            <Button variant={variant} icon={Download} isPending>
              Export
            </Button>
          </Specimen>
        </Row>
      ))}
      <Row label="pending keeps the width">
        <PendingToggle />
      </Row>
      <Row label="icon only">
        <Specimen name="Default">
          <IconButton icon={X} label="Dismiss" />
        </Specimen>
        <Specimen name="Hover">
          <Forced state="hovered">
            <IconButton icon={X} label="Dismiss" />
          </Forced>
        </Specimen>
        <Specimen name="Focus">
          <Forced state="focus-visible">
            <IconButton icon={X} label="Dismiss" />
          </Forced>
        </Specimen>
        <Specimen name="Secondary">
          <IconButton icon={Plus} label="Add filter" variant="secondary" />
        </Specimen>
        <Specimen name="Disabled">
          <IconButton icon={X} label="Dismiss" isDisabled />
        </Specimen>
      </Row>
    </Section>
  );
}

function PendingToggle() {
  const [pending, setPending] = useState(false);
  return (
    <>
      <Specimen name={pending ? "Pending, press Toggle" : "At rest, press Toggle"}>
        <Button variant="primary" isPending={pending}>
          Import
        </Button>
        <Button isPending={pending} icon={Download}>
          Export
        </Button>
      </Specimen>
      <Specimen name="Real">
        <Button
          variant="quiet"
          onPress={() => {
            setPending((value) => !value);
          }}
        >
          Toggle
        </Button>
      </Specimen>
    </>
  );
}

function Fields() {
  return (
    <Section
      title="Text field"
      note="A label above, the field, and a helper line. In error the message replaces the helper line."
    >
      <div className={styles.fieldGrid}>
        <TextField
          label="Workspace name"
          defaultValue="Unit 573 piping"
          description="Shown in the workspace switcher."
        />
        <Forced state="hovered" target="input">
          <TextField label="Hover" defaultValue="Unit 573 piping" description="Forced." />
        </Forced>
        <Forced state={["focused", "focus-visible"]} target="input">
          <TextField
            label="Focus"
            defaultValue="Unit 573 piping"
            description="Accent border and the focus ring. Forced."
          />
        </Forced>
        <TextField
          label="Empty"
          placeholder="28/02/2026"
          description="The placeholder is an example."
        />
        <TextField
          label="Snapshot date"
          defaultValue="31/02/2026"
          errorMessage="This is not a date. Enter it as day, month, year, for example 28/02/2026."
        />
        <TextField label="Author name" defaultValue="sico" isDisabled description="Disabled." />
        <TextField
          label="Loading"
          defaultValue="Unit 573 piping"
          isPending
          description="Stays editable."
        />
        <TextField
          label="Loading, in error"
          defaultValue="Unit 573"
          isPending
          errorMessage="A workspace with this name exists. Enter another name."
        />
      </div>
    </Section>
  );
}

const groupings = [
  { id: "discipline", label: "Discipline" },
  { id: "hold-type", label: "Hold type" },
  { id: "role", label: "Role" },
  { id: "blocker-type", label: "Blocker type", isDisabled: true },
];

function Selects() {
  return (
    <Section
      title="Select"
      note="A listbox drawn by the app. The first is real; the open list beside the fields is a still copy made from the same styles."
    >
      <div className={styles.fieldGrid}>
        <Select
          label="Group by"
          options={groupings}
          defaultSelectedKey="discipline"
          description="Real: open it with the pointer or the keyboard."
        />
        <Select label="Nothing chosen" options={groupings} placeholder="Choose a field" />
        <Forced state="hovered" target="button">
          <Select label="Hover" options={groupings} defaultSelectedKey="role" />
        </Forced>
        <Forced state="focus-visible" target="button">
          <Select label="Focus" options={groupings} defaultSelectedKey="role" />
        </Forced>
        <Select
          label="Line ID"
          options={groupings}
          errorMessage="Choose the column that holds the line ID."
        />
        <Select label="Disabled" options={groupings} defaultSelectedKey="role" isDisabled />
        <Select
          label="Loading"
          options={groupings}
          isPending
          description="The options are being read."
        />
        <Select
          label="Loading, in error"
          options={groupings}
          isPending
          errorMessage="Choose the column that holds the line ID."
        />
        <div>
          <div
            className={selectStyles.popover}
            style={{ "--trigger-width": "100%" } as CSSProperties}
          >
            <div className={selectStyles.list}>
              <div className={selectStyles.option}>
                <span className={selectStyles.optionLabel}>Discipline</span>
              </div>
              <div className={selectStyles.option} data-focused="true" data-selected="true">
                <span className={selectStyles.optionLabel}>Hold type</span>
                <span className={selectStyles.detail}>12 values</span>
                <Icon icon={Check} className={selectStyles.check ?? ""} />
              </div>
              <div className={selectStyles.option}>
                <span className={selectStyles.optionLabel}>Role</span>
              </div>
              <div className={selectStyles.option} data-disabled="true">
                <span className={selectStyles.optionLabel}>Blocker type</span>
              </div>
            </div>
          </div>
          <p className={styles.caption}>
            Open list: highlighted and chosen, then a disabled option
          </p>
        </div>
      </div>
    </Section>
  );
}

function Checkboxes() {
  return (
    <Section title="Checkbox" note="The whole row is the target. The mixed state shows a dash.">
      <Row>
        <Specimen name="Unchecked">
          <Checkbox>Include my notes</Checkbox>
        </Specimen>
        <Specimen name="Hover">
          <Forced state="hovered">
            <Checkbox>Include my notes</Checkbox>
          </Forced>
        </Specimen>
        <Specimen name="Pressed">
          <Forced state="pressed">
            <Checkbox>Include my notes</Checkbox>
          </Forced>
        </Specimen>
        <Specimen name="Checked">
          <Checkbox defaultSelected>Include my notes</Checkbox>
        </Specimen>
        <Specimen name="Checked, hover">
          <Forced state="hovered">
            <Checkbox defaultSelected>Include my notes</Checkbox>
          </Forced>
        </Specimen>
        <Specimen name="Mixed">
          <Checkbox isIndeterminate>All columns</Checkbox>
        </Specimen>
        <Specimen name="Focus">
          <Forced state="focus-visible">
            <Checkbox defaultSelected>Include my notes</Checkbox>
          </Forced>
        </Specimen>
        <Specimen name="In error">
          <Checkbox isInvalid>Confirm the date</Checkbox>
        </Specimen>
        <Specimen name="Disabled">
          <Checkbox isDisabled>Include my notes</Checkbox>
        </Specimen>
        <Specimen name="Disabled, checked">
          <Checkbox isDisabled defaultSelected>
            Include my notes
          </Checkbox>
        </Specimen>
      </Row>
    </Section>
  );
}

interface Line {
  id: string;
  holds: string;
  disciplines: string;
  oldest: string;
  blocker: string;
}

const lines: Line[] = [
  {
    id: "78B01-573-4434-FW-001",
    holds: "13",
    disciplines: "3",
    oldest: "71 d",
    blocker: "Civil / 577-PR-400",
  },
  {
    id: "78B01-573-4386-FW-001",
    holds: "13",
    disciplines: "3",
    oldest: "71 d",
    blocker: "Civil / 577-PR-400",
  },
  {
    id: "78B01-573-4500-FW-001",
    holds: "13",
    disciplines: "2",
    oldest: "64 d",
    blocker: "Piping / FIV/AIV",
  },
  {
    id: "78B01-573-PP-1041",
    holds: "12",
    disciplines: "2",
    oldest: "64 d",
    blocker: "Process / P&ID",
  },
  {
    id: "78B01-573-4601-FW-001",
    holds: "12",
    disciplines: "2",
    oldest: "58 d",
    blocker: "Civil / SLEEPERS",
  },
  {
    id: "78B10-610-OO-0100",
    holds: "9",
    disciplines: "1",
    oldest: "112 d",
    blocker: "Instrumentation / INSTRUMENT TAG",
  },
  {
    id: "78B02-538-PR-0100",
    holds: "4",
    disciplines: "1",
    oldest: "9 d",
    blocker: "Vendor / DATA SHEET",
  },
  {
    id: "78B02-538-CW-2207",
    holds: "1",
    disciplines: "1",
    oldest: "3 d",
    blocker: "Tie-in / T104-R220",
  },
];

const lineColumns: DataTableColumn<Line>[] = [
  { id: "id", header: "Line ID", kind: "identifier", isRowHeader: true, cell: (line) => line.id },
  { id: "holds", header: "Holds", kind: "number", allowsSorting: true, cell: (line) => line.holds },
  {
    id: "disciplines",
    header: "Disciplines",
    kind: "number",
    allowsSorting: true,
    cell: (line) => line.disciplines,
  },
  {
    id: "oldest",
    header: "Oldest",
    kind: "number",
    allowsSorting: true,
    cell: (line) => line.oldest,
  },
  { id: "blocker", header: "First blocker", isSupporting: true, cell: (line) => line.blocker },
];

function Tables() {
  const [selected, setSelected] = useState<string | null>("78B01-573-4386-FW-001");
  const [sort, setSort] = useState({
    column: "oldest",
    direction: "descending" as "ascending" | "descending",
  });
  return (
    <Section
      title="Table"
      note="Row 2 is selected, row 3 hovered, row 5 has keyboard focus (forced). Line IDs are monospace; numbers are right-aligned on tabular figures. The table is real: arrow keys move, Enter selects, headers sort."
    >
      <h3 className={styles.subTitle}>At the density of the page</h3>
      <Forced state="hovered" target="tbody tr:nth-of-type(3)">
        <Forced state="focus-visible" target="tbody tr:nth-of-type(5)">
          <DataTable
            aria-label="Lines on hold"
            columns={lineColumns}
            rows={lines}
            rowKey={(line) => line.id}
            selectedKey={selected}
            onSelectionChange={setSelected}
            sort={sort}
            onSortChange={setSort}
          />
        </Forced>
      </Forced>
      <h3 className={styles.subTitle}>
        Compact, by the table&apos;s own density, with row actions
      </h3>
      <DataTable
        aria-label="Lines on hold, compact"
        columns={lineColumns}
        rows={lines.slice(0, 4)}
        rowKey={(line) => line.id}
        density="compact"
        rowActions={() => <Button variant="quiet">Show holds</Button>}
      />
      <h3 className={styles.subTitle}>Scrolled: the header stays, with its shadow</h3>
      <ScrolledTable />
      <h3 className={styles.subTitle}>First load: skeleton rows</h3>
      <DataTable
        aria-label="Lines on hold, loading"
        columns={lineColumns}
        rows={[]}
        rowKey={(line) => line.id}
        isLoading
        skeletonRows={4}
      />
      <h3 className={styles.subTitle}>Refetch: the previous rows, dimmed</h3>
      <DataTable
        aria-label="Lines on hold, refetching"
        columns={lineColumns}
        rows={lines.slice(0, 3)}
        rowKey={(line) => line.id}
        isStale
      />
      <h3 className={styles.subTitle}>Empty: the empty state under the header row</h3>
      <DataTable
        aria-label="Lines on hold, filtered to nothing"
        columns={lineColumns}
        rows={[]}
        rowKey={(line) => line.id}
        emptyState={
          <EmptyState
            title="No holds match these filters"
            placement="table"
            action={<Button>Clear all</Button>}
          >
            3 filters are active and together they hide every hold in this snapshot. Remove a
            filter, or clear them all.
          </EmptyState>
        }
      />
    </Section>
  );
}

/** A table in a box shorter than its rows, scrolled a little so the sticky header shows. */
function ScrolledTable() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = box.current?.firstElementChild;
    const table = scroller?.querySelector("table");
    if (!scroller || !table) return;
    // The rows arrive after the first render, so the scroll waits until there is something to scroll.
    const sizes = new ResizeObserver(() => {
      if (scroller.scrollHeight <= scroller.clientHeight) return;
      scroller.scrollTop = scroller.scrollHeight / 4;
      sizes.disconnect();
    });
    sizes.observe(table);
    return () => {
      sizes.disconnect();
    };
  }, []);
  return (
    <div ref={box} className={styles.scrollBox}>
      <DataTable
        aria-label="Lines on hold, scrolled"
        columns={lineColumns}
        rows={lines}
        rowKey={(line) => line.id}
      />
    </div>
  );
}

function TabsDemo() {
  return (
    <Section
      title="Tabs"
      note="The indicator is moved and scaled to the selected tab by a transform. Hold type is hovered and Role has focus (forced); Blocker type is disabled."
    >
      <Forced state="hovered" target='[role="tab"]:nth-of-type(2)'>
        <Forced state="focus-visible" target='[role="tab"]:nth-of-type(3)'>
          <Tabs defaultSelectedKey="discipline">
            <TabList aria-label="Breakdown">
              <Tab id="discipline">Discipline</Tab>
              <Tab id="type">Hold type</Tab>
              <Tab id="role">Role</Tab>
              <Tab id="blocker" isDisabled>
                Blocker type
              </Tab>
              <Tab id="age">Age band</Tab>
            </TabList>
            <TabPanel id="discipline">Holds by discipline</TabPanel>
            <TabPanel id="type">Holds by hold type</TabPanel>
            <TabPanel id="role">Holds by role</TabPanel>
            <TabPanel id="blocker">Holds by blocker type</TabPanel>
            <TabPanel id="age">Holds by age band</TabPanel>
          </Tabs>
        </Forced>
      </Forced>
    </Section>
  );
}

function Tiles() {
  return (
    <Section
      title="Stat tile"
      note="Cells of one container, divided by hairlines. The second is hovered, the third has focus (forced), the fourth is loading. Below: changes since the previous snapshot, and a figure the snapshot cannot give."
    >
      <Forced state="hovered" target="button:nth-of-type(2)">
        <Forced state="focus-visible" target="button:nth-of-type(3)">
          <StatTileGroup aria-label="Open holds in this snapshot">
            <StatTile label="Open holds" value="5,042" onPress={() => undefined} />
            <StatTile label="Lines on hold" value="3,611" onPress={() => undefined} />
            <StatTile label="Single-hold lines" value="1,274" onPress={() => undefined} />
            <StatTile label="Median age" isLoading />
          </StatTileGroup>
        </Forced>
      </Forced>
      <div className={styles.gap} />
      <Forced state="pressed" target="button:nth-of-type(2)">
        <StatTileGroup aria-label="Open holds, compared with the previous snapshot">
          <StatTile
            label="Open holds"
            value="5,042"
            delta={{ direction: "down", change: "-118", caption: "since previous snapshot" }}
            onPress={() => undefined}
          />
          <StatTile
            label="Lines on hold (pressed)"
            value="3,611"
            delta={{ direction: "up", change: "+24", caption: "since previous snapshot" }}
            onPress={() => undefined}
          />
          <StatTile
            label="Single-hold lines"
            value="1,274"
            delta={{ direction: "none", change: "0", caption: "since previous snapshot" }}
          />
          <StatTile label="Median age" unavailable="The export has no created date column." />
        </StatTileGroup>
      </Forced>
    </Section>
  );
}

function Bars() {
  const [picked, setPicked] = useState("Process");
  return (
    <Section
      title="Bar row"
      note="Plain data is neutral gray. Piping is hovered, Instrumentation pressed, Structural has focus (forced). The row in the active filter takes the teal tint and the strongest neutral bar; press a row to move the filter."
    >
      <h3 className={styles.subTitle}>Holds by discipline</h3>
      <Forced state="hovered" target="button:nth-of-type(2)">
        <Forced state="pressed" target="button:nth-of-type(4)">
          <Forced state="focus-visible" target="button:nth-of-type(5)">
            <BarRowGroup aria-label="Holds by discipline">
              {(
                [
                  ["Civil", "1,515", "612 lines", 1],
                  ["Piping", "1,285", "540 lines", 0.848],
                  ["Process", "846", "398 lines", 0.558],
                  ["Instrumentation", "512", "301 lines", 0.338],
                  ["Structural", "377", "190 lines", 0.249],
                  ["Unspecified", "241", "166 lines", 0.159],
                ] as const
              ).map(([label, value, second, fraction]) => (
                <BarRow
                  key={label}
                  label={label}
                  value={value}
                  secondaryValue={second}
                  fraction={fraction}
                  isSelected={picked === label}
                  onPress={() => {
                    setPicked(label);
                  }}
                />
              ))}
            </BarRowGroup>
          </Forced>
        </Forced>
      </Forced>
      <h3 className={styles.subTitle}>
        Holds by age band: the one group with a color, in band order
      </h3>
      <Forced state="hovered" target="button:nth-of-type(2)">
        <BarRowGroup aria-label="Holds by age band">
          <BarRow label="0 to 13 days" value="412" fraction={0.31} ordinalStep={1} />
          <BarRow label="14 to 29 days" value="688" fraction={0.52} ordinalStep={2} />
          <BarRow label="30 to 59 days" value="1,322" fraction={1} ordinalStep={3} />
          <BarRow label="60 to 89 days" value="1,010" fraction={0.76} ordinalStep={4} isSelected />
          <BarRow label="90 days and over" value="610" fraction={0.46} ordinalStep={5} />
        </BarRowGroup>
      </Forced>
      <h3 className={styles.subTitle}>First load, and a refetch</h3>
      <div className={styles.twoColumns}>
        <BarRowGroup aria-label="Holds by hold type, loading" isLoading skeletonRows={4} />
        <BarRowGroup aria-label="Holds by hold type, refetching" isStale>
          <BarRow label="Design" value="2,410" fraction={1} />
          <BarRow label="Vendor" value="1,102" fraction={0.457} />
          <BarRow label="Site" value="640" fraction={0.266} />
        </BarRowGroup>
      </div>
    </Section>
  );
}

function Notices() {
  return (
    <Section
      title="Notice"
      note="A tint, a full hairline border, an icon, and words. No stripe on one side. Danger is announced at once, the others politely."
    >
      <div className={styles.stack}>
        <Notice
          tone="info"
          title="You are viewing the snapshot of 30 Sep 2026."
          actions={<Button variant="quiet">Show newest</Button>}
        >
          Numbers show the holds as they stood then.
        </Notice>
        <Notice tone="success" title="Snapshot imported." onDismiss={() => undefined}>
          9,241 holds on 3,611 lines, dated 7 Oct 2026.
        </Notice>
        <Notice
          tone="warning"
          title="12 rows were skipped."
          actions={<Button variant="quiet">Show rows</Button>}
          onDismiss={() => undefined}
        >
          Their line ID is blank. The rows are listed below with their row numbers.
        </Notice>
        <Notice
          tone="danger"
          title="The file could not be read."
          actions={<Button variant="quiet">Try again</Button>}
        >
          It is open in another program. Close it there, then import again.
        </Notice>
        <Notice tone="info">A notice without a title: an update is available.</Notice>
      </div>
    </Section>
  );
}

function ShowToast() {
  const toast = useToast();
  return (
    <>
      <Button
        onPress={() => {
          toast.show({
            message: "Snapshot of 30 Sep 2026 deleted.",
            action: { label: "Undo", onAction: () => undefined },
          });
        }}
      >
        Show a toast with Undo
      </Button>
      <Button
        onPress={() => {
          toast.show({ message: "Snapshot imported into Unit 573 piping.", tone: "success" });
        }}
      >
        Show a success toast
      </Button>
    </>
  );
}

function Toasts() {
  return (
    <Section
      title="Toast and tooltip"
      note="A toast floats at the bottom left of the content area, carries Undo, and leaves after eight seconds unless it is hovered or focused. The stills below are the same component, laid out in the page. Ctrl+Z triggers the newest Undo."
    >
      <div className={styles.stage}>
        <Toast
          message="Snapshot of 30 Sep 2026 deleted."
          action={{ label: "Undo", onAction: () => undefined }}
          onDismiss={() => undefined}
        />
        <Toast
          message="Snapshot imported into Unit 573 piping."
          tone="success"
          onDismiss={() => undefined}
        />
        <Forced state="hovered" target="button">
          <Toast
            message="Workspace renamed to Unit 573 piping."
            action={{ label: "Undo", onAction: () => undefined }}
            onDismiss={() => undefined}
          />
        </Forced>
      </div>
      <Row label="real">
        <ShowToast />
      </Row>
      <h3 className={styles.subTitle}>Tooltip</h3>
      <Row>
        <Specimen name="Still: a label">
          <div className={tooltipStyles.tooltip}>
            <span>Dismiss</span>
          </div>
        </Specimen>
        <Specimen name="Still: a label and a shortcut">
          <div className={tooltipStyles.tooltip}>
            <span>Import a holds export</span>
            <kbd className={tooltipStyles.shortcut}>Ctrl+I</kbd>
          </div>
        </Specimen>
        <Specimen name="Still: long text wraps">
          <div className={tooltipStyles.tooltip}>
            <span>
              Instrumentation / INSTRUMENT TAG 577-FT-4401A to be confirmed by vendor data sheet
            </span>
          </div>
        </Specimen>
        <Specimen name="Real: rest the pointer, or focus">
          <Tooltip text="Import a holds export" shortcut="Ctrl+I">
            <Button>Import</Button>
          </Tooltip>
        </Specimen>
      </Row>
    </Section>
  );
}

function Skeletons() {
  return (
    <Section
      title="Skeleton"
      note="Still blocks in the shape of what they stand for: a line of text, a stat value, a bar. No shimmer, no pulse."
    >
      <Row>
        <Specimen name="Text line, 21 characters">
          <Skeleton width="21ch" />
        </Specimen>
        <Specimen name="Stat value">
          <Skeleton variant="stat" />
        </Specimen>
        <Specimen name="Bar, 60 percent" wide>
          <Skeleton variant="bar" width="60%" />
        </Specimen>
      </Row>
    </Section>
  );
}

function Pages() {
  return (
    <Section
      title="Page header, breadcrumb, and empty state"
      note="One page title, an optional description, and actions level with the title. A page below a destination carries a breadcrumb above its title; a destination carries none. An empty state says what is absent, why, and offers one action."
    >
      <h3 className={styles.subTitle}>A destination: no breadcrumb</h3>
      <div className={styles.page}>
        <PageHeader title="Blockers" />
        <EmptyState title="Not available in this version" action={<Button>Go to Overview</Button>}>
          Blockers will list what each hold waits for, with the lines it keeps on hold, so you can
          see which blocker frees the most lines when it is solved.
        </EmptyState>
      </div>
      <h3 className={styles.subTitle}>A page below a destination: one ancestor</h3>
      <div className={styles.page}>
        <PageHeader
          title="Map columns"
          description="Choose the column of the file that holds each field."
          breadcrumb={{ ancestors: [{ label: "Import", onPress: () => undefined }] }}
          actions={
            <>
              <Button>Cancel</Button>
              <Button variant="primary">Continue</Button>
            </>
          }
        />
      </div>
      <h3 className={styles.subTitle}>
        Link states: hover, pressed, and focus (forced), then the current page
      </h3>
      <div className={styles.page}>
        <Forced state="hovered" target="li:nth-of-type(1) [role=link], li:nth-of-type(1) a">
          <Forced state="pressed" target="li:nth-of-type(2) [role=link], li:nth-of-type(2) a">
            <Forced
              state="focus-visible"
              target="li:nth-of-type(3) [role=link], li:nth-of-type(3) a"
            >
              <PageHeader
                title="Review import"
                breadcrumb={{
                  ancestors: [
                    { label: "Import", onPress: () => undefined },
                    { label: "Choose sheet", onPress: () => undefined },
                    { label: "Map columns", onPress: () => undefined },
                  ],
                  current: "Review",
                }}
              />
            </Forced>
          </Forced>
        </Forced>
      </div>
      <h3 className={styles.subTitle}>
        A long trail in a narrow container: the ancestors are cut, the current page is not
      </h3>
      <div className={styles.narrowPage}>
        <PageHeader
          title="Map columns"
          breadcrumb={{
            ancestors: [
              { label: "Import a holds export from the piping system", onPress: () => undefined },
              { label: "Holds_2026-10-07_unit-573_revision-B.xlsx", onPress: () => undefined },
            ],
            current: "Map the columns of the file",
          }}
        />
      </div>
      <h3 className={styles.subTitle}>
        Narrower than the current page alone: now the current page is cut as well
      </h3>
      <div className={styles.narrowestPage}>
        <PageHeader
          title="Map columns"
          breadcrumb={{
            ancestors: [
              { label: "Import a holds export from the piping system", onPress: () => undefined },
            ],
            current: "Map the columns of the file to the fields of a hold",
          }}
        />
      </div>
    </Section>
  );
}

const dropTexts = {
  title: "Import a holds export",
  text: "Drop the spreadsheet here, or choose it.",
  chooseLabel: "Choose file",
  fileTypes: "xlsx, xlsm, xlsb, xls, ods, csv, tsv, txt",
  onChoose: () => undefined,
};

function Drops() {
  return (
    <Section
      title="Drop zone and progress"
      note="At rest, hovered (forced: the border and the sentence change, never the fill), with a file over it, while an import runs, and in error."
    >
      <div className={styles.dropGrid}>
        <DropZone {...dropTexts} />
        <Forced state="hovered" target='[role="group"]'>
          <DropZone {...dropTexts} />
        </Forced>
        <DropZone
          {...dropTexts}
          active={{ title: "Drop to import", text: "Holds_2026-10-07.xlsx" }}
        />
        <DropZone
          {...dropTexts}
          progress={<Progress label="Reading rows, 4,200 of 9,300" value={0.45} />}
        />
        <DropZone
          {...dropTexts}
          error={
            <Notice tone="danger" title="The file could not be read.">
              It is open in another program. Close it there, then import again.
            </Notice>
          }
        />
      </div>
      <h3 className={styles.subTitle}>Progress</h3>
      <div className={styles.stack}>
        <Progress label="Reading rows, 4,200 of 9,300" value={0.45} />
        <Progress label="Reading the file" />
      </div>
    </Section>
  );
}

function Errors() {
  const error = {
    kind: "NewerSchema",
    message:
      "This workspace was written by a newer version of Hold Explorer, so this version cannot read it. The file was not changed. Install the newer version to open it.",
  };
  return (
    <Section
      title="Error state"
      note="What a screen shows in place of content that failed to load: the command's own message, unchanged, under a heading, with a retry action when there is one."
    >
      <div className={styles.stack}>
        <ErrorState
          error={error}
          title="The workspace could not be opened"
          onRetry={() => undefined}
        />
        <ErrorState error={error} onRetry={() => undefined} isRetrying />
        <ErrorState error={{ kind: "Internal", message: error.message }} />
      </div>
    </Section>
  );
}

function Hidden() {
  return (
    <Section
      title="Visually hidden"
      note="Text for assistive technology that takes no room. The paragraph below ends with a hidden sentence."
    >
      <p>
        8 rows.
        <VisuallyHidden> Sorted by oldest hold, descending.</VisuallyHidden>
      </p>
    </Section>
  );
}

/** One theme, as a page of its own. */
function Page({ theme }: { theme: ThemeName }) {
  useEffect(() => {
    applyTheme(theme === "light" ? "Light" : "Dark");
    document.documentElement.dataset.density = density;
  }, [theme]);
  return (
    <I18nProvider locale={locale}>
      <ToastRegion>
        <main className={styles.frame}>
          <header className={styles.frameHead}>
            <h1 className={styles.frameTitle}>{theme === "light" ? "Light" : "Dark"}</h1>
            <span className={styles.caption}>{density}</span>
          </header>
          <Buttons />
          <Fields />
          <Selects />
          <Checkboxes />
          <Tables />
          <TabsDemo />
          <Tiles />
          <Bars />
          <Notices />
          <Toasts />
          <Skeletons />
          <Pages />
          <Drops />
          <Errors />
          <Hidden />
        </main>
      </ToastRegion>
    </I18nProvider>
  );
}

function address(theme: ThemeName, at: Density): string {
  return `gallery.html?frame=1&theme=${theme}&density=${at}`;
}

/** A theme in a frame of its own, as tall as its content. A theme belongs to a whole document. */
function Frame({ theme, at }: { theme: ThemeName; at: Density }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let sizes: ResizeObserver | null = null;
    const fit = () => {
      const page = element.contentDocument?.documentElement;
      if (page) element.style.blockSize = `${String(page.scrollHeight)}px`;
    };
    const watch = () => {
      const body = element.contentDocument?.body;
      if (!body) return;
      sizes?.disconnect();
      sizes = new ResizeObserver(fit);
      sizes.observe(body);
      fit();
    };
    element.addEventListener("load", watch);
    watch();
    return () => {
      element.removeEventListener("load", watch);
      sizes?.disconnect();
    };
  }, []);
  return (
    <iframe
      ref={frame}
      title={`Components, ${theme} theme`}
      src={address(theme, at)}
      className={styles.iframe}
    />
  );
}

/** Both themes side by side, with the density switch. */
function Shell() {
  const [at, setAt] = useState<Density>(density);
  const [view, setView] = useState<"both" | ThemeName>(() => {
    const asked = params.get("theme");
    return asked === "dark" || asked === "light" ? asked : "both";
  });
  useEffect(() => {
    applyTheme("Dark");
    const next = new URLSearchParams({ theme: view, density: at });
    window.history.replaceState(null, "", `?${next.toString()}`);
  }, [at, view]);
  const themes: readonly ThemeName[] = view === "both" ? ["dark", "light"] : [view];
  return (
    <I18nProvider locale={locale}>
      <div className={styles.shell}>
        <header className={styles.shellHead}>
          <h1 className={styles.shellTitle}>Component gallery</h1>
          <div className={styles.switches}>
            <Select
              label="Theme"
              options={[
                { id: "both", label: "Both, side by side" },
                { id: "dark", label: "Dark" },
                { id: "light", label: "Light" },
              ]}
              selectedKey={view}
              onSelectionChange={(id) => {
                setView(id === "dark" || id === "light" ? id : "both");
              }}
            />
            <Select
              label="Density"
              options={[
                { id: "comfortable", label: "Comfortable" },
                { id: "compact", label: "Compact" },
              ]}
              selectedKey={at}
              onSelectionChange={(id) => {
                setAt(id === "compact" ? "compact" : "comfortable");
              }}
            />
          </div>
        </header>
        <div className={styles.frames}>
          {themes.map((theme) => (
            <Frame key={`${theme}-${at}`} theme={theme} at={at} />
          ))}
        </div>
      </div>
    </I18nProvider>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("The page has no element with the id root, so the gallery cannot start.");
}
const framed = params.get("frame") !== null;
createRoot(container).render(
  <StrictMode>
    {framed ? <Page theme={params.get("theme") === "light" ? "light" : "dark"} /> : <Shell />}
  </StrictMode>,
);
