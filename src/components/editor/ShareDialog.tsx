import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Link, LockSimple, MagnifyingGlass, UserPlus, Warning, X } from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import { removeShare, share } from "../../features/whiteBoard/whiteBoardSlice";
import {
  getBoardSharePlan,
  inviteBoardCollaborator,
  inviteBoardFriend,
  listBoardCollaborators,
  removeBoardCollaborator,
  type BoardCollaborator,
  type BoardSharePlan,
} from "../../services/collaboratorRepository";
import { listFriendships, type SocialProfile } from "../../services/socialRepository";
import { AppDispatch, RootState } from "../../store";
import { ProfileAvatar } from "../social/ProfileAvatar";
import ui from "../ui/Ui.module.css";
import styles from "./EditorWorkspace.module.css";

interface ShareDialogProps {
  onClose: () => void;
}

const directBoardUrl = (boardId: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("board", boardId);
  url.hash = "";
  return url.toString();
};

const ShareDialog = ({ onClose }: ShareDialogProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [friendQuery, setFriendQuery] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [includeLinkedBoards, setIncludeLinkedBoards] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<BoardCollaborator[]>([]);
  const [friends, setFriends] = useState<SocialProfile[]>([]);
  const [invitingFriendUid, setInvitingFriendUid] = useState<string | null>(null);
  const [plan, setPlan] = useState<BoardSharePlan | null>(null);
  const isOwner = board.role === "owner";

  useEffect(() => {
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (!board.id) return;
    let active = true;
    void Promise.all([
      listBoardCollaborators(board.id),
      isOwner ? getBoardSharePlan(board.id) : Promise.resolve(null),
    ]).then(([people, nextPlan]) => {
      if (!active) return;
      setCollaborators(people);
      setPlan(nextPlan);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "We couldn't load board access.");
    }).finally(() => {
      if (active) setLoadingAccess(false);
    });
    return () => { active = false; };
  }, [board.id, isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    let active = true;
    void listFriendships()
      .then((overview) => {
        if (active) setFriends(overview.friends);
      })
      .catch(() => {
        if (active) setFriends([]);
      });
    return () => { active = false; };
  }, [isOwner]);

  const linkedBoards = useMemo(
    () => plan?.boards.filter((candidate) => candidate.id !== board.id) ?? [],
    [board.id, plan]
  );
  const managedLinkedBoards = linkedBoards.filter((candidate) => candidate.manageable);
  const externalPrivateBoards = linkedBoards.filter((candidate) => !candidate.manageable && candidate.visibility === "private");
  const shareConnectedBoards = includeLinkedBoards && !plan?.truncated;
  const collaboratorIds = useMemo(() => new Set(collaborators.map((person) => person.id)), [collaborators]);
  const availableFriends = useMemo(() => {
    const normalized = friendQuery.trim().toLowerCase();
    return friends
      .filter((friend) => !collaboratorIds.has(friend.id))
      .filter((friend) => !normalized || friend.displayName.toLowerCase().includes(normalized) || friend.username.toLowerCase().includes(normalized))
      .slice(0, 6);
  }, [collaboratorIds, friendQuery, friends]);

  const recordInvite = (
    result: Awaited<ReturnType<typeof inviteBoardCollaborator>>,
    fallbackName: string
  ) => {
    dispatch(share({ uid: result.uid, role: result.role }));
    setCollaborators((current) => {
      const next = current.filter((person) => person.id !== result.uid);
      return [...next, {
        id: result.uid,
        email: result.email,
        name: result.name || fallbackName,
        avatar: result.avatar ?? "",
        role: result.role,
      }].sort((left, right) => left.name.localeCompare(right.name));
    });
  };

  const inviteMessage = (recipient: string, sharedCount: number, inaccessibleCount: number) =>
    `${recipient} can now ${role === "editor" ? "edit" : "view"} ${sharedCount === 1 ? "this board" : `${sharedCount} connected boards`}.` +
    (inaccessibleCount ? ` ${inaccessibleCount} private ${inaccessibleCount === 1 ? "destination still needs" : "destinations still need"} its owner.` : "");

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!board.id || submitting) return;
    const invitedEmail = email.trim();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await inviteBoardCollaborator(board.id, invitedEmail, role, shareConnectedBoards);
      recordInvite(result, invitedEmail);
      setEmail("");
      setMessage(inviteMessage(invitedEmail, result.sharedBoards.length, result.unavailableBoards.length));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't invite this person.");
    } finally {
      setSubmitting(false);
    }
  };

  const inviteFriend = async (friend: SocialProfile) => {
    if (!board.id || submitting || invitingFriendUid) return;
    setInvitingFriendUid(friend.id);
    setError(null);
    setMessage(null);
    try {
      const result = await inviteBoardFriend(board.id, friend.id, role, shareConnectedBoards);
      recordInvite(result, friend.displayName);
      setMessage(inviteMessage(friend.displayName, result.sharedBoards.length, result.unavailableBoards.length));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't share with this friend.");
    } finally {
      setInvitingFriendUid(null);
    }
  };

  const removeMember = async (memberUid: string) => {
    if (!board.id || removingUid) return;
    setError(null);
    setMessage(null);
    setRemovingUid(memberUid);
    try {
      await removeBoardCollaborator(board.id, memberUid, shareConnectedBoards);
      dispatch(removeShare(memberUid));
      setCollaborators((current) => current.filter((person) => person.id !== memberUid));
      setMessage("Access removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't remove this person.");
    } finally {
      setRemovingUid(null);
    }
  };

  const copyLink = async () => {
    if (!board.id) return;
    try {
      await navigator.clipboard.writeText(directBoardUrl(board.id));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Your browser blocked clipboard access.");
    }
  };

  return (
    <div className={styles.dialogBackdrop} onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`${styles.dialog} ${styles.shareDialog}`} role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className={styles.dialogHeader}>
          <div>
            <span className={styles.dialogEyebrow}>Board access</span>
            <h2 id="share-title">Share “{board.title}”</h2>
          </div>
          <button type="button" className={`${ui.button} ${ui.buttonGhost} ${ui.iconButton} ${styles.closeButton}`} aria-label="Close sharing dialog" onClick={onClose}><X aria-hidden="true" /></button>
        </div>

        <div className={styles.shareLinkRow}>
          <span><Link aria-hidden="true" /><b>Direct board link</b><small>Only people with access can open it.</small></span>
          <button type="button" className={`${ui.button} ${ui.buttonCompact}`} onClick={copyLink}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy link"}</button>
        </div>

        {isOwner ? (
          <>
          <section className={styles.friendShare} aria-labelledby="friend-share-title">
            <div className={styles.friendShareHeading}>
              <span><UserPlus aria-hidden="true" /><strong id="friend-share-title">Share with a friend</strong></span>
              <div className={styles.friendShareControls}>
                <label>
                  <span className="sr-only">Find a friend to share with</span>
                  <MagnifyingGlass aria-hidden="true" />
                  <input value={friendQuery} onChange={(event) => setFriendQuery(event.target.value)} placeholder="Find a friend" />
                </label>
                <select aria-label="Friend sharing role" value={role} onChange={(event) => setRole(event.target.value as "editor" | "viewer")}>
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
              </div>
            </div>
            {availableFriends.length > 0 ? (
              <div className={styles.friendShareList}>
                {availableFriends.map((friend) => (
                  <div className={styles.friendShareRow} key={friend.id}>
                    <ProfileAvatar name={friend.displayName} avatarUrl={friend.avatarUrl} size={30} />
                    <span><strong>{friend.displayName}</strong><small>@{friend.username}</small></span>
                    <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${ui.buttonCompact}`} disabled={Boolean(invitingFriendUid)} onClick={() => void inviteFriend(friend)}>
                      {invitingFriendUid === friend.id ? "Sharing" : `Share as ${role === "editor" ? "editor" : "viewer"}`}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.friendShareEmpty}>{friends.length ? "Everyone matching this search already has access." : "Add friends from your dashboard to share here without entering an email."}</p>
            )}
          </section>
          <form className={styles.inviteForm} onSubmit={invite}>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Email</span>
              <input className={ui.control} ref={inputRef} type="email" value={email} placeholder="collaborator@example.com" required onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Role</span>
              <select className={ui.control} aria-label="Role" value={role} onChange={(event) => setRole(event.target.value as "editor" | "viewer")}>
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
            </label>
            <button type="submit" className={`${ui.button} ${ui.buttonPrimary}`} disabled={submitting}>{submitting ? "Sharing" : "Share"}</button>
            {linkedBoards.length > 0 && (
              <label className={styles.linkedShareOption} aria-label="Share linked boards">
                <input type="checkbox" checked={shareConnectedBoards} disabled={plan?.truncated} onChange={(event) => setIncludeLinkedBoards(event.target.checked)} />
                <span>
                  <strong>{plan?.truncated ? "Connected sharing unavailable" : `Include ${managedLinkedBoards.length} linked ${managedLinkedBoards.length === 1 ? "board" : "boards"}`}</strong>
                  <small>{plan?.truncated ? "Reduce this board's link graph before sharing it as one connected set." : "Kumo follows the board graph and avoids cycles."}</small>
                </span>
              </label>
            )}
          </form>
          </>
        ) : (
          <p className={`${ui.notice} ${styles.accessNote}`}>Only the board owner can invite or remove collaborators.</p>
        )}

        {externalPrivateBoards.length > 0 && (
          <div className={styles.shareWarning}>
            <Warning aria-hidden="true" />
            <span><strong>{externalPrivateBoards.length} private linked {externalPrivateBoards.length === 1 ? "board has" : "boards have"} another owner.</strong><small>Those owners must share {externalPrivateBoards.map((candidate) => candidate.title).join(", ")} separately.</small></span>
          </div>
        )}
        {plan?.truncated && <p className={`${ui.notice} ${ui.noticeError} ${styles.dialogError}`} role="alert">The linked-board graph exceeded the safe sharing limit. Kumo will only allow direct-board sharing until the graph is smaller.</p>}
        {error && <p className={`${ui.notice} ${ui.noticeError} ${styles.dialogError}`} role="alert">{error}</p>}
        {message && <p className={`${ui.notice} ${ui.noticeSuccess} ${styles.dialogMessage}`} role="status">{message}</p>}

        <div className={styles.memberList}>
          <h3>People with access</h3>
          {collaborators.map((person) => (
            <div className={styles.memberRow} key={person.id}>
              <ProfileAvatar name={person.name || person.email || "Collaborator"} avatarUrl={person.avatar || null} size={30} />
              <span className={styles.memberIdentity}><strong>{person.name || person.email || "Collaborator"}</strong><small>{person.email || (person.role === "owner" ? "Board owner" : "Member")}</small></span>
              <span className={styles.memberRole}>{person.role === "owner" ? "Owner" : person.role === "viewer" ? "Can view" : "Can edit"}</span>
              {isOwner && person.role !== "owner" && <button type="button" disabled={Boolean(removingUid)} aria-label={`Remove ${person.name || person.email}`} onClick={() => removeMember(person.id)}>{removingUid === person.id ? "Removing" : "Remove"}</button>}
            </div>
          ))}
          {loadingAccess && <div className={styles.memberLoading}><LockSimple aria-hidden="true" />Loading access</div>}
          {!loadingAccess && !collaborators.length && <div className={styles.memberLoading}><LockSimple aria-hidden="true" />No collaborators yet</div>}
        </div>
      </div>
    </div>
  );
};

export default ShareDialog;
