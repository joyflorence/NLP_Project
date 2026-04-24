import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { setAuthToken } from "./api/client";
import { AuthDialog } from "./components/AuthDialog";
import { AdminDocumentList } from "./components/AdminDocumentList";
import { AdminIngestionPanel } from "./components/AdminIngestionPanel";
import { AdminIngestJobs } from "./components/AdminIngestJobs";
import { AdminIndexStatus } from "./components/AdminIndexStatus";
import { AdminAuditLog } from "./components/AdminAuditLog";
import { AdminMemberManager } from "./components/AdminMemberManager";
import { AdminInviteManager } from "./components/AdminInviteManager";
import { InviteCompletionPage } from "./components/InviteCompletionPage";

function getLoginMode(search: string) {
  const params = new URLSearchParams(search);
  const mode = params.get("mode");
  return mode === "signup" || mode === "reset" ? mode : "signin";
}

function getInviteEmail(search: string) {
  const params = new URLSearchParams(search);
  return params.get("email") || params.get("invite_email") || "";
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<"signin" | "signup" | "reset">("signin");
  const [authDialogEmail, setAuthDialogEmail] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Check initial auth state
    supabase?.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthToken(session?.access_token ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase?.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setAuthToken(session?.access_token ?? null);
        setLoading(false);
      }
    ) ?? { data: { subscription: null } };

    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setAccountMenuOpen(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading && !user && location.pathname === "/") {
      const timer = window.setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2500);

      return () => window.clearTimeout(timer);
    }
  }, [loading, user, location.pathname, navigate]);

  useEffect(() => {
    if (!loading && !user && location.pathname === "/login") {
      setAuthDialogMode(getLoginMode(location.search));
      setAuthDialogEmail(getInviteEmail(location.search));
      setAuthDialogOpen(true);
    }
  }, [loading, user, location.pathname, location.search]);

  async function handleSignOut() {
    setAccountMenuOpen(false);
    await supabase?.auth.signOut();
    setAuthToken(null);
    setUser(null);
    setLoading(false);
  }

  const isAdmin = user?.app_metadata?.role === "admin" || user?.user_metadata?.role === "admin";
  const accountLabel = user?.email || "Account";

  function handleAuthenticated() {
    navigate("/", { replace: true });
  }

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p>Loading...</p>
      </div>
    );
  }

  const LandingPage = (
    <div style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
      <h1>Welcome to the Admin Portal</h1>
      <p style={{ maxWidth: 620, margin: "1rem auto", color: "#4a5568" }}>
        Manage documents, review ingestion history, and monitor search indexing.
        You will be redirected to the login page shortly.
      </p>
      <div style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="auth-icon-button"
          onClick={() => navigate("/login?mode=signin")}
        >
          Sign In Now
        </button>
      </div>
    </div>
  );

  const LoginPage = (
    <div style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
      <h1>Admin Login</h1>
      <p style={{ maxWidth: 620, margin: "1rem auto", color: "#4a5568" }}>
        Please sign in with admin credentials to access the portal.
      </p>
      <div style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          className="auth-icon-button"
          onClick={() => {
            setAuthDialogMode("signin");
            setAuthDialogEmail("");
            setAuthDialogOpen(true);
          }}
        >
          Open Login Dialog
        </button>
      </div>
    </div>
  );

  if (!user && location.pathname === "/") {
    return (
      <div className="layout">
        <div className="brand-bar">
          <h1>Admin Panel</h1>
        </div>
        {LandingPage}
      </div>
    );
  }

  if (!user && location.pathname === "/login") {
    return (
      <div className="layout">
        <div className="brand-bar">
          <h1>Admin Panel</h1>
        </div>
        {LoginPage}
        <AuthDialog
          open={authDialogOpen}
          initialMode={authDialogMode}
          initialEmail={authDialogEmail}
          onClose={() => setAuthDialogOpen(false)}
          onAuthenticated={handleAuthenticated}
        />
      </div>
    );
  }

  if (location.pathname === "/complete-invite") {
    return (
      <div className="layout">
        <div className="brand-bar">
          <h1>Admin Panel</h1>
        </div>
        <InviteCompletionPage onComplete={handleAuthenticated} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="layout">
        <div className="brand-bar">
          <h1>Admin Panel</h1>
          <div className="auth-actions">
            <div className="account-chip-shell" ref={accountMenuRef}>
              <button
                type="button"
                className="account-chip"
                onClick={() => setAccountMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
              >
                <span className="auth-badge">Signed in: {accountLabel}</span>
                <span className="account-chip-avatar" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="icon-user">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                  </svg>
                </span>
                <svg viewBox="0 0 24 24" className={accountMenuOpen ? "account-chip-caret is-open" : "account-chip-caret"} aria-hidden="true">
                  <path d="M7 10l5 5 5-5" />
                </svg>
              </button>
              {accountMenuOpen ? (
                <div className="account-dropdown-menu" role="menu" aria-label="Account actions">
                  <span className="account-role-pill">Signed in</span>
                  <span className="account-menu-email">{accountLabel}</span>
                  <button type="button" className="account-dropdown-action" onClick={handleSignOut}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h2>Admin Access Required</h2>
          <p>Your account does not have admin privileges. Please contact an administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      <div className="brand-bar">
        <h1>Admin Panel</h1>
        <div className="auth-actions">
          <div className="account-chip-shell" ref={accountMenuRef}>
            <button
              type="button"
              className="account-chip"
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
            >
              <span className="auth-badge">Admin: {accountLabel}</span>
              <span className="account-chip-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="icon-user">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
              </span>
              <svg viewBox="0 0 24 24" className={accountMenuOpen ? "account-chip-caret is-open" : "account-chip-caret"} aria-hidden="true">
                <path d="M7 10l5 5 5-5" />
              </svg>
            </button>
            {accountMenuOpen ? (
              <div className="account-dropdown-menu" role="menu" aria-label="Account actions">
                <span className="account-role-pill">Admin access</span>
                <span className="account-menu-email">{accountLabel}</span>
                <button type="button" className="account-dropdown-action" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Routes>
        <Route
          path="/"
          element={
            <div className="stack">
              <AdminMemberManager onActionComplete={() => setRefreshKey((current) => current + 1)} />
              <AdminInviteManager
                refreshKey={refreshKey}
                onActionComplete={() => setRefreshKey((current) => current + 1)}
              />
              <AdminAuditLog refreshKey={refreshKey} />
              <AdminIndexStatus refreshKey={refreshKey} />
              <AdminIngestJobs refreshKey={refreshKey} />
              <AdminDocumentList
                refreshKey={refreshKey}
                onCacheReset={() => setRefreshKey(k => k + 1)}
              />
              <AdminIngestionPanel
                isAdmin={isAdmin}
                onUploadSuccess={() => setRefreshKey(k => k + 1)}
              />
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;


