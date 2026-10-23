import { OctagonAlert, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Autocomplete,
  Dialog,
  Header,
  Input,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Modal,
  ModalOverlay,
  Text,
  TextField,
} from "react-aria-components";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { useDensitySetting } from "../../app/actions/density";
import { useWorkspaceFolder } from "../../app/actions/folder";
import { useStart } from "../../app/actions/start";
import { useThemeSetting } from "../../app/actions/theme";
import type { Destination } from "../../app/destinations";
import { useFilters } from "../../app/filters/state";
import { useShell } from "../../app/shell/context";
import { useSnapshotQuery } from "../../app/view";
import type { SearchHit } from "../../bindings/SearchHit";
import type { SearchResults } from "../../bindings/SearchResults";
import { Icon, Skeleton, Tag, VisuallyHidden } from "../../components";
import { cx } from "../../components/cx";
import { formatCount, formatList } from "../../text/format";
import { t, type MessageKey } from "../../text/i18n";
import { startImport } from "../import/start";
import { useSearchChoice } from "../search/choose";
import { MatchedText } from "../search/results";
import { MIN_QUERY_LENGTH, SEND_AFTER_MS } from "../search/SearchField";
import type { ShellProblem } from "../shell/problem";
import { ariaKeyShortcuts, formatShortcut, MODAL_ATTRIBUTE } from "../shell/shortcuts";
import { useSelectSnapshot } from "../shell/SnapshotSelector";
import { usePageExport } from "../shell/topBarSlot";
import { useApplyView } from "../views/apply";
import { openSaveView, useHasSaveView } from "../views/SaveViewPopover";
import { useOpenWorkspace } from "../workspaces/WorkspaceSwitcher";
import { narrow, PALETTE_GROUPS, paletteItems, type PaletteGroup, type PaletteItem } from "./items";
import styles from "./CommandPalette.module.css";

/** How many items chosen last are listed under Recent. */
export const RECENT_COUNT = 5;

/** How many items chosen are kept, of which the first that can run are listed. */
const KEPT_COUNT = 25;

/** How many line IDs the Lines group lists at most: those of one group of the search command. */
const LINE_COUNT = 8;

/** The id of the item that reads the line IDs again after a failure. */
const RETRY_ID = "lines:retry";

/** An item chosen in this session, as it is offered again under Recent. */
interface RecentEntry {
  id: string;
  /** The result of a line, which the search answered once; the fixed items are built anew. */
  hit: SearchHit | null;
  /**
   * The snapshot a line was chosen in, by its workspace and its id: a line is offered again only
   * there, since another snapshot may not have it, or have it with other holds.
   */
  snapshot: { workspace: string; id: number } | null;
}

/** A group of the list as it is drawn: its heading, its items. */
interface Section {
  id: PaletteGroup | "recent";
  heading: string;
  items: readonly PaletteItem[];
}

const HEADING_KEYS: Record<PaletteGroup | "recent", MessageKey> = {
  actions: "palette.group.actions",
  destinations: "palette.group.destinations",
  views: "palette.group.views",
  snapshots: "palette.group.snapshots",
  workspaces: "palette.group.workspaces",
  lines: "palette.group.lines",
  recent: "palette.group.recent",
};

function isSearchable(text: string): boolean {
  return text.trim().length >= MIN_QUERY_LENGTH;
}

/** The item of a line the search found. */
function lineItem(hit: SearchHit, open: (hit: SearchHit) => void): PaletteItem {
  return {
    id: `line:${hit.value}`,
    group: "lines",
    label: hit.value,
    hit,
    run: () => {
      open(hit);
    },
  };
}

/**
 * The line IDs the search command finds for what is typed, read as the search field reads them:
 * once typing has stopped for a moment, from 2 characters, for the snapshot in view. An answer
 * is matched to the text it was asked for; the one of before stands in, dimmed, until the next.
 */
function useLines(text: string) {
  const [asked, setAsked] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAsked(text);
    }, SEND_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  const { start } = useShell();
  const hasSnapshot = start.open?.selected != null;
  const query = useSnapshotQuery({
    name: "search",
    params: [asked],
    read: (view, typed) => api.search(view, typed),
    enabled: hasSnapshot && isSearchable(asked),
  });
  const answer: SearchResults | undefined = query.data;
  const fresh =
    answer !== undefined && !query.isPlaceholderData && answer.query === text ? answer : null;
  const [kept, setKept] = useState<SearchResults | null>(null);
  if (fresh !== null && kept !== fresh) setKept(fresh);
  if (!isSearchable(text) && kept !== null) setKept(null);
  const shown = fresh ?? kept;
  const searchable = hasSnapshot && isSearchable(text);
  const failed = searchable && query.isError && fresh === null && asked === text;
  const hits =
    !searchable || failed
      ? []
      : (shown?.groups.find((group) => group.kind === "Lines")?.hits ?? [])
          .filter((hit) => hit.kind === "Line")
          .slice(0, LINE_COUNT);
  return {
    hits,
    /** Waiting for the first answer for what is typed, with nothing to show meanwhile. */
    isWaiting: searchable && !failed && shown === null,
    /** What is shown is the answer for an earlier text. */
    isStale: searchable && !failed && fresh === null && shown !== null,
    error: failed ? asCommandError(query.error).message : null,
    retry: () => void query.refetch(),
  };
}

/** The shortcut of an item as key caps, one for each key. Decoration: the item names it. */
function KeyCaps({ shortcut }: { shortcut: string }) {
  const parts = formatShortcut(shortcut).split("+");
  return (
    <kbd aria-hidden="true" className={styles.keys}>
      {parts.map((part, index) => (
        <kbd key={index} className={styles.key}>
          {part === "" ? "+" : part}
        </kbd>
      ))}
    </kbd>
  );
}

/** What describes an item to assistive technology after its label. */
function descriptionOf(item: PaletteItem): string {
  const { hit } = item;
  if (hit !== undefined) {
    return formatList(
      [hit.released ? t("search.released") : "", t("search.holds", { count: hit.holds })].filter(
        (part) => part !== "",
      ),
    );
  }
  return formatList([item.tag ?? "", item.detail ?? ""].filter((part) => part !== ""));
}

function PaletteOption({
  id,
  item,
  onChoose,
}: {
  id: string;
  item: PaletteItem;
  onChoose: (item: PaletteItem) => void;
}) {
  const { hit, shortcut } = item;
  const description = descriptionOf(item);
  const keyShortcuts = shortcut === undefined ? undefined : ariaKeyShortcuts(shortcut);
  return (
    <ListBoxItem
      id={id}
      textValue={item.label}
      onAction={() => {
        onChoose(item);
      }}
      className={cx(styles.item)}
      // The component library passes no `aria-keyshortcuts` through, so the element is given it.
      // No item has an address, so the element is never a link.
      render={(props) => (
        <div {...(props as ComponentProps<"div">)} aria-keyshortcuts={keyShortcuts} />
      )}
    >
      {item.icon === undefined ? null : <Icon icon={item.icon} className={styles.icon} />}
      <Text
        slot="label"
        className={styles.label}
        data-identifier={hit === undefined ? undefined : ""}
      >
        {hit === undefined ? (
          item.label
        ) : (
          <>
            {/* The marks are for the eye; the line ID is read whole. */}
            <span aria-hidden="true">
              <MatchedText parts={hit.parts} />
            </span>
            <VisuallyHidden>{item.label}</VisuallyHidden>
          </>
        )}
      </Text>
      <span aria-hidden="true" className={styles.end}>
        {item.tag === undefined ? null : <Tag>{item.tag}</Tag>}
        {hit?.released === true ? <Tag>{t("search.released")}</Tag> : null}
        {item.detail === undefined ? null : <span className={styles.detail}>{item.detail}</span>}
        {hit === undefined ? null : <span className={styles.count}>{formatCount(hit.holds)}</span>}
        {shortcut === undefined ? null : <KeyCaps shortcut={shortcut} />}
      </span>
      {description === "" ? null : (
        <VisuallyHidden>
          <Text slot="description">{description}</Text>
        </VisuallyHidden>
      )}
    </ListBoxItem>
  );
}

interface BodyProps {
  /** The fixed items for the app's state now. */
  items: readonly PaletteItem[];
  /** The items chosen last that can still run, the last chosen first. */
  recentOf: (fixed: readonly PaletteItem[]) => PaletteItem[];
  openLine: (hit: SearchHit) => void;
  onChoose: (item: PaletteItem) => void;
}

/** What the palette holds while it is open: the field, the groups, and their states. */
function PaletteBody({ items, recentOf, openLine, onChoose }: BodyProps) {
  const [text, setText] = useState("");
  const lines = useLines(text);
  // The field takes the focus once the modal has noted where the focus was, to give it back there
  // on closing: an effect runs after that note is taken, where `autoFocus` would run before it.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const isEmptyText = text.trim() === "";

  const sections: Section[] = [];
  const shown = isEmptyText
    ? items.filter((item) => item.group === "actions" || item.group === "destinations")
    : narrow(items, text);
  const lineItems = lines.hits.map((hit) => lineItem(hit, openLine));
  for (const group of PALETTE_GROUPS) {
    const held = group === "lines" ? lineItems : shown.filter((item) => item.group === group);
    if (held.length > 0) sections.push({ id: group, heading: t(HEADING_KEYS[group]), items: held });
  }
  if (isEmptyText) {
    const recent = recentOf(items);
    if (recent.length > 0) {
      sections.push({ id: "recent", heading: t(HEADING_KEYS.recent), items: recent });
    }
  }
  const linesFailed = lines.error !== null;
  const isEmpty = sections.length === 0 && !linesFailed;
  const nothing = isEmpty && !lines.isWaiting ? t("palette.nothing", { query: text.trim() }) : "";

  // The Lines group after a failure: why, and the item that reads them again.
  const failedSection: ReactNode = linesFailed ? (
    <ListBoxSection id="lines" className={cx(styles.section)}>
      <Header className={styles.heading}>{t(HEADING_KEYS.lines)}</Header>
      <ListBoxItem
        id={RETRY_ID}
        textValue={t("common.retry")}
        onAction={lines.retry}
        className={cx(styles.item)}
      >
        <Text slot="label" className={styles.label}>
          {t("common.retry")}
        </Text>
        <Text slot="description" className={styles.error}>
          <Icon icon={OctagonAlert} />
          <span>{t("palette.linesError", { message: lines.error ?? "" })}</span>
        </Text>
      </ListBoxItem>
    </ListBoxSection>
  ) : null;

  return (
    <Autocomplete inputValue={text} onInputChange={setText}>
      <TextField aria-label={t("palette.name")} className={cx(styles.field)}>
        <Icon icon={Search} className={styles.fieldIcon} />
        <Input ref={input} placeholder={t("palette.placeholder")} className={cx(styles.input)} />
      </TextField>
      <VisuallyHidden role="status">
        {linesFailed ? t("palette.linesError", { message: lines.error ?? "" }) : nothing}
      </VisuallyHidden>
      <div className={styles.results}>
        <ListBox
          aria-label={t("palette.items")}
          aria-busy={lines.isWaiting || lines.isStale ? "true" : undefined}
          className={cx(styles.list)}
          renderEmptyState={() =>
            nothing === "" ? null : <span className={styles.nothing}>{nothing}</span>
          }
        >
          {sections.map((section) => (
            <ListBoxSection
              key={section.id}
              id={section.id}
              className={cx(styles.section)}
              data-stale={section.id === "lines" && lines.isStale ? "" : undefined}
            >
              <Header className={styles.heading}>{section.heading}</Header>
              {section.items.map((item) => {
                const id = section.id === "recent" ? `recent:${item.id}` : item.id;
                return <PaletteOption key={id} id={id} item={item} onChoose={onChoose} />;
              })}
            </ListBoxSection>
          ))}
          {failedSection}
        </ListBox>
        {lines.isWaiting && lineItems.length === 0 ? (
          // The first answer for what is typed is on its way: one line where the line IDs come.
          <div aria-hidden="true" className={styles.waiting}>
            <span className={styles.heading}>{t(HEADING_KEYS.lines)}</span>
            <span className={styles.skeleton}>
              <Skeleton width="40%" />
            </span>
          </div>
        ) : null}
      </div>
    </Autocomplete>
  );
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  destinations: readonly Destination[];
  /** Opens a destination as its sidebar item or its shortcut does. */
  openDestination: (path: string) => void;
  /** Draws the page anew, as a second press on its destination does. */
  onRestart: () => void;
  /** Says what went wrong, for the shell to show under the top bar; `null` takes it back. */
  onProblem: (problem: ShellProblem | null) => void;
}

/**
 * The command palette (DESIGN.md, "Command palette"): a modal that lists the app's actions and
 * destinations, the saved views, the snapshots, the workspaces, and the line IDs the search finds,
 * narrowed by what is typed. Choosing an item closes it and does what the item's own control
 * does. The shell holds it, and whether it is open; `Ctrl+K` opens and closes it.
 */
export function CommandPalette({
  isOpen,
  onOpenChange,
  destinations,
  openDestination,
  onRestart,
  onProblem,
}: CommandPaletteProps) {
  const { start, report } = useShell();
  const { isBusy } = useStart();
  const { isDefault, clear } = useFilters();
  const { setTheme } = useThemeSetting();
  const { setDensity } = useDensitySetting();
  const folder = useWorkspaceFolder();
  const applyView = useApplyView(onRestart);
  const exportView = usePageExport();
  const hasSaveView = useHasSaveView();
  const snapshots = useSelectSnapshot(onProblem);
  const workspaces = useOpenWorkspace(destinations, onProblem);
  const chooseSearch = useSearchChoice();

  const openLine = useCallback(
    (hit: SearchHit) => {
      chooseSearch({ kind: "hit", hit });
    },
    [chooseSearch],
  );

  const items = paletteItems({
    destinations,
    open: start.open,
    workspaces: start.list.workspaces,
    theme: start.settings.theme,
    density: start.settings.density,
    isBusy,
    isSettingsWaiting: folder.change?.step === "moving",
    hasFilters: !isDefault,
    actions: {
      openDestination,
      startImport: () => void startImport(),
      exportView,
      clearFilters: clear,
      setTheme: (theme) => {
        setTheme.mutate(theme, {
          onError: (error) => {
            report({ title: t("settings.themeError"), error: asCommandError(error) });
          },
        });
      },
      setDensity: (density) => {
        setDensity.mutate(density, {
          onError: (error) => {
            report({ title: t("settings.densityError"), error: asCommandError(error) });
          },
        });
      },
      saveView: hasSaveView
        ? () => {
            openSaveView();
          }
        : null,
      applyView,
      selectSnapshot: snapshots.select,
      openWorkspace: workspaces.open,
    },
  });

  // The items chosen in this session, the last chosen first.
  const [recent, setRecent] = useState<readonly RecentEntry[]>([]);
  const inView =
    start.open?.selected == null
      ? null
      : { workspace: start.open.workspace.id, id: start.open.selected };
  const recentOf = (fixed: readonly PaletteItem[]): PaletteItem[] => {
    const byId = new Map(fixed.map((item) => [item.id, item]));
    const offered: PaletteItem[] = [];
    for (const entry of recent) {
      if (entry.hit !== null) {
        const at = entry.snapshot;
        if (at !== null && at.workspace === inView?.workspace && at.id === inView.id) {
          offered.push(lineItem(entry.hit, openLine));
        }
        continue;
      }
      const item = byId.get(entry.id);
      if (item !== undefined) offered.push(item);
    }
    return offered.slice(0, RECENT_COUNT);
  };

  // Where the focus was when the palette opened: it goes back there when the palette closes,
  // unless what was chosen took it elsewhere. Noted before the field takes it.
  const returnTo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const active = document.activeElement;
    returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [isOpen]);

  // What was chosen runs once the palette is gone, so that the focus it gives back, and the page
  // it leaves, are those the action then changes.
  const chosen = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (isOpen) return undefined;
    const run = chosen.current;
    chosen.current = null;
    run?.();
    const back = returnTo.current;
    returnTo.current = null;
    if (back === null) return undefined;
    // The modal gives the focus back on the next frame as well, when it can; it is given back
    // here when nothing has taken it by then.
    const frame = window.requestAnimationFrame(() => {
      const lost = document.activeElement === null || document.activeElement === document.body;
      if (lost && back.isConnected) back.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  const choose = (item: PaletteItem) => {
    setRecent((current) => [
      { id: item.id, hit: item.hit ?? null, snapshot: item.hit === undefined ? null : inView },
      // More than are shown are kept: one that cannot run now may come back.
      ...current.filter((entry) => entry.id !== item.id).slice(0, KEPT_COUNT - 1),
    ]);
    chosen.current = item.run;
    onOpenChange(false);
  };

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={cx(styles.scrim)}
      {...{ [MODAL_ATTRIBUTE]: "" }}
    >
      <Modal className={cx(styles.modal)}>
        <Dialog aria-label={t("palette.name")} className={cx(styles.dialog)}>
          <PaletteBody items={items} recentOf={recentOf} openLine={openLine} onChoose={choose} />
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
