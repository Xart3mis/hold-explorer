import { OctagonAlert, Search } from "lucide-react";
import {
  useContext,
  useEffect,
  useRef,
  useState,
  type ContextType,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  ComboBox,
  ComboBoxStateContext,
  Input,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
} from "react-aria-components";
import { Icon, Skeleton, VisuallyHidden } from "../../components";
import { cx } from "../../components/cx";
import { lengthToken } from "../../design/token-values";
import { t } from "../../text/i18n";
import { isSearchable, useSearchAnswer } from "./answer";
import { useSearchChoice } from "./choose";
import {
  ResultSectionView,
  sectionsOf,
  statusOf,
  type Picked,
  type ResultSection,
} from "./results";
import styles from "./SearchField.module.css";

export { MIN_QUERY_LENGTH, SEND_AFTER_MS } from "./answer";

/** The key that focuses the field from the page; the shortcuts register it (Task 13). */
export const SEARCH_SHORTCUT = "/";

/** The id of the item that tries a failed search again. */
const RETRY_ID = "retry";

/** What the list holds after a failure: the item that tries again, in place of the groups. */
const RETRY_ITEMS: readonly ResultSection[] = [
  { id: RETRY_ID, group: "Lines", heading: "", rows: [] },
];

/** How the field that is shown takes the focus; `null` while none is shown. */
let focusShown: (() => void) | null = null;

/**
 * Takes the focus to the search field of the top bar. Returns whether there was one: it is absent
 * while no snapshot is in view, as nothing can be found then.
 */
export function focusSearchField(): boolean {
  if (focusShown === null) return false;
  focusShown();
  return true;
}

/** The state of the combobox, kept where the field can reach it outside a render. */
type ComboBoxState = NonNullable<ContextType<typeof ComboBoxStateContext>>;

/**
 * Hands the state of the combobox around it to the field. The items of the list are also drawn
 * once outside the combobox, to build the collection, so they cannot read it themselves.
 */
function StateOf({ heldRef }: { heldRef: RefObject<ComboBoxState | null> }) {
  const state = useContext(ComboBoxStateContext);
  useEffect(() => {
    heldRef.current = state;
  });
  return null;
}

/**
 * The search field of the top bar: a combobox whose results open under it in groups. What is
 * typed is sent once typing has stopped for a moment; choosing a result opens it or filters by it,
 * and Enter with no result highlighted sets the text as the text filter. See DESIGN.md, "Search
 * field".
 */
export function SearchField() {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const comboBox = useRef<ComboBoxState | null>(null);
  const choose = useSearchChoice();
  const offset = lengthToken("--space-1");

  useEffect(() => {
    const take = () => {
      input.current?.focus();
    };
    focusShown = take;
    return () => {
      if (focusShown === take) focusShown = null;
    };
  }, []);

  const { fresh, shown, isWaiting, error, retry, forget } = useSearchAnswer(text);
  // Choosing an item closes the list; after a retry it opens again with the answer.
  const tryAgain = () => {
    void retry().then(() => {
      comboBox.current?.open(null, "manual");
    });
  };
  const searchable = isSearchable(text);
  const sections: ResultSection[] =
    !searchable || error !== null ? [] : sectionsOf(shown?.groups ?? []);

  const clear = () => {
    setText("");
    forget();
  };
  const pick = (picked: Picked) => {
    const query = text;
    clear();
    choose(picked.kind === "hit" ? picked : { ...picked, query });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Read before the combobox has answered the key: the attributes still say what the list was.
    const field = event.currentTarget;
    const wasOpen = field.getAttribute("aria-expanded") === "true";
    const highlighted = field.getAttribute("aria-activedescendant") !== null;
    if (event.key === "Enter" && !(wasOpen && highlighted)) {
      if (text.trim() === "") return;
      const query = text;
      clear();
      choose({ kind: "text", query });
      return;
    }
    if (event.key === "Escape" && !wasOpen) clear();
  };

  const status =
    error !== null
      ? t("search.error", { message: error })
      : fresh === null || !searchable
        ? ""
        : fresh.groups.length === 0
          ? t("search.nothing", { query: text.trim() })
          : statusOf(fresh.groups);

  return (
    <div className={styles.search}>
      <ComboBox
        aria-label={t("search.label")}
        inputValue={text}
        onInputChange={setText}
        value={null}
        items={error === null ? sections : RETRY_ITEMS}
        allowsCustomValue
        allowsEmptyCollection={searchable}
        menuTrigger="input"
        onKeyDown={onKeyDown}
        className={cx(styles.combobox)}
      >
        <StateOf heldRef={comboBox} />
        <span className={styles.control}>
          <Icon icon={Search} className={styles.icon} />
          <Input
            ref={input}
            placeholder={t("search.placeholder")}
            aria-keyshortcuts={SEARCH_SHORTCUT}
            className={cx(styles.input)}
          />
          <kbd aria-hidden="true" className={styles.key}>
            {SEARCH_SHORTCUT}
          </kbd>
        </span>
        <Popover
          placement="bottom start"
          {...(offset === null ? {} : { offset })}
          className={cx(styles.popover)}
          style={{ zIndex: "var(--z-dropdown)" }}
        >
          {/* In the popover: while it is open, what is outside is hidden from assistive technology. */}
          <VisuallyHidden role="status">{status}</VisuallyHidden>
          <div data-stale={isWaiting && shown !== null ? "" : undefined} className={styles.results}>
            {error === null ? null : (
              <p className={styles.error}>
                <Icon icon={OctagonAlert} />
                <span>{t("search.error", { message: error })}</span>
              </p>
            )}
            <ListBox
              aria-label={t("search.results")}
              className={cx(styles.list)}
              // The component library passes no `aria-busy` through, so the element is given it:
              // the list itself is busy while the answer for what is typed is on its way.
              render={(props) => <div {...props} aria-busy={isWaiting ? "true" : undefined} />}
              renderEmptyState={() =>
                shown === null ? (
                  <span className={styles.waiting}>
                    <Skeleton width="60%" />
                  </span>
                ) : (
                  <span className={styles.nothing}>
                    {t("search.nothing", { query: shown.query.trim() })}
                  </span>
                )
              }
            >
              {(section: ResultSection) =>
                section.id === RETRY_ID ? (
                  <ListBoxItem
                    id={RETRY_ID}
                    textValue={t("common.retry")}
                    onAction={tryAgain}
                    className={cx(styles.item)}
                  >
                    <Text slot="label" className={styles.more}>
                      {t("common.retry")}
                    </Text>
                  </ListBoxItem>
                ) : (
                  <ResultSectionView section={section} onChoose={pick} />
                )
              }
            </ListBox>
          </div>
        </Popover>
      </ComboBox>
    </div>
  );
}
