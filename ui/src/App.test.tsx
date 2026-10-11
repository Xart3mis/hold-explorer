import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import en from "./locales/en.json";

describe("App", () => {
  it("shows the product name from the text catalog", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: en.app.name })).toBeInTheDocument();
  });
});
