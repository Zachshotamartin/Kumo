import { fireEvent, render, screen } from "@testing-library/react";
import { redeemPrototype } from "../../services/platformRepository";
import PrototypeShareView from "./PrototypeShareView";

vi.mock("../../services/platformRepository", () => ({ redeemPrototype: vi.fn() }));

const prototype = {
  boardId: "board", title: "Checkout", startShapeId: "frame", deviceFrame: "phone",
  document: { nodes: {
    frame: { id: "frame", type: "frame", x1: 0, y1: 0, x2: 300, y2: 600, width: 300, height: 600, level: 0, zIndex: 1, backgroundColor: "#ffffff" },
    group: { id: "group", type: "group", parentId: "frame", x1: 20, y1: 20, x2: 280, y2: 100, width: 260, height: 80, level: 1, zIndex: 2 },
    title: { id: "title", type: "text", parentId: "group", x1: 30, y1: 30, x2: 270, y2: 70, width: 240, height: 40, level: 2, zIndex: 3, name: "Checkout title", text: "Checkout" },
    next: { id: "next", type: "rectangle", parentId: "frame", x1: 30, y1: 500, x2: 270, y2: 550, width: 240, height: 50, level: 1, zIndex: 4, name: "Continue", prototypeInteractions: [{ id: "next-action", trigger: "click", action: "navigate", destinationId: "confirmation" }] },
    external: { id: "external", type: "rectangle", parentId: "frame", x1: 30, y1: 430, x2: 270, y2: 480, width: 240, height: 50, level: 1, zIndex: 4, name: "Open docs", prototypeInteractions: [{ id: "external-action", trigger: "click", action: "open-url", url: "https://kumo.test/docs" }] },
    confirmation: { id: "confirmation", type: "frame", x1: 400, y1: 0, x2: 700, y2: 600, width: 300, height: 600, level: 0, zIndex: 1, backgroundColor: "#ffffff", name: "Confirmation" },
    back: { id: "back", type: "rectangle", parentId: "confirmation", x1: 430, y1: 500, x2: 670, y2: 550, width: 240, height: 50, level: 1, zIndex: 2, name: "Go back", prototypeInteractions: [{ id: "back-action", trigger: "click", action: "back" }] },
  } },
};

describe("PrototypeShareView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nested descendants in a presentation-only device frame", async () => {
    vi.mocked(redeemPrototype).mockResolvedValue(prototype);
    const { container } = render(<PrototypeShareView token="secret" />);
    expect(await screen.findByRole("button", { name: "Checkout title" })).toHaveTextContent("Checkout");
    expect(container.querySelector("main")).toHaveAttribute("data-device", "phone");
    expect(redeemPrototype).toHaveBeenCalledWith("secret", "");
  });

  it("prompts for a password and retries with the entered secret", async () => {
    vi.mocked(redeemPrototype).mockRejectedValueOnce(new Error("Prototype password is incorrect.")).mockResolvedValueOnce(prototype);
    render(<PrototypeShareView token="secret" />);
    const password = await screen.findByLabelText("Prototype password");
    fireEvent.change(password, { target: { value: "open-sesame" } });
    fireEvent.click(screen.getByRole("button", { name: "Open prototype" }));
    expect(await screen.findByRole("button", { name: "Checkout title" })).toBeVisible();
    expect(redeemPrototype).toHaveBeenLastCalledWith("secret", "open-sesame");
  });

  it("navigates between frames, returns through history, and opens external links safely", async () => {
    vi.mocked(redeemPrototype).mockResolvedValue(prototype);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<PrototypeShareView token="secret" />);
    fireEvent.click(await screen.findByRole("button", { name: "Open docs" }));
    expect(open).toHaveBeenCalledWith("https://kumo.test/docs", "_blank", "noopener,noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("button", { name: "Go back" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(await screen.findByRole("button", { name: "Continue" })).toBeVisible();
    open.mockRestore();
  });
});
