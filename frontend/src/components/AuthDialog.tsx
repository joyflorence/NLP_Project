import { FormEvent, useEffect, useState } from "react";
import { setAuthToken } from "@/api/client";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  initialMode?: "signin" | "signup" | "reset";
  onClose: () => void;
};

export function AuthDialog({ open, initialMode = "signin", onClose }: Props) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
      setNotice(null);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  if (!open) return null;

  function normalizeEmail(value: string) {
    return value
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[“”‘’]/g, "")
      .replace(/[＇＂]/g, "")
      .replace(/＠/g, "@")
      .replace(/\s+/g, "")
      .trim()
      .replace(/^['"]+|['"]+$/g, "")
      .toLowerCase();
  }

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    setLoading(true);
    try {
      const cleanEmail = normalizeEmail(email);
      if (!isValidEmail(cleanEmail)) {
        throw new Error("Email address is invalid");
      }
      if ((mode === "signup" || mode === "reset") && cooldownSeconds > 0) {
        throw new Error(`Please wait ${cooldownSeconds}s before requesting another email.`);
      }

      if (mode === "reset") {
        const redirectTo = import.meta.env.VITE_PASSWORD_RESET_REDIRECT_URL ?? window.location.origin;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
        if (resetError) throw resetError;
        setNotice("Password reset email sent. Check your inbox.");
        setCooldownSeconds(60);
      } else if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({ email: cleanEmail, password });
        if (signUpError) throw signUpError;

        if (data.session?.access_token) {
          setAuthToken(data.session.access_token);
          onClose();
          return;
        }

        setNotice("Check your email to confirm your account, then sign in.");
        setCooldownSeconds(60);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (signInError) throw signInError;
        if (data.session?.access_token) {
          setAuthToken(data.session.access_token);
        }
        onClose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      if (/invalid login credentials/i.test(message)) {
        setError("Invalid login credentials. If you don’t have an account yet, use Sign up below.");
      } else if (/rate limit/i.test(message)) {
        setCooldownSeconds((prev) => Math.max(prev, 60));
        setError("Email rate limit exceeded. Please wait 60 seconds before trying again.");
      } else if (/invalid/i.test(message)) {
        setError(`${message}. Use a normal email format like admin@gmail.com (without quotes or spaces).`);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-overlay" role="dialog" aria-modal="true" aria-label="Authentication">
      <div className="auth-dialog">
        <header>
          <h2>{mode === "signin" ? "Sign In" : mode === "signup" ? "Sign Up" : "Reset Password"}</h2>
          <button type="button" className="auth-close" onClick={onClose} aria-label="Close authentication dialog">
            x
          </button>
        </header>

        <form onSubmit={onSubmit} className="stack">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <label>
            Password
            <div className="auth-password-row">
              <input
                className={mode !== "reset" ? "auth-password-input has-toggle" : "auth-password-input"}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={mode !== "reset"}
                minLength={6}
                disabled={mode === "reset"}
              />
              {mode !== "reset" ? (
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  <svg viewBox="0 0 24 24" className="auth-password-icon" aria-hidden="true">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
                    <circle cx="12" cy="12" r="3" />
                    {showPassword ? <path d="M4 4l16 16" /> : null}
                  </svg>
                </button>
              ) : null}
            </div>
          </label>

          <button type="submit" disabled={loading || ((mode === "signup" || mode === "reset") && cooldownSeconds > 0)}>
            {loading ? "Please wait..." : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="auth-note">{notice}</p> : null}
        {(mode === "signup" || mode === "reset") && cooldownSeconds > 0 ? (
          <p className="auth-note">You can request another email in {cooldownSeconds}s.</p>
        ) : null}

        <div className="auth-switch">
          {mode === "signin" ? (
            <>
              <button type="button" className="link-button" onClick={() => setMode("reset")}>
                Forgot password?
              </button>
              <button type="button" className="link-button" onClick={() => setMode("signup")}>
                New user? Sign up
              </button>
            </>
          ) : mode === "signup" ? (
            <button type="button" className="link-button" onClick={() => setMode("signin")}>
              Already have an account? Sign in
            </button>
          ) : (
            <button type="button" className="link-button" onClick={() => setMode("signin")}>
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
