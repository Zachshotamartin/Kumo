import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeSlash, GoogleLogo } from "@phosphor-icons/react";
import styles from "./homePage.module.css";
import ui from "../ui/Ui.module.css";
import { auth, firebaseApiKey, provider } from "../../config/firebase";
import {
  signInWithEmailAndPassword,
  getRedirectResult,
  signInWithRedirect,
  signInWithCredential,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { ensureUserProfile } from "../../services/userRepository";
import { type KumoLogoContext } from "../brand/KumoLogoConfig";
import MarketingCanvas from "./MarketingCanvas";
import {
  consumeLocalGoogleRedirect,
  hasLocalGoogleRedirectResult,
  prepareLocalGoogleRedirect,
  usesLocalGoogleRedirect,
} from "../../config/localGoogleRedirect";

interface HomePageProps {
  authPending?: boolean;
}

const HomePage = ({ authPending = false }: HomePageProps) => {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const signinTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectMode = (nextMode: "signin" | "register") => {
    setMode(nextMode);
    setError("");
    setMessage("");
  };

  const handleModeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let nextMode: "signin" | "register";
    if (event.key === "ArrowRight") {
      nextMode = mode === "signin" ? "register" : "signin";
    } else if (event.key === "ArrowLeft") {
      nextMode = mode === "register" ? "signin" : "register";
    } else if (event.key === "Home") {
      nextMode = "signin";
    } else if (event.key === "End") {
      nextMode = "register";
    } else {
      return;
    }
    event.preventDefault();
    selectMode(nextMode);
    if (nextMode === "signin") signinTabRef.current!.focus();
    else registerTabRef.current!.focus();
  };

  useEffect(() => {
    let active = true;
    const completeRedirect = async () => {
      if (hasLocalGoogleRedirectResult(window.location.href)) {
        const localResult = consumeLocalGoogleRedirect(window.location.href, window.sessionStorage);
        if (localResult) {
          window.history.replaceState({}, "", localResult.returnUrl);
          await signInWithCredential(auth, localResult.credential);
          await ensureUserProfile();
        }
        return;
      }
      await getRedirectResult(auth);
    };
    void completeRedirect().catch((caught: unknown) => {
      if (!active) return;
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
      setError(caught instanceof Error ? caught.message : "Authentication with Google failed.");
    });
    return () => { active = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      if (mode === "signin") {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          await signOut(auth);
          setMessage("Verify your email before opening Kumo. We sent a fresh verification link.");
          return;
        }
        await ensureUserProfile();
      } else {
        if (password.length < 12) {
          setError("Use a password with at least twelve characters.");
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(credential.user);
        await signOut(auth);
        setPassword("");
        setConfirmPassword("");
        setMode("signin");
        setMessage("Account created. Check your email to verify it before signing in.");
      }
    } catch (caught: unknown) {
      const code = typeof caught === "object" && caught !== null && "code" in caught
        ? String(caught.code)
        : undefined;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setError("The email or password is incorrect.");
      } else if (code === "auth/email-already-in-use") {
        setError("An account already uses this email. Sign in instead.");
      } else if (code === "auth/weak-password") {
        setError("Use a password with at least six characters.");
      } else {
        setError("Authentication failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      if (usesLocalGoogleRedirect(window.location)) {
        const redirectUrl = await prepareLocalGoogleRedirect(
          firebaseApiKey,
          window.location.href,
          window.sessionStorage
        );
        window.location.assign(redirectUrl);
      } else {
        await signInWithRedirect(auth, provider);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Authentication with Google failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Enter your email first, then request a reset link.");
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Password reset email sent.");
    } catch {
      setError("We couldn't send a reset email. Check the address and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const logoContext: KumoLogoContext = authPending || submitting
    ? "loading"
    : error
      ? "error"
      : message
        ? "success"
        : "idle";
  const controlsDisabled = authPending || submitting;
  const logoStatus = authPending
    ? "Checking your existing session"
    : submitting
    ? "Opening your workspace"
    : error
      ? "Something needs another look."
      : message
        ? "You are all set."
        : "Ready when the idea is.";

  return (
    <main className={styles.homePage}>
      <section className={styles.intro}>
        <MarketingCanvas logoContext={logoContext} logoStatus={logoStatus} />
      </section>
      <form className={styles.loginForm} aria-label="Authentication" onSubmit={handleLogin} aria-busy={controlsDisabled}>
        <div className={styles.modeSwitch} role="tablist" aria-label="Authentication mode">
          <button id="signin-tab" aria-controls="authentication-panel" ref={signinTabRef} type="button" role="tab" aria-selected={mode === "signin"} tabIndex={mode === "signin" ? 0 : -1} disabled={controlsDisabled} onClick={() => selectMode("signin")} onKeyDown={handleModeKeyDown}>Sign in</button>
          <button id="register-tab" aria-controls="authentication-panel" ref={registerTabRef} type="button" role="tab" aria-selected={mode === "register"} tabIndex={mode === "register" ? 0 : -1} disabled={controlsDisabled} onClick={() => selectMode("register")} onKeyDown={handleModeKeyDown}>Create account</button>
        </div>
        <div id="authentication-panel" className={styles.authPanel} role="tabpanel" aria-labelledby={`${mode}-tab`}>
          {authPending && <p className={`${ui.notice} ${styles.feedback}`} role="status">Checking your existing session…</p>}
          <div>
            <h2>{mode === "signin" ? "Return to your boards" : "Start with a blank canvas"}</h2>
            <p className={styles.formIntro}>{mode === "signin" ? "Your connected workspace is ready." : "Make an account, then make the first move."}</p>
          </div>
          <div className={styles.loginFormRow}>
            <div className={styles.inputContainer}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className={`${ui.control} ${styles.input}`}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={controlsDisabled}
                required
              />
            </div>
            <div className={styles.inputContainer}>
              <label htmlFor="password">Password</label>
              <div className={styles.passwordControl}>
              <input
                id="password"
                className={`${ui.control} ${styles.input}`}
                type={showPassword ? "text" : "password"}
                placeholder={mode === "register" ? "At least 12 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === "register" ? 12 : 6}
                disabled={controlsDisabled}
                required
              />
              <button type="button" className={styles.passwordToggle} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} disabled={controlsDisabled}>{showPassword ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
              </div>
            </div>
            {mode === "register" && <div className={styles.inputContainer}>
              <label htmlFor="confirm-password">Confirm password</label>
              <input id="confirm-password" className={`${ui.control} ${styles.input}`} type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} disabled={controlsDisabled} required />
            </div>}
          </div>
          <div className={styles.loginFormColumn}>
            <button className={`${ui.button} ${ui.buttonPrimary} ${styles.submit}`} type="submit" disabled={controlsDisabled}>
              <span>{submitting ? "Please wait" : mode === "signin" ? "Sign in" : "Create account"}</span>
              {!submitting && <ArrowRight aria-hidden="true" />}
            </button>
            {mode === "signin" && <button className={`${ui.buttonLink} ${styles.resetButton}`} type="button" onClick={handleResetPassword} disabled={controlsDisabled}>Forgot password?</button>}
            <div className={styles.divider}><span>or</span></div>
            <button
              className={`${ui.button} ${styles.googleButton}`}
              type="button"
              onClick={handleGoogleLogin}
              disabled={controlsDisabled}
            >
              <GoogleLogo aria-hidden="true" weight="bold" />
              <span>Continue with Google</span>
            </button>
          </div>
          {error && <p className={`${ui.notice} ${ui.noticeError} ${styles.feedback}`} role="alert">{error}</p>}
          {message && <p className={`${ui.notice} ${ui.noticeSuccess} ${styles.feedback}`} role="status">{message}</p>}
        </div>
      </form>
    </main>
  );
};

export default HomePage;
