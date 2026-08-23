import { useState } from "react";
import styles from "./homePage.module.css";
import { auth, provider } from "../../config/firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import logo from "../../res/logo3.png";
import { ensureUserProfile } from "../../services/userRepository";

const HomePage = () => {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    try {
      await signInWithPopup(auth, provider);
      await ensureUserProfile();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Authentication with Google failed.");
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Enter your email first, then request a reset link.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Password reset email sent.");
    } catch {
      setError("We couldn't send a reset email. Check the address and try again.");
    }
  };

  return (
    <main className={styles.homePage}>
      <section className={styles.intro}>
        <div className={styles.logo}>
          <img className={styles.icon} src={logo} alt="" />
          <span className={styles.logoText}>Kumo</span>
        </div>
        <p className={styles.eyebrow}>A shared visual workspace</p>
        <h1>Ideas move faster when the canvas stays out of the way.</h1>
        <p className={styles.introCopy}>Shape interfaces, map product thinking, and work together in real time.</p>
      </section>
      <form className={styles.loginForm} onSubmit={handleLogin}>
        <div className={styles.modeSwitch} role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => { setMode("signin"); setError(""); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>Create account</button>
        </div>
        <div>
          <h2>{mode === "signin" ? "Welcome back" : "Start a workspace"}</h2>
          <p className={styles.formIntro}>{mode === "signin" ? "Continue to your boards." : "Create an account with email or Google."}</p>
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
            {submitting ? "Please wait" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {mode === "signin" && <button className={styles.resetButton} type="button" onClick={handleResetPassword}>Forgot password?</button>}
          <div className={styles.divider}><span>or</span></div>
          <button
            className={styles.googleButton}
            type="button"
            onClick={handleGoogleLogin}
          >
            Continue with Google
          </button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p className={styles.message} role="status">{message}</p>}
      </form>
    </main>
  );
};

export default HomePage;
