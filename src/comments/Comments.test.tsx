import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer, { login } from "../features/auth/authSlice";
import editorReducer, { setCommentDraftAnchor, setRightPanel } from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import { normalizeShape } from "../editor/geometry";
import { CommentsPanel } from "./CommentsPanel";
import { CommentPins } from "./CommentPins";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";
import type { BoardCollaborator } from "../services/collaboratorRepository";

const liveblocks = vi.hoisted(() => ({
  threads: [] as Array<Record<string, unknown>>,
  markRead: vi.fn(),
  createThread: vi.fn(),
  createComment: vi.fn(),
  resolve: vi.fn(),
  reopen: vi.fn(),
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
  deleteThread: vi.fn(),
  editThreadMetadata: vi.fn(),
  uploadAttachment: vi.fn(),
  attachmentUrl: vi.fn(),
  listCollaborators: vi.fn(),
}));

vi.mock("@liveblocks/react/suspense", () => ({
  useThreads: () => ({ threads: liveblocks.threads }),
  useMarkThreadAsRead: () => liveblocks.markRead,
  useCreateThread: () => liveblocks.createThread,
  useCreateComment: () => liveblocks.createComment,
  useMarkThreadAsResolved: () => liveblocks.resolve,
  useMarkThreadAsUnresolved: () => liveblocks.reopen,
  useAddReaction: () => liveblocks.addReaction,
  useRemoveReaction: () => liveblocks.removeReaction,
  useEditComment: () => liveblocks.editComment,
  useDeleteComment: () => liveblocks.deleteComment,
  useDeleteThread: () => liveblocks.deleteThread,
  useEditThreadMetadata: () => liveblocks.editThreadMetadata,
  useRoom: () => ({ uploadAttachment: liveblocks.uploadAttachment }),
  useAttachmentUrl: (id: string) => liveblocks.attachmentUrl(id),
}));

vi.mock("../services/collaboratorRepository", () => ({
  listBoardCollaborators: liveblocks.listCollaborators,
}));

const collaborator: BoardCollaborator = {
  id: "owner",
  email: "owner@example.com",
  name: "Owner",
  avatar: "",
  role: "owner",
};

const comment = {
  type: "comment",
  id: "comment-1",
  threadId: "thread-1",
  roomId: "board:board",
  userId: "owner",
  createdAt: new Date("2026-08-23T00:00:00Z"),
  reactions: [],
  attachments: [],
  metadata: { source: "canvas" },
  body: { version: 1, content: [{ type: "paragraph", children: [{ text: "Review this" }] }] },
};

const thread = {
  type: "thread",
  id: "thread-1",
  roomId: "board:board",
  createdAt: new Date("2026-08-23T00:00:00Z"),
  updatedAt: new Date("2026-08-23T00:00:00Z"),
  comments: [comment],
  metadata: { x: 20, y: 30, shapeId: "" },
  resolved: false,
  visibility: "public",
};

const makeStore = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      whiteBoard: whiteBoardReducer,
      actions: actionsReducer,
      selected: selectedReducer,
      editor: editorReducer,
    },
  });
  store.dispatch(login({ uid: "owner", email: "owner@example.com" }));
  store.dispatch(setWhiteboardData({ id: "board", roomId: "board:board", role: "owner", shapes: [] }));
  return store;
};

describe("live comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    liveblocks.threads = [thread];
    liveblocks.listCollaborators.mockResolvedValue([collaborator]);
    liveblocks.createThread.mockReturnValue(thread);
    liveblocks.attachmentUrl.mockReturnValue({ isLoading: false, url: "https://files.example/attachment" });
    liveblocks.uploadAttachment.mockImplementation(async (attachment: { id: string; name: string; size: number; mimeType: string }) => ({ type: "attachment", id: attachment.id, name: attachment.name, size: attachment.size, mimeType: attachment.mimeType }));
  });

  it("renders, focuses, resolves, reacts to, and replies to a thread", async () => {
    const store = makeStore();
    store.dispatch(setRightPanel("comments"));
    render(<Provider store={store}><CommentsPanel /></Provider>);
    expect(await screen.findByText("Review this")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(store.getState().editor.selectedThreadId).toBe("thread-1");
    expect(liveblocks.markRead).toHaveBeenCalledWith("thread-1");
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(liveblocks.resolve).toHaveBeenCalledWith("thread-1");
    fireEvent.click(screen.getByRole("button", { name: "Add Appreciate reaction" }));
    expect(liveblocks.addReaction).toHaveBeenCalledWith({
      threadId: "thread-1",
      commentId: "comment-1",
      emoji: "heart",
    });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "Done" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Comment" }), { key: "Enter", metaKey: true });
    expect(liveblocks.createComment).toHaveBeenCalledWith(expect.objectContaining({ threadId: "thread-1" }));
  });

  it("creates a canvas thread and converts the draft into a numbered pin", async () => {
    liveblocks.threads = [];
    const store = makeStore();
    store.dispatch(setCommentDraftAnchor({ x: 40, y: 60, shapeId: "" }));
    const view = render(<Provider store={store}><CommentPins /></Provider>);
    const input = screen.getByRole("textbox", { name: "Comment" });
    fireEvent.change(input, { target: { value: "Canvas feedback" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(liveblocks.createThread).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { x: 40, y: 60, shapeId: "" },
    }));
    expect(store.getState().editor.commentDraftAnchor).toBeNull();
    liveblocks.threads = [thread];
    view.rerender(<Provider store={store}><CommentPins /></Provider>);
    expect(await screen.findByRole("button", { name: "Open comment 1" })).toBeInTheDocument();
  });

  it("moves a comment pin and persists its new canvas anchor", async () => {
    const store = makeStore();
    render(<Provider store={store}><CommentPins /></Provider>);
    const layer = screen.getByLabelText("Canvas comments");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500,
      toJSON: () => ({}),
    });
    const pin = screen.getByRole("button", { name: "Open comment 1" });
    Object.assign(pin, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    await act(async () => {
      fireEvent.pointerDown(pin, { pointerId: 4, button: 0, clientX: 20, clientY: 30 });
      fireEvent.pointerMove(pin, { pointerId: 4, clientX: 90, clientY: 110 });
      fireEvent.pointerUp(pin, { pointerId: 4, clientX: 90, clientY: 110 });
      await Promise.resolve();
    });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalledWith({
      threadId: "thread-1",
      metadata: { x: 90, y: 110, shapeId: "" },
    });
  });

  it("suggests collaborators and inserts a real mention token", async () => {
    liveblocks.threads = [];
    const store = makeStore();
    store.dispatch(setCommentDraftAnchor({ x: 1, y: 2, shapeId: "" }));
    render(<Provider store={store}><CommentPins /></Provider>);
    const input = screen.getByRole("textbox", { name: "Comment" });
    fireEvent.change(input, { target: { value: "Ask @own", selectionStart: 8 } });
    expect(await screen.findByRole("option", { name: /Owner/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Owner/ }));
    await waitFor(() => expect(input).toHaveValue("Ask @owner@example.com "));
  });

  it("assigns, prioritizes, dates, searches, and filters feedback", async () => {
    const store = makeStore();
    store.dispatch(setRightPanel("comments"));
    render(<Provider store={store}><CommentsPanel /></Provider>);
    await screen.findByText("Review this");
    await screen.findByRole("option", { name: "Owner" });
    fireEvent.change(screen.getByLabelText("Comment assignee"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Comment priority"), { target: { value: "high" } });
    fireEvent.change(screen.getByLabelText("Comment due date"), { target: { value: "2026-08-30" } });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalledWith({ threadId: "thread-1", metadata: { assigneeId: "owner" } });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalledWith({ threadId: "thread-1", metadata: { priority: "high" } });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalledWith({ threadId: "thread-1", metadata: { dueAt: "2026-08-30" } });
    fireEvent.change(screen.getByLabelText("Search comments"), { target: { value: "missing" } });
    expect(screen.queryByText("Review this")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search comments"), { target: { value: "review" } });
    expect(screen.getByText("Review this")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter comments by assignee"), { target: { value: "unassigned" } });
    expect(screen.getByText("Review this")).toBeInTheDocument();
  });

  it("uploads attachments before creating a canvas thread", async () => {
    liveblocks.threads = [];
    const store = makeStore();
    store.dispatch(setCommentDraftAnchor({ x: 1, y: 2, shapeId: "" }));
    render(<Provider store={store}><CommentPins /></Provider>);
    fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [new File(["design"], "review.txt", { type: "text/plain" })] } });
    expect(screen.getByText("review.txt")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "See attachment" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(liveblocks.uploadAttachment).toHaveBeenCalled());
    await waitFor(() => expect(liveblocks.createThread).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [expect.objectContaining({ name: "review.txt", mimeType: "text/plain" })],
    })));
  });

  it("filters resolved and assigned threads, focuses attached shapes, and closes the panel", async () => {
    liveblocks.listCollaborators.mockResolvedValueOnce([collaborator, { ...collaborator, id: "other", email: "other@example.com", name: "Other" }]);
    const resolved = {
      ...thread,
      id: "thread-2",
      updatedAt: new Date("2026-08-24T00:00:00Z"),
      resolved: true,
      metadata: { x: 5, y: 6, shapeId: "shape" , assigneeId: "owner" },
      comments: [{ ...comment, id: "comment-2", threadId: "thread-2", body: { version: 1, content: [{ type: "paragraph", children: [{ text: "Resolved item" }] }] } }],
    };
    liveblocks.threads = [thread, resolved];
    const store = makeStore();
    store.dispatch(setWhiteboardData({ id: "board", roomId: "board:board", role: "owner", shapes: [normalizeShape({ id: "shape", type: "rectangle", x1: 100, y1: 80, x2: 140, y2: 120, width: 40, height: 40, level: 0, zIndex: 1 })] }));
    store.dispatch(setRightPanel("comments"));
    render(<Provider store={store}><CommentsPanel /></Provider>);
    await screen.findByText("Review this");
    expect(await screen.findAllByRole("option", { name: "Other" })).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Resolved" }));
    expect(screen.getByText("Resolved item")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Filter comments by assignee"), { target: { value: "owner" } });
    expect(screen.getByRole("button", { name: "Show" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(store.getState().editor.selectedThreadId).toBe("thread-2");
    expect(store.getState().editor.viewport.x).toBe(-55);
    expect(store.getState().editor.viewport.y).toBe(-54);
    fireEvent.click(screen.getByRole("button", { name: "Close comments" }));
    expect(store.getState().editor.rightPanel).toBe("properties");
  });

  it("shows collaborator loading errors and empty resolved feedback", async () => {
    liveblocks.threads = [];
    liveblocks.listCollaborators.mockRejectedValueOnce("offline");
    const store = makeStore();
    render(<Provider store={store}><CommentsPanel /></Provider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Collaborators could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Resolved" }));
    expect(screen.getByText("No comments here")).toBeInTheDocument();
  });

  it("handles composer limits, removal, keyboard controls, upload errors, and defaults", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const animation = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const view = render(
      <CommentComposer
        collaborators={[collaborator]}
        initialValue="Ask @own"
        submitLabel="Send"
        focusOnMount
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );
    const input = screen.getByRole("textbox", { name: "Comment" });
    expect(input).toHaveFocus();
    fireEvent.select(input, { target: { selectionStart: 8 } });
    fireEvent.click(await screen.findByRole("option", { name: /Owner/ }));
    expect(input).toHaveValue("Ask @owner@example.com ");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Attach files" }));
    const files = [
      new File(["one"], "one.bin"),
      new File(["two"], "two.txt", { type: "text/plain" }),
      new File(["three"], "three.txt"),
      new File(["four"], "four.txt"),
      new File(["five"], "five.txt"),
      new File(["six"], "six.txt"),
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "too-large.bin"),
    ];
    fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files } });
    expect(screen.queryByText("six.txt")).not.toBeInTheDocument();
    expect(screen.queryByText("too-large.bin")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove two.txt" }));
    expect(screen.queryByText("two.txt")).not.toBeInTheDocument();

    liveblocks.uploadAttachment.mockRejectedValueOnce("upload failed");
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The attachment could not be uploaded."));

    liveblocks.uploadAttachment.mockRejectedValueOnce(new Error("Storage unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Storage unavailable"));

    liveblocks.uploadAttachment.mockResolvedValue({ type: "attachment", id: "attachment", name: "one.bin", size: 3, mimeType: "application/octet-stream" });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(input).toHaveValue("");

    view.rerender(<CommentComposer collaborators={[]} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Comment" }), { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Comment" }), { key: "Enter", metaKey: true });
    animation.mockRestore();
  });

  it("covers pin selection, resolved state, attached coordinates, and drag cancellation", async () => {
    const attachedThread = {
      ...thread,
      resolved: true,
      metadata: { x: 5, y: 6, shapeId: "shape" },
    };
    liveblocks.threads = [attachedThread];
    const store = makeStore();
    store.dispatch(setWhiteboardData({
      id: "board",
      roomId: "board:board",
      role: "owner",
      shapes: [normalizeShape({ id: "shape", type: "rectangle", x1: 100, y1: 80, x2: 140, y2: 120, width: 40, height: 40, level: 0, zIndex: 1 })],
    }));
    store.dispatch(setCommentDraftAnchor({ x: 2, y: 3, shapeId: "shape" }));
    const view = render(<Provider store={store}><CommentPins /></Provider>);
    const layer = screen.getByLabelText("Canvas comments");
    const pin = screen.getByRole("button", { name: "Open comment 1 (resolved)" });
    expect(pin).toHaveStyle({ left: "105px", top: "86px" });
    fireEvent.click(pin);
    expect(store.getState().editor.selectedThreadId).toBe("thread-1");
    expect(store.getState().editor.rightPanel).toBe("comments");

    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500,
      toJSON: () => ({}),
    });
    Object.assign(pin, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
    });
    fireEvent.pointerDown(pin, { pointerId: 8, button: 1, clientX: 105, clientY: 86 });
    fireEvent.pointerMove(pin, { pointerId: 8, clientX: 130, clientY: 100 });
    expect(liveblocks.editThreadMetadata).not.toHaveBeenCalled();

    fireEvent.pointerDown(pin, { pointerId: 9, button: 0, clientX: 105, clientY: 86 });
    fireEvent.pointerMove(pin, { pointerId: 10, clientX: 108, clientY: 88 });
    fireEvent.pointerMove(pin, { pointerId: 9, clientX: 106, clientY: 87 });
    fireEvent.pointerUp(pin, { pointerId: 10, clientX: 106, clientY: 87 });
    fireEvent.pointerUp(pin, { pointerId: 9, clientX: 106, clientY: 87 });
    expect(liveblocks.editThreadMetadata).not.toHaveBeenCalled();

    fireEvent.pointerDown(pin, { pointerId: 10, button: 0, clientX: 105, clientY: 86 });
    fireEvent.pointerCancel(pin, { pointerId: 10 });

    fireEvent.pointerDown(pin, { pointerId: 11, button: 0, clientX: 105, clientY: 86 });
    fireEvent.pointerMove(pin, { pointerId: 11, clientX: 120, clientY: 100 });
    expect(pin).toHaveStyle({ left: "120px", top: "100px" });
    Object.assign(pin, { hasPointerCapture: vi.fn(() => true) });
    fireEvent.pointerCancel(pin, { pointerId: 11 });
    expect(pin).toHaveStyle({ left: "105px", top: "86px" });

    fireEvent.pointerDown(screen.getByText("Post").closest("div")!, { pointerId: 12 });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.getState().editor.commentDraftAnchor).toBeNull();
    view.unmount();
  });

  it("covers pin drag guards, shape-relative drops, and click suppression", () => {
    const store = makeStore();
    store.dispatch(setWhiteboardData({
      id: "board",
      roomId: "board:board",
      role: "owner",
      shapes: [normalizeShape({ id: "shape", type: "rectangle", x1: 50, y1: 40, x2: 150, y2: 140, width: 100, height: 100, level: 0, zIndex: 1 })],
    }));
    render(<Provider store={store}><CommentPins /></Provider>);
    const layer = screen.getByLabelText("Canvas comments");
    const pin = screen.getByRole("button", { name: "Open comment 1" });
    Object.assign(pin, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });

    fireEvent.pointerDown(pin, { pointerId: 1, button: 0, clientX: 20, clientY: 30 });
    fireEvent.pointerMove(pin, { pointerId: 1, clientX: 80, clientY: 90 });
    fireEvent.pointerUp(pin, { pointerId: 1, clientX: 80, clientY: 90 });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalled();
    liveblocks.editThreadMetadata.mockClear();

    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500,
      toJSON: () => ({}),
    });
    fireEvent.pointerDown(pin, { pointerId: 2, button: 0, clientX: 20, clientY: 30 });
    fireEvent.pointerMove(pin, { pointerId: 2, clientX: 80, clientY: 90 });
    fireEvent.pointerUp(pin, { pointerId: 2, clientX: 80, clientY: 90 });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalledWith({
      threadId: "thread-1",
      metadata: { x: 30, y: 50, shapeId: "shape" },
    });
    fireEvent.click(pin);
    expect(store.getState().editor.selectedThreadId).toBeNull();
    fireEvent.click(pin);
    expect(store.getState().editor.selectedThreadId).toBe("thread-1");
    fireEvent.pointerCancel(pin, { pointerId: 2 });
  });

  it("manages comments, edits content, and toggles reactions", async () => {
    const richComment = {
      ...comment,
      reactions: [
        { emoji: "heart", users: [{ id: "owner", createdAt: new Date() }] },
        { emoji: "check", users: [{ id: "other", createdAt: new Date() }] },
      ],
      body: {
        version: 1,
        content: [{
          type: "paragraph",
          children: [
            { text: "Ask " },
            { type: "mention", kind: "user", id: "owner" },
          ],
        }],
      },
    };
    const richThread = { ...thread, comments: [richComment], metadata: { x: 0, y: 0, shapeId: "", dueAt: "2026-08-30T12:00:00Z" } };
    render(<CommentThread thread={richThread as never} collaborators={[collaborator]} currentUserId="owner" selected />);
    expect(screen.getByText("@Owner").tagName).toBe("STRONG");
    expect(screen.getByText("1 comment")).toBeInTheDocument();
    expect(screen.getByLabelText("Comment due date")).toHaveValue("2026-08-30");
    fireEvent.change(screen.getByLabelText("Comment due date"), { target: { value: "" } });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalledWith({ threadId: "thread-1", metadata: { dueAt: undefined } });

    fireEvent.click(screen.getByRole("button", { name: "Remove Appreciate reaction" }));
    expect(liveblocks.removeReaction).toHaveBeenCalledWith({ threadId: "thread-1", commentId: "comment-1", emoji: "heart" });
    fireEvent.click(screen.getByRole("button", { name: "Add Approved reaction" }));
    expect(liveblocks.addReaction).toHaveBeenCalledWith({ threadId: "thread-1", commentId: "comment-1", emoji: "check" });

    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    const input = screen.getByRole("textbox", { name: "Comment" });
    expect(input).toHaveValue("Ask @Owner");
    fireEvent.change(input, { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(liveblocks.editComment).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "thread-1",
      commentId: "comment-1",
      attachments: [],
    }));

    fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(liveblocks.deleteComment).toHaveBeenCalledWith({ threadId: "thread-1", commentId: "comment-1" });
    fireEvent.click(screen.getByRole("button", { name: "Delete thread" }));
    expect(liveblocks.deleteThread).toHaveBeenCalledWith("thread-1");
  });

  it("renders attachment states, deleted comments, identity fallbacks, and resolved controls", () => {
    liveblocks.attachmentUrl.mockImplementation((id: string) => {
      if (id === "loading") return { isLoading: true };
      if (id === "error") return { isLoading: false, error: new Error("gone") };
      return { isLoading: false, url: `https://files.example/${id}` };
    });
    const attachments = [
      { type: "attachment", id: "loading", name: "loading.txt", size: 0, mimeType: "text/plain" },
      { type: "attachment", id: "error", name: "error.txt", size: 2000, mimeType: "text/plain" },
      { type: "attachment", id: "image", name: "image.png", size: 2048, mimeType: "image/png" },
      { type: "attachment", id: "file", name: "file.pdf", size: 1, mimeType: "application/pdf" },
    ];
    const comments = [
      { ...comment, attachments, userId: "email-only", body: null },
      { ...comment, id: "comment-2", userId: "unknown", attachments, body: comment.body },
    ];
    const emailOnly = { ...collaborator, id: "email-only", name: "", email: "fallback@example.com" };
    const resolvedThread = {
      ...thread,
      resolved: true,
      comments,
      metadata: { x: 0, y: 0, shapeId: "", assigneeId: "", priority: undefined, dueAt: undefined },
    };
    const view = render(<CommentThread thread={resolvedThread as never} collaborators={[emailOnly]} currentUserId="nobody" />);
    expect(screen.getByText("Comment removed")).toBeInTheDocument();
    expect(screen.getByText("Collaborator")).toBeInTheDocument();
    expect(screen.getByText("Loading loading.txt…")).toBeInTheDocument();
    expect(screen.getByText("error.txt unavailable")).toBeInTheDocument();
    expect(view.container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getAllByText("1 KB")).not.toHaveLength(0);
    expect(screen.getAllByText("2 KB")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Delete thread" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
    expect(liveblocks.reopen).toHaveBeenCalledWith("thread-1");
    fireEvent.change(screen.getByLabelText("Comment assignee"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Comment due date"), { target: { value: "" } });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalledWith({ threadId: "thread-1", metadata: { assigneeId: undefined } });
    expect(liveblocks.editThreadMetadata).toHaveBeenCalledWith({ threadId: "thread-1", metadata: { dueAt: undefined } });
  });

  it("cancels replies and omits optional focus controls", () => {
    const emptyThread = { ...thread, comments: [], metadata: { x: 0, y: 0, shapeId: "" } };
    render(<CommentThread thread={emptyThread as never} collaborators={[]} currentUserId={null} />);
    expect(screen.getByText("0 comments")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Reply" })).toBeInTheDocument();
  });
});
