import { AuthDialog } from "@/components/AuthDialog";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { api, setAuthToken } from "@/api/client";
import { DocumentRecord, SavedDocument } from "@/types/domain";
import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate, Link } from "react-router-dom";
import { AdminPage } from "@/pages/AdminPage";
import { SearchPage } from "@/pages/SearchPage";
import { RelatedWorksPage } from "@/pages/RelatedWorksPage";
import { DocumentFullTextPage } from "@/pages/DocumentFullTextPage";
import { LibraryPage } from "@/pages/LibraryPage";

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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [savedDocuments, setSavedDocuments] = useState<SavedDocument[]>([]);

  async function refreshSavedDocuments(nextIsAuthenticated: boolean, nextIsAdmin: boolean) {
    if (!nextIsAuthenticated || nextIsAdmin) {
      setSavedDocuments([]);
      return;
    }
    try {
      const res = await api.getSavedDocuments();
      setSavedDocuments(res.documents ?? []);
    } catch {
      setSavedDocuments([]);
    }
  }

  useEffect(() => {
    void api
      .ping()
      .catch((err: unknown) => console.error("Backend ping failed:", err));

    if (!isSupabaseConfigured || !supabase) {
      const token = window.localStorage.getItem("access_token");
      setIsAuthenticated(Boolean(token));
      setIsAdmin(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data }) => {
      const role = data.session?.user?.app_metadata?.role as string | undefined;
      const email = data.session?.user?.email ?? "";
      const nextIsAuthenticated = Boolean(data.session);
      const nextIsAdmin = resolveIsAdmin(role, email);
      setIsAuthenticated(nextIsAuthenticated);
      const meta = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
      const name =
        (meta?.full_name as string | undefined) ??
        (meta?.name as string | undefined) ??
        (meta?.username as string | undefined) ??
        "";
      setAuthEmail(email);
      setAuthName(name);
      setIsAdmin(nextIsAdmin);
      setAuthToken(data.session?.access_token ?? null);
      await refreshSavedDocuments(nextIsAuthenticated, nextIsAdmin);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const role = session?.user?.app_metadata?.role as string | undefined;
      const email = session?.user?.email ?? "";
      const nextIsAdmin = resolveIsAdmin(role, email);
      const nextIsAuthenticated = Boolean(session);
      setIsAuthenticated(nextIsAuthenticated);
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
      await refreshSavedDocuments(nextIsAuthenticated, nextIsAdmin);

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
    setSavedDocuments([]);
    setAccountMenuOpen(false);
  }

  async function handleToggleSavedDocument(doc: DocumentRecord) {
    if (!isAuthenticated) {
      setAuthMode("signin");
      setAuthOpen(true);
      return;
    }
    try {
      if (savedDocuments.some((item) => item.id === doc.id)) {
        await api.removeDocumentFromLibrary(doc.id);
      } else {
        await api.saveDocumentToLibrary(doc.id);
      }
      await refreshSavedDocuments(true, isAdmin);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not update your library.");
    }
  }

  async function handleSaveNote(documentId: string, note: string) {
    if (!isAuthenticated) return;
    try {
      await api.saveDocumentToLibrary(documentId, note);
      await refreshSavedDocuments(true, isAdmin);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not save your note.");
    }
  }

  function handleIsSaved(documentId: string) {
    return savedDocuments.some((doc) => doc.id === documentId);
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
          <div className="account-chip-shell">
            <button
              type="button"
              className={isAuthenticated ? "account-chip" : "guest-account-launch"}
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              title={isAuthenticated ? "Account" : "Open account menu"}
            >
              {isAuthenticated ? <span className="auth-badge">{authName || authEmail || "Signed in"}</span> : null}
              <span className="account-chip-avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="icon-user">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
              </span>
            </button>
            {accountMenuOpen ? (
              <div className="logout-menu account-dropdown-menu account-popover-card">
                {isAuthenticated ? (
                  <>
                    <div className="account-popover-header">
                      <span className="account-popover-avatar" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="icon-user">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                        </svg>
                      </span>
                      <div>
                        <strong>{authName || "My Account"}</strong>
                        <p>{authEmail || "Signed in"}</p>
                      </div>
                    </div>
                    <div className="account-popover-actions">
                      {!isAdmin ? (
                        <Link to="/library" className="account-dropdown-link" onClick={() => setAccountMenuOpen(false)}>
                          My Library ({savedDocuments.length})
                        </Link>
                      ) : null}
                      {isAdmin ? (
                        <Link to="/admin" className="account-dropdown-link" onClick={() => setAccountMenuOpen(false)}>
                          Admin
                        </Link>
                      ) : null}
                      <button type="button" className="account-dropdown-button" onClick={signOut}>
                        Sign out
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="account-popover-header is-guest">
                      <span className="account-popover-avatar" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="icon-user">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                        </svg>
                      </span>
                      <div>
                        <strong>Welcome</strong>
                        <p>Sign in to manage downloads and keep your saved library with your account.</p>
                      </div>
                    </div>
                    <div className="account-popover-actions">
                      <button
                        type="button"
                        className="account-dropdown-button is-primary"
                        onClick={() => {
                          setAuthMode("signin");
                          setAuthOpen(true);
                          setAccountMenuOpen(false);
                        }}
                      >
                        Sign in
                      </button>
                      <button
                        type="button"
                        className="account-dropdown-button"
                        onClick={() => {
                          setAuthMode("signup");
                          setAuthOpen(true);
                          setAccountMenuOpen(false);
                        }}
                      >
                        Create account
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <Routes>
        <Route
          path="/"
          element={<SearchPage onDownloadDocument={downloadDocument} onToggleSaveDocument={handleToggleSavedDocument} isDocumentSaved={handleIsSaved} />}
        />
        <Route
          path="/search"
          element={<SearchPage onDownloadDocument={downloadDocument} onToggleSaveDocument={handleToggleSavedDocument} isDocumentSaved={handleIsSaved} />}
        />
        <Route path="/document/full-text" element={<DocumentFullTextPage onDownloadDocument={downloadDocument} />} />
        <Route
          path="/related-works"
          element={<RelatedWorksPage onDownloadDocument={downloadDocument} onToggleSaveDocument={handleToggleSavedDocument} isDocumentSaved={handleIsSaved} />}
        />
        <Route
          path="/library"
          element={<LibraryPage savedDocuments={savedDocuments} isAuthenticated={isAuthenticated && !isAdmin} onDownloadDocument={downloadDocument} onToggleSaveDocument={handleToggleSavedDocument} onSaveNote={handleSaveNote} isDocumentSaved={handleIsSaved} />}
        />
        <Route path="/admin" element={<AdminPage isAdmin={isAdmin} />} />
        <Route
          path="*"
          element={<SearchPage onDownloadDocument={downloadDocument} onToggleSaveDocument={handleToggleSavedDocument} isDocumentSaved={handleIsSaved} />}
        />
      </Routes>

      <AuthDialog open={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />
    </main>
  );
}
