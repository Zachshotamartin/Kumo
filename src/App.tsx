import "./App.css";
import { lazy, Suspense, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import { login, logout, setAuthenticatedProfile, setAuthInitialized } from "./features/auth/authSlice";
import { ensureUserProfile } from "./services/userRepository";
import { AppDispatch, RootState } from "./store";
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
            <HomePage />
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
