// The component gallery: every base component in every variant and state, for looking at.
// Development only. It is served by `pnpm dev` at /gallery.html and is not part of the build.
//
//   /gallery.html                              both themes side by side, with a density switch
//   /gallery.html?frame=1&theme=light          one theme alone, as a page of its own
//   /gallery.html?frame=1&theme=dark&density=compact
//   /gallery.html?view=table&theme=dark            the table with 30,000 lines, as a page
import {
  Check,
  ChevronDown,
  CircleCheck,
  Download,
  Info,
  OctagonAlert,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { StrictMode, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "react-aria-components";
import "../text/i18n";
import "../design/fonts.css";
import "../design/tokens.css";
import "../app.css";
import {
  AddFilterChip,
  BarRow,
  BarRowGroup,
  Button,
  ChartViewToggle,
  Checkbox,
  ChoiceGroup,
  DataTable,
  Disclosure,
  DisclosureGroup,
  DisclosureStatement,
  DropZone,
  EmptyState,
  ErrorState,
  FactList,
  FilterChip,
  Heatmap,
  Icon,
  IconButton,
  LineChart,
  MenuButton,
  MenuItem,
  MenuSection,
  MenuSeparator,
  MenuSubmenu,
  Notice,
  OptionList,
  PageHeader,
  Popover,
  Progress,
  SectionTitle,
  Select,
  Skeleton,
  StatTile,
  StatTileGroup,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  TextField,
  ToastRegion,
  Tooltip,
  useToast,
  VisuallyHidden,
  type ButtonVariant,
  type ChartView,
  type DataTableColumn,
  type LinePoint,
} from "../components";
import menuStyles from "../components/Menu/Menu.module.css";
import popoverStyles from "../components/Popover/Popover.module.css";
import selectStyles from "../components/Select/Select.module.css";
import { Toast } from "../components/ToastRegion/ToastRegion";
import tooltipStyles from "../components/Tooltip/Tooltip.module.css";
import { applyTheme } from "../design/theme";
import { formatCount } from "../text/format";
import { locale } from "../text/i18n";
import styles from "./gallery.module.css";
import { TablePage } from "./table";

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
            <Button variant={variant} reservesPendingSpace isPending>
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
          <Specimen name="Waiting for another control">
            <Button variant={variant} reservesPendingSpace isPending={false} isInert>
              Import
            </Button>
          </Specimen>
        </Row>
      ))}
      <Row label="pending keeps the width">
        <PendingToggle />
      </Row>
      <Row label="room for the spinner">
        <Specimen name="Asked for: wider at rest">
          <Button reservesPendingSpace>Import</Button>
        </Specimen>
        <Specimen name="Asked for, pending: the same width">
          <Button reservesPendingSpace isPending>
            Import
          </Button>
        </Specimen>
        <Specimen name="Not asked for: as wide as its label">
          <Button>Import</Button>
        </Specimen>
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
        <Button variant="primary" reservesPendingSpace isPending={pending}>
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

function Menus() {
  return (
    <Section
      title="Menu"
      note="A quiet button with a chevron that opens a list of actions or of choices. The first two open, the second as the Export menu of the Overview with a submenu for each chart action; the open menu is a still copy made from the same styles: a section that holds a choice, a highlighted item, a separator, an action, and a disabled item."
    >
      <Row>
        <Specimen name="Real: open it">
          <MenuButton label="Unit 573 piping" menuLabel="Workspace">
            <MenuSection title="Workspaces" selectedKey="unit" onSelectionChange={() => undefined}>
              <MenuItem id="unit" detail="3 snapshots">
                Unit 573 piping
              </MenuItem>
              <MenuItem id="tank" detail="1 snapshot">
                Tank farm
              </MenuItem>
            </MenuSection>
            <MenuSeparator />
            <MenuItem id="rename">Rename</MenuItem>
            <MenuItem id="folder" isDisabled>
              Show in folder
            </MenuItem>
          </MenuButton>
        </Specimen>
        <Specimen name="Real: the Export menu of the Overview, with its submenus">
          <MenuButton label="Export" menuLabel="Export" align="end">
            <MenuItem id="excel">Excel, this view…</MenuItem>
            <MenuItem id="workbook">Full workbook…</MenuItem>
            <MenuItem id="report">Status report (PDF)…</MenuItem>
            <MenuSeparator />
            {(
              [
                ["png", "Chart as PNG", "…"],
                ["svg", "Chart as SVG", "…"],
                ["copy", "Copy chart", ""],
              ] as const
            ).map(([id, label, ellipsis]) => (
              <MenuSubmenu key={id} id={id} label={label}>
                {[
                  "Open holds by discipline",
                  "Open holds by hold type",
                  "Open holds by role",
                  "Top blockers",
                ].map((chart) => (
                  <MenuItem key={chart} id={`${id}-${chart}`}>
                    {`${chart}${ellipsis}`}
                  </MenuItem>
                ))}
              </MenuSubmenu>
            ))}
          </MenuButton>
        </Specimen>
        <Specimen name="Hover">
          <Forced state="hovered">
            <MenuButton label="Unit 573 piping" menuLabel="Workspace">
              <MenuItem id="rename">Rename</MenuItem>
            </MenuButton>
          </Forced>
        </Specimen>
        <Specimen name="Focus">
          <Forced state="focus-visible">
            <MenuButton label="Unit 573 piping" menuLabel="Workspace">
              <MenuItem id="rename">Rename</MenuItem>
            </MenuButton>
          </Forced>
        </Specimen>
        <Specimen name="Loading">
          <MenuButton label="Snapshot 7 Oct 2026" menuLabel="Snapshot" isPending>
            <MenuItem id="a">7 Oct 2026</MenuItem>
          </MenuButton>
        </Specimen>
        <Specimen name="Waiting for another control">
          <MenuButton label="Snapshot 7 Oct 2026" menuLabel="Snapshot" isInert>
            <MenuItem id="a">7 Oct 2026</MenuItem>
          </MenuButton>
        </Specimen>
        <Specimen name="Open (still)">
          <div>
            <div className={menuStyles.trigger} aria-expanded="true">
              <span className={menuStyles.triggerLabel}>Unit 573 piping</span>
              <Icon icon={ChevronDown} className={menuStyles.chevron ?? ""} />
            </div>
            <div className={styles.gapSmall} />
            <div
              className={menuStyles.popover}
              style={{ "--trigger-width": "100%" } as CSSProperties}
            >
              <div className={menuStyles.menu}>
                <div className={menuStyles.section}>
                  <div className={menuStyles.sectionTitle}>Workspaces</div>
                  <div
                    className={menuStyles.item}
                    role="menuitemradio"
                    aria-checked="true"
                    data-selected="true"
                  >
                    <span className={menuStyles.itemLabel}>Unit 573 piping</span>
                    <span className={menuStyles.detail}>3 snapshots</span>
                    <Icon icon={Check} className={menuStyles.check ?? ""} />
                  </div>
                  <div
                    className={menuStyles.item}
                    role="menuitemradio"
                    aria-checked="false"
                    data-focused="true"
                  >
                    <span className={menuStyles.itemLabel}>Tank farm</span>
                    <span className={menuStyles.detail}>1 snapshot</span>
                  </div>
                </div>
                <div className={menuStyles.separator} />
                <div className={menuStyles.item} data-focus-visible="true">
                  <span className={menuStyles.itemLabel}>Rename</span>
                </div>
                <div className={menuStyles.item} data-disabled="true">
                  <span className={menuStyles.itemLabel}>Show in folder</span>
                </div>
              </div>
            </div>
          </div>
        </Specimen>
      </Row>
    </Section>
  );
}

const matches = [
  { value: "is", label: "Is" },
  { value: "is-not", label: "Is not" },
];

const targets = [
  {
    value: "keep",
    label: "Keep both",
    description: "The workspace then has two snapshots of 14 Oct 2026.",
  },
  {
    value: "replace",
    label: "Replace the snapshot of 08:00",
    description: "Its holds are removed. This cannot be undone.",
  },
  { value: "other", label: "Import into another workspace" },
];

function Choices() {
  const [match, setMatch] = useState("is");
  const [target, setTarget] = useState("keep");
  const still = () => undefined;
  return (
    <Section
      title="Choice group"
      note="One choice out of a few that are all worth seeing. The first two are real: Tab reaches the chosen option, the arrow keys move the choice. Then hover, pressed, and focus (forced) on an unchosen and on a chosen option, and the disabled group."
    >
      <div className={styles.twoColumns}>
        <ChoiceGroup
          label="Snapshots of the same day"
          value={target}
          onChange={setTarget}
          options={targets}
        />
        <ChoiceGroup
          label="Holds whose discipline"
          orientation="horizontal"
          value={match}
          onChange={setMatch}
          options={matches}
        />
      </div>
      <Row>
        <Specimen name="Hover, unchosen">
          <Forced state="hovered" target="label:nth-of-type(1)">
            <ChoiceGroup
              label="Match"
              value="x"
              onChange={still}
              options={[{ value: "is", label: "Is" }]}
            />
          </Forced>
        </Specimen>
        <Specimen name="Pressed, unchosen">
          <Forced state="pressed" target="label:nth-of-type(1)">
            <ChoiceGroup
              label="Match"
              value="x"
              onChange={still}
              options={[{ value: "is", label: "Is" }]}
            />
          </Forced>
        </Specimen>
        <Specimen name="Chosen">
          <ChoiceGroup
            label="Match"
            value="is"
            onChange={still}
            options={[{ value: "is", label: "Is" }]}
          />
        </Specimen>
        <Specimen name="Hover, chosen">
          <Forced state="hovered" target="label:nth-of-type(1)">
            <ChoiceGroup
              label="Match"
              value="is"
              onChange={still}
              options={[{ value: "is", label: "Is" }]}
            />
          </Forced>
        </Specimen>
        <Specimen name="Pressed, chosen">
          <Forced state="pressed" target="label:nth-of-type(1)">
            <ChoiceGroup
              label="Match"
              value="is"
              onChange={still}
              options={[{ value: "is", label: "Is" }]}
            />
          </Forced>
        </Specimen>
        <Specimen name="Focus">
          <Forced state="focus-visible" target="label:nth-of-type(1)">
            <ChoiceGroup
              label="Match"
              value="is"
              onChange={still}
              options={[{ value: "is", label: "Is" }]}
            />
          </Forced>
        </Specimen>
        <Specimen name="Disabled">
          <ChoiceGroup
            label="Match"
            orientation="horizontal"
            value="is"
            onChange={still}
            options={matches}
            isDisabled
          />
        </Specimen>
      </Row>
    </Section>
  );
}

function Tags() {
  return (
    <Section
      title="Tag"
      note="A small label on a row or an item. Neutral for a plain fact; a state tone always with its icon. It is not interactive and has no states."
    >
      <Row>
        <Specimen name="Neutral">
          <Tag>Soon</Tag>
        </Specimen>
        <Specimen name="Neutral, another fact">
          <Tag>Limited</Tag>
        </Specimen>
        <Specimen name="Neutral, with an icon">
          <Tag icon={Info}>Read now</Tag>
        </Specimen>
        <Specimen name="Info">
          <Tag tone="info" icon={Info}>
            Older snapshot
          </Tag>
        </Specimen>
        <Specimen name="Warning">
          <Tag tone="warning" icon={TriangleAlert}>
            Size mismatch
          </Tag>
        </Specimen>
        <Specimen name="Danger">
          <Tag tone="danger" icon={OctagonAlert}>
            Overdue
          </Tag>
        </Specimen>
        <Specimen name="Success">
          <Tag tone="success" icon={CircleCheck}>
            Released
          </Tag>
        </Specimen>
      </Row>
    </Section>
  );
}

function Chips() {
  const still = () => undefined;
  const [chips, setChips] = useState(["Discipline", "Hold type", "Role"]);
  return (
    <Section
      title="Filter chip"
      note="The only pills: round means a filter that can be removed. A chip is two controls, the filter and its X. Hover, pressed, and focus are forced on the first of them; the row at the end is real: Tab, Backspace or Delete, and the X all work, and the X shows its tooltip."
    >
      <Row label="active filter">
        <Specimen name="Default">
          <FilterChip field="Discipline" value="Civil" onPress={still} onRemove={still} />
        </Specimen>
        <Specimen name="Hover">
          <Forced state="hovered" target="button">
            <FilterChip field="Discipline" value="Civil" onPress={still} onRemove={still} />
          </Forced>
        </Specimen>
        <Specimen name="Pressed, or its picker is open">
          <Forced state="pressed" target="button">
            <FilterChip field="Discipline" value="Civil" onPress={still} onRemove={still} />
          </Forced>
        </Specimen>
        <Specimen name="Focus">
          <Forced state="focus-visible" target="button">
            <FilterChip field="Discipline" value="Civil" onPress={still} onRemove={still} />
          </Forced>
        </Specimen>
        <Specimen name="Is not">
          <FilterChip field="Hold type" value="Vendor" isNegated onPress={still} onRemove={still} />
        </Specimen>
        <Specimen name="Several values">
          <FilterChip field="Discipline" value="Civil +3" onPress={still} onRemove={still} />
        </Specimen>
        <Specimen name="Disabled">
          <FilterChip
            field="Discipline"
            value="Civil"
            isDisabled
            onPress={still}
            onRemove={still}
          />
        </Specimen>
      </Row>
      <Row label="the X">
        <Specimen name="Hover">
          <Forced state="hovered" target="button + button">
            <FilterChip field="Discipline" value="Civil" onPress={still} onRemove={still} />
          </Forced>
        </Specimen>
        <Specimen name="Pressed">
          <Forced state="pressed" target="button + button">
            <FilterChip field="Discipline" value="Civil" onPress={still} onRemove={still} />
          </Forced>
        </Specimen>
        <Specimen name="Hover, while the picker of the chip is open">
          <Forced state="pressed" target="button">
            <Forced state="hovered" target="button + button">
              <FilterChip field="Discipline" value="Civil" onPress={still} onRemove={still} />
            </Forced>
          </Forced>
        </Specimen>
        <Specimen name="Focus">
          <Forced state="focus-visible" target="button + button">
            <FilterChip field="Discipline" value="Civil" onPress={still} onRemove={still} />
          </Forced>
        </Specimen>
      </Row>
      <Row label="a long value">
        <Specimen name="Cut at the end, at the widest a chip gets">
          <FilterChip
            field="Blocker"
            value="Instrumentation / INSTRUMENT TAG 577-FT-4401A to be confirmed by vendor data sheet"
            onPress={still}
            onRemove={still}
          />
        </Specimen>
      </Row>
      <Row label="add filter">
        <Specimen name="Default">
          <AddFilterChip onPress={still} />
        </Specimen>
        <Specimen name="Hover">
          <Forced state="hovered">
            <AddFilterChip onPress={still} />
          </Forced>
        </Specimen>
        <Specimen name="Pressed, or its picker is open">
          <Forced state="pressed">
            <AddFilterChip onPress={still} />
          </Forced>
        </Specimen>
        <Specimen name="Focus">
          <Forced state="focus-visible">
            <AddFilterChip onPress={still} />
          </Forced>
        </Specimen>
        <Specimen name="Disabled">
          <AddFilterChip onPress={still} isDisabled />
        </Specimen>
      </Row>
      <h3 className={styles.subTitle}>A filter bar, real: on the panel surface</h3>
      <div className={styles.filterBar}>
        {chips.map((field) => (
          <FilterChip
            key={field}
            field={field}
            value={field === "Discipline" ? "Civil, Piping" : field === "Role" ? "Lead" : "Vendor"}
            isNegated={field === "Hold type"}
            onPress={still}
            onRemove={() => {
              setChips((current) => current.filter((chip) => chip !== field));
            }}
          />
        ))}
        <AddFilterChip
          onPress={() => {
            setChips(["Discipline", "Hold type", "Role"]);
          }}
        />
        {chips.length === 0 ? null : (
          <Button
            variant="quiet"
            onPress={() => {
              setChips([]);
            }}
          >
            Clear all
          </Button>
        )}
      </div>
      <h3 className={styles.subTitle}>Disabled, with the line that says why</h3>
      <div className={styles.filterBar}>
        <FilterChip
          field="Discipline"
          value="Civil, Piping"
          isDisabled
          onPress={still}
          onRemove={still}
        />
        <FilterChip
          field="Hold type"
          value="Vendor"
          isNegated
          isDisabled
          onPress={still}
          onRemove={still}
        />
        <AddFilterChip onPress={still} isDisabled />
        <span className={styles.caption}>
          Filters can be changed again when the snapshot of 30 Sep 2026 has opened.
        </span>
      </div>
    </Section>
  );
}

const fileFacts = [
  { label: "File", value: "Holds_2026-10-14.xlsx", kind: "identifier" as const },
  {
    label: "Sheet",
    value: "data",
    action: <Button variant="quiet">Choose another sheet</Button>,
  },
  { label: "Project number", value: "No project number in the file", isAbsent: true },
  {
    label: "Remark",
    value:
      "Instrument tag 577-FT-4401A to be confirmed by the vendor data sheet before the line can be issued for construction; see transmittal T-2231.",
  },
];

function Facts() {
  return (
    <Section
      title="Section title and fact list"
      note="A level 2 title heads a section and a level 3 title a part inside it. A fact list rules pairs of a label and a value: an identifier in the monospace, a row with an action, an absent value in words, and a long value that wraps. On a first load the labels show and each value is a still block."
    >
      <div className={styles.twoColumns}>
        <div className={styles.stack}>
          <SectionTitle level={2}>File</SectionTitle>
          <FactList aria-label="File facts" items={fileFacts} />
        </div>
        <div className={styles.stack}>
          <SectionTitle level={3}>Sizes</SectionTitle>
          <FactList
            aria-label="Line sizes, loading"
            isLoading
            items={[
              { label: "Model size", value: "" },
              { label: "LDT size", value: "" },
              { label: "Stress calculation", value: "" },
            ]}
          />
        </div>
      </div>
    </Section>
  );
}

function Disclosures() {
  return (
    <Section
      title="Disclosure row"
      note="A row that opens in place. The group is real: Enter or Space opens and closes a row. A statement stands where there is nothing to open; then a closed row with its count and its summary, a row that starts open, and a row with an action. Below it: hover, pressed, and focus (forced)."
    >
      <div className={styles.stack}>
        <DisclosureGroup>
          <DisclosureStatement>No rows were skipped.</DisclosureStatement>
          <Disclosure
            level={3}
            title="Release dates that cannot be read"
            count="37 times"
            summary="The hold is kept, without a release date."
          >
            <p>Row 612: the release date &quot;soon&quot; could not be read as a date.</p>
          </Disclosure>
          <Disclosure
            level={3}
            title="Cells with a spreadsheet error"
            count="1 time"
            summary="A cell that holds an error such as #N/A was read as blank."
            defaultExpanded
          >
            <p>4 cells hold a spreadsheet error such as #N/A and were read as blank.</p>
            <p className={styles.caption}>Showing 1 of 1.</p>
          </Disclosure>
          <Disclosure
            level={3}
            title="Column mapping"
            action={<Button variant="quiet">Change mapping</Button>}
          >
            <FactList
              aria-label="Columns in use"
              items={[
                { label: "Line ID", value: "line_id" },
                { label: "Hold remark", value: "hold_remark" },
                { label: "Model size", value: "No column", isAbsent: true },
              ]}
            />
          </Disclosure>
        </DisclosureGroup>
        <div className={styles.gap} />
        <DisclosureGroup>
          <Forced state="hovered" target="button">
            <Disclosure title="Hover" count="12 rows">
              The rows
            </Disclosure>
          </Forced>
          <Forced state="pressed" target="button">
            <Disclosure title="Pressed" count="12 rows">
              The rows
            </Disclosure>
          </Forced>
          <Forced state="focus-visible" target="button">
            <Disclosure title="Focus" count="12 rows">
              The rows
            </Disclosure>
          </Forced>
        </DisclosureGroup>
      </div>
    </Section>
  );
}

const disciplineValues = [
  { key: "civil", label: "Civil", count: 1515 },
  { key: "piping", label: "Piping", count: 1285 },
  { key: "process", label: "Process", count: 846 },
  { key: "instrumentation", label: "Instrumentation", count: 512 },
  { key: "structural", label: "Structural", count: 377 },
  { key: "vendor", label: "Vendor", count: 0 },
  {
    key: "long",
    label: "Instrumentation / INSTRUMENT TAG 577-FT-4401A to be confirmed by vendor data sheet",
    count: 12,
  },
  { key: "electrical", label: "Electrical", count: 241 },
  { key: "hvac", label: "HVAC", count: 88 },
  { key: "telecom", label: "Telecom", count: 9 },
];

/** The filter picker as DESIGN.md composes it: a field, a choice in a row, the list, its footer. */
function Picker({ isLoading = false }: { isLoading?: boolean }) {
  const [match, setMatch] = useState("is");
  const [ticked, setTicked] = useState<readonly string[]>(["civil", "vendor"]);
  const [typed, setTyped] = useState("");
  const shown = disciplineValues.filter((value) =>
    value.label.toLowerCase().includes(typed.trim().toLowerCase()),
  );
  return (
    <>
      <TextField
        label="Discipline"
        placeholder="Type to narrow"
        value={typed}
        onChange={setTyped}
      />
      <ChoiceGroup
        label="Keep holds whose discipline"
        orientation="horizontal"
        value={match}
        onChange={setMatch}
        options={matches}
      />
      <OptionList
        aria-label="Discipline values"
        selectionMode="multiple"
        options={shown}
        selectedKeys={ticked}
        onSelectionChange={setTicked}
        isLoading={isLoading}
        emptyText="No value matches."
        footer="3 more values. Type to narrow."
      />
    </>
  );
}

/** A popover drawn in the page: the surface of the real one, without its place over the page. */
function StillPopover({ children }: { children: ReactNode }) {
  return (
    <div className={popoverStyles.popover}>
      <div className={popoverStyles.dialog}>
        <div className={popoverStyles.body}>{children}</div>
      </div>
    </div>
  );
}

function Pickers() {
  const [one, setOne] = useState<readonly string[]>(["yes"]);
  const [size, setSize] = useState<readonly string[]>(["match"]);
  const [several, setSeveral] = useState<readonly string[]>(["civil"]);
  const still = () => undefined;
  return (
    <Section
      title="Popover and option list"
      note="A popover is the surface of a menu for anything that is more than a list. The first is real: it takes the focus into its field, or without one into its first list, Tab stays inside, Escape closes it and gives the focus back. The stills beside it are the same surface drawn in the page. An option list ticks several values or holds one; its mark says which."
    >
      <Row label="real">
        <Specimen name="Opened from Add filter">
          <Popover trigger={<AddFilterChip onPress={still} />} aria-label="Filter by discipline">
            <Picker />
          </Popover>
        </Specimen>
        <Specimen name="Opened from a chip: the X does not open it">
          <Popover
            trigger={
              <FilterChip
                field="Discipline"
                value="Civil, Vendor"
                onPress={still}
                onRemove={still}
              />
            }
            aria-label="Filter by discipline"
          >
            <Picker />
          </Popover>
        </Specimen>
        <Specimen name="Without a field: the popover holds the focus">
          <Popover trigger={<Button>Size mismatch</Button>} aria-label="Filter by size mismatch">
            <ChoiceGroup
              label="Keep holds whose sizes"
              orientation="horizontal"
              value="differ"
              onChange={still}
              options={[
                { value: "differ", label: "Differ" },
                { value: "agree", label: "Agree" },
              ]}
            />
          </Popover>
        </Specimen>
        <Specimen name="Holding a list: the list takes the focus, on its ticked option">
          <Popover trigger={<Button>Model and LDT sizes</Button>} aria-label="Filter by size">
            <OptionList
              aria-label="Model and LDT sizes"
              selectionMode="single"
              options={[
                { key: "differ", label: "Differ", count: 214 },
                { key: "match", label: "Match", count: 4828 },
              ]}
              selectedKeys={size}
              onSelectionChange={setSize}
              emptyText="No value matches."
            />
          </Popover>
        </Specimen>
        <Specimen name="Lined up with the trailing edge">
          <Popover
            trigger={<Button>Filter by text</Button>}
            aria-label="Filter by text"
            placement="bottom end"
          >
            {(close) => (
              <>
                <TextField label="Text in any column" placeholder="577-PR-400" />
                <Button variant="quiet" onPress={close}>
                  Close
                </Button>
              </>
            )}
          </Popover>
        </Specimen>
      </Row>
      <h3 className={styles.subTitle}>
        The filter picker, composed, and the same while its counts are read again
      </h3>
      <div className={styles.pickers}>
        <Forced state="hovered" target='[role="option"]:nth-of-type(3)'>
          <Forced state={["focused", "focus-visible"]} target='[role="option"]:nth-of-type(4)'>
            <StillPopover>
              <Picker />
            </StillPopover>
          </Forced>
        </Forced>
        <StillPopover>
          <Picker isLoading />
        </StillPopover>
      </div>
      <h3 className={styles.subTitle}>
        Option list alone: several values, one value, a first read, and nothing to list
      </h3>
      <div className={styles.pickers}>
        <StillPopover>
          <OptionList
            aria-label="Hold types"
            selectionMode="multiple"
            options={disciplineValues.slice(0, 4)}
            selectedKeys={several}
            onSelectionChange={setSeveral}
            emptyText="No value matches."
          />
        </StillPopover>
        <StillPopover>
          <OptionList
            aria-label="Size mismatch"
            selectionMode="single"
            options={[
              { key: "yes", label: "Yes", count: 214 },
              { key: "no", label: "No", count: 4828 },
            ]}
            selectedKeys={one}
            onSelectionChange={setOne}
            emptyText="No value matches."
          />
        </StillPopover>
        <StillPopover>
          <OptionList
            aria-label="Values, first read"
            selectionMode="multiple"
            options={[]}
            selectedKeys={[]}
            onSelectionChange={still}
            isLoading
            emptyText="No value matches."
          />
        </StillPopover>
        <StillPopover>
          <OptionList
            aria-label="Values, none"
            selectionMode="multiple"
            options={[]}
            selectedKeys={[]}
            onSelectionChange={still}
            emptyText="No value matches. Type less, or clear the field."
          />
        </StillPopover>
      </div>
      <h3 className={styles.subTitle}>
        Pressed: an unticked and a ticked option, each with the pressed step of its mark; and an
        option that would keep nothing, not ticked
      </h3>
      <div className={styles.pickers}>
        <Forced state={["hovered", "pressed"]} target='[role="option"]:nth-of-type(2)'>
          <Forced state={["hovered", "pressed"]} target='[role="option"]:nth-of-type(3)'>
            <StillPopover>
              <OptionList
                aria-label="Disciplines, pressed"
                selectionMode="multiple"
                options={[
                  { key: "civil", label: "Civil", count: 1515 },
                  { key: "piping", label: "Piping, pressed", count: 1285 },
                  { key: "process", label: "Process, ticked and pressed", count: 846 },
                  { key: "vendor", label: "Vendor", count: 0 },
                  { key: "telecom", label: "Telecom, ticked", count: 0 },
                ]}
                selectedKeys={["process", "telecom"]}
                onSelectionChange={still}
                emptyText="No value matches."
              />
            </StillPopover>
          </Forced>
        </Forced>
        <Forced state={["hovered", "pressed"]} target='[role="option"]:nth-of-type(2)'>
          <Forced state={["hovered", "pressed"]} target='[role="option"]:nth-of-type(1)'>
            <StillPopover>
              <OptionList
                aria-label="Size mismatch, pressed"
                selectionMode="single"
                options={[
                  { key: "yes", label: "Yes, chosen and pressed", count: 214 },
                  { key: "no", label: "No, pressed", count: 4828 },
                  { key: "unknown", label: "Not known", count: 0 },
                ]}
                selectedKeys={["yes"]}
                onSelectionChange={still}
                emptyText="No value matches."
              />
            </StillPopover>
          </Forced>
        </Forced>
      </div>
      <h3 className={styles.subTitle}>
        Focus where there is no option to carry it: an empty list and a first read are the stop for
        Tab themselves; and a popover without a field holds the focus itself
      </h3>
      <div className={styles.pickers}>
        <Forced state="focus-visible" target='[role="listbox"]'>
          <StillPopover>
            <OptionList
              aria-label="Values, none, focused"
              selectionMode="multiple"
              options={[]}
              selectedKeys={[]}
              onSelectionChange={still}
              emptyText="No value matches."
            />
          </StillPopover>
        </Forced>
        <Forced state="focus-visible" target='[role="listbox"]'>
          <StillPopover>
            <OptionList
              aria-label="Values, first read, focused"
              selectionMode="multiple"
              options={[]}
              selectedKeys={[]}
              onSelectionChange={still}
              isLoading
              emptyText="No value matches."
            />
          </StillPopover>
        </Forced>
        <Forced state="focus-visible" target={`.${popoverStyles.dialog ?? ""}`}>
          <StillPopover>
            <ChoiceGroup
              label="Keep holds whose sizes"
              orientation="horizontal"
              value="differ"
              onChange={still}
              options={[
                { value: "differ", label: "Differ" },
                { value: "agree", label: "Agree" },
              ]}
            />
          </StillPopover>
        </Forced>
      </div>
      <h3 className={styles.subTitle}>
        On the panel surface, outside an overlay: the hover fill of a row
      </h3>
      <div className={styles.onPanel}>
        <Forced state="hovered" target='[role="option"]:nth-of-type(2)'>
          <OptionList
            aria-label="Age bands"
            selectionMode="multiple"
            options={[
              { key: "a", label: "0 to 13 days", count: 412 },
              { key: "b", label: "14 to 29 days", count: 688 },
              { key: "c", label: "30 to 59 days", count: 1322 },
            ]}
            selectedKeys={["c"]}
            onSelectionChange={still}
            emptyText="No value matches."
          />
        </Forced>
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
  {
    id: "id",
    header: "Line ID",
    kind: "identifier",
    isRowHeader: true,
    size: { chars: 21 },
    cell: (line) => line.id,
  },
  {
    id: "holds",
    header: "Holds",
    kind: "number",
    allowsSorting: true,
    size: { chars: 4 },
    cell: (line) => line.holds,
  },
  {
    id: "disciplines",
    header: "Disciplines",
    kind: "number",
    allowsSorting: true,
    size: { chars: 4 },
    cell: (line) => line.disciplines,
  },
  {
    id: "oldest",
    header: "Oldest",
    kind: "number",
    allowsSorting: true,
    size: { chars: 6 },
    cell: (line) => line.oldest,
  },
  {
    id: "blocker",
    header: "First blocker",
    isSupporting: true,
    size: { flex: 1, minChars: 24 },
    cell: (line) => line.blocker,
  },
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
      note="Row 2 is selected, row 3 hovered, row 5 has keyboard focus (forced). Line IDs are monospace; numbers are right-aligned on tabular figures. The table is real: arrow keys move, Enter selects, headers sort. Only the rows near the visible part are in the document; the table with 30,000 lines is a page of its own, at ?view=table."
    >
      <h3 className={styles.subTitle}>At the density of the page</h3>
      <Forced state="hovered" target='[role="row"][aria-rowindex="4"]'>
        <Forced state="focus-visible" target='[role="row"][aria-rowindex="6"]'>
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
        Several rows selected: the open row has a deeper tint among them, and the count line says
        how many
      </h3>
      <SelectedRowsTable />
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
      <ScrolledTable top />
      <h3 className={styles.subTitle}>
        Narrower than its columns: it scrolls sideways, and the line ID stays with a hairline at its
        edge
      </h3>
      <div className={styles.narrow}>
        <ScrolledTable />
      </div>
      <h3 className={styles.subTitle}>
        A part of a longer result: the count line, and a row of skeletons while more rows load
      </h3>
      <DataTable
        aria-label="Lines on hold, more loading"
        columns={lineColumns}
        rows={lines.slice(0, 4)}
        rowKey={(line) => line.id}
        totalRows={3612}
        countText={(shown, total) => `${formatCount(shown)} of ${formatCount(total)} lines`}
        isLoadingMore
      />
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

/**
 * A table with several rows selected beside the open one. It is real: a press opens a row and
 * selects it alone, Ctrl and a press or Ctrl+Space adds or takes out a row, Shift and a press,
 * Shift+Space, or Shift+Up and Shift+Down select a range, Ctrl+A selects every row, and Esc
 * clears the selection.
 */
function SelectedRowsTable() {
  const [open, setOpen] = useState<string | null>(lines[1]?.id ?? null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set([lines[0], lines[1], lines[3]].flatMap((line) => (line ? [line.id] : []))),
  );
  return (
    <DataTable
      aria-label="Lines on hold, several selected"
      columns={lineColumns}
      rows={lines}
      rowKey={(line) => line.id}
      selectedKey={open}
      onSelectionChange={setOpen}
      selectedKeys={selected}
      onSelectedKeysChange={setSelected}
      totalRows={9312}
      countText={(shown, total) => `${formatCount(shown)} of ${formatCount(total)} lines`}
      selectedText={(count) => `${formatCount(count)} selected`}
      height={{ maxRows: 6 }}
    />
  );
}

/**
 * A table scrolled a little, so what stays in place shows: down (`top`), where the header gains
 * its shadow, or sideways, where the pinned column gains its hairline.
 */
function ScrolledTable({ top = false }: { top?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = box.current?.querySelector('[role="grid"]');
    if (!grid) return;
    // The rows arrive after the first render, so the scroll waits until there is something to scroll.
    const sizes = new ResizeObserver(() => {
      if (top && grid.scrollHeight > grid.clientHeight) grid.scrollTop = grid.scrollHeight / 4;
      else if (!top && grid.scrollWidth > grid.clientWidth) grid.scrollLeft = grid.scrollWidth / 6;
      else return;
      sizes.disconnect();
    });
    sizes.observe(grid);
    return () => {
      sizes.disconnect();
    };
  }, [top]);
  return (
    <div ref={box}>
      <DataTable
        aria-label={top ? "Lines on hold, scrolled" : "Lines on hold, scrolled sideways"}
        columns={lineColumns}
        rows={lines}
        rowKey={(line) => line.id}
        height={{ maxRows: 5 }}
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
      note="Plain data is neutral gray. Piping is hovered, Instrumentation pressed, Structural has focus (forced). The row in the active filter takes the teal tint and the strongest neutral bar; press a row to move the filter. A group is a list to assistive technology, and each row an item of it."
    >
      <h3 className={styles.subTitle}>Holds by discipline</h3>
      <Forced state="hovered" target='[role="listitem"]:nth-of-type(2) button'>
        <Forced state="pressed" target='[role="listitem"]:nth-of-type(4) button'>
          <Forced state="focus-visible" target='[role="listitem"]:nth-of-type(5) button'>
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
      <Forced state="hovered" target='[role="listitem"]:nth-of-type(2) button'>
        <BarRowGroup aria-label="Holds by age band">
          {(
            [
              ["0 to 13 days", "412", 0.31, 1],
              ["14 to 29 days", "688", 0.52, 2],
              ["30 to 59 days", "1,322", 1, 3],
              ["60 to 89 days", "1,010", 0.76, 4],
              ["90 days and over", "610", 0.46, 5],
            ] as const
          ).map(([label, value, fraction, step]) => (
            <BarRow
              key={label}
              label={label}
              value={value}
              fraction={fraction}
              ordinalStep={step}
              isSelected={step === 4}
              onPress={() => undefined}
            />
          ))}
        </BarRowGroup>
      </Forced>
      <h3 className={styles.subTitle}>
        Static: on a screen that cannot filter by a row yet, a row is not a button
      </h3>
      <BarRowGroup aria-label="Holds by hold type, static">
        <BarRow isStatic label="Design" value="2,410" secondaryValue="1,822 lines" fraction={1} />
        <BarRow isStatic label="Vendor" value="1,102" secondaryValue="904 lines" fraction={0.457} />
        <BarRow isStatic label="Site" value="640" secondaryValue="511 lines" fraction={0.266} />
      </BarRowGroup>
      <h3 className={styles.subTitle}>First load, and a refetch</h3>
      <div className={styles.twoColumns}>
        <BarRowGroup aria-label="Holds by hold type, loading" isLoading skeletonRows={4} />
        <BarRowGroup aria-label="Holds by hold type, refetching" isStale>
          <BarRow label="Design" value="2,410" fraction={1} onPress={() => undefined} />
          <BarRow label="Vendor" value="1,102" fraction={0.457} onPress={() => undefined} />
          <BarRow label="Site" value="640" fraction={0.266} onPress={() => undefined} />
        </BarRowGroup>
      </div>
    </Section>
  );
}

// The charts' data: thirty disciplines by thirty hold remarks, some of them long, and the curve
// of a solve order of 2,400 steps. Made up, and the same at every load.
const DISCIPLINES = [
  "Civil",
  "Piping",
  "Process",
  "Instrumentation",
  "Structural",
  "Electrical",
  "Mechanical",
  "Stress",
  "HVAC",
  "Telecom",
  "Safety",
  "Architectural",
  "Geotechnical",
  "Materials",
  "Corrosion",
  "Fire protection",
  "Layout",
  "Vendor coordination",
  "Construction",
  "Commissioning",
  "Operations",
  "Insulation",
  "Painting",
  "Heat tracing",
  "Supports",
  "Pipeline",
  "Subsea",
  "Marine",
  "Utilities",
  "Quality",
].map((label) => ({ key: label, label }));
const REMARKS = Array.from({ length: 30 }, (_, index) => {
  const label =
    index % 4 === 1
      ? `Vendor data for the compressor skid, revision ${String.fromCharCode(65 + (index % 26))}, to be confirmed`
      : `577-PR-${String(400 + index * 7)}`;
  return { key: label, label };
});
const MATRIX = Array.from({ length: 31 }, (_, r) =>
  Array.from({ length: 31 }, (__, c) => {
    const seed = (r * 37 + c * 61 + r * c * 7) % 101;
    if (seed % 5 === 0) return 0;
    return Math.round((seed * seed) / (r + c + 2) / 3);
  }),
);
const MATRIX_MAX = Math.max(...MATRIX.flat());
const SMALL = {
  rows: DISCIPLINES.slice(0, 4),
  cols: REMARKS.slice(0, 5),
  cells: [
    [12, 0, 3, 41, 1],
    [70, 5, 1, 0, 22],
    [2, 9, 40, 18, 0],
    [0, 0, 6, 61, 33],
    [8, 14, 0, 2, 57],
  ],
};
const CURVE: LinePoint[] = Array.from({ length: 2400 }, (_, index) => ({
  x: index + 1,
  y: Math.round(3612 * (1 - Math.exp(-(index + 1) / 420))),
  label: index % 3 === 0 ? `Civil / 577-PR-${String(400 + index)}` : `Vendor data ${String(index)}`,
}));

function heatmapLabels() {
  return {
    rowsLabel: "Discipline",
    colsLabel: "Hold remark",
    valueLabel: "Holds",
    formatCell: formatCount,
  };
}

function ChartsDemo() {
  const [matrixView, setMatrixView] = useState<ChartView>("chart");
  const [curveView, setCurveView] = useState<ChartView>("chart");
  const [step, setStep] = useState<number | null>(119);
  return (
    <Section
      title="Heatmap and line chart"
      note="Cells take the step of their value in the blue ramp; an empty cell is the surface with a hairline. The grid scrolls sideways in its own region with the row labels kept in view. One stop for Tab: arrow keys, Home and End (with Ctrl for the grid). Focus shows the tooltip at once, the pointer after the tooltip delay. Other cells are never pressed. The line chart is one path; a marker shows only at the point under the pointer or the keyboard, and at the selected point."
    >
      <div className={styles.chartHead}>
        <h3 className={styles.subTitle}>Many: 30 by 30 with Other, long labels cut</h3>
        <ChartViewToggle view={matrixView} onChange={setMatrixView} />
      </div>
      <Heatmap
        aria-label="Holds by discipline and hold remark"
        rows={DISCIPLINES}
        cols={REMARKS}
        cells={MATRIX}
        max={MATRIX_MAX}
        otherRow="Other"
        otherCol="Other"
        onCellPress={() => undefined}
        view={matrixView}
        {...heatmapLabels()}
      />
      <h3 className={styles.subTitle}>
        A few, without Other; focus a cell to see its ring and tooltip
      </h3>
      <Heatmap
        aria-label="Holds by discipline and hold remark, few"
        {...SMALL}
        max={70}
        onCellPress={() => undefined}
        {...heatmapLabels()}
      />

      <div className={styles.twoColumns}>
        <div>
          <h3 className={styles.subTitle}>One cell</h3>
          <Heatmap
            aria-label="Holds, one cell"
            rows={DISCIPLINES.slice(0, 1)}
            cols={REMARKS.slice(0, 1)}
            cells={[[4]]}
            max={4}
            {...heatmapLabels()}
          />
        </div>
        <div>
          <h3 className={styles.subTitle}>Table view</h3>
          <Heatmap
            aria-label="Holds by discipline and hold remark, table"
            {...SMALL}
            max={70}
            view="table"
            {...heatmapLabels()}
          />
        </div>
      </div>
      <div className={styles.twoColumns}>
        <div>
          <h3 className={styles.subTitle}>First load</h3>
          <Heatmap
            aria-label="Holds, loading"
            rows={[]}
            cols={[]}
            cells={[]}
            max={0}
            isLoading
            {...heatmapLabels()}
          />
        </div>
        <div>
          <h3 className={styles.subTitle}>Refetch, and empty</h3>
          <Heatmap
            aria-label="Holds, refetching"
            {...SMALL}
            max={70}
            isStale
            {...heatmapLabels()}
          />
          <Heatmap
            aria-label="Holds, empty"
            rows={[]}
            cols={[]}
            cells={[]}
            max={0}
            emptyState={
              <EmptyState
                title="No holds match these filters"
                action={<Button variant="secondary">Clear all</Button>}
              >
                Clear a filter to see holds again.
              </EmptyState>
            }
            {...heatmapLabels()}
          />
        </div>
      </div>
      <div className={styles.chartHead}>
        <h3 className={styles.subTitle}>
          Many: 2,400 points, step {step === null ? "none" : String(step + 1)} selected; press a
          point
        </h3>
        <ChartViewToggle view={curveView} onChange={setCurveView} />
      </div>
      <LineChart
        aria-label="Lines freed by the solve order"
        points={CURVE}
        yMax={3612}
        xLabel="Step"
        yLabel="Lines freed"
        labelName="Blocker"
        formatY={formatCount}
        selectedIndex={step}
        onPointPress={(_, index) => {
          setStep(index);
        }}
        view={curveView}
      />
      <div className={styles.twoColumns}>
        <div>
          <h3 className={styles.subTitle}>Few points</h3>
          <LineChart
            aria-label="Lines freed, few"
            points={CURVE.slice(0, 12).map((point) => ({ ...point, y: point.y * 10 }))}
            yMax={3612}
            xLabel="Step"
            yLabel="Lines freed"
            labelName="Blocker"
            formatY={formatCount}
          />
        </div>
        <div>
          <h3 className={styles.subTitle}>One point</h3>
          <LineChart
            aria-label="Lines freed, one point"
            points={[{ x: 1, y: 14, label: "Civil / 577-PR-400" }]}
            yMax={37}
            xLabel="Step"
            yLabel="Lines freed"
            labelName="Blocker"
            formatY={formatCount}
          />
        </div>
      </div>
      <div className={styles.twoColumns}>
        <div>
          <h3 className={styles.subTitle}>First load</h3>
          <LineChart
            aria-label="Lines freed, loading"
            points={[]}
            yMax={0}
            xLabel="Step"
            yLabel="Lines freed"
            labelName="Blocker"
            formatY={formatCount}
            isLoading
          />
        </div>
        <div>
          <h3 className={styles.subTitle}>Refetch, and table view</h3>
          <LineChart
            aria-label="Lines freed, refetching"
            points={CURVE.slice(0, 12).map((point) => ({ ...point, y: point.y * 10 }))}
            yMax={3612}
            xLabel="Step"
            yLabel="Lines freed"
            labelName="Blocker"
            formatY={formatCount}
            isStale
          />
          <LineChart
            aria-label="Lines freed, few"
            points={CURVE.slice(0, 12)}
            yMax={3612}
            xLabel="Step"
            yLabel="Lines freed"
            labelName="Blocker"
            formatY={formatCount}
            view="table"
          />
        </div>
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
            action: { label: "Undo", onAction: () => undefined, isUndo: true },
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
          <Menus />
          <Checkboxes />
          <Choices />
          <Tables />
          <TabsDemo />
          <Tiles />
          <Bars />
          <ChartsDemo />
          <Notices />
          <Tags />
          <Chips />
          <Pickers />
          <Facts />
          <Disclosures />
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
const asked: ThemeName = params.get("theme") === "light" ? "light" : "dark";

/** The table with a long list, as a page of its own: see ui/src/dev/table.tsx. */
function TableView({ theme }: { theme: ThemeName }) {
  useEffect(() => {
    applyTheme(theme === "light" ? "Light" : "Dark");
    document.documentElement.dataset.density = density;
  }, [theme]);
  return (
    <I18nProvider locale={locale}>
      <TablePage />
    </I18nProvider>
  );
}

createRoot(container).render(
  <StrictMode>
    {params.get("view") === "table" ? (
      <TableView theme={asked} />
    ) : framed ? (
      <Page theme={asked} />
    ) : (
      <Shell />
    )}
  </StrictMode>,
);
