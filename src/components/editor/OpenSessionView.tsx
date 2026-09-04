import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { login, setAuthenticatedProfile } from "../../features/auth/authSlice";
import { setWhiteboardData } from "../../features/whiteBoard/whiteBoardSlice";
import { redeemOpenSession } from "../../services/platformRepository";
import type { AppDispatch, RootState } from "../../store";
import { openSessionGuestNonce, rememberOpenSessionPassword } from "../../collaboration/openSession";
import KumoLogo from "../brand/KumoLogo";
import WorkSpace from "../workSpace/workSpace";
import ui from "../ui/Ui.module.css";
import styles from "./PrototypeShareView.module.css";

const OpenSessionView = ({ token }: { token: string }) => {
  const dispatch = useDispatch<AppDispatch>();
  const boardId = useSelector((state: RootState) => state.whiteBoard.id);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const redeem = async (candidate: string) => {
    setLoading(true);
    setError(null);
    try {
      const session = await redeemOpenSession(token, candidate, openSessionGuestNonce(token));
      rememberOpenSessionPassword(token, candidate);
      dispatch(login({ uid: session.guestId, email: "guest@open-session.kumo" }));
      dispatch(setAuthenticatedProfile({ displayName: "Kumo guest", username: session.guestId.replace(":", "-"), avatarUrl: null }));
      dispatch(setWhiteboardData({
        id: session.boardId,
        roomId: session.roomId,
        baseRoomId: session.roomId,
        role: session.role,
        shapes: [],
        title: session.title,
        uid: session.ownerId,
        type: session.visibility,
        sharedWith: [],
        members: { [session.ownerId]: "owner", [session.guestId]: session.role },
        linkedBoards: {},
        backGroundColor: "#252629",
        lastChangedBy: null,
        currentUsers: [],
        schemaVersion: 5,
        revision: 0,
        updatedAt: session.updatedAt,
      }));
      setNeedsPassword(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "This open session could not be joined.";
      setNeedsPassword(/password/i.test(message));
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (boardId) return;
    const timer = window.setTimeout(() => { void redeem(password); }, 0);
    return () => window.clearTimeout(timer);
  }, [boardId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (boardId) return <WorkSpace />;
  if (loading) return <div className="app-loading" role="status"><KumoLogo className="app-loading-logo" context="loading" decorative /><span>Joining open board</span></div>;
  return <main className={styles.shareView}><section className={styles.passwordCard}><KumoLogo decorative /><h1>Join this Kumo session</h1><p>{needsPassword ? "Enter the password the host shared with you." : "This link may have expired or been revoked."}</p>{needsPassword && <form onSubmit={(event) => { event.preventDefault(); void redeem(password); }}><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button type="submit" className={`${ui.button} ${ui.buttonPrimary}`}>Join board</button></form>}{error && <p role="alert">{error}</p>}</section></main>;
};

export default OpenSessionView;
