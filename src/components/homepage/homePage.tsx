import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
  browserPopupRedirectResolver,
} from "firebase/auth";
import { clearPendingGoogleRedirect, hasPendingGoogleRedirect, markPendingGoogleRedirect } from "../../config/googleRedirectState";
import LoadingScreen from "../LoadingScreen";
import { type KumoLogoContext } from "../brand/KumoLogoConfig";
import MarketingCanvasPreview from "./MarketingCanvasPreview";
import KumoLogo from "../brand/KumoLogo";
import canvasStyles from "./MarketingCanvas.module.css";
import {
  consumeLocalGoogleRedirect,
  hasLocalGoogleRedirectResult,
  prepareLocalGoogleRedirect,
  usesLocalGoogleRedirect,
} from "../../config/localGoogleRedirect";

interface HomePageProps {
  authPending?: boolean;
}

const MarketingCanvas = lazy(() => import("./MarketingCanvas"));

/** Fields that can carry their own error; anything else is reported once at the top of the form. */
type AuthField = "email" | "password" | "confirm-password";

const HomePage = ({ authPending = false }: HomePageProps) => {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const signinTabRef = useRef<HTMLButtonElement>(null);
  const registerTabRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ field: AuthField; text: string } | null>(null);
  const [message, setMessage] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirectPending, setRedirectPending] = useState(() => hasLocalGoogleRedirectResult(window.location.href));
  const redirectPromise = useRef<Promise<void> | null>(null);

  const selectMode = (nextMode: "signin" | "register") => {
    setMode(nextMode);
    setError("");
    setFieldError(null);
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
        }
        return;
      }
      if (hasPendingGoogleRedirect()) {
        clearPendingGoogleRedirect();
        await getRedirectResult(auth, browserPopupRedirectResolver);
      }
    };
    // Strict Mode replays effects; both subscriptions must wait for the same
    // credential exchange after its URL fragment has been consumed.
    redirectPromise.current ??= completeRedirect();
    void redirectPromise.current.catch((caught: unknown) => {
      if (!active) return;
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
      setError(caught instanceof Error ? caught.message : "Authentication with Google failed.");
    }).finally(() => {
      if (active) setRedirectPending(false);
    });
    return () => { active = false; };
  }, []);

  const fieldErrorId = fieldError ? `${fieldError.field}-error` : undefined;
  useEffect(() => {
    if (!fieldError) return;
    const field = { email: emailRef, password: passwordRef, "confirm-password": confirmPasswordRef }[fieldError.field];
    field.current?.focus();
  }, [fieldError]);

  const clearFeedback = () => {
    setError("");
    setFieldError(null);
    setMessage("");
  };
  const failField = (field: AuthField, text: string) => setFieldError({ field, text });
  const passwordHelpId = mode === "register" ? "password-help" : undefined;
  const invalidProps = (field: AuthField) => fieldError?.field === field
    ? { "aria-invalid": true as const, "aria-describedby": fieldErrorId }
    : { "aria-describedby": field === "password" ? passwordHelpId : undefined };
  const fieldErrorText = (field: AuthField) => fieldError?.field === field
    ? <p id={fieldErrorId} className={styles.fieldError} role="alert">{fieldError.text}</p>
    : null;

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearFeedback();
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
      } else {
        if (password.length < 12) {
          failField("password", "Use a password with at least twelve characters.");
          return;
        }
        if (password !== confirmPassword) {
          failField("confirm-password", "Passwords do not match.");
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
        failField("email", "An account already uses this email. Sign in instead.");
      } else if (code === "auth/weak-password") {
        failField("password", "Use a password with at least six characters.");
      } else {
        setError("Authentication failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    clearFeedback();
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
        markPendingGoogleRedirect();
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Authentication with Google failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    clearFeedback();
    if (!email.trim()) {
      failField("email", "Enter your email first, then request a reset link.");
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Password reset email sent.");
    } catch {
      failField("email", "We couldn't send a reset email. Check the address and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (redirectPending) return <LoadingScreen />;

  const hasError = Boolean(error || fieldError);
  const logoContext: KumoLogoContext = authPending || submitting
    ? "loading"
    : hasError
      ? "error"
      : message
        ? "success"
        : "idle";
  const controlsDisabled = authPending || submitting;
  const logoStatus = authPending
    ? "Checking your existing session"
    : submitting
    ? "Opening your workspace"
    : hasError
      ? "Something needs another look."
      : message
        ? "You are all set."
        : "Ready when the idea is.";

  return (
    <main className={styles.homePage}>
      <section className={styles.intro}>
        <div className={canvasStyles.marketingCanvas} data-context={logoContext}>
          <Suspense fallback={<MarketingCanvasPreview logoContext={logoContext} logoStatus={logoStatus} />}>
            <MarketingCanvas logoContext={logoContext} logoStatus={logoStatus} showLogo={false} />
          </Suspense>
          <div className={canvasStyles.heroVisual}>
            <KumoLogo className={canvasStyles.brandLogo} context={logoContext} label="Animated Kumo mascot" startupAnimation="startup" animationScope="app-startup" />
          </div>
        </div>
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
          {error && <p className={`${ui.notice} ${ui.noticeError} ${styles.feedback}`} role="alert">{error}</p>}
          {message && <p className={`${ui.notice} ${ui.noticeSuccess} ${styles.feedback}`} role="status">{message}</p>}
          <div className={styles.loginFormRow}>
            <div className={styles.inputContainer}>
              <label htmlFor="email">Email</label>
              <input
                ref={emailRef}
                id="email"
                className={`${ui.control} ${styles.input}`}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={controlsDisabled}
                required
                {...invalidProps("email")}
              />
              {fieldErrorText("email")}
            </div>
            <div className={styles.inputContainer}>
              <label htmlFor="password">Password</label>
              <div className={styles.passwordControl}>
              <input
                ref={passwordRef}
                id="password"
                className={`${ui.control} ${styles.input}`}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === "register" ? 12 : 6}
                disabled={controlsDisabled}
                required
                {...invalidProps("password")}
              />
              <button type="button" className={styles.passwordToggle} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)} disabled={controlsDisabled}>{showPassword ? <EyeSlash aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
              </div>
              {mode === "register" && <p id="password-help" className={styles.fieldHelp}>Use at least 12 characters.</p>}
              {fieldErrorText("password")}
            </div>
            {mode === "register" && <div className={styles.inputContainer}>
              <label htmlFor="confirm-password">Confirm password</label>
              <input ref={confirmPasswordRef} id="confirm-password" className={`${ui.control} ${styles.input}`} type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} disabled={controlsDisabled} required {...invalidProps("confirm-password")} />
              {fieldErrorText("confirm-password")}
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
        </div>
      </form>
    </main>
  );
};

export default HomePage;
