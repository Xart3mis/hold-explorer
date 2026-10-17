import { useDeferredValue, useState } from "react";
import { api } from "../../api/commands";
import { asCommandError } from "../../api/error";
import { dimName, isSameDim } from "../../app/filters/dims";
import { useFilters, withValues, type FilterValue } from "../../app/filters/state";
import { useSnapshotQuery } from "../../app/view";
import type { Dim } from "../../bindings/Dim";
import type { ValuePage } from "../../bindings/ValuePage";
import { ChoiceGroup, ErrorState, OptionList, TextField, type Option } from "../../components";
import { t } from "../../text/i18n";

/** The values the command answered, and the text they were asked for with. */
interface Answer {
  page: ValuePage;
  search: string;
}

/**
 * The options of the list: the values the command answered, in its order, each with the holds it
 * would keep.
 *
 * A ticked value the answer does not list is shown first, under the label it was ticked under,
 * so that it can be unticked. When the answer holds every value, no hold has that value under
 * the other filters, and it is shown with 0. When the answer holds only the first of many, its
 * count is not known and none is shown. An answer to typed text holds what matches the text and
 * nothing else: why a value is not in it cannot be told here.
 */
function optionsOf(answer: Answer | undefined, ticked: readonly FilterValue[]): Option[] {
  if (answer === undefined) return [];
  const { page, search } = answer;
  const listed = page.values.map((group): Option => ({
    key: group.key,
    label: group.label,
    count: group.holds,
  }));
  if (search !== "") return listed;
  const answered = new Set(page.values.map((group) => group.key));
  const isComplete = page.total <= page.values.length;
  const gone = ticked
    .filter((value) => !answered.has(value.key))
    .map((value): Option => ({
      key: value.key,
      label: value.label,
      ...(isComplete ? { count: 0 } : {}),
    }));
  return [...gone, ...listed];
}

export interface FieldValuesProps {
  /** The dimension whose values are chosen. */
  dim: Dim;
}

/**
 * The editor of a field of values: a field that narrows them, whether the ticked ones are kept or
 * left out, and the values with the count of holds each would keep. The counts are those of the
 * filters that are set without this field's own, so they are read again after every tick; the
 * counts of before stay meanwhile, dimmed. What is typed is sent once the renderer has caught up
 * with the keys, and not at each of them.
 */
export function FieldValues({ dim }: FieldValuesProps) {
  const { filters, spec, update } = useFilters();
  const entry = filters.fields.find((held) => isSameDim(held.dim, dim));
  const ticked = entry?.values ?? [];
  // The condition can be chosen before a value is ticked; until then no filter holds it.
  const [chosenNegate, setChosenNegate] = useState(entry?.negate ?? false);
  const negate = entry?.negate ?? chosenNegate;
  const [typed, setTyped] = useState("");
  const search = useDeferredValue(typed.trim());

  const values = useSnapshotQuery({
    name: "filterValues",
    params: [spec, dim, search],
    read: async (view, askedSpec, askedDim, askedSearch): Promise<Answer> => ({
      page: await api.filterValues(askedSpec, askedDim, askedSearch, view),
      search: askedSearch,
    }),
  });
  const answer = values.data;
  const options = optionsOf(answer, ticked);
  const name = dimName(dim);

  const tick = (chosen: string[]) => {
    const labels = new Map(options.map((option) => [option.key, option.label]));
    update((current) => {
      const held = current.fields.find((other) => isSameDim(other.dim, dim))?.values ?? [];
      // The values of before keep their order and the label they were ticked under.
      const kept = held.filter((value) => chosen.includes(value.key));
      const added = chosen
        .filter((key) => !kept.some((value) => value.key === key))
        .map((key) => ({ key, label: labels.get(key) ?? key }));
      return withValues(current, dim, [...kept, ...added], negate);
    });
  };

  return (
    <>
      <TextField
        label={name}
        placeholder={t("filters.picker.narrow")}
        value={typed}
        onChange={setTyped}
      />
      <ChoiceGroup
        label={t("filters.picker.condition.label")}
        orientation="horizontal"
        value={negate ? "isNot" : "is"}
        onChange={(chosen) => {
          const next = chosen === "isNot";
          setChosenNegate(next);
          update((current) => {
            const held = current.fields.find((other) => isSameDim(other.dim, dim))?.values ?? [];
            return withValues(current, dim, held, next);
          });
        }}
        options={[
          { value: "is", label: t("filters.picker.condition.is") },
          { value: "isNot", label: t("filters.picker.condition.isNot") },
        ]}
      />
      {values.isError ? (
        <ErrorState
          error={asCommandError(values.error)}
          title={t("filters.picker.valuesError")}
          onRetry={() => void values.refetch()}
          isRetrying={values.isRefetching}
        />
      ) : (
        <OptionList
          aria-label={t("filters.picker.values", { field: name })}
          selectionMode="multiple"
          options={options}
          selectedKeys={ticked.map((value) => value.key)}
          onSelectionChange={tick}
          // Read for the first time, or again: for other filters, or for the text as it is now.
          isLoading={answer === undefined || values.isPlaceholderData || search !== typed.trim()}
          emptyText={
            answer !== undefined && answer.search !== ""
              ? t("filters.picker.noMatch", { text: answer.search })
              : t("filters.picker.noValues")
          }
          {...(answer !== undefined && answer.page.total > answer.page.values.length
            ? {
                footer: t("filters.picker.moreValues", {
                  // How many values the answer leaves out: both numbers are the command's.
                  count: answer.page.total - answer.page.values.length,
                }),
              }
            : {})}
        />
      )}
    </>
  );
}
