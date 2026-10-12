import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "../../locales/en.json";
import { review } from "../../test/import";
import { NEW_WORKSPACE, type ImportChoices } from "./draft";
import { readTarget } from "./review";
import { ReviewTarget } from "./ReviewTarget";

const text = en.import.review.target;
const found = review({ project_no: null });

/**
 * The target section as the review page holds it: the choices, and the place where the name is
 * written as it is typed, which the test hands in so that it can read it.
 */
function Harness({
  typedNameRef,
  onChoose,
}: {
  typedNameRef: RefObject<string | null>;
  onChoose: (chosen: Partial<ImportChoices>) => void;
}) {
  const [choices, setChoices] = useState<Pick<ImportChoices, "target" | "newName">>({
    target: NEW_WORKSPACE,
    newName: null,
  });
  return (
    <ReviewTarget
      review={found}
      target={readTarget(found, choices)}
      openId={undefined}
      moment="2026-10-14T08:00:00"
      check={undefined}
      checkError={null}
      isChecking={false}
      onCheckAgain={() => undefined}
      replace={null}
      onOpen={() => undefined}
      isOpening={false}
      onChoose={(chosen) => {
        onChoose(chosen);
        setChoices((held) => ({ ...held, ...chosen }));
      }}
      typedNameRef={typedNameRef}
      isDisabled={false}
    />
  );
}

function setup() {
  const typedNameRef: RefObject<string | null> = { current: null };
  const onChoose = vi.fn<(chosen: Partial<ImportChoices>) => void>();
  const user = userEvent.setup();
  render(<Harness typedNameRef={typedNameRef} onChoose={onChoose} />);
  const typed = () => typedNameRef.current;
  return { user, onChoose, typed };
}

describe("the name of a new workspace as it is typed", () => {
  it("is written for the page at every key, and is nothing again once the field is left", async () => {
    const { user, onChoose, typed } = setup();
    const name = screen.getByRole("textbox", { name: text.newName });
    expect(typed()).toBeNull();

    await user.type(name, "Unit 6");
    expect(name).toHaveValue("Unit 6");
    expect(typed()).toBe("Unit 6");

    // Leaving the field hands the name to the page. What is typed and not left is nothing now.
    await user.tab();
    expect(onChoose).toHaveBeenLastCalledWith({ newName: "Unit 6" });
    expect(name).toHaveValue("Unit 6");
    expect(typed()).toBeNull();

    // The same on Enter.
    await user.type(name, "00{Enter}");
    expect(onChoose).toHaveBeenLastCalledWith({ newName: "Unit 600" });
    expect(typed()).toBeNull();
  });

  it("is nothing once the field is gone, whatever was typed in it", async () => {
    const { user, typed } = setup();
    const name = screen.getByRole("textbox", { name: text.newName });
    await user.type(name, "Unit 6");
    expect(typed()).toBe("Unit 6");
    // Another workspace is chosen: the field of the name goes.
    await user.click(screen.getByRole("button", { name: / Import into$/ }));
    await user.click(await screen.findByRole("option", { name: /^Tank farm/ }));
    expect(screen.queryByRole("textbox", { name: text.newName })).not.toBeInTheDocument();
    expect(typed()).toBeNull();
  });
});
