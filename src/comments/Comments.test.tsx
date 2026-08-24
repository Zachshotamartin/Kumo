import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import actionsReducer from "../features/actions/actionsSlice";
import authReducer, { login } from "../features/auth/authSlice";
import editorReducer, { setCommentDraftAnchor, setRightPanel } from "../features/editor/editorSlice";
import selectedReducer from "../features/selected/selectedSlice";
import whiteBoardReducer, { setWhiteboardData } from "../features/whiteBoard/whiteBoardSlice";
import { CommentsPanel } from "./CommentsPanel";
import { CommentPins } from "./CommentPins";

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
  useAttachmentUrl: () => ({ isLoading: false, url: "https://files.example/attachment" }),
}));

vi.mock("../services/collaboratorRepository", () => ({
  listBoardCollaborators: vi.fn().mockResolvedValue([{
    id: "owner",
    email: "owner@example.com",
    name: "Owner",
    avatar: "",
    role: "owner",
  }]),
}));

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
    liveblocks.createThread.mockReturnValue(thread);
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
    fireEvent.pointerDown(pin, { pointerId: 4, button: 0, clientX: 20, clientY: 30 });
    fireEvent.pointerMove(pin, { pointerId: 4, clientX: 90, clientY: 110 });
    fireEvent.pointerUp(pin, { pointerId: 4, clientX: 90, clientY: 110 });
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
});
