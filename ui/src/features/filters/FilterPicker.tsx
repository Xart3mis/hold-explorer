import type { UseQueryResult } from "@tanstack/react-query";
import { useState, type RefObject } from "react";
import { Menu, MenuItem, Text } from "react-aria-components";
import { asCommandError } from "../../api/error";
import { useFilters } from "../../app/filters/state";
import type { FilterOptions } from "../../bindings/FilterOptions";
import { ErrorState, OptionList, Popover, Spinner, TextField } from "../../components";
import { cx } from "../../components/cx";
import { t } from "../../text/i18n";
import { AgeBands } from "./AgeBands";
import { chipsOf, fieldId, fieldName, type FilterField } from "./chips";
import { DateRangeFields } from "./DateRangeFields";
import { pickerFields } from "./fields";
import { FieldValues } from "./FieldValues";
import styles from "./FilterPicker.module.css";

/** The options of the snapshot in view, as the filter bar reads them. The picker reads none of its own. */
type Options = UseQueryResult<FilterOptions>;

/** The list of fields in one word: whether it is there, being read, or could not be read. */
function listState(options: Options): string {
  if (options.isError) return "fields-error";
  return options.data === undefined ? "fields-reading" : "fields";
}

interface FieldListProps {
  options: Options;
  onChoose: (field: FilterField) => void;
}

/**
 * The fields the snapshot in view can be filtered by, as the items of a menu. A field that has a
 * filter says what it is filtered to, as its chip does; choosing it opens that filter.
 */
function FieldList({ options, onChoose }: FieldListProps) {
  const { filters } = useFilters();
  if (options.isError) {
    return (
      <ErrorState
        error={asCommandError(options.error)}
        title={t("filters.error")}
        onRetry={() => void options.refetch()}
        isRetrying={options.isRefetching}
      />
    );
  }
  // Which fields the snapshot has is not known before its options are.
  if (options.data === undefined) {
    return (
      <p role="status" className={styles.reading}>
        <Spinner />
        {t("common.loading")}
      </p>
    );
  }
  const fields = pickerFields(options.data);
  const set = new Map(chipsOf(filters).map((chip) => [chip.id, chip]));
  return (
    <Menu
      aria-label={t("filters.picker.fields")}
      onAction={(id) => {
        const chosen = fields.find((field) => fieldId(field) === id);
        if (chosen !== undefined) onChoose(chosen);
      }}
      className={cx(styles.fields)}
    >
      {fields.map((field) => {
        const id = fieldId(field);
        const name = fieldName(field);
        const chip = set.get(id);
        return (
          <MenuItem key={id} id={id} textValue={name} className={cx(styles.field)}>
            <Text slot="label" className={cx(styles.fieldName)}>
              {name}
            </Text>
            {chip === undefined ? null : (
              <Text slot="description" className={cx(styles.fieldDetail)}>
                {chip.isNegated ? t("filters.picker.isNot", { value: chip.value }) : chip.value}
              </Text>
            )}
          </MenuItem>
        );
      })}
    </Menu>
  );
}

/**
 * The editor of the sizes: the holds whose model size and LDT size differ, or the ones whose
 * sizes match. One choice, and choosing it again removes the filter. Without the counts, which
 * the bar says could not be read, the two can still be chosen.
 */
function SizeMismatch({ options }: { options: Options }) {
  const { filters, update } = useFilters();
  const name = fieldName({ kind: "sizeMismatch" });
  const facets = options.isError ? undefined : options.data?.facets;
  return (
    <div className={styles.group}>
      <p className={styles.title}>{name}</p>
      <OptionList
        aria-label={name}
        selectionMode="single"
        options={[
          {
            key: "differ",
            label: t("filters.picker.size.differ"),
            ...(facets === undefined ? {} : { count: facets.size_mismatch }),
          },
          {
            key: "match",
            label: t("filters.picker.size.match"),
            ...(facets === undefined ? {} : { count: facets.size_match }),
          },
        ]}
        selectedKeys={
          filters.sizeMismatch === null ? [] : [filters.sizeMismatch ? "differ" : "match"]
        }
        onSelectionChange={([chosen]) => {
          update((current) => ({
            ...current,
            sizeMismatch: chosen === undefined ? null : chosen === "differ",
          }));
        }}
        isLoading={facets !== undefined && options.isPlaceholderData}
        // The list always holds its two values.
        emptyText=""
      />
    </div>
  );
}

/**
 * The editor of text: one field. What is typed applies on Enter, when the field is left, and
 * when Escape closes the picker, and not at every key: each change reads the whole page again.
 */
function TextFilter() {
  const { filters, update } = useFilters();
  const [typed, setTyped] = useState(filters.text);
  const apply = () => {
    const text = typed.trim();
    update((current) => (current.text === text ? current : { ...current, text }));
  };
  return (
    <TextField
      label={fieldName({ kind: "text" })}
      description={t("filters.picker.text.help")}
      value={typed}
      onChange={setTyped}
      onBlur={apply}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") apply();
        // Escape goes on to the picker, which closes; so does every key that is typed.
        if (event.key !== "Enter") event.continuePropagation();
      }}
    />
  );
}

/** The editor of one field. */
function Editor({ field, options }: { field: FilterField; options: Options }) {
  switch (field.kind) {
    case "dim":
      return <FieldValues dim={field.dim} />;
    case "ageBands":
      return <AgeBands options={options} />;
    case "created":
    case "released":
      return <DateRangeFields kind={field.kind} />;
    case "sizeMismatch":
      return <SizeMismatch options={options} />;
    case "text":
      return <TextFilter />;
  }
}

export interface FilterPickerProps {
  /** What it stands under: the place the control that opened it had. */
  anchor: RefObject<Element | null>;
  isOpen: boolean;
  /** The field whose editor it shows; `null` for the list of fields. */
  field: FilterField | null;
  /** The options of the snapshot in view, as the filter bar reads them. */
  options: Options;
  /** A field was chosen in the list of fields. */
  onChoose: (field: FilterField) => void;
  /** Escape or a press outside asked for it to close. */
  onClose: () => void;
}

/**
 * The popover a chip and "Add filter" open. Opened to add a filter it lists the fields, and the
 * field that is chosen is then edited in its place; opened from a chip it shows the editor of
 * that chip's field at once. Whatever is set in it applies at once, through the filters every
 * data screen shares, and it stays open: nothing in it confirms.
 */
export function FilterPicker({
  anchor,
  isOpen,
  field,
  options,
  onChoose,
  onClose,
}: FilterPickerProps) {
  return (
    <Popover
      anchor={anchor}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label={
        field === null
          ? t("filters.picker.add")
          : t("filters.picker.filterBy", { field: fieldName(field) })
      }
      // What it holds is replaced when a field is chosen, and when the list of fields arrives.
      contentKey={field === null ? listState(options) : fieldId(field)}
    >
      {field === null ? (
        <FieldList options={options} onChoose={onChoose} />
      ) : (
        <Editor field={field} options={options} />
      )}
    </Popover>
  );
}
