import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { setAuthToken } from "../api/client";
import { supabase } from "../lib/supabase";

type Props = {
  onComplete: () => void;
};

function getEmail(search: string) {
  const params = new URLSearchParams(search);
  return params.get("email") || params.get("invite_email") || "";
}

function getMode(search: string) {
  const params = new URLSearchParams(search);
  return params.get("mode") || "signup";
}

export function InviteCompletionPage({ onComplete }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(getEmail(location.search));
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      setLoading(true);
      if (!supabase) {
        if (mounted) {
          setHasSession(false);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const session = data?.session ?? null;
      setHasSession(Boolean(session));
      setEmail((current) => current || session?.user?.email || getEmail(location.search));
      setLoading(false);
    }

    void loadSession();
    return () => {
      mounted = false;
    };
  }, [location.search]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      if (!supabase) {
        throw new Error("Authentication is not configured.");
      }

      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        throw new Error("Please enter the email address from your invite.");
      }
      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters.");
      }

      if (hasSession) {
        const { error: updateError } = await supabase.auth.updateUser({
          password,
          data: name.trim() ? { full_name: name.trim(), name: name.trim() } : undefined
        });
        if (updateError) throw updateError;
        const { data: sessionData } = await supabase.auth.getSession();
        setAuthToken(sessionData.session?.access_token ?? null);
        onComplete();
        return;
      }

      const redirectTo = new URL("/complete-invite", window.location.origin);
      redirectTo.searchParams.set("mode", "signup");
      redirectTo.searchParams.set("email", cleanEmail);

      const { error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: redirectTo.toString(),
          data: {
            full_name: name.trim(),
            name: name.trim()
          }
        }
      });
      if (signUpError) throw signUpError;

      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.access_token) {
        setAuthToken(sessionData.session.access_token);
        onComplete();
        return;
      }

      setNotice("We sent a confirmation email. Open it to finish activating your admin access.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the invite.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="invite-complete-shell">
        <div className="invite-complete-card">
          <p className="invite-complete-kicker">Admin invite</p>
          <h1>Preparing your invite</h1>
          <p>We are checking your invite link and loading your account details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-complete-shell">
      <div className="invite-complete-card">
        <div className="invite-complete-header">
          <div>
            <p className="invite-complete-kicker">Admin invite</p>
            <h1>{getMode(location.search) === "signup" ? "Complete your setup" : "Welcome back"}</h1>
            <p>
              Set a password for your admin account, then enter the portal. If your invite already signed you in, we will
              simply update your password and take you back to the dashboard.
            </p>
          </div>
          <button type="button" className="auth-icon-button invite-complete-home" onClick={() => navigate("/login?mode=signin")}>
            Go to sign in
          </button>
        </div>

        <form className="invite-complete-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={hasSession}
              required
            />
          </label>

          <label>
            Display name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </label>

          <label>
            Create password
            <div className="auth-password-row invite-password-row">
              <input
                className="auth-password-input has-toggle"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <svg viewBox="0 0 24 24" className="auth-password-icon" aria-hidden="true">
                  <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword ? <path d="M4 4l16 16" /> : null}
                </svg>
              </button>
            </div>
          </label>

          <button type="submit" className="action-button primary invite-complete-submit" disabled={submitting}>
            {submitting ? "Completing..." : hasSession ? "Set Password" : "Create Password"}
          </button>
        </form>

        {error ? <p className="error invite-complete-error">{error}</p> : null}
        {notice ? <p className="auth-note invite-complete-note">{notice}</p> : null}
      </div>
    </div>
  );
}
