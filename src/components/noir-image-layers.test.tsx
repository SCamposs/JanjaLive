// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NoirInterference } from "./noir-interference";

afterEach(cleanup);

it("keeps the message and controls available when the decorative image fails", () => {
  const { container, getByRole, getByText } = render(<NoirInterference><button>Compartilhar tela</button></NoirInterference>);
  expect(container.querySelector("[data-image-state]")?.getAttribute("data-image-state")).toBe("loading");
  expect(container.querySelectorAll("img")).toHaveLength(1);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("[data-image-state]")?.getAttribute("data-image-state")).toBe("failed");
  expect(container.querySelectorAll("img")).toHaveLength(0);
  expect(container.querySelector(".noir-scan")).toBeNull();
  expect(getByText(/retirar imediatamente o Discord/)).toBeTruthy();
  expect(getByRole("button", { name: "Compartilhar tela" })).toBeTruthy();
});

it("adds the existing visual layers only after the base image loads", async () => {
  const { container } = render(<NoirInterference />);
  const image = container.querySelector("img")!;
  Object.defineProperty(image, "naturalWidth", { value: 1200 });
  fireEvent.load(image);
  await waitFor(() => expect(container.querySelectorAll("img")).toHaveLength(3));
  expect(container.querySelector("[data-image-state]")?.getAttribute("data-image-state")).toBe("ready");
  expect(container.querySelector(".noir-scan")).toBeTruthy();
});
