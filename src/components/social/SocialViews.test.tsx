import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import authReducer, { login } from "../../features/auth/authSlice";
import { FriendsView } from "./FriendsView";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileView } from "./ProfileView";

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

const person = (id: string, relationship: "friend" | "incoming" | "outgoing" | "none" = "friend") => ({
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
    render(<FriendsView onOpenProfile={vi.fn()} onIncomingCountChange={vi.fn()} />);
    await screen.findByText("Alex Rivera");
    fireEvent.change(screen.getByPlaceholderText("Search names or usernames"), { target: { value: "al" } });
    expect(await screen.findByText("Search results")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Add friend" }));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledWith("alex", "request"));
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

  const renderProfile = (profile = ownProfile) => {
    const store = configureStore({ reducer: { auth: authReducer } });
    store.dispatch(login({ uid: "avery", email: "avery@example.com" }));
    mocks.getProfile.mockResolvedValue(profile);
    mocks.updateProfile.mockResolvedValue({ ...profile, displayName: "Avery Updated" });
    const openBoard = vi.fn();
    render(<Provider store={store}><ProfileView onOpenBoard={openBoard} onIncomingCountChange={vi.fn()} /></Provider>);
    return { store, openBoard };
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
  });
});
