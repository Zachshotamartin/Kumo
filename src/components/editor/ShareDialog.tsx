import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { auth } from "../../config/firebase";
import { removeShare, share } from "../../features/whiteBoard/whiteBoardSlice";
import { AppDispatch, RootState } from "../../store";
import styles from "./EditorWorkspace.module.css";

interface ShareDialogProps {
  onClose: () => void;
}

interface ApiResponse {
  uid?: string;
  role?: "editor" | "viewer";
  error?: string;
}

const callShareApi = async (body: Record<string, unknown>): Promise<ApiResponse> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again to manage sharing.");
  const response = await fetch("/api/share-board", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as ApiResponse;
  if (!response.ok) throw new Error(data.error ?? "We couldn't update board access.");
  return data;
};

const ShareDialog = ({ onClose }: ShareDialogProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const board = useSelector((state: RootState) => state.whiteBoard);
  const user = useSelector((state: RootState) => state.auth);
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!board.id || submitting) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await callShareApi({ boardId: board.id, action: "invite", email, role });
      if (result.uid) dispatch(share({ uid: result.uid, role: result.role ?? role }));
      setEmail("");
      setMessage(`${email} can now ${role === "editor" ? "edit" : "view"} this board.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't invite this person.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeMember = async (memberUid: string) => {
    if (!board.id) return;
    setError(null);
    try {
      await callShareApi({ boardId: board.id, action: "remove", memberUid });
      dispatch(removeShare(memberUid));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't remove this person.");
    }
  };

  const members = Object.entries(board.members).filter(([uid]) => uid !== board.uid);
  const isOwner = board.role === "owner";

  return (
    <div className={styles.dialogBackdrop}>
      <div className={`${styles.dialog} ${styles.shareDialog}`} role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className={styles.dialogHeader}>
          <div>
            <span className={styles.dialogEyebrow}>Board access</span>
            <h2 id="share-title">Share “{board.title}”</h2>
          </div>
          <button type="button" className={styles.closeButton} aria-label="Close sharing dialog" onClick={onClose}>×</button>
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
            <button type="submit" disabled={submitting}>{submitting ? "Inviting" : "Invite"}</button>
          </form>
        ) : (
          <p className={styles.accessNote}>Only the board owner can invite or remove collaborators.</p>
        )}

        {error && <p className={styles.dialogError} role="alert">{error}</p>}
        {message && <p className={styles.dialogMessage} role="status">{message}</p>}

        <div className={styles.memberList}>
          <h3>People with access</h3>
          <div className={styles.memberRow}>
            <span className={styles.memberAvatar}>{(user.email ?? "O").slice(0, 1).toUpperCase()}</span>
            <span className={styles.memberIdentity}><strong>{board.uid === user.uid ? user.email : "Board owner"}</strong><small>Owner</small></span>
          </div>
          {members.map(([uid, memberRole]) => (
            <div className={styles.memberRow} key={uid}>
              <span className={styles.memberAvatar}>{uid.slice(0, 1).toUpperCase()}</span>
              <span className={styles.memberIdentity}><strong>Collaborator</strong><small>{memberRole === "viewer" ? "Can view" : "Can edit"}</small></span>
              {isOwner && <button type="button" onClick={() => removeMember(uid)}>Remove</button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShareDialog;
