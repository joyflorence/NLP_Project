import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { AuthDialog } from "./components/AuthDialog";
import { AdminDocumentList } from "./components/AdminDocumentList";
import { AdminIngestionPanel } from "./components/AdminIngestionPanel";
import { AdminIngestJobs } from "./components/AdminIngestJobs";
import { AdminIndexStatus } from "./components/AdminIndexStatus";
import { AdminMemberManager } from "./components/AdminMemberManager";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Check initial auth state
    supabase?.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase?.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    ) ?? { data: { subscription: null } };

    return () => subscription?.unsubscribe();
  }, []);

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
      setAuthDialogOpen(true);
    }
  }, [loading, user, location.pathname]);

  const isAdmin = user?.app_metadata?.role === "admin" || user?.user_metadata?.role === "admin";

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
          onClick={() => navigate("/login")}
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
          onClick={() => setAuthDialogOpen(true)}
        >
          Open Login Dialog
        </button>
      </div>
      <AuthDialog open={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
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
            <span className="auth-badge">Signed in as {user.email}</span>
            <button
              type="button"
              className="auth-icon-button"
              onClick={() => supabase?.auth.signOut()}
            >
              Sign Out
            </button>
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
          <span className="auth-badge">Admin: {user.email}</span>
          <button
            type="button"
            className="auth-icon-button"
            onClick={() => supabase?.auth.signOut()}
          >
            Sign Out
          </button>
        </div>
      </div>

      <Routes>
        <Route
          path="/"
          element={
            <div className="stack">
              <AdminMemberManager />
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