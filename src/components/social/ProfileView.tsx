import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Prohibit,
  UserMinus,
  UserPlus,
  X,
} from "@phosphor-icons/react";
import { useDispatch } from "react-redux";
import { setAuthenticatedProfile } from "../../features/auth/authSlice";
import type { AppDispatch } from "../../store";
import type { BoardSummary } from "../../services/boardRepository";
import {
  getProfile,
  mutateFriendship,
  updateProfile,
  uploadProfileAvatar,
  type FriendRequestPolicy,
  type FriendshipAction,
  type UserProfile,
} from "../../services/socialRepository";
import { BoardCard } from "../dashboard/BoardCard";
import ui from "../ui/Ui.module.css";
import { ProfileAvatar } from "./ProfileAvatar";
import styles from "./Social.module.css";

const relationshipAction = (profile: UserProfile): { action: FriendshipAction; label: string; icon: typeof UserPlus } | null => {
  if (profile.relationship === "none") return { action: "request", label: "Add friend", icon: UserPlus };
  if (profile.relationship === "incoming") return { action: "accept", label: "Accept request", icon: Check };
  if (profile.relationship === "outgoing") return { action: "cancel", label: "Cancel request", icon: X };
  if (profile.relationship === "friend") return { action: "remove", label: "Remove friend", icon: UserMinus };
  if (profile.relationship === "blocked") return { action: "unblock", label: "Unblock", icon: Check };
  return null;
};

export const ProfileView = ({
  username,
  onOpenBoard,
  onIncomingCountChange,
}: {
  username?: string | null;
  onOpenBoard: (board: BoardSummary) => void;
  onIncomingCountChange: () => void;
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const profileRef = useRef<UserProfile | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    bio: "",
    avatarUrl: "",
    discoverable: true,
    friendRequestPolicy: "everyone" as FriendRequestPolicy,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    let active = true;
    void getProfile(username ?? undefined)
      .then((next) => {
        if (!active) return;
        if (!next) {
          setProfile(null);
          setLoading(false);
          return;
        }
        setProfile(next);
        setForm({
          displayName: next.displayName,
          username: next.username,
          bio: next.bio,
          avatarUrl: next.avatarUrl ?? "",
          discoverable: next.discoverable ?? true,
          friendRequestPolicy: next.friendRequestPolicy ?? "everyone",
        });
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "We couldn't load this profile.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [username]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = await updateProfile({
        ...form,
        avatarUrl: form.avatarUrl || null,
      });
      setProfile(next);
      setForm((current) => ({ ...current, username: next.username, displayName: next.displayName }));
      if (username) {
        const url = new URL(window.location.href);
        url.searchParams.set("profile", next.username);
        window.history.replaceState({}, "", url);
      }
      dispatch(setAuthenticatedProfile({
        displayName: next.displayName,
        username: next.username,
        avatarUrl: next.avatarUrl,
      }));
      setMessage("Profile saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const changeRelationship = async (action: FriendshipAction) => {
    const current = profile!;
    if ((action === "block" || action === "remove") && !window.confirm(
      action === "block"
        ? `Block ${current.displayName}? They will not be able to find or request you.`
        : `Remove ${current.displayName} from your friends? Existing board access will stay unchanged.`
    )) return;
    setBusy(true);
    setError(null);
    try {
      const relationship = await mutateFriendship(current.id, action);
      setProfile({ ...current, relationship });
      onIncomingCountChange();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't update this friendship.");
    } finally {
      setBusy(false);
    }
  };

  const copyProfileLink = async () => {
    const current = profile!;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("board");
      url.searchParams.set("profile", current.username);
      url.hash = "";
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Your browser blocked clipboard access.");
    }
  };

  if (loading) return <div className={styles.skeleton} aria-label="Loading profile" />;
  if (!profile) return <div className={`${ui.notice} ${ui.noticeError}`} role="alert">{error ?? "Profile not found."}</div>;
  const primary = relationshipAction(profile);
  const PrimaryIcon = primary?.icon;

  return (
    <div className={styles.page}>
      {error && <div className={`${ui.notice} ${ui.noticeError}`} role="alert">{error}</div>}
      {message && <div className={`${ui.notice} ${ui.noticeSuccess}`} role="status">{message}</div>}
      <div className={styles.profileGrid}>
        <section className={`${ui.surface} ${styles.profileCard}`} aria-labelledby="profile-name">
          <ProfileAvatar className={styles.profileAvatar} name={profile.displayName} avatarUrl={profile.avatarUrl} size={88} />
          <h1 className={styles.profileName} id="profile-name">{profile.displayName}</h1>
          <span className={styles.handle}>@{profile.username}</span>
          <p className={styles.profileBio}>{profile.bio || (profile.editable ? "Add a short note about what you make." : "This profile has no biography yet.")}</p>
          <div className={styles.profileStats}>
            <span><strong>{profile.friendCount}</strong><small>Friends</small></span>
            <span><strong>{profile.publicBoardCount}</strong><small>Public boards</small></span>
          </div>
          <div className={styles.profileActions}>
            <button type="button" className={ui.button} onClick={copyProfileLink}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy profile link"}
            </button>
            {!profile.editable && primary && PrimaryIcon && (
              <button type="button" className={`${ui.button} ${ui.buttonPrimary}`} disabled={busy} onClick={() => changeRelationship(primary.action)}>
                <PrimaryIcon aria-hidden="true" />{busy ? "Working" : primary.label}
              </button>
            )}
            {!profile.editable && profile.relationship !== "blocked" && (
              <button type="button" className={`${ui.button} ${ui.buttonDanger}`} disabled={busy} onClick={() => changeRelationship("block")}>
                <Prohibit aria-hidden="true" />Block
              </button>
            )}
          </div>
        </section>

        {profile.editable ? (
          <section className={`${ui.surface} ${styles.editorCard}`} aria-labelledby="profile-edit-title">
            <h2 id="profile-edit-title">Profile settings</h2>
            <form className={styles.form} onSubmit={save}>
              <label className={`${ui.field} ${styles.field}`}>
                <span className={ui.fieldLabel}>Display name</span>
                <input className={ui.control} aria-label="Display name" required maxLength={60} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
                <small className={ui.fieldHelp}>The name collaborators see on boards and comments.</small>
              </label>
              <label className={`${ui.field} ${styles.field}`}>
                <span className={ui.fieldLabel}>Username</span>
                <input className={ui.control} aria-label="Username" required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9._-]{2,29}" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} />
                <small className={ui.fieldHelp}>Used in profile links. Lowercase letters, numbers, periods, underscores, or hyphens.</small>
              </label>
              <label className={`${ui.field} ${styles.field} ${styles.fieldWide}`}>
                <span className={ui.fieldLabel}>Biography</span>
                <textarea className={ui.control} aria-label="Biography" maxLength={280} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} />
                <small className={ui.fieldHelp}>{form.bio.length}/280 characters</small>
              </label>
              <label className={`${ui.field} ${styles.field} ${styles.fieldWide}`}>
                <span className={ui.fieldLabel}>Avatar image</span>
                <input className={ui.control} aria-label="Upload avatar" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploadingAvatar} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setUploadingAvatar(true); setError(null); void uploadProfileAvatar(file).then((avatarUrl) => { setForm((current) => ({ ...current, avatarUrl })); const current = profileRef.current!; const next = { ...current, avatarUrl }; profileRef.current = next; setProfile(next); dispatch(setAuthenticatedProfile({ displayName: next.displayName, username: next.username, avatarUrl })); setMessage("Avatar cropped and uploaded."); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Avatar upload failed.")).finally(() => setUploadingAvatar(false)); }} />
                <small className={ui.fieldHelp}>{uploadingAvatar ? "Cropping and uploading…" : "PNG, JPEG, or WebP. Kumo center-crops to a square and stores the optimized image."}</small>
              </label>
              <label className={`${ui.field} ${styles.field}`}>
                <span className={ui.fieldLabel}>Friend requests</span>
                <select className={ui.control} aria-label="Friend requests" value={form.friendRequestPolicy} onChange={(event) => setForm({ ...form, friendRequestPolicy: event.target.value as FriendRequestPolicy })}>
                  <option value="everyone">Everyone</option>
                  <option value="friends_of_friends">Friends of friends</option>
                  <option value="none">Nobody</option>
                </select>
                <small className={ui.fieldHelp}>Controls who can start a new friendship.</small>
              </label>
              <label className={styles.toggle}>
                <input aria-label="Show me in profile search" type="checkbox" checked={form.discoverable} onChange={(event) => setForm({ ...form, discoverable: event.target.checked })} />
                <span><strong>Show me in profile search</strong><small>Your direct profile link keeps working when search is off.</small></span>
              </label>
              <div className={styles.formFooter}>
                <small className={ui.fieldHelp}>Your email stays private until you share a board with someone.</small>
                <button type="submit" className={`${ui.button} ${ui.buttonPrimary}`} disabled={saving}>{saving ? "Saving" : "Save profile"}</button>
              </div>
            </form>
          </section>
        ) : (
          <section className={`${ui.surface} ${styles.editorCard}`} aria-labelledby="relationship-title">
            <h2 id="relationship-title">Working relationship</h2>
            <p className={styles.profileBio}>
              {profile.relationship === "friend"
                ? "You are friends. This profile is available directly in every board sharing dialog."
                : profile.relationship === "incoming"
                  ? `${profile.displayName} sent you a friend request.`
                  : profile.relationship === "outgoing"
                    ? `Your request to ${profile.displayName} is waiting for a response.`
                    : profile.relationship === "blocked"
                      ? "You blocked this profile."
                      : "Add this person as a friend to make future board sharing faster."}
            </p>
          </section>
        )}
      </div>

      <section className={styles.boardSection} aria-labelledby="profile-boards-title">
        <div className={ui.sectionHeading}><h2 id="profile-boards-title">Public boards</h2><span>{profile.publicBoards.length}</span></div>
        {profile.publicBoards.length ? (
          <div className={styles.boardGrid}>
            {profile.publicBoards.map((board) => <BoardCard key={board.id} board={board} actionLabel="View" onOpen={() => onOpenBoard(board)} />)}
          </div>
        ) : (
          <div className={ui.emptyState}><strong>No public boards</strong><span>{profile.editable ? "Set a board to public to show it here." : "This person has not published a board."}</span></div>
        )}
      </section>
    </div>
  );
};
