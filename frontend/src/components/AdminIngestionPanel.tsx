import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { api } from "@/api/client";

type Props = {
  isAdmin: boolean;
  onUploadSuccess?: () => void;
};

type DocumentMetadata = {
  supervisor: string;
  level: string;
  department: string;
};

type UploadedReviewItem = {
  documentId: string;
  fileName: string;
  title: string;
  author: string;
  year: string;
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
};

const DEFAULT_METADATA: DocumentMetadata = {
  supervisor: "",
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
  const [reviewItems, setReviewItems] = useState<UploadedReviewItem[]>([]);

  function normFilename(name: string): string {
    let normalized = name.replace(/[^\w.\-]/g, "_").replace(/\s+/g, "_");
    if (!normalized.toLowerCase().endsWith(".pdf")) normalized = `${normalized}.pdf`;
    return normalized.toLowerCase();
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
    abstract?: string | null;
    documentId?: string;
  }> {
    setProgress(`Uploading ${index} of ${total}: ${file.name}...`);

    let safeName = file.name.replace(/[^\w.\-]/g, "_").replace(/\s+/g, "_");
    if (!safeName.toLowerCase().endsWith(".pdf")) safeName = `${safeName}.pdf`;
    const objectPath = `${user.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase!
      .storage.from("academic-docs")
      .upload(objectPath, file, { upsert: false });
    if (uploadError) return { ok: false, name: file.name, error: uploadError.message };

    const manualSupervisor = meta.supervisor.trim();
    const manualDepartment = meta.department.trim();
    const insertYear = new Date().getFullYear();
    const docTitle = file.name.replace(/\.[^.]+$/, "") || file.name;

    setProgress(`Indexing ${index} of ${total}: ${file.name}...`);
    const { data: signed } = await supabase!.storage
      .from("academic-docs")
      .createSignedUrl(objectPath, 3600);
    if (!signed?.signedUrl) {
      await supabase!.storage.from("academic-docs").remove([objectPath]);
      return { ok: false, name: file.name, error: "No signed URL" };
    }

    const job = await api.ingestFromUrl({
      url: signed.signedUrl,
      filename: safeName,
      bucketPath: objectPath
    });

    if (job.status === "duplicate") {
      await supabase!.storage.from("academic-docs").remove([objectPath]);
      return {
        ok: false,
        name: file.name,
        error: job.message ?? "Duplicate document (same content).",
        duplicateContent: true,
        title: job.title ?? null,
        author: job.author ?? null,
        year: job.year ?? null,
        abstract: job.abstract ?? null
      };
    }

    if (job.status !== "completed") {
      await supabase!.storage.from("academic-docs").remove([objectPath]);
      return {
        ok: false,
        name: file.name,
        error: job.message ?? "Indexing failed.",
        title: job.title ?? null,
        author: job.author ?? null,
        year: job.year ?? null,
        abstract: job.abstract ?? null
      };
    }

    const extractedYear = typeof job.year === "number" ? job.year : null;
    const finalTitle = job.title?.trim() || docTitle;
    const finalAuthor = job.author?.trim() || "Unknown";
    const finalYear = extractedYear ?? insertYear;
    const finalAbstract = job.abstract?.trim() || "";

    const { data: insertedDocument, error: insertError } = await supabase!
      .from("documents")
      .insert({
        title: finalTitle,
        abstract: finalAbstract,
        author: finalAuthor,
        supervisor: manualSupervisor || "N/A",
        department: manualDepartment || "N/A",
        level: meta.level === "postgrad" ? "postgrad" : "undergraduate",
        year: finalYear,
        file_path: objectPath,
        uploaded_by: user.id
      })
      .select("id")
      .single();
    if (insertError || !insertedDocument?.id) {
      await supabase!.storage.from("academic-docs").remove([objectPath]);
      throw new Error(`Failed to save document metadata row: ${insertError?.message ?? "Missing document id."}`);
    }

    return {
      ok: true,
      name: file.name,
      documentId: insertedDocument.id,
      title: finalTitle,
      abstract: finalAbstract,
      author: finalAuthor,
      year: finalYear
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setReviewItems([]);

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
      const uploadedReviewItems: UploadedReviewItem[] = [];

      for (let i = 0; i < toUploadNew.length; i++) {
        const result = await uploadOneFull(toUploadNew[i], user, i + 1, toUploadNew.length, metadata);
        if (result.ok) {
          okCount++;
          if (result.documentId) {
            uploadedReviewItems.push({
              documentId: result.documentId,
              fileName: result.name,
              title: result.title ?? "",
              author: result.author ?? "",
              year: result.year ? String(result.year) : "",
              saved: false,
              error: null
            });
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
      setReviewItems(uploadedReviewItems);

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
        setReviewItems([]);
      }
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "Failed to upload document(s).");
    } finally {
      setLoading(false);
    }
  }

  async function saveReviewItem(documentId: string) {
    const target = reviewItems.find((item) => item.documentId === documentId);
    if (!target || !supabase) return;

    const parsedYear = target.year.trim() ? parseInt(target.year.trim(), 10) : null;
    const finalYear = parsedYear !== null && !Number.isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= 2100
      ? parsedYear
      : null;

    setReviewItems((items) =>
      items.map((item) =>
        item.documentId === documentId
          ? { ...item, saving: true, saved: false, error: null }
          : item
      )
    );

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        title: target.title.trim() || target.fileName.replace(/\.[^.]+$/, ""),
        author: target.author.trim() || "Unknown",
        year: finalYear ?? new Date().getFullYear()
      })
      .eq("id", documentId);

    setReviewItems((items) =>
      items.map((item) => {
        if (item.documentId !== documentId) return item;
        if (updateError) {
          return {
            ...item,
            saving: false,
            saved: false,
            error: updateError.message
          };
        }
        return {
          ...item,
          saving: false,
          saved: true,
          error: null,
          year: finalYear ? String(finalYear) : item.year
        };
      })
    );
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

        {reviewItems.length > 0 ? (
          <div className="ingestion-review-panel">
            <div className="ingestion-review-header">
              <div>
                <strong>Review extracted metadata</strong>
                <p className="muted">Check the extracted title, author, and year before using them in search and citation.</p>
              </div>
            </div>
            <div className="ingestion-review-list">
              {reviewItems.map((item) => (
                <article key={item.documentId} className="ingestion-review-card">
                  <div className="ingestion-review-card-top">
                    <strong>{item.fileName}</strong>
                    {item.saved ? <span className="ingestion-review-badge">Saved</span> : null}
                  </div>
                  <div className="ingestion-review-grid">
                    <label className="metadata-full">
                      Title
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) =>
                          setReviewItems((items) =>
                            items.map((current) =>
                              current.documentId === item.documentId
                                ? { ...current, title: e.target.value, saved: false, error: null }
                                : current
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      Author
                      <input
                        type="text"
                        value={item.author}
                        onChange={(e) =>
                          setReviewItems((items) =>
                            items.map((current) =>
                              current.documentId === item.documentId
                                ? { ...current, author: e.target.value, saved: false, error: null }
                                : current
                            )
                          )
                        }
                      />
                    </label>
                    <label>
                      Year
                      <input
                        type="number"
                        min={1900}
                        max={2100}
                        value={item.year}
                        onChange={(e) =>
                          setReviewItems((items) =>
                            items.map((current) =>
                              current.documentId === item.documentId
                                ? { ...current, year: e.target.value, saved: false, error: null }
                                : current
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="ingestion-review-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => saveReviewItem(item.documentId)}
                      disabled={item.saving}
                    >
                      {item.saving ? "Saving..." : item.saved ? "Saved" : "Save metadata"}
                    </button>
                    {item.error ? <span className="error">{item.error}</span> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <fieldset className="metadata-fieldset">
          <legend>Academic details (optional)</legend>
          <p className="muted">Use this for metadata the PDF usually cannot extract well. Title, author, and year can be reviewed after upload.</p>
          <div className="metadata-grid">
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






