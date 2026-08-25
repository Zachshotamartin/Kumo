import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import authReducer, { login } from "../../features/auth/authSlice";
import { FriendsView } from "./FriendsView";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileView } from "./ProfileView";
import type { RelationshipStatus, UserProfile } from "../../services/socialRepository";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  search: vi.fn(),
  mutate: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  clipboard: vi.fn(),
}));

vi.mock("../../services/socialRepository", () => ({
  listFriendships: mocks.list,
  searchProfiles: mocks.search,
  mutateFriendship: mocks.mutate,
  getProfile: mocks.getProfile,
  updateProfile: mocks.updateProfile,
}));

const person = (id: string, relationship: RelationshipStatus = "friend") => ({
  id,
  username: id,
  displayName: id === "alex" ? "Alex Rivera" : "Taylor Chen",
  bio: "Maps product systems.",
  avatarUrl: null,
  relationship,
});

describe("friends view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      friends: [person("alex")],
      incoming: [person("taylor", "incoming")],
      outgoing: [],
      blocked: [],
    });
    mocks.search.mockResolvedValue([person("alex", "none")]);
    mocks.mutate.mockResolvedValue("friend");
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders relationship groups, accepts requests, and reports the incoming count", async () => {
    const open = vi.fn();
    const count = vi.fn();
    render(<FriendsView onOpenProfile={open} onIncomingCountChange={count} />);
    expect(await screen.findByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Taylor Chen")).toBeInTheDocument();
    expect(count).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("taylor", "accept"));
    expect(mocks.list).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Open Alex Rivera's profile" }));
    expect(open).toHaveBeenCalledWith("alex");
  });

  it("debounces profile search and offers a friend request", async () => {
    mocks.search.mockResolvedValueOnce([person("alex", "none"), person("taylor", "none")]);
    render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    await screen.findByText("Alex Rivera");
    fireEvent.change(screen.getByPlaceholderText("Search names or usernames"), { target: { value: "al" } });
    expect(await screen.findByText("Search results")).toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole("button", { name: "Add friend" }))[0]!);
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("alex", "request"));
  });

  it("renders and mutates every relationship with confirmations and sparse bios", async () => {
    const alex = { ...person("alex"), bio: "" };
    const taylor = person("taylor", "incoming");
    const outgoing = person("outgoing", "outgoing");
    const blocked = { ...person("blocked"), relationship: "blocked" as const };
    mocks.list.mockResolvedValue({ friends: [alex], incoming: [taylor], outgoing: [outgoing], blocked: [blocked] });
    render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    await screen.findByText("Sent requests");
    expect(screen.getByText("Blocked profiles")).toBeVisible();
    expect(screen.getAllByText("Maps product systems.")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("taylor", "decline"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("outgoing", "cancel"));
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("blocked", "unblock"));

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Block" })[0]!);
    expect(mocks.mutate).not.toHaveBeenCalledWith("taylor", "block");
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Block" })[0]!);
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("taylor", "block"));

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    expect(mocks.mutate).not.toHaveBeenCalledWith("alex", "remove");
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("alex", "remove"));
  });

  it("reports friendship loading and mutation failures from Error and non-Error values", async () => {
    mocks.list.mockRejectedValueOnce(new Error("Friends unavailable"));
    const first = render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Friends unavailable");
    first.unmount();

    mocks.list.mockRejectedValueOnce("offline");
    const second = render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your friends.");
    second.unmount();

    mocks.list.mockResolvedValue({ friends: [person("alex")], incoming: [], outgoing: [], blocked: [] });
    mocks.mutate.mockRejectedValueOnce(new Error("Update unavailable"));
    const mutations = render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove friend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Update unavailable");
    mocks.mutate.mockRejectedValueOnce("update unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't update this friendship."));
    mutations.unmount();
  });

  it("handles empty and failed searches, short-query clearing, and stale results", async () => {
    mocks.search.mockResolvedValueOnce([]);
    render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    await screen.findByText("Alex Rivera");
    const input = screen.getByPlaceholderText("Search names or usernames");
    fireEvent.change(input, { target: { value: "zz" } });
    expect(await screen.findByText("No profiles found")).toBeVisible();
    fireEvent.change(input, { target: { value: "z" } });
    expect(screen.getByText("Alex Rivera")).toBeVisible();

    mocks.search.mockRejectedValueOnce(new Error("Search failed"));
    fireEvent.change(input, { target: { value: "er" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Search failed");
    mocks.search.mockRejectedValueOnce("search failed");
    fireEvent.change(input, { target: { value: "no" } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't search profiles."));

    let resolveSearch!: (value: ReturnType<typeof person>[]) => void;
    mocks.search.mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }));
    fireEvent.change(input, { target: { value: "stale" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith("stale"));
    fireEvent.change(input, { target: { value: "s" } });
    await act(async () => { resolveSearch([person("stale")]); await Promise.resolve(); });
    expect(screen.queryByText("Search results")).not.toBeInTheDocument();

    let rejectSearch!: (reason: unknown) => void;
    mocks.search.mockImplementationOnce(() => new Promise((_, reject) => { rejectSearch = reject; }));
    fireEvent.change(input, { target: { value: "late" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith("late"));
    fireEvent.change(input, { target: { value: "l" } });
    await act(async () => { rejectSearch(new Error("Too late")); await Promise.resolve(); });
    expect(screen.queryByText("Too late")).not.toBeInTheDocument();
  });

  it("ignores friendship loading completion after unmount", async () => {
    let resolveList!: (value: { friends: ReturnType<typeof person>[]; incoming: never[]; outgoing: never[]; blocked: never[] }) => void;
    mocks.list.mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
    const success = render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    success.unmount();
    await act(async () => { resolveList({ friends: [person("alex")], incoming: [], outgoing: [], blocked: [] }); await Promise.resolve(); });

    let rejectList!: (reason: unknown) => void;
    mocks.list.mockImplementationOnce(() => new Promise((_, reject) => { rejectList = reject; }));
    const failure = render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    failure.unmount();
    await act(async () => { rejectList(new Error("Too late")); await Promise.resolve(); });
  });
});

it("falls back to initials when an avatar image cannot load", () => {
  const { container } = render(<ProfileAvatar name="Alex" avatarUrl="https://images.example/missing.png" />);
  const image = container.querySelector("img");
  expect(image).toBeInTheDocument();
  fireEvent.error(image!);
  expect(container).toHaveTextContent("A");
  expect(container.querySelector("img")).not.toBeInTheDocument();
});

it("uses the Kumo initial when a profile has no display name", () => {
  const { container } = render(<ProfileAvatar name="   " />);
  expect(container).toHaveTextContent("K");
});

describe("profile view", () => {
  const ownProfile = {
    ...person("avery", "none"),
    displayName: "Avery Morgan",
    editable: true,
    email: "avery@example.com",
    discoverable: true,
    friendRequestPolicy: "everyone" as const,
    friendCount: 2,
    publicBoardCount: 1,
    publicBoards: [{
      id: "public", title: "System map", ownerId: "avery", visibility: "public" as const,
      roomId: "board:public", role: "viewer" as const, updatedAt: 1, thumbnailUrl: null,
    }],
  };

  const renderProfile = (profile: UserProfile = ownProfile, username?: string | null) => {
    const store = configureStore({ reducer: { auth: authReducer } });
    store.dispatch(login({ uid: "avery", email: "avery@example.com" }));
    mocks.getProfile.mockResolvedValue(profile);
    mocks.updateProfile.mockResolvedValue({ ...profile, displayName: "Avery Updated" });
    const openBoard = vi.fn();
    const view = render(<Provider store={store}><ProfileView username={username} onOpenBoard={openBoard} onIncomingCountChange={vi.fn()} /></Provider>);
    return { store, openBoard, ...view };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutate.mockResolvedValue("outgoing");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.clipboard } });
    mocks.clipboard.mockResolvedValue(undefined);
  });

  it("edits the current profile, privacy settings, and Redux account identity", async () => {
    const { store, openBoard } = renderProfile();
    expect(await screen.findByRole("heading", { name: "Avery Morgan" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Avery Updated" } });
    fireEvent.change(screen.getByLabelText("Biography"), { target: { value: "Designing connected canvases." } });
    fireEvent.click(screen.getByLabelText("Show me in profile search"));
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      displayName: "Avery Updated",
      bio: "Designing connected canvases.",
      discoverable: false,
    })));
    expect(store.getState().auth.displayName).toBe("Avery Updated");
    fireEvent.click(screen.getByRole("button", { name: "View System map" }));
    expect(openBoard).toHaveBeenCalledWith(expect.objectContaining({ id: "public" }));
  });

  it("requests a friendship and copies another person's profile link", async () => {
    renderProfile({
      ...ownProfile,
      ...person("alex", "none"),
      editable: false,
      friendCount: 0,
      publicBoardCount: 0,
      publicBoards: [],
    });
    expect(await screen.findByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("alex", "request"));
    fireEvent.click(screen.getByRole("button", { name: "Copy profile link" }));
    await waitFor(() => expect(mocks.clipboard).toHaveBeenCalledWith(expect.stringContaining("profile=alex")));
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 1650)); });
  });

  it("loads profile defaults, edits every field, and updates a routed profile URL", async () => {
    const defaulted = {
      ...ownProfile,
      avatarUrl: undefined,
      discoverable: undefined,
      friendRequestPolicy: undefined,
      bio: "",
    };
    renderProfile(defaulted as unknown as UserProfile, "old-name");
    expect(await screen.findByText("Add a short note about what you make.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "NEW.NAME" } });
    fireEvent.change(screen.getByLabelText("Avatar URL"), { target: { value: "https://images.example/avatar.png" } });
    fireEvent.change(screen.getByLabelText("Friend requests"), { target: { value: "friends_of_friends" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      username: "new.name",
      avatarUrl: "https://images.example/avatar.png",
      friendRequestPolicy: "friends_of_friends",
    })));
    expect(window.location.search).toContain("profile=avery");
  });

  it("sends a null avatar, guards duplicate saves, and reports save failures", async () => {
    let finishSave!: (value: typeof ownProfile) => void;
    mocks.updateProfile.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    renderProfile();
    await screen.findByRole("heading", { name: "Avery Morgan" });
    const form = screen.getByRole("button", { name: "Save profile" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
    expect(mocks.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: null }));
    await act(async () => { finishSave(ownProfile); await Promise.resolve(); });

    mocks.updateProfile.mockRejectedValueOnce(new Error("Save unavailable"));
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent("Save unavailable");
    mocks.updateProfile.mockRejectedValueOnce("save unavailable");
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't save your profile."));
  });

  it.each([
    ["incoming", "Accept request", "accept", "sent you a friend request"],
    ["outgoing", "Cancel request", "cancel", "waiting for a response"],
    ["blocked", "Unblock", "unblock", "You blocked this profile"],
  ] as const)("renders and applies the %s relationship", async (relationship, label, action, copy) => {
    const incomingCount = vi.fn();
    const profile = { ...ownProfile, ...person("alex", relationship), editable: false, publicBoards: [], publicBoardCount: 0 };
    const store = configureStore({ reducer: { auth: authReducer } });
    mocks.getProfile.mockResolvedValue(profile);
    render(<Provider store={store}><ProfileView onOpenBoard={vi.fn()} onIncomingCountChange={incomingCount} /></Provider>);
    expect(await screen.findByText(new RegExp(copy))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("alex", action));
    expect(incomingCount).toHaveBeenCalled();
  });

  it("confirms friend removal and blocking, including cancellation and errors", async () => {
    const friend = { ...ownProfile, ...person("alex", "friend"), editable: false, bio: "", publicBoards: [], publicBoardCount: 0 };
    renderProfile(friend);
    expect(await screen.findByText("This profile has no biography yet.")).toBeVisible();
    expect(screen.getByText(/You are friends/)).toBeVisible();

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    mocks.mutate.mockRejectedValueOnce(new Error("Relationship unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Remove friend" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Relationship unavailable");

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(mocks.mutate).not.toHaveBeenCalledWith("alex", "block");
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    mocks.mutate.mockRejectedValueOnce("relationship unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't update this friendship."));
  });

  it("shows working relationship progress and the fallback for an unsupported relationship", async () => {
    let finish!: (value: string) => void;
    mocks.mutate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const outgoing = { ...ownProfile, ...person("alex", "none"), editable: false, publicBoards: [], publicBoardCount: 0 };
    const first = renderProfile(outgoing);
    fireEvent.click(await screen.findByRole("button", { name: "Add friend" }));
    expect(screen.getByRole("button", { name: "Working" })).toBeDisabled();
    await act(async () => { finish("outgoing"); await Promise.resolve(); });
    expect(first.store.getState().auth.uid).toBe("avery");
  });

  it("renders editable empty boards and an unsupported external relationship", async () => {
    const editable = renderProfile({ ...ownProfile, publicBoards: [], publicBoardCount: 0 });
    expect(await screen.findByText("Set a board to public to show it here.")).toBeVisible();
    expect(editable.store.getState().auth.uid).toBe("avery");
    editable.unmount();

    const unsupported = { ...ownProfile, ...person("alex", "none"), relationship: "unsupported" as never, editable: false, publicBoards: [], publicBoardCount: 0 };
    const store = configureStore({ reducer: { auth: authReducer } });
    mocks.getProfile.mockResolvedValueOnce(unsupported);
    render(<Provider store={store}><ProfileView onOpenBoard={vi.fn()} onIncomingCountChange={vi.fn()} /></Provider>);
    expect(await screen.findByText("Add this person as a friend to make future board sharing faster.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add friend" })).not.toBeInTheDocument();
  });

  it("reports profile loading and clipboard failures, missing profiles, and ignores stale loads", async () => {
    const store = configureStore({ reducer: { auth: authReducer } });
    const renderWithMocks = () => render(<Provider store={store}><ProfileView onOpenBoard={vi.fn()} onIncomingCountChange={vi.fn()} /></Provider>);
    mocks.getProfile.mockRejectedValueOnce(new Error("Profile unavailable"));
    const first = renderWithMocks();
    expect(await screen.findByRole("alert")).toHaveTextContent("Profile unavailable");
    first.unmount();

    mocks.getProfile.mockRejectedValueOnce("offline");
    const second = renderWithMocks();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load this profile.");
    second.unmount();

    mocks.getProfile.mockResolvedValueOnce(null);
    const missing = renderWithMocks();
    expect(await screen.findByRole("alert")).toHaveTextContent("Profile not found.");
    missing.unmount();

    const other = { ...ownProfile, ...person("alex", "none"), editable: false, publicBoards: [], publicBoardCount: 0 };
    mocks.getProfile.mockResolvedValueOnce(other);
    mocks.clipboard.mockRejectedValueOnce(new Error("denied"));
    const copy = renderWithMocks();
    fireEvent.click(await screen.findByRole("button", { name: "Copy profile link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("browser blocked clipboard");
    copy.unmount();

    let resolveProfile!: (value: typeof other) => void;
    mocks.getProfile.mockImplementationOnce(() => new Promise((resolve) => { resolveProfile = resolve; }));
    const staleSuccess = renderWithMocks();
    staleSuccess.unmount();
    await act(async () => { resolveProfile(other); await Promise.resolve(); });
    let rejectProfile!: (reason: unknown) => void;
    mocks.getProfile.mockImplementationOnce(() => new Promise((_, reject) => { rejectProfile = reject; }));
    const staleFailure = renderWithMocks();
    staleFailure.unmount();
    await act(async () => { rejectProfile(new Error("Too late")); await Promise.resolve(); });
  });
});
