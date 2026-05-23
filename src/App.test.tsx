import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

function installLocalStorage() {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
      get length() {
        return storage.size;
      }
    }
  });
}

describe("App user flows", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("creates a listing after tracking multi-image upload and removal state", async () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /sell/i }));
    const imageInput = screen.getByLabelText(/images/i);
    const files = [
      new File(["first"], "first.png", { type: "image/png" }),
      new File(["second"], "second.jpg", { type: "image/jpeg" })
    ];

    fireEvent.change(imageInput, { target: { files } });

    await waitFor(() => {
      expect(container.querySelectorAll(".upload-strip img")).toHaveLength(2);
    });

    const firstPreview = container.querySelector<HTMLButtonElement>(".upload-strip button");
    expect(firstPreview).not.toBeNull();
    fireEvent.click(firstPreview!);

    await waitFor(() => {
      expect(container.querySelectorAll(".upload-strip img")).toHaveLength(1);
    });

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Test lamp" } });
    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: "64" } });
    fireEvent.change(screen.getByLabelText(/pickup or shipping notes/i), {
      target: { value: "Porch pickup" }
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: "Brass desk lamp with working dimmer." }
    });
    fireEvent.click(screen.getByRole("button", { name: /publish listing/i }));

    expect(await screen.findAllByRole("heading", { name: "Test lamp" })).toHaveLength(2);
    expect(screen.getAllByText("$64")).toHaveLength(2);
    expect(screen.getByText("Porch pickup")).toBeInTheDocument();
  });

  it("creates a chat message from the rendered composer and clears the input", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /chat/i }));
    const composer = screen.getByPlaceholderText(/write a message/i);

    fireEvent.change(composer, { target: { value: "Pickup at 5?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Pickup at 5?")).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });

  it("does not show another buyer's reservation chat after switching users", () => {
    render(<App />);

    fireEvent.change(screen.getAllByLabelText(/demo user/i)[0], { target: { value: "buyer-2" } });
    fireEvent.click(screen.getByRole("button", { name: /chat/i }));

    expect(screen.getByText(/reserve an item to start/i)).toBeInTheDocument();
    expect(screen.queryByText(/i can pay today/i)).not.toBeInTheDocument();
  });

  it("clears unread notifications when marking them read", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /alerts/i }));
    expect(screen.getByRole("heading", { name: /payment overdue/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mark read/i }));

    expect(screen.queryByRole("heading", { name: /payment overdue/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no unread notifications/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark read/i })).toBeDisabled();
  });

  it("keeps the primary mobile navigation visible in the rendered shell", () => {
    render(<App />);

    const navigation = screen.getByLabelText(/primary navigation/i);

    for (const label of ["Browse", "Sell", "Picked", "Chat"]) {
      expect(within(navigation).getByRole("button", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });
});
