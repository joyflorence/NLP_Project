import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { api } from "@/api/client";

type Props = {
  isAdmin: boolean;
  onUploadSuccess?: () => void;
};

type DocumentMetadata = {
  title: string;
  author: string;
  supervisor: string;
  year: string;
  level: string;
  department: string;
};

const DEFAULT_METADATA: DocumentMetadata = {
  title: "",
  author: "",
  supervisor: "",
  year: "",
  level: "undergraduate",
  department: ""
};

export function AdminIngestionPanel({ isAdmin, onUploadSuccess }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<DocumentMetadata>(DEFAULT_METADATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [detectedMeta, setDetectedMeta] = useState<{ title?: string | null; author?: string | null; year?: number | null } | null>(null);

  function normFilename(name: string): string {
    return name.replace(/\s+/g, "_").toLowerCase();
  }

  if (!isAdmin) {
    return (
      <section className="panel scholar-panel">
        <h2>Admin Ingestion</h2>
        <p className="muted">Ingestion is restricted to admin accounts.</p>
      </section>
    );
  }

  async function uploadOneFull(
    file: File,
    user: { id: string },
    index: number,
    total: number,
    meta: DocumentMetadata
  ): Promise<{
    ok: boolean;
    name: string;
    error?: string;
    duplicateContent?: boolean;
    title?: string | null;
    author?: string | null;
    year?: number | null;
  }> {
    setProgress(`Uploading ${index} of ${total}: ${file.name}...`);

    let safeName = file.name.replace(/[^\w.\-]/g, "_").replace(/\s+/g, "_");
    if (!safeName.toLowerCase().endsWith(".pdf")) safeName = `${safeName}.pdf`;
    const objectPath = `${user.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase!
      .storage.from("academic-docs")
      .upload(objectPath, file, { upsert: false });
    if (uploadError) return { ok: false, name: file.name, error: uploadError.message };

    const parsedYear = meta.year.trim() ? parseInt(meta.year.trim(), 10) : null;
    const extractedYearFallback = new Date().getFullYear();
    const safeYear = parsedYear !== null && !Number.isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100
      ? parsedYear
      : extractedYearFallback;

    const manualTitle = meta.title.trim();
    const manualAuthor = meta.author.trim();
    const manualSupervisor = meta.supervisor.trim();
    const manualDepartment = meta.department.trim();
    const docTitle = manualTitle || file.name.replace(/\.[^.]+$/, "") || file.name;

    const { error: insertError } = await supabase!.from("documents").insert({
      title: docTitle,
      abstract: "",
      author: manualAuthor || "Unknown",
      supervisor: manualSupervisor || "N/A",
      department: manualDepartment || "N/A",
      level: meta.level === "postgrad" ? "postgrad" : "undergraduate",
      year: safeYear,
      file_path: objectPath,
      uploaded_by: user.id
    });
    if (insertError) {
      throw new Error(`Failed to save document metadata row: ${insertError.message}`);
    }

    setProgress(`Indexing ${index} of ${total}: ${file.name}...`);
    const { data: signed } = await supabase!.storage
      .from("academic-docs")
      .createSignedUrl(objectPath, 3600);
    if (!signed?.signedUrl) return { ok: false, name: file.name, error: "No signed URL" };

    const job = await api.ingestFromUrl({
      url: signed.signedUrl,
      filename: safeName,
      bucketPath: objectPath
    });

    if (job.status === "duplicate") {
      return {
        ok: false,
        name: file.name,
        error: job.message ?? "Duplicate document (same content).",
        duplicateContent: true,
        title: job.title ?? null,
        author: job.author ?? null,
        year: job.year ?? null
      };
    }

    if (job.status !== "completed") {
      return {
        ok: false,
        name: file.name,
        error: job.message ?? "Indexing failed.",
        title: job.title ?? null,
        author: job.author ?? null,
        year: job.year ?? null
      };
    }

    const extractedYear = typeof job.year === "number" ? job.year : null;
    const finalTitle = manualTitle || job.title?.trim() || docTitle;
    const finalAuthor = manualAuthor || job.author?.trim() || "Unknown";
    const finalYear = safeYear ?? extractedYear;

    const { error: updateError } = await supabase!
      .from("documents")
      .update({
        title: finalTitle,
        author: finalAuthor,
        year: finalYear
      })
      .eq("file_path", objectPath)
      .eq("uploaded_by", user.id);
    if (updateError) {
      throw new Error(`Indexed document, but failed to sync extracted metadata: ${updateError.message}`);
    }

    return {
      ok: true,
      name: file.name,
      title: finalTitle,
      author: finalAuthor,
      year: finalYear
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setDetectedMeta(null);

    if (!isSupabaseConfigured || !supabase) {
      setError("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }

    const toUpload = files.filter((f) => f && f.size > 0);
    if (toUpload.length === 0) {
      setError("Please select one or more document files.");
      return;
    }

    setLoading(true);
    try {
      setProgress("Checking for duplicates...");
      const { documents: indexed } = await api.getIndexedDocuments();
      const existingNorm = new Set((indexed ?? []).map((d) => normFilename(d.filename)));

      const duplicates: File[] = [];
      const toUploadNew: File[] = [];
      for (const f of toUpload) {
        if (existingNorm.has(normFilename(f.name))) {
          duplicates.push(f);
        } else {
          toUploadNew.push(f);
        }
      }

      if (toUploadNew.length === 0) {
        setProgress(null);
        setNotice(null);
        setError(
          duplicates.length === 1
            ? `Document already uploaded: ${duplicates[0].name}`
            : `All selected documents are already uploaded: ${duplicates.map((f) => f.name).join(", ")}`
        );
        setLoading(false);
        return;
      }

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("No authenticated user found.");

      let okCount = 0;
      const errors: string[] = [];
      const contentDuplicates: string[] = [];
      let lastMeta: { title?: string | null; author?: string | null; year?: number | null } | null = null;

      for (let i = 0; i < toUploadNew.length; i++) {
        const result = await uploadOneFull(toUploadNew[i], user, i + 1, toUploadNew.length, metadata);
        if (result.ok) {
          okCount++;
          if (result.title || result.author || result.year) {
            lastMeta = {
              title: result.title ?? null,
              author: result.author ?? null,
              year: result.year ?? null
            };
          }
        } else if (result.duplicateContent) {
          contentDuplicates.push(result.name);
        } else {
          errors.push(`${result.name}: ${result.error ?? "failed"}`);
        }
      }

      setMetadata({ ...DEFAULT_METADATA });
      setProgress(null);
      setFiles([]);
      setDetectedMeta(lastMeta);

      const skipParts: string[] = [];
      if (duplicates.length > 0) {
        skipParts.push(`Skipped (already uploaded by filename): ${duplicates.map((f) => f.name).join(", ")}`);
      }
      if (contentDuplicates.length > 0) {
        skipParts.push(`Skipped (already uploaded - same content): ${contentDuplicates.join(", ")}`);
      }
      const skipMsg = skipParts.length > 0 ? ` ${skipParts.join(" ")}` : "";

      const attemptedCount = toUploadNew.length;
      const effectiveTotal = attemptedCount - contentDuplicates.length;

      if (okCount === effectiveTotal && errors.length === 0) {
        setNotice(
          toUploadNew.length === 1
            ? `Document uploaded and indexed for search.${skipMsg}`
            : `${okCount} document(s) uploaded and indexed.${skipMsg}`
        );
        onUploadSuccess?.();
      } else if (okCount > 0 || contentDuplicates.length > 0) {
        const base = effectiveTotal > 0 ? `${okCount} of ${effectiveTotal} uploaded.` : "";
        const errorPart = errors.length > 0 ? ` ${errors.join("; ")}.` : "";
        setNotice(`${base}${errorPart}${skipMsg}`);
        onUploadSuccess?.();
      } else {
        setError(errors.join("; ") || "Upload failed.");
        setDetectedMeta(null);
      }
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "Failed to upload document(s).");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel scholar-panel">
      <h2>Admin Ingestion</h2>
      <p className="muted">
        Upload one or more documents (PDF recommended). They will be stored and indexed for search.
      </p>

      <form className="stack" onSubmit={onSubmit}>
        <label>
          Documents
          <input
            type="file"
            accept=".pdf,.txt,.doc,.docx"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>

        {files.length > 0 ? (
          <p className="muted">
            {files.length} file{files.length === 1 ? "" : "s"} selected.
          </p>
        ) : null}

        {detectedMeta && (detectedMeta.title || detectedMeta.author || detectedMeta.year) ? (
          <div className="note">
            <strong>Detected from document:</strong>{" "}
            {detectedMeta.title ? `"${detectedMeta.title}"` : "Title unavailable"}
            {detectedMeta.author ? ` by ${detectedMeta.author}` : ""}
            {detectedMeta.year ? ` (${detectedMeta.year})` : ""}
          </div>
        ) : null}

        <fieldset className="metadata-fieldset">
          <legend>Document metadata (optional)</legend>
          <p className="muted">Applied to all files in this upload. Leave blank to use extracted metadata where available.</p>
          <div className="metadata-grid">
            <label className="metadata-full">
              Title
              <input
                type="text"
                value={metadata.title}
                onChange={(e) => setMetadata((m) => ({ ...m, title: e.target.value }))}
                placeholder="e.g. Fundamentals of Web Design"
              />
            </label>
            <label>
              Author
              <input
                type="text"
                value={metadata.author}
                onChange={(e) => setMetadata((m) => ({ ...m, author: e.target.value }))}
                placeholder="e.g. J. Smith"
              />
            </label>
            <label>
              Supervisor
              <input
                type="text"
                value={metadata.supervisor}
                onChange={(e) => setMetadata((m) => ({ ...m, supervisor: e.target.value }))}
                placeholder="e.g. Dr. A. Jones"
              />
            </label>
            <label>
              Year
              <input
                type="number"
                min={1900}
                max={2100}
                value={metadata.year}
                onChange={(e) => setMetadata((m) => ({ ...m, year: e.target.value }))}
                placeholder={String(new Date().getFullYear())}
              />
            </label>
            <label>
              Level
              <select
                value={metadata.level}
                onChange={(e) => setMetadata((m) => ({ ...m, level: e.target.value }))}
              >
                <option value="undergraduate">Undergraduate</option>
                <option value="postgrad">Postgraduate</option>
              </select>
            </label>
            <label className="metadata-full">
              Department
              <input
                type="text"
                value={metadata.department}
                onChange={(e) => setMetadata((m) => ({ ...m, department: e.target.value }))}
                placeholder="e.g. Computer Science"
              />
            </label>
          </div>
        </fieldset>

        <button type="submit" disabled={loading || files.length === 0}>
          {loading ? (progress ?? "Uploading...") : "Upload"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
      {notice ? (
        <div className="ingestion-feedback success">
          <p className="auth-note">{notice}</p>
          <Link to="/search" className="ingestion-search-link">
            Search documents
          </Link>
        </div>
      ) : null}
      {loading && progress ? (
        <div className="ingestion-feedback loading" aria-live="polite">
          <p className="ingestion-progress">{progress}</p>
        </div>
      ) : null}
    </section>
  );
}



