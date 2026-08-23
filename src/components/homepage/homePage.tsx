import { useEffect, useState } from "react";
import { ArrowRight, GoogleLogo, Graph } from "@phosphor-icons/react";
import styles from "./homePage.module.css";
import { auth, firebaseApiKey, provider } from "../../config/firebase";
import {
  signInWithEmailAndPassword,
  getRedirectResult,
  signInWithRedirect,
  signInWithCredential,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { ensureUserProfile } from "../../services/userRepository";
import KumoLogo from "../brand/KumoLogo";
import { type KumoLogoContext } from "../brand/KumoLogoConfig";
import {
  consumeLocalGoogleRedirect,
  hasLocalGoogleRedirectResult,
  prepareLocalGoogleRedirect,
  usesLocalGoogleRedirect,
} from "../../config/localGoogleRedirect";

const HomePage = () => {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
      await ensureUserProfile();
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

  const logoContext: KumoLogoContext = submitting
    ? "loading"
    : error
      ? "error"
      : message
        ? "success"
        : "idle";
  const logoStatus = submitting
    ? "Opening your workspace"
    : error
      ? "Something needs another look."
      : message
        ? "You are all set."
        : "Ready when the idea is.";

  return (
    <main className={styles.homePage}>
      <section className={styles.intro}>
        <header className={styles.brandBar}>
          <span className={styles.logoText}>Kumo</span>
          <span>Connected visual workspace</span>
        </header>
        <div className={styles.heroVisual} data-context={logoContext}>
          <KumoLogo className={styles.brandLogo} context={logoContext} label="Animated Kumo mascot" startupAnimation="startup" animationScope="app-startup" />
          <div className={styles.connectionModel} aria-label="A chain of connected Kumo boards">
            <span>Explore</span>
            <ArrowRight aria-hidden="true" />
            <span>Shape</span>
            <ArrowRight aria-hidden="true" />
            <span>Build</span>
          </div>
          <span className={styles.logoStatus} aria-live="polite">{logoStatus}</span>
        </div>
        <div className={styles.introText}>
          <p className={styles.eyebrow}><Graph aria-hidden="true" /> Make space to think</p>
          <h1>Every board can lead somewhere.</h1>
          <p className={styles.introCopy}>Create together in real time, then link one board directly into the next.</p>
        </div>
      </section>
      <form className={styles.loginForm} onSubmit={handleLogin}>
        <div className={styles.modeSwitch} role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === "signin"} disabled={submitting} onClick={() => { setMode("signin"); setError(""); setMessage(""); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "register"} disabled={submitting} onClick={() => { setMode("register"); setError(""); setMessage(""); }}>Create account</button>
        </div>
        <div>
          <h2>{mode === "signin" ? "Return to your boards" : "Start with a blank canvas"}</h2>
          <p className={styles.formIntro}>{mode === "signin" ? "Your connected workspace is ready." : "Make an account, then make the first move."}</p>
        </div>
        <div className={styles.loginFormRow}>
          <div className={styles.inputContainer}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className={styles.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.inputContainer}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
        </div>
        <div className={styles.loginFormColumn}>
          <button className={styles.submit} type="submit" disabled={submitting}>
            <span>{submitting ? "Please wait" : mode === "signin" ? "Sign in" : "Create account"}</span>
            {!submitting && <ArrowRight aria-hidden="true" />}
          </button>
          {mode === "signin" && <button className={styles.resetButton} type="button" onClick={handleResetPassword} disabled={submitting}>Forgot password?</button>}
          <div className={styles.divider}><span>or</span></div>
          <button
            className={styles.googleButton}
            type="button"
            onClick={handleGoogleLogin}
            disabled={submitting}
          >
            <GoogleLogo aria-hidden="true" weight="bold" />
            <span>Continue with Google</span>
          </button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.message} role="status">{message}</p>}
      </form>
    </main>
  );
};

export default HomePage;
