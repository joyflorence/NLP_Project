import { FormEvent, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Props = {
  isAdmin: boolean;
};

export function AdminIngestionPanel({ isAdmin }: Props) {
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [author, setAuthor] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [department, setDepartment] = useState("");
  const [level, setLevel] = useState<"undergraduate" | "postgrad">("undergraduate");
  const [year, setYear] = useState<number>(2025);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isAdmin) {
    return (
      <section className="panel scholar-panel">
        <h2>Admin Ingestion</h2>
        <p className="muted">Ingestion is restricted to admin accounts.</p>
      </section>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    if (!file) {
      setError("Please select a document file.");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("No authenticated user found.");

      const safeName = file.name.replace(/\s+/g, "_");
      const objectPath = `${user.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from("academic-docs").upload(objectPath, file, {
        upsert: false
      });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("documents").insert({
        title,
        abstract,
        author,
        supervisor,
        department,
        level,
        year,
        file_path: objectPath,
        uploaded_by: user.id
      });
      if (insertError) {
        await supabase.storage.from("academic-docs").remove([objectPath]);
        throw insertError;
      }

      setNotice("Document uploaded and stored successfully.");
      setTitle("");
      setAbstract("");
      setAuthor("");
      setSupervisor("");
      setDepartment("");
      setLevel("undergraduate");
      setYear(2025);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel scholar-panel">
      <h2>Admin Ingestion</h2>
      <p className="muted">Upload and register academic documents directly from the frontend.</p>

      <form className="stack" onSubmit={onSubmit}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>

        <label>
          Abstract
          <textarea value={abstract} onChange={(e) => setAbstract(e.target.value)} rows={4} required />
        </label>

        <label>
          Author
          <input value={author} onChange={(e) => setAuthor(e.target.value)} required />
        </label>

        <label>
          Supervisor
          <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} required />
        </label>

        <label>
          Department
          <input value={department} onChange={(e) => setDepartment(e.target.value)} required />
        </label>

        <div className="admin-grid">
          <label>
            Level
            <select value={level} onChange={(e) => setLevel(e.target.value as "undergraduate" | "postgrad")}>
              <option value="undergraduate">Undergraduate</option>
              <option value="postgrad">Postgrad</option>
            </select>
          </label>

          <label>
            Year
            <input type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
        </div>

        <label>
          File (PDF/TXT)
          <input
            type="file"
            accept=".pdf,.txt,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Uploading..." : "Upload Document"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="auth-note">{notice}</p> : null}
    </section>
  );
}
