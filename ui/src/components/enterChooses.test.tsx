import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useEnterChooses } from "./enterChooses";

/** Two radios in a group that Enter chooses in, shown or not, and drawn anew on demand. */
function Group({ shown = true, generation = 0 }: { shown?: boolean; generation?: number }) {
  const enterChooses = useEnterChooses();
  const [chosen, setChosen] = useState("lines");
  if (!shown) return null;
  return (
    <div key={generation} ref={enterChooses} role="radiogroup" aria-label="Rows to show">
      {["lines", "holds"].map((value) => (
        <label key={value}>
          <input
            type="radio"
            name="rows"
            value={value}
            checked={chosen === value}
            onChange={() => {
              setChosen(value);
            }}
          />
          {value}
        </label>
      ))}
    </div>
  );
}

describe("useEnterChooses", () => {
  it("lets Enter choose the radio that has the focus", async () => {
    const user = userEvent.setup();
    render(<Group />);
    screen.getByRole("radio", { name: "holds" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("radio", { name: "holds" })).toBeChecked();
  });

  it("keeps working in a group that was rendered again, and in one that came later", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Group generation={1} />);
    rerender(<Group generation={2} />);
    screen.getByRole("radio", { name: "holds" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("radio", { name: "holds" })).toBeChecked();

    rerender(<Group shown={false} />);
    rerender(<Group generation={3} />);
    screen.getByRole("radio", { name: "lines" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("radio", { name: "lines" })).toBeChecked();
  });
});
