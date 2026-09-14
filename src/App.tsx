import "./App.css";
import { lazy, Suspense, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./config/firebase";
import { clearPendingGoogleRedirect } from "./config/googleRedirectState";
import { login, logout, setAuthenticatedProfile, setAuthInitialized } from "./features/auth/authSlice";
import { ensureUserProfile } from "./services/userRepository";
import { AppDispatch, RootState } from "./store";
import { getBoard } from "./services/boardRepository";
import { clearSelectedShapes } from "./features/selected/selectedSlice";
import { setWhiteboardData } from "./features/whiteBoard/whiteBoardSlice";
import LoadingScreen from "./components/LoadingScreen";
import { startObservability } from "./platform/observability";
import BuilderLauncher from "./builder/BuilderLauncher";

const importWorkspace = () => import("./components/workSpace/workSpace");
let workspacePromise: ReturnType<typeof importWorkspace> | null = null;
const loadWorkspace = () => {
  workspacePromise ??= importWorkspace();
  return workspacePromise;
};
const WorkSpace = lazy(loadWorkspace);
const MiddlePage = lazy(() => import("./components/middlePage/middlePage"));
// Fetch the public page alongside Firebase restoration without blocking the
// small startup shell or rendering the landing page for a restored session.
const homePagePromise = import("./components/homepage/homePage");
const HomePage = lazy(() => homePagePromise);
const PrototypeShareView = lazy(() => import("./components/editor/PrototypeShareView"));
const VersionShareView = lazy(() => import("./history/VersionShareView"));
const OpenSessionView = lazy(() => import("./components/editor/OpenSessionView"));
const LiveblocksRoot = lazy(() => import("./collaboration/LiveblocksRoot").then(({ LiveblocksRoot: Component }) => ({ default: Component })));

function App() {
  const user = useSelector((state: RootState) => state.auth);
  const whiteBoard = useSelector((state: RootState) => state.whiteBoard);
  const dispatch = useDispatch<AppDispatch>();
  const [profilePending, setProfilePending] = useState(false);
  const prototypeToken = new URL(window.location.href).searchParams.get("prototype");
  const versionToken = new URL(window.location.href).searchParams.get("versionToken");
  const versionId = new URL(window.location.href).searchParams.get("version");
  const openSessionToken = new URL(window.location.href).searchParams.get("openSession");

  useEffect(() => {
    let generation = 0;
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        const current = ++generation;
        setProfilePending(false);
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
        clearPendingGoogleRedirect();
        setProfilePending(true);
        dispatch(
          login({
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? "",
          })
        );
        void ensureUserProfile()
          .then((profile) => {
            if (current === generation) dispatch(setAuthenticatedProfile(profile));
          })
          .catch((error: unknown) => {
            console.error("Kumo could not initialize the authenticated profile.", error);
          })
          .finally(() => {
            if (current === generation) setProfilePending(false);
          });
      },
      () => {
        generation += 1;
        setProfilePending(false);
        dispatch(setAuthInitialized());
      }
    );
    return () => { generation += 1; unsubscribe(); };
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
          ) : !user.isInitialized || profilePending ? (
            <LoadingScreen />
          ) : !user.isAuthenticated ? (
            <HomePage />
          ) : whiteBoard.id !== null ? (
            <LiveblocksRoot><WorkSpace /></LiveblocksRoot>
          ) : (
            <MiddlePage />
          )}
        </Suspense>
      </div>
      {user.isAuthenticated && !profilePending && !openSessionToken && !prototypeToken && !versionToken && <BuilderLauncher />}
    </>
  );
}

export default App;
