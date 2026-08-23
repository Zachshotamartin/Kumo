import "./App.css";
import { lazy, Suspense, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import { login, logout, setAuthInitialized } from "./features/auth/authSlice";
import { ensureUserProfile } from "./services/userRepository";
import { AppDispatch, RootState } from "./store";
import KumoLogo from "./components/brand/KumoLogo";

const WorkSpace = lazy(() => import("./components/workSpace/workSpace"));
const HomePage = lazy(() => import("./components/homepage/homePage"));
const MiddlePage = lazy(() => import("./components/middlePage/middlePage"));
export const MINIMUM_LOADING_DURATION_MS = 1800;

const LoadingScreen = () => (
  <div className="app-loading" role="status">
    <div className="app-loading-brand">
      <KumoLogo className="app-loading-logo" context="loading" startupAnimation="startup" decorative />
      <span className="app-loading-word">Kumo</span>
    </div>
    <span className="app-loading-status">Loading workspace</span>
  </div>
);

function App() {
  const user = useSelector((state: RootState) => state.auth);
  const whiteBoard = useSelector((state: RootState) => state.whiteBoard);
  const dispatch = useDispatch<AppDispatch>();
  const [loadingAnimationComplete, setLoadingAnimationComplete] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const timer = window.setTimeout(
      () => setLoadingAnimationComplete(true),
      reducedMotion ? 0 : MINIMUM_LOADING_DURATION_MS
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (!firebaseUser) {
          dispatch(logout());
          return;
        }
        dispatch(
          login({
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? "",
          })
        );
        void ensureUserProfile().catch((error: unknown) => {
          console.error("Kumo could not initialize the authenticated profile.", error);
        });
      },
      () => dispatch(setAuthInitialized())
    );
    return () => unsubscribe();
  }, [dispatch]);

  if (!user.isInitialized || !loadingAnimationComplete) return <LoadingScreen />;

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="App" id="main-content">
        <Suspense fallback={<LoadingScreen />}>
          {!user.isAuthenticated ? (
            <HomePage />
          ) : whiteBoard.id !== null ? (
            <WorkSpace />
          ) : (
            <MiddlePage />
          )}
        </Suspense>
      </div>
    </>
  );
}

export default App;
