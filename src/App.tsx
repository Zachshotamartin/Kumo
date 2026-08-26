import "./App.css";
import { lazy, Suspense, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./config/firebase";
import { login, logout, setAuthenticatedProfile, setAuthInitialized } from "./features/auth/authSlice";
import { ensureUserProfile } from "./services/userRepository";
import { AppDispatch, RootState } from "./store";
import { getBoard } from "./services/boardRepository";
import { clearSelectedShapes } from "./features/selected/selectedSlice";
import { setWhiteboardData } from "./features/whiteBoard/whiteBoardSlice";
import KumoLogo from "./components/brand/KumoLogo";
import { startObservability } from "./platform/observability";

const importWorkspace = () => import("./components/workSpace/workSpace");
let workspacePromise: ReturnType<typeof importWorkspace> | null = null;
const loadWorkspace = () => {
  workspacePromise ??= importWorkspace();
  return workspacePromise;
};
const WorkSpace = lazy(loadWorkspace);
const MiddlePage = lazy(() => import("./components/middlePage/middlePage"));
const HomePage = lazy(() => import("./components/homepage/homePage"));
const PrototypeShareView = lazy(() => import("./components/editor/PrototypeShareView"));
const VersionShareView = lazy(() => import("./history/VersionShareView"));
const OpenSessionView = lazy(() => import("./components/editor/OpenSessionView"));
const LiveblocksRoot = lazy(() => import("./collaboration/LiveblocksRoot").then(({ LiveblocksRoot: Component }) => ({ default: Component })));

const LoadingScreen = () => (
  <div className="app-loading" role="status">
    <KumoLogo className="app-loading-logo" context="loading" startupAnimation="startup" animationScope="app-startup" decorative />
    <div className="app-loading-copy">
      <span className="app-loading-word">Kumo</span>
      <span className="app-loading-status">Opening your canvas</span>
    </div>
  </div>
);

function App() {
  const user = useSelector((state: RootState) => state.auth);
  const whiteBoard = useSelector((state: RootState) => state.whiteBoard);
  const dispatch = useDispatch<AppDispatch>();
  const prototypeToken = new URL(window.location.href).searchParams.get("prototype");
  const versionToken = new URL(window.location.href).searchParams.get("versionToken");
  const versionId = new URL(window.location.href).searchParams.get("version");
  const openSessionToken = new URL(window.location.href).searchParams.get("openSession");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (!firebaseUser) {
          dispatch(logout());
          return;
        }
        if (firebaseUser.email && firebaseUser.emailVerified === false) {
          dispatch(logout());
          void signOut(auth);
          return;
        }
        // Start the core editor chunk before dashboard requests and preview work.
        // Opening a board should only wait for collaboration, never module scheduling.
        void loadWorkspace();
        dispatch(
          login({
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? "",
          })
        );
        void ensureUserProfile()
          .then((profile) => dispatch(setAuthenticatedProfile(profile)))
          .catch((error: unknown) => {
            console.error("Kumo could not initialize the authenticated profile.", error);
          });
      },
      () => dispatch(setAuthInitialized())
    );
    return () => unsubscribe();
  }, [dispatch]);

  useEffect(() => {
    if (!user.isAuthenticated) return;
    return startObservability();
  }, [user.isAuthenticated]);

  useEffect(() => {
    if (!user.isAuthenticated) return;
    let active = true;
    const synchronizeHistory = () => {
      const boardId = new URL(window.location.href).searchParams.get("board");
      if (!boardId) {
        dispatch(clearSelectedShapes());
        dispatch(setWhiteboardData({ id: null }));
        return;
      }
      if (boardId === whiteBoard.id) return;
      void getBoard(boardId).then((board) => {
        if (!active) return;
        dispatch(clearSelectedShapes());
        dispatch(setWhiteboardData(board));
      }).catch(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("board");
        window.history.replaceState({}, "", url);
        dispatch(setWhiteboardData({ id: null }));
      });
    };
    window.addEventListener("popstate", synchronizeHistory);
    return () => { active = false; window.removeEventListener("popstate", synchronizeHistory); };
  }, [dispatch, user.isAuthenticated, whiteBoard.id]);

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="App" id="main-content">
        <Suspense fallback={<LoadingScreen />}>
          {openSessionToken ? (
            <LiveblocksRoot><OpenSessionView token={openSessionToken} /></LiveblocksRoot>
          ) : versionToken && versionId ? (
            <VersionShareView versionId={versionId} token={versionToken} />
          ) : prototypeToken ? (
            <PrototypeShareView token={prototypeToken} />
          ) : !user.isInitialized || !user.isAuthenticated ? (
            <HomePage authPending={!user.isInitialized} />
          ) : whiteBoard.id !== null ? (
            <LiveblocksRoot><WorkSpace /></LiveblocksRoot>
          ) : (
            <MiddlePage />
          )}
        </Suspense>
      </div>
    </>
  );
}

export default App;
