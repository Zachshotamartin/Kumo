import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Link, LockSimple, Warning, X } from "@phosphor-icons/react";
import { useDispatch, useSelector } from "react-redux";
import { removeShare, share } from "../../features/whiteBoard/whiteBoardSlice";
import {
  getBoardSharePlan,
  inviteBoardCollaborator,
  listBoardCollaborators,
  removeBoardCollaborator,
  type BoardCollaborator,
  type BoardSharePlan,
} from "../../services/collaboratorRepository";
import { AppDispatch, RootState } from "../../store";
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
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [includeLinkedBoards, setIncludeLinkedBoards] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<BoardCollaborator[]>([]);
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

  const linkedBoards = useMemo(
    () => plan?.boards.filter((candidate) => candidate.id !== board.id) ?? [],
    [board.id, plan]
  );
  const managedLinkedBoards = linkedBoards.filter((candidate) => candidate.manageable);
  const externalPrivateBoards = linkedBoards.filter((candidate) => !candidate.manageable && candidate.visibility === "private");
  const shareConnectedBoards = includeLinkedBoards && !plan?.truncated;

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!board.id || submitting) return;
    const invitedEmail = email.trim();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await inviteBoardCollaborator(board.id, invitedEmail, role, shareConnectedBoards);
      dispatch(share({ uid: result.uid, role: result.role }));
      setCollaborators((current) => {
        const next = current.filter((person) => person.id !== result.uid);
        return [...next, {
          id: result.uid,
          email: result.email,
          name: result.email,
          avatar: "",
          role: result.role,
        }].sort((left, right) => left.name.localeCompare(right.name));
      });
      setEmail("");
      const sharedCount = result.sharedBoards.length;
      const inaccessibleCount = result.unavailableBoards.length;
      setMessage(
        `${invitedEmail} can now ${role === "editor" ? "edit" : "view"} ${sharedCount === 1 ? "this board" : `${sharedCount} connected boards`}.` +
        (inaccessibleCount ? ` ${inaccessibleCount} private ${inaccessibleCount === 1 ? "destination still needs" : "destinations still need"} its owner.` : "")
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't invite this person.");
    } finally {
      setSubmitting(false);
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
    <div className={styles.dialogBackdrop}>
      <div className={`${styles.dialog} ${styles.shareDialog}`} role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className={styles.dialogHeader}>
          <div>
            <span className={styles.dialogEyebrow}>Board access</span>
            <h2 id="share-title">Share “{board.title}”</h2>
          </div>
          <button type="button" className={styles.closeButton} aria-label="Close sharing dialog" onClick={onClose}><X aria-hidden="true" /></button>
        </div>

        <div className={styles.shareLinkRow}>
          <span><Link aria-hidden="true" /><b>Direct board link</b><small>Only people with access can open it.</small></span>
          <button type="button" onClick={copyLink}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy link"}</button>
        </div>

        {isOwner ? (
          <form className={styles.inviteForm} onSubmit={invite}>
            <label>
              <span>Email</span>
              <input ref={inputRef} type="email" value={email} placeholder="collaborator@example.com" required onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as "editor" | "viewer")}>
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
            </label>
            <button type="submit" disabled={submitting}>{submitting ? "Sharing" : "Share"}</button>
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
        ) : (
          <p className={styles.accessNote}>Only the board owner can invite or remove collaborators.</p>
        )}

        {externalPrivateBoards.length > 0 && (
          <div className={styles.shareWarning}>
            <Warning aria-hidden="true" />
            <span><strong>{externalPrivateBoards.length} private linked {externalPrivateBoards.length === 1 ? "board has" : "boards have"} another owner.</strong><small>Those owners must share {externalPrivateBoards.map((candidate) => candidate.title).join(", ")} separately.</small></span>
          </div>
        )}
        {plan?.truncated && <p className={styles.dialogError} role="alert">The linked-board graph exceeded the safe sharing limit. Kumo will only allow direct-board sharing until the graph is smaller.</p>}
        {error && <p className={styles.dialogError} role="alert">{error}</p>}
        {message && <p className={styles.dialogMessage} role="status">{message}</p>}

        <div className={styles.memberList}>
          <h3>People with access</h3>
          {collaborators.map((person) => (
            <div className={styles.memberRow} key={person.id}>
              <span className={styles.memberAvatar}>{(person.name || person.email || "C").slice(0, 1).toUpperCase()}</span>
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
