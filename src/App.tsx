import { AuthDialog } from "@/components/AuthDialog";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { api, setAuthToken } from "@/api/client";
import { DocumentRecord } from "@/types/domain";
import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate, Link } from "react-router-dom";
import { AdminPage } from "@/pages/AdminPage";
import { SearchPage } from "@/pages/SearchPage";
import { RelatedWorksPage } from "@/pages/RelatedWorksPage";
import { DocumentFullTextPage } from "@/pages/DocumentFullTextPage";

function parseAdminEmails(): string[] {
  const raw = import.meta.env.VITE_ADMIN_EMAILS;
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_EMAILS = parseAdminEmails();

function resolveIsAdmin(role?: string, email?: string): boolean {
  if (role === "admin") return true;
  if (email && ADMIN_EMAILS.length > 0) {
    return ADMIN_EMAILS.includes(email.trim().toLowerCase());
  }
  return false;
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "reset">("signin");
  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    // verify that the backend is reachable; log to console when there's a
    // problem so developers can spot CORS/URL issues early.
    void api
      .ping()
      .catch((err) => console.error("Backend ping failed:", err));

    if (!isSupabaseConfigured || !supabase) {
      const token = window.localStorage.getItem("access_token");
      setIsAuthenticated(Boolean(token));
      setIsAdmin(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const role = data.session?.user?.app_metadata?.role as string | undefined;
      const email = data.session?.user?.email ?? "";
      setIsAuthenticated(Boolean(data.session));
      const meta = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
      const name =
        (meta?.full_name as string | undefined) ??
        (meta?.name as string | undefined) ??
        (meta?.username as string | undefined) ??
        "";
      setAuthEmail(email);
      setAuthName(name);
      setIsAdmin(resolveIsAdmin(role, email));
      setAuthToken(data.session?.access_token ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const role = session?.user?.app_metadata?.role as string | undefined;
      const email = session?.user?.email ?? "";
      const nextIsAdmin = resolveIsAdmin(role, email);
      setIsAuthenticated(Boolean(session));
      const meta = session?.user?.user_metadata as Record<string, unknown> | undefined;
      const name =
        (meta?.full_name as string | undefined) ??
        (meta?.name as string | undefined) ??
        (meta?.username as string | undefined) ??
        "";
      setAuthEmail(email);
      setAuthName(name);
      setIsAdmin(nextIsAdmin);
      setAuthToken(session?.access_token ?? null);

      if (_event === "SIGNED_IN" && nextIsAdmin && location.pathname !== "/admin") {
        navigate("/admin");
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [location.pathname, navigate]);

  async function signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setAuthToken(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
    setAuthEmail("");
    setAuthName("");
    setShowLogout(false);
  }

  async function downloadDocument(doc: DocumentRecord) {
    if (!isAuthenticated) {
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }
    try {
      const signed = await api.getSignedDownloadUrl(doc.id);
      window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not generate download link.");
    }
  }

  return (
    <main className="layout">
      <header className="brand-bar">
        <h1>University Search</h1>
        <div className="auth-actions">
          {isAdmin ? (
            <Link to="/admin" className="admin-link">
              Admin
            </Link>
          ) : null}
          {isAuthenticated ? (
            <>
              <span className="auth-badge">{authName || authEmail || "Signed in"}</span>
              <div className="logout-toggle">
                <button
                  type="button"
                  className="auth-icon-button"
                  onClick={() => setShowLogout((prev) => !prev)}
                  title="Account"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="icon-user">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                  </svg>
                </button>
                {showLogout ? (
                  <button type="button" className="logout-menu" onClick={signOut}>
                    Log out
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="auth-icon-button"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthOpen(true);
                }}
                title="Sign in"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<SearchPage onDownloadDocument={downloadDocument} />} />
        <Route path="/search" element={<SearchPage onDownloadDocument={downloadDocument} />} />
        <Route path="/document/full-text" element={<DocumentFullTextPage onDownloadDocument={downloadDocument} />} />
        <Route path="/related-works" element={<RelatedWorksPage onDownloadDocument={downloadDocument} />} />
        <Route path="/admin" element={<AdminPage isAdmin={isAdmin} />} />
        <Route path="*" element={<SearchPage onDownloadDocument={downloadDocument} />} />
      </Routes>

      <AuthDialog open={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />
    </main>
  );
}
