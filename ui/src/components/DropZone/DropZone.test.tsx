import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { Notice } from "../Notice/Notice";
import { Progress } from "../Progress/Progress";
import { DropZone } from "./DropZone";

const texts = {
  title: "Import a holds export",
  text: "Drop the spreadsheet here, or choose it.",
  chooseLabel: "Choose file",
  fileTypes: "xlsx, xlsm, xlsb, xls, ods, csv, tsv, txt",
};

describe("DropZone", () => {
  it("is a group named by its title, with a sentence and the accepted file types", () => {
    render(<DropZone {...texts} onChoose={() => undefined} />);
    const zone = screen.getByRole("group", { name: "Import a holds export" });
    expect(within(zone).getByText("Drop the spreadsheet here, or choose it.")).toBeInTheDocument();
    expect(within(zone).getByText("xlsx, xlsm, xlsb, xls, ods, csv, tsv, txt")).toBeInTheDocument();
  });

  it("always has a button, so dropping is never the only way in", async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(<DropZone {...texts} onChoose={onChoose} />);
    const button = screen.getByRole("button", { name: "Choose file" });
    expect(button).toHaveAttribute("data-variant", "primary");

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onChoose).toHaveBeenCalledTimes(2);
  });

  it("with a file over it, says what dropping will do and hides the button and the file types", () => {
    render(
      <DropZone
        {...texts}
        onChoose={() => undefined}
        active={{ title: "Drop to import", text: "Holds_2026-10-07.xlsx" }}
      />,
    );
    const zone = screen.getByRole("group", { name: "Drop to import" });
    expect(zone).toHaveAttribute("data-active");
    expect(within(zone).getByText("Holds_2026-10-07.xlsx")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: texts.title })).not.toBeInTheDocument();
    // What the zone shows at rest keeps its room, hidden and out of reach, so the zone keeps its size.
    for (const hidden of [texts.fileTypes, texts.title, texts.chooseLabel]) {
      const layer = screen.getByText(hidden).closest("[data-hidden]");
      expect(layer).toHaveAttribute("aria-hidden", "true");
      expect(layer).toHaveAttribute("inert");
    }
  });

  it("with a file over it, cannot be operated: the hidden button takes no press", async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(
      <DropZone
        {...texts}
        onChoose={onChoose}
        active={{ title: "Drop to import", text: "Holds_2026-10-07.xlsx" }}
      />,
    );
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("while an import runs, shows the progress in place of its content", () => {
    render(
      <DropZone
        {...texts}
        onChoose={() => undefined}
        progress={<Progress label="Reading rows, 4,200 of 9,300" value={0.45} />}
      />,
    );
    expect(
      screen.getByRole("progressbar", { name: "Reading rows, 4,200 of 9,300" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(texts.text).closest("[data-hidden]")).toHaveAttribute("inert");
    expect(screen.getByRole("group", { name: texts.title })).toBeInTheDocument();
  });

  it("shows why a file cannot be imported in a notice under the zone", () => {
    render(
      <DropZone
        {...texts}
        onChoose={() => undefined}
        error={
          <Notice tone="danger" title="The file could not be read.">
            It is open in another program. Close it there, then import again.
          </Notice>
        }
      />,
    );
    expect(screen.getByRole("group", { name: texts.title })).toHaveAttribute("data-invalid");
    expect(screen.getByRole("alert")).toHaveTextContent("The file could not be read.");
    expect(screen.getByRole("button", { name: "Choose file" })).toBeInTheDocument();
  });

  it("has no accessibility violation at rest, with a file over it, importing, and in error", async () => {
    const { container, rerender } = render(<DropZone {...texts} onChoose={() => undefined} />);
    await expectNoAxeViolations(container);
    rerender(
      <DropZone
        {...texts}
        onChoose={() => undefined}
        active={{ title: "Drop to import", text: "Holds_2026-10-07.xlsx" }}
      />,
    );
    await expectNoAxeViolations(container);
    rerender(
      <DropZone
        {...texts}
        onChoose={() => undefined}
        progress={<Progress label="Reading the file" />}
      />,
    );
    await expectNoAxeViolations(container);
    rerender(
      <DropZone
        {...texts}
        onChoose={() => undefined}
        error={<Notice tone="danger">The file could not be read.</Notice>}
      />,
    );
    await expectNoAxeViolations(container);
  });
});
