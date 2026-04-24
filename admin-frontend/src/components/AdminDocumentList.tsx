import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { AdminDocument, AdminDocumentUpdateRequest } from "../types/domain";

type Props = {
  refreshKey?: number;
  onCacheReset?: () => void;
};

type SortKey = "title" | "author" | "year" | "department" | "indexed" | "created_at" | "uploaded_by";
type SortDirection = "asc" | "desc";

const EMPTY_EDIT: AdminDocumentUpdateRequest = {
  title: "",
  author: "",
  supervisor: "",
  year: undefined,
  level: "undergraduate",
  department: "",
  abstract: ""
};

function formatDate(value?: string | null) {
  if (!value) return "Recently added";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function compareNullableString(a?: string | null, b?: string | null) {
  return (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
}

function compareNullableNumber(a?: number | null, b?: number | null) {
  return (a ?? Number.NEGATIVE_INFINITY) - (b ?? Number.NEGATIVE_INFINITY);
}

function getUploaderLabel(doc: AdminDocument) {
  return doc.uploaded_by_display || doc.uploaded_by_name || doc.uploaded_by_email || doc.uploaded_by || "-";
}

function getUploaderSecondary(doc: AdminDocument) {
  const primary = getUploaderLabel(doc);
  const parts = [doc.uploaded_by_email, doc.uploaded_by, doc.uploaded_by_name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim());
  const secondary = parts.find((value) => value !== primary);
  return secondary || null;
}

export function AdminDocumentList({ refreshKey = 0, onCacheReset }: Props) {
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AdminDocumentUpdateRequest>(EMPTY_EDIT);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  async function loadDocuments(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    const res = await api.getAdminDocuments();
    setDocuments((res.documents ?? []).filter((doc) => !deletedIds.includes(doc.id)));
    if (!silent) {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getAdminDocuments()
      .then((res) => {
        if (!cancelled) setDocuments(res.documents ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load documents.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, deletedIds]);

  const indexedCount = useMemo(() => documents.filter((doc) => doc.indexed).length, [documents]);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const query = searchQuery.toLowerCase().trim();
    return documents.filter((doc) => {
      return (
        (doc.title?.toLowerCase().includes(query) || false) ||
        (doc.author?.toLowerCase().includes(query) || false) ||
        (doc.department?.toLowerCase().includes(query) || false) ||
        (doc.supervisor?.toLowerCase().includes(query) || false) ||
        (doc.file_path?.toLowerCase().includes(query) || false) ||
        (getUploaderLabel(doc).toLowerCase().includes(query) || false) ||
        (getUploaderSecondary(doc)?.toLowerCase().includes(query) || false)
      );
    });
  }, [documents, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortKey, sortDirection]);

  const sortedDocuments = useMemo(() => {
    const sorted = [...filteredDocuments];
    sorted.sort((left, right) => {
      let result = 0;
      switch (sortKey) {
        case "title":
          result = compareNullableString(left.title, right.title);
          break;
        case "author":
          result = compareNullableString(left.author, right.author);
          break;
        case "year":
          result = compareNullableNumber(left.year, right.year);
          break;
        case "department":
          result = compareNullableString(left.department, right.department);
          break;
        case "indexed":
          result = Number(left.indexed) - Number(right.indexed);
          break;
        case "created_at":
          result = compareNullableString(left.created_at, right.created_at);
          break;
        case "uploaded_by":
          result = compareNullableString(getUploaderLabel(left), getUploaderLabel(right));
          break;
        default:
          result = 0;
      }

      if (result === 0) {
        result = compareNullableString(left.title, right.title);
      }

      return sortDirection === "asc" ? result : -result;
    });
    return sorted;
  }, [filteredDocuments, sortDirection, sortKey]);

  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage);
  const paginatedDocuments = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedDocuments.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedDocuments, currentPage, itemsPerPage]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "title" || nextKey === "author" || nextKey === "department" ? "asc" : "desc");
  }

  async function handleResetCache() {
    const confirmed = window.confirm(
      "Clear the local search cache and indexed-document registry? Deleted bucket files will disappear from the UI, and the backend will need to re-ingest current bucket documents."
    );
    if (!confirmed) return;

    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.resetIndexCache();
      setNotice(result.message ?? "Local search cache cleared.");
      onCacheReset?.();
      await loadDocuments({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear local cache.");
    } finally {
      setResetting(false);
    }
  }

  function startEdit(doc: AdminDocument) {
    setEditingId(doc.id);
    setOpenActionsId(null);
    setEditForm({
      title: doc.title || "",
      author: doc.author || "",
      supervisor: doc.supervisor || "",
      year: doc.year ?? undefined,
      level: doc.level === "postgrad" ? "postgrad" : "undergraduate",
      department: doc.department || "",
      abstract: doc.abstract || ""
    });
    setNotice(null);
    setError(null);
  }

  async function saveEdit(documentId: string) {
    setSavingId(documentId);
    setError(null);
    setNotice(null);
    try {
      const payload: AdminDocumentUpdateRequest = {
        ...editForm,
        title: editForm.title?.trim() || undefined,
        author: editForm.author?.trim() || undefined,
        supervisor: editForm.supervisor?.trim() || undefined,
        department: editForm.department?.trim() || undefined,
        abstract: editForm.abstract?.trim() || undefined
      };
      const result = await api.updateAdminDocument(documentId, payload);
      await loadDocuments({ silent: true });
      setEditingId(null);
      setNotice(result.message);
      onCacheReset?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update document.");
    } finally {
      setSavingId(null);
    }
  }

  async function reindexDocument(documentId: string, title: string) {
    setReindexingId(documentId);
    setOpenActionsId(null);
    setError(null);
    setNotice(null);
    try {
      const result = await api.reindexAdminDocument(documentId);
      setNotice(result.message || `Local index refreshed for ${title}.`);
      await loadDocuments({ silent: true });
      onCacheReset?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rebuild the local index for this document.");
    } finally {
      setReindexingId(null);
    }
  }

  async function deleteDocument(documentId: string, title: string) {
    const confirmed = window.confirm(`Delete "${title}" from Supabase storage, metadata, and the local index?`);
    if (!confirmed) return;
    setDeletingId(documentId);
    setOpenActionsId(null);
    setError(null);
    setNotice(null);
    try {
      const result = await api.deleteAdminDocument(documentId);
      setDeletedIds((ids) => (ids.includes(documentId) ? ids : [...ids, documentId]));
      setDocuments((docs) => docs.filter((doc) => doc.id !== documentId));
      setNotice(result.message);
      onCacheReset?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document.");
    } finally {
      setDeletingId(null);
    }
  }

  function renderSortButton(label: string, key: SortKey) {
    const active = sortKey === key;
    const indicator = active ? (sortDirection === "asc" ? "^" : "v") : "";
    return (
      <button
        type="button"
        className={active ? "admin-table-sort is-active" : "admin-table-sort"}
        onClick={() => toggleSort(key)}
      >
        <span>{label}</span>
        <span className="admin-table-sort-indicator" aria-hidden="true">{indicator}</span>
      </button>
    );
  }

  if (loading) {
    return (
      <section className="panel scholar-panel">
        <h2>Documents</h2>
        <div className="loading-state-card compact-loading-state"><strong>Loading document inventory...</strong><p>Preparing the current metadata and index view.</p></div>
      </section>
    );
  }

  if (error && documents.length === 0) {
    return (
      <section className="panel scholar-panel">
        <h2>Documents</h2>
        <p className="error">{error}</p>
      </section>
    );
  }

  return (
    <section className="panel scholar-panel">
      <div className="admin-list-header">
        <div>
          <h2>Documents</h2>
          <p className="muted">{documents.length} document(s) in Supabase, {indexedCount} currently present in the local search index.</p>
        </div>
        <button type="button" className="admin-reset-button" onClick={handleResetCache} disabled={resetting}>
          {resetting ? "Rebuilding..." : "Rebuild local index"}
        </button>
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Search by title, author, department, supervisor, or filename..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            border: "1px solid #d4deea",
            borderRadius: "12px",
            fontSize: "0.95rem",
            backgroundColor: "#fbfdff"
          }}
        />
      </div>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="muted">{notice}</p> : null}
      {documents.length === 0 ? (
        <div className="empty-state admin-empty-state"><strong>No documents found.</strong><p>Upload documents and their metadata will appear here for management.</p></div>
      ) : (
        <div className="admin-document-table-shell">
          <div className="admin-document-table-scroll">
            <table className="admin-document-table">
              <thead>
                <tr>
                  <th>{renderSortButton("Document", "title")}</th>
                  <th>{renderSortButton("Author", "author")}</th>
                  <th>{renderSortButton("Year", "year")}</th>
                  <th>{renderSortButton("Department", "department")}</th>
                  <th>{renderSortButton("Uploaded By", "uploaded_by")}</th>
                  <th>{renderSortButton("Status", "indexed")}</th>
                  <th>{renderSortButton("Added", "created_at")}</th>
                  <th className="admin-document-actions-head">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDocuments.map((doc) => {
                  const isEditing = editingId === doc.id;
                  const isReindexing = reindexingId === doc.id;
                  const actionsOpen = openActionsId === doc.id;
                  return (
                    <Fragment key={doc.id}>
                      <tr className={isEditing ? "admin-document-row is-editing" : "admin-document-row"}>
                        <td>
                          <div className="admin-document-cell-main admin-document-cell-title-only">
                            <strong>{doc.title}</strong>
                          </div>
                        </td>
                        <td>{doc.author || "Unknown author"}</td>
                        <td>{doc.year || "-"}</td>
                        <td>{doc.department || "-"}</td>
                        <td>
                          <div className="admin-document-cell-main admin-document-uploaded-by">
                            <strong>{getUploaderLabel(doc)}</strong>
                            {getUploaderSecondary(doc) ? (
                              <span className="admin-document-fileline">{getUploaderSecondary(doc)}</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className={doc.indexed ? "job-status job-status-success" : "job-status"}>{doc.indexed ? "Indexed" : "Pending"}</span>
                        </td>
                        <td>{formatDate(doc.created_at)}</td>
                        <td className="admin-row-menu-cell">
                          <button
                            type="button"
                            className={actionsOpen ? "admin-row-menu-toggle is-open" : "admin-row-menu-toggle"}
                            onClick={() => setOpenActionsId((current) => (current === doc.id ? null : doc.id))}
                            disabled={isReindexing || deletingId === doc.id}
                          >
                            {actionsOpen ? "Close" : "Manage"}
                          </button>
                        </td>
                      </tr>
                      {actionsOpen ? (
                        <tr className="admin-document-actions-row">
                          <td colSpan={7}>
                            <div className="admin-row-menu admin-row-menu-inline">
                              <button
                                type="button"
                                className={doc.indexed ? "admin-row-menu-action" : "admin-row-menu-action is-primary"}
                                onClick={() => reindexDocument(doc.id, doc.title)}
                                disabled={isReindexing}
                              >
                                {isReindexing ? (doc.indexed ? "Reindexing locally..." : "Indexing locally...") : doc.indexed ? "Reindex locally" : "Index locally"}
                              </button>
                              <button type="button" className="admin-row-menu-action" onClick={() => (isEditing ? setEditingId(null) : startEdit(doc))}>
                                {isEditing ? "Close editor" : "Edit metadata"}
                              </button>
                              <button type="button" className="admin-row-menu-action is-danger" onClick={() => deleteDocument(doc.id, doc.title)} disabled={deletingId === doc.id}>
                                {deletingId === doc.id ? "Removing..." : "Delete document"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {isEditing ? (
                        <tr className="admin-document-edit-row">
                          <td colSpan={8}>
                            <div className="admin-document-edit-card">
                              <div className="admin-document-actions-label">Editing metadata</div>
                              <div className="admin-edit-grid">
                                <label>
                                  Title
                                  <input value={editForm.title ?? ""} onChange={(e) => setEditForm((form) => ({ ...form, title: e.target.value }))} />
                                </label>
                                <label>
                                  Author
                                  <input value={editForm.author ?? ""} onChange={(e) => setEditForm((form) => ({ ...form, author: e.target.value }))} />
                                </label>
                                <label>
                                  Supervisor
                                  <input value={editForm.supervisor ?? ""} onChange={(e) => setEditForm((form) => ({ ...form, supervisor: e.target.value }))} />
                                </label>
                                <label>
                                  Year
                                  <input type="number" min={1900} max={2100} value={editForm.year ?? ""} onChange={(e) => setEditForm((form) => ({ ...form, year: e.target.value ? Number(e.target.value) : undefined }))} />
                                </label>
                                <label>
                                  Level
                                  <select value={editForm.level ?? "undergraduate"} onChange={(e) => setEditForm((form) => ({ ...form, level: e.target.value as "undergraduate" | "postgrad" }))}>
                                    <option value="undergraduate">Undergraduate</option>
                                    <option value="postgrad">Postgraduate</option>
                                  </select>
                                </label>
                                <label>
                                  Department
                                  <input value={editForm.department ?? ""} onChange={(e) => setEditForm((form) => ({ ...form, department: e.target.value }))} />
                                </label>
                                <label className="admin-edit-full">
                                  Abstract
                                  <textarea rows={4} value={editForm.abstract ?? ""} onChange={(e) => setEditForm((form) => ({ ...form, abstract: e.target.value }))} />
                                </label>
                              </div>
                              <div className="admin-document-actions admin-document-table-actions">
                                <button type="button" className="admin-action-button admin-action-primary" onClick={() => saveEdit(doc.id)} disabled={savingId === doc.id}>
                                  {savingId === doc.id ? "Saving changes..." : "Save changes"}
                                </button>
                                <button type="button" className="admin-action-button admin-action-secondary" onClick={() => setEditingId(null)}>
                                  Cancel editing
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem" }}>
              <span className="muted">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sortedDocuments.length)} of {sortedDocuments.length} entries
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="admin-action-button admin-action-secondary"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  Previous
                </button>
                <div style={{ padding: "0.4rem 0.8rem", display: "flex", alignItems: "center", backgroundColor: "#f1f5f9", borderRadius: "6px", fontSize: "0.9rem" }}>
                  Page {currentPage} of {totalPages}
                </div>
                <button
                  type="button"
                  className="admin-action-button admin-action-secondary"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}