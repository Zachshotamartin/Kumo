import { act, fireEvent, render, screen } from "@testing-library/react";
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

  it("shows non-password failures and handles non-Error retry failures", async () => {
    vi.mocked(redeemPrototype).mockRejectedValueOnce("offline");
    const failed = render(<PrototypeShareView token="secret" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Prototype could not be opened");
    failed.unmount();

    vi.mocked(redeemPrototype).mockRejectedValueOnce(new Error("Password required")).mockRejectedValueOnce("offline");
    const retry = render(<PrototypeShareView token="retry" />);
    const password = await screen.findByLabelText("Prototype password");
    fireEvent.change(password, { target: { value: "bad" } });
    fireEvent.submit(password.closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Prototype could not be opened");
    retry.unmount();

    vi.mocked(redeemPrototype).mockRejectedValueOnce(new Error("Password required")).mockRejectedValueOnce(new Error("Password is still incorrect"));
    const errorRetry = render(<PrototypeShareView token="retry-error" />);
    const errorPassword = await screen.findByLabelText("Prototype password");
    await act(async () => fireEvent.submit(errorPassword.closest("form")!));
    expect(await screen.findByLabelText("Prototype password")).toBeVisible();
    expect(redeemPrototype).toHaveBeenCalledWith("retry-error", "");
    errorRetry.unmount();
  });

  it("falls back to prototype-start frames and supports inert layers", async () => {
    vi.mocked(redeemPrototype).mockResolvedValue({
      ...prototype,
      startShapeId: "missing",
      deviceFrame: undefined,
      document: { nodes: {
        start: { ...prototype.document.nodes.frame, id: "start", prototypeStart: true, backgroundColor: undefined },
        ellipse: { id: "ellipse", type: "ellipse", parentId: "start", x1: 10, y1: 10, x2: 40, y2: 40, width: 30, height: 30, level: 1, zIndex: 2, text: "Choice", backgroundColor: undefined },
        inert: { id: "inert", type: "rectangle", parentId: "start", x1: 50, y1: 10, x2: 80, y2: 40, width: 30, height: 30, level: 1, zIndex: 3, prototypeInteractions: [{ id: "hover", trigger: "hover", action: "navigate" }] },
        noDestination: { id: "no-destination", type: "rectangle", parentId: "start", x1: 90, y1: 10, x2: 120, y2: 40, width: 30, height: 30, level: 1, zIndex: 4, name: "No destination", prototypeInteractions: [{ id: "open", trigger: "click", action: "open-url" }] },
      } },
    } as never);
    const { container } = render(<PrototypeShareView token="secret" />);
    fireEvent.click(await screen.findByRole("button", { name: "Choice" }));
    fireEvent.click(screen.getByRole("button", { name: "rectangle" }));
    fireEvent.click(screen.getByRole("button", { name: "No destination" }));
    expect(container.querySelector("main")).toHaveAttribute("data-device", "none");
    expect(screen.getByRole("button", { name: "Choice" })).toHaveStyle({ borderRadius: "50%", background: "transparent" });
  });

  it("handles prototypes without frames and ignores results after unmount", async () => {
    vi.mocked(redeemPrototype).mockResolvedValueOnce({ ...prototype, startShapeId: "missing", document: { nodes: {} } });
    const empty = render(<PrototypeShareView token="empty" />);
    expect(await screen.findByText("This prototype has no frames yet.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Back to Kumo/ }));
    empty.unmount();

    let resolve!: (value: typeof prototype) => void;
    vi.mocked(redeemPrototype).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = render(<PrototypeShareView token="pending" />);
    pending.unmount();
    await act(async () => resolve(prototype));

    let reject!: (reason: unknown) => void;
    vi.mocked(redeemPrototype).mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const rejected = render(<PrototypeShareView token="rejected" />);
    rejected.unmount();
    await act(async () => reject(new Error("late")));
  });

  it("keeps the first frame and tolerates an empty back history", async () => {
    vi.mocked(redeemPrototype).mockResolvedValue({
      ...prototype,
      startShapeId: "confirmation",
      document: { nodes: { confirmation: prototype.document.nodes.confirmation, back: prototype.document.nodes.back } },
    });
    render(<PrototypeShareView token="secret" />);
    fireEvent.click(await screen.findByRole("button", { name: "Go back" }));
    expect(screen.getByRole("button", { name: "Go back" })).toBeVisible();
  });
});
