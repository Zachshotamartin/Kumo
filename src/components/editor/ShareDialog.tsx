import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Link, LockSimple, MagnifyingGlass, SignOut, UserPlus, Warning, X } from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import { removeShare, setWhiteboardData, share } from "../../features/whiteBoard/whiteBoardSlice";
import {
  cancelBoardInvitation,
  getBoardSharingOverview,
  inviteBoardCollaborator,
  inviteBoardFriend,
  listBoardCollaborators,
  removeBoardCollaborator,
  resendBoardInvitation,
  transferBoardOwnership,
  updateBoardCollaboratorRole,
  leaveSharedBoard,
  type BoardCollaborator,
  type BoardSharePlan,
  type PendingBoardInvitation,
  type ShareBoardResult,
} from "../../services/collaboratorRepository";
import { listFriendships, type SocialProfile } from "../../services/socialRepository";
import { AppDispatch, RootState } from "../../store";
import { ProfileAvatar } from "../social/ProfileAvatar";
import ui from "../ui/Ui.module.css";
import styles from "./EditorWorkspace.module.css";
import { createShareLink, loadAccessRequests, loadShareLinks, resolveAccessRequest, revokeShareLink, type BoardAccessRequest, type GovernedShareLink } from "../../services/productRepository";
import { createOpenSession, loadOpenSessions, revokeOpenSession, type OpenBoardSession } from "../../services/platformRepository";

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
  const [accessRequests, setAccessRequests] = useState<BoardAccessRequest[]>([]);
  const [allowedDomain, setAllowedDomain] = useState("");
  const [linkExpiryDays, setLinkExpiryDays] = useState("7");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<GovernedShareLink[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingBoardInvitation[]>([]);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [openSessions, setOpenSessions] = useState<OpenBoardSession[]>([]);
  const [openSessionRole, setOpenSessionRole] = useState<"viewer" | "editor">("viewer");
  const [openSessionPassword, setOpenSessionPassword] = useState("");
  const [openSessionHours, setOpenSessionHours] = useState("24");
  const [openSessionUrl, setOpenSessionUrl] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());
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
      isOwner ? getBoardSharingOverview(board.id) : Promise.resolve(null),
    ]).then(([people, overview]) => {
      if (!active) return;
      setCollaborators(people);
      setPlan(overview?.plan ?? null);
      setPendingInvitations(overview?.invitations ?? []);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "We couldn't load board access.");
    }).finally(() => {
      if (active) setLoadingAccess(false);
    });
    return () => { active = false; };
  }, [board.id, isOwner]);

  useEffect(() => {
    if (!isOwner || !board.id) return;
    let active = true;
    void loadOpenSessions(board.id)
      .then((sessions) => active && setOpenSessions(Array.isArray(sessions) ? sessions : []))
      .catch(() => {
        if (active) setOpenSessions([]);
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

  useEffect(() => {
    if (!isOwner || !board.id) return;
    let active = true;
    void Promise.all([loadAccessRequests(board.id), loadShareLinks(board.id)]).then(([requests, links]) => {
      if (!active) return;
      setAccessRequests(requests ?? []);
      setShareLinks(links ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [board.id, isOwner]);

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
    result: ShareBoardResult,
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
    const invitedEmail = email.trim();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await inviteBoardCollaborator(board.id!, invitedEmail, role, shareConnectedBoards);
      if ("pending" in result) {
        setPendingInvitations((current) => [result.invitation, ...current.filter((item) => item.id !== result.invitation.id)]);
        setPendingLink(result.url);
        setEmail("");
        setMessage(result.delivery === "sent" ? `Invitation emailed to ${invitedEmail}.` : `Invitation created for ${invitedEmail}. Copy the secure link to send it.`);
        return;
      }
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
    setInvitingFriendUid(friend.id);
    setError(null);
    setMessage(null);
    try {
      const result = await inviteBoardFriend(board.id!, friend.id, role, shareConnectedBoards);
      if ("pending" in result) throw new Error("Friend invitations must resolve to an existing profile.");
      recordInvite(result, friend.displayName);
      setMessage(inviteMessage(friend.displayName, result.sharedBoards.length, result.unavailableBoards.length));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't share with this friend.");
    } finally {
      setInvitingFriendUid(null);
    }
  };

  const removeMember = async (memberUid: string) => {
    setError(null);
    setMessage(null);
    setRemovingUid(memberUid);
    try {
      await removeBoardCollaborator(board.id!, memberUid, shareConnectedBoards);
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
    try {
      await navigator.clipboard.writeText(directBoardUrl(board.id!));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Your browser blocked clipboard access.");
    }
  };

  const runAction = <T,>(operation: Promise<T>, onSuccess: (result: T) => void, fallback: string) => {
    setError(null);
    void operation.then(onSuccess).catch((caught) => {
      setError(caught instanceof Error ? caught.message : fallback);
    });
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
          <button type="button" className={`${ui.button} ${ui.buttonCompact}`} disabled={!board.id} onClick={copyLink}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy link"}</button>
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
                    <button type="button" className={`${ui.button} ${ui.buttonPrimary} ${ui.buttonCompact}`} disabled={!board.id || submitting || Boolean(invitingFriendUid)} onClick={() => void inviteFriend(friend)}>
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
            <button type="submit" className={`${ui.button} ${ui.buttonPrimary}`} disabled={!board.id || submitting}>{submitting ? "Sharing" : "Share"}</button>
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
          {pendingInvitations.length > 0 && <section className={styles.governedShare} aria-labelledby="pending-invitations-title"><h3 id="pending-invitations-title">Pending invitations</h3>{pendingInvitations.map((invitation) => <div className={styles.memberRow} key={invitation.id}><ProfileAvatar name={invitation.email} avatarUrl={null} size={30} /><span className={styles.memberIdentity}><strong>{invitation.email}</strong><small>{invitation.role === "editor" ? "Can edit" : "Can view"} · expires {new Date(invitation.expires_at).toLocaleDateString()}</small></span><button type="button" disabled={!board.id} onClick={() => runAction(resendBoardInvitation(board.id!, invitation.id), (result) => { setPendingLink(result.url); setMessage(result.delivery === "sent" ? "Invitation resent." : "Fresh invitation link created."); }, "Invitation resend failed.")}>Resend</button><button type="button" disabled={!board.id} onClick={() => runAction(cancelBoardInvitation(board.id!, invitation.id), () => setPendingInvitations((current) => current.filter((item) => item.id !== invitation.id)), "Invitation cancellation failed.")}>Cancel</button></div>)}</section>}
          {pendingLink && <div className={styles.shareLinkRow}><span><Link aria-hidden="true" /><b>Invitation link</b><small>Use this when email delivery is not configured.</small></span><button type="button" onClick={() => runAction(navigator.clipboard.writeText(pendingLink), () => undefined, "Clipboard access failed.")}>Copy</button></div>}
          <section className={styles.governedShare} aria-labelledby="governed-link-title">
            <h3 id="governed-link-title">Governed share link</h3>
            <p>Create an expiring link, optionally restricted to one email domain.</p>
            <div className={styles.fieldGrid}><label className={styles.field}><span>Expires in days</span><input type="number" min={1} max={365} value={linkExpiryDays} onChange={(event) => setLinkExpiryDays(event.target.value)} /></label><label className={styles.field}><span>Email domain</span><input placeholder="example.com" value={allowedDomain} onChange={(event) => setAllowedDomain(event.target.value)} /></label></div>
            <button type="button" className={`${ui.button} ${ui.buttonCompact}`} onClick={() => {
              const expiresAt = new Date(Date.now() + Math.max(1, Number(linkExpiryDays) || 7) * 86_400_000).toISOString();
              void createShareLink(board.id!, { role, allowedDomain: allowedDomain || undefined, expiresAt }).then(({ token }) => {
                const url = new URL(window.location.origin);
                url.searchParams.set("share", token);
                setGeneratedLink(url.toString());
              }).catch((caught) => setError(caught instanceof Error ? caught.message : "Share link creation failed."));
            }} disabled={!board.id}>Create secure link</button>
            {generatedLink && <div className={styles.shareLinkRow}><span><Link aria-hidden="true" /><b>Secure link ready</b><small>{generatedLink}</small></span><button type="button" onClick={() => runAction(navigator.clipboard.writeText(generatedLink), () => undefined, "Clipboard access failed.")}>Copy</button></div>}
            {shareLinks.filter((link) => !link.revoked_at).map((link) => <div className={styles.shareLinkRow} key={link.id}><span><LockSimple aria-hidden="true" /><b>{link.role === "editor" ? "Editing" : "Viewing"} link</b><small>{link.allowed_domain ? `@${link.allowed_domain} · ` : ""}{link.expires_at ? `Expires ${new Date(link.expires_at).toLocaleDateString()}` : "No expiry"}{link.last_used_at ? ` · Used ${new Date(link.last_used_at).toLocaleDateString()}` : " · Never used"}</small></span><button type="button" onClick={() => runAction(revokeShareLink(link.id), () => setShareLinks((current) => current.map((item) => item.id === link.id ? { ...item, revoked_at: new Date().toISOString() } : item)), "Share link revocation failed.")}>Revoke</button></div>)}
          </section>
          <section className={styles.governedShare} aria-labelledby="open-session-title">
            <h3 id="open-session-title">Temporary open session</h3>
            <p>Invite guests without Kumo accounts. Sessions expire automatically, cannot open linked boards or branches, and editor sessions require a password.</p>
            <div className={styles.fieldGrid}><label className={styles.field}><span>Guest role</span><select value={openSessionRole} onChange={(event) => setOpenSessionRole(event.target.value as "viewer" | "editor")}><option value="viewer">Can view</option><option value="editor">Can edit</option></select></label><label className={styles.field}><span>Expires in hours</span><input type="number" min={1} max={168} value={openSessionHours} onChange={(event) => setOpenSessionHours(event.target.value)} /></label></div>
            <label className={styles.field}><span>Password{openSessionRole === "editor" ? " (required)" : " (optional)"}</span><input type="password" minLength={openSessionRole === "editor" ? 8 : undefined} value={openSessionPassword} onChange={(event) => setOpenSessionPassword(event.target.value)} /></label>
            <button type="button" className={`${ui.button} ${ui.buttonCompact}`} onClick={() => {
              const expiresAt = new Date(Date.now() + Math.min(168, Math.max(1, Number(openSessionHours) || 24)) * 3_600_000).toISOString();
              void createOpenSession(board.id!, { role: openSessionRole, password: openSessionPassword || undefined, expiresAt }).then((result) => {
                setOpenSessions((current) => [result.session, ...current]);
                setOpenSessionUrl(result.url);
                setOpenSessionPassword("");
              }).catch((caught) => setError(caught instanceof Error ? caught.message : "Open session creation failed."));
            }} disabled={!board.id || (openSessionRole === "editor" && openSessionPassword.length < 8)}>Create open session</button>
            {openSessionUrl && <div className={styles.shareLinkRow}><span><Link aria-hidden="true" /><b>Guest link ready</b><small>The password is never included in the URL.</small></span><button type="button" onClick={() => runAction(navigator.clipboard.writeText(openSessionUrl), () => undefined, "Clipboard access failed.")}>Copy</button></div>}
            {openSessions.filter((session) => !session.revoked_at && new Date(session.expires_at).getTime() > renderedAt).map((session) => <div className={styles.shareLinkRow} key={session.id}><span><LockSimple aria-hidden="true" /><b>{session.role === "editor" ? "Guest editing" : "Guest viewing"}</b><small>Expires {new Date(session.expires_at).toLocaleString()} · {session.use_count ?? 0} joins</small></span><button type="button" disabled={!board.id} onClick={() => runAction(revokeOpenSession(board.id!, session.id), () => setOpenSessions((current) => current.map((item) => item.id === session.id ? { ...item, revoked_at: new Date().toISOString() } : item)), "Open session revocation failed.")}>Revoke</button></div>)}
          </section>
          {accessRequests.some((request) => request.status === "pending") && <section className={styles.governedShare}><h3>Access requests</h3>{accessRequests.filter((request) => request.status === "pending").map((request) => <div className={styles.memberRow} key={request.id}><ProfileAvatar name={request.profiles?.display_name ?? request.requester_id} avatarUrl={request.profiles?.avatar_url ?? null} size={30} /><span className={styles.memberIdentity}><strong>{request.profiles?.display_name ?? "Kumo user"}</strong><small>{request.requested_role} · {request.message || "No message"}</small></span><button type="button" onClick={() => runAction(resolveAccessRequest(request.id, "approved"), () => setAccessRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "approved" } : item)), "Access request approval failed.")}>Approve</button><button type="button" onClick={() => runAction(resolveAccessRequest(request.id, "denied"), () => setAccessRequests((current) => current.map((item) => item.id === request.id ? { ...item, status: "denied" } : item)), "Access request denial failed.")}>Deny</button></div>)}</section>}
          </>
        ) : (
          <div className={styles.accessNote}><p className={ui.notice}>Only the board owner can invite or remove collaborators.</p><button type="button" className={`${ui.button} ${ui.buttonDanger}`} disabled={!board.id} onClick={() => runAction(leaveSharedBoard(board.id!), () => { dispatch(setWhiteboardData({ id: null, roomId: null, shapes: [] })); onClose(); }, "Leaving the board failed.")}><SignOut aria-hidden="true" /> Leave board</button></div>
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
              {isOwner && person.role !== "owner" ? <select className={styles.memberRole} aria-label={`Role for ${person.name || person.email}`} value={person.role} disabled={!board.id} onChange={(event) => {
                const nextRole = event.target.value as "editor" | "viewer";
                void updateBoardCollaboratorRole(board.id!, person.id, nextRole, shareConnectedBoards).then(() => setCollaborators((current) => current.map((item) => item.id === person.id ? { ...item, role: nextRole } : item))).catch((caught) => setError(caught instanceof Error ? caught.message : "Role update failed."));
              }}><option value="editor">Can edit</option><option value="viewer">Can view</option></select> : <span className={styles.memberRole}>{person.role === "owner" ? "Owner" : person.role === "viewer" ? "Can view" : "Can edit"}</span>}
              {isOwner && person.role !== "owner" && <><button type="button" disabled={!board.id} onClick={() => runAction(transferBoardOwnership(board.id!, person.id), () => { setMessage(`${person.name || person.email} is now the owner.`); setCollaborators((current) => current.map((item) => item.id === person.id ? { ...item, role: "owner" } : item.role === "owner" ? { ...item, role: "editor" } : item)); }, "Ownership transfer failed.")}>Make owner</button><button type="button" disabled={!board.id || Boolean(removingUid)} aria-label={`Remove ${person.name || person.email}`} onClick={() => removeMember(person.id)}>{removingUid === person.id ? "Removing" : "Remove"}</button></>}
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
