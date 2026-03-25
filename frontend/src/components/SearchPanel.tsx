import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { PreviewModal } from "@/components/PreviewModal";
import { DocumentRecord, SearchFilters, SearchResponse, SearchSortBy, SearchSortOrder } from "@/types/domain";
import { DocumentCard } from "./DocumentCard";

type Props = {
  onDownloadDocument: (doc: DocumentRecord) => void;
  onToggleSaveDocument: (doc: DocumentRecord) => void;
  isDocumentSaved: (documentId: string) => boolean;
};

const SEARCH_IDEAS = [
  "student performance in higher education",
  "digital transformation in universities",
  "revenue collection and local governance",
  "mobile banking adoption",
  "climate change adaptation",
  "public health service delivery",
  "procurement and accountability",
  "artificial intelligence in education",
  "financial management practices",
  "leadership and organizational performance"
];

export function SearchPanel({ onDownloadDocument, onToggleSaveDocument, isDocumentSaved }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [topK, setTopK] = useState(20);
  const [year, setYear] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [sortBy, setSortBy] = useState<SearchSortBy>("relevance");
  const [sortOrder, setSortOrder] = useState<SearchSortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [customizePageSize, setCustomizePageSize] = useState(false);
  const [semanticResult, setSemanticResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compatibilityNotice, setCompatibilityNotice] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1899 }, (_, i) => String(currentYear - i));
  const effectiveQuery = query.trim();
  const totalPages = semanticResult?.total
    ? Math.max(1, Math.ceil(semanticResult.total / (semanticResult.pageSize ?? pageSize)))
    : 1;

  const liveSuggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    const titleSuggestions = (semanticResult?.semanticResults ?? [])
      .map((doc) => doc.title)
      .filter(Boolean)
      .filter((title, index, arr) => arr.indexOf(title) === index);

    const pool = [...SEARCH_IDEAS, ...titleSuggestions];
    const ranked = pool
      .filter((item, index, arr) => arr.indexOf(item) === index)
      .map((item) => {
        const lower = item.toLowerCase();
        const score = !term
          ? SEARCH_IDEAS.indexOf(item)
          : lower.startsWith(term)
            ? 0
            : lower.includes(term)
              ? 1
              : 2;
        return { item, score };
      })
      .filter(({ item, score }) => !term || score < 2 || item.toLowerCase().split(" ").some((part) => part.startsWith(term)));

    return ranked
      .sort((left, right) => left.score - right.score || left.item.localeCompare(right.item))
      .map(({ item }) => item)
      .slice(0, 6);
  }, [query, semanticResult]);

  function resetControls() {
    setTopK(20);
    setYear("");
    setLevel("");
    setSortBy("relevance");
    setSortOrder("desc");
    setPageSize(10);
    setCustomizePageSize(false);
    setPage(1);
  }

  function normalizeSearchResponse(
    res: SearchResponse,
    requestedPage: number,
    requestedPageSize: number,
    topKLimit: number
  ): { normalized: SearchResponse; compatibilityMode: boolean } {
    const hasFullPaginationMeta =
      typeof res.total === "number" && typeof res.page === "number" && typeof res.pageSize === "number";
    if (hasFullPaginationMeta) {
      return { normalized: res, compatibilityMode: false };
    }

    const safePage = Math.max(1, requestedPage);
    const safePageSize = Math.max(1, requestedPageSize);
    const baseResults = res.semanticResults.slice(0, topKLimit);
    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const pagedSemantic = baseResults.slice(start, end);

    const kwBase = (res.keywordResults ?? []).slice(0, topKLimit);
    const pagedKeyword = kwBase.length ? kwBase.slice(start, end) : undefined;

    return {
      compatibilityMode: true,
      normalized: {
        ...res,
        semanticResults: pagedSemantic,
        keywordResults: pagedKeyword,
        total: baseResults.length,
        page: safePage,
        pageSize: safePageSize
      }
    };
  }

  async function runSearch(nextPage = 1, nextQuery?: string) {
    const submittedQuery = (nextQuery ?? query).trim();
    setLoading(true);
    setError(null);
    try {
      const filters: SearchFilters = {
        ...(year ? { year: Number(year) } : {}),
        ...(level ? { level: level as "undergraduate" | "postgrad" } : {})
      };
      const payload = { query: submittedQuery, topK, filters, sortBy, sortOrder, page: nextPage, pageSize };
      const semantic = await api.semanticSearch(payload);
      const semanticNorm = normalizeSearchResponse(semantic, nextPage, pageSize, topK);
      setSemanticResult(semanticNorm.normalized);
      setCompatibilityNotice(
        semanticNorm.compatibilityMode
          ? "Backend pagination metadata not returned; using compatibility paging on current results."
          : null
      );
      setPage(nextPage);
      setShowSuggestions(false);
      
      if (submittedQuery) {
        setRecentSearches(prev => {
          const next = [submittedQuery, ...prev.filter(q => q.toLowerCase() !== submittedQuery.toLowerCase())].slice(0, 5);
          window.setTimeout(() => {
            try { localStorage.setItem("recentAcademicSearches", JSON.stringify(next)); } catch {}
          }, 0);
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion(suggestion: string) {
    setQuery(suggestion);
    void runSearch(1, suggestion);
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem("recentAcademicSearches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    void runSearch(1);
  }, [topK, sortBy, sortOrder, pageSize, year, level]);

  return (
    <section className="panel scholar-panel search-panel">
      <div className="search-hero">
        <div>
          <h2>Search Literature</h2>
          <p className="search-intro">Explore academic work with focused search experience.</p>
        </div>
        <div className="search-hero-note">Search across university documents</div>
      </div>

      <div className="search-toolbar">
        <div className="scholar-search-row">
          <div className="search-query-shell">
            <input
              className="scholar-query-input search-query-with-icon"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) void runSearch(1);
                if (e.key === "Escape") setShowSuggestions(false);
              }}
              placeholder="Search across university documents"
            />
            <button
              type="button"
              className="search-inline-action"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void runSearch(1)}
              disabled={loading}
              aria-label={loading ? "Searching" : "Search"}
              title={loading ? "Searching" : "Search"}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="search-inline-icon">
                <circle cx="11" cy="11" r="6" />
                <path d="M20 20l-4.2-4.2" />
              </svg>
            </button>
            {showSuggestions && liveSuggestions.length > 0 ? (
              <div className="search-suggestions-panel" role="listbox" aria-label="Search ideas">
                <div className="search-suggestions-header">Try searching for</div>
                <div className="search-suggestions-list">
                  {liveSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="search-suggestion-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySuggestion(suggestion)}
                    >
                      <span className="search-suggestion-icon" aria-hidden="true">/</span>
                      <span>{suggestion}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            
            {recentSearches.length > 0 ? (
              <div className="recent-searches-row" style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted-color, #868e96)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent:</span>
                {recentSearches.map(term => (
                  <button 
                    key={term} 
                    type="button"
                    onClick={() => applySuggestion(term)} 
                    style={{ background: 'transparent', border: '1px solid var(--border-color, #dee2e6)', borderRadius: '16px', padding: '2px 10px', fontSize: '12px', color: 'var(--primary-color, #1a73e8)', cursor: 'pointer', transition: 'all 0.15s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-color, #f8f9fa)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {term}
                  </button>
                ))}
              </div>
            ) : null}
            
          </div>
        </div>

        <div className="search-controls-card">
          <div className="search-filter-grid search-filter-grid-primary">
            <label className="search-field">
              <span>Filter by year</span>
              <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
                <option value="">All years</option>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="search-field">
              <span>Level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
                <option value="">All levels</option>
                <option value="undergraduate">Undergraduate</option>
                <option value="postgrad">Postgraduate</option>
              </select>
            </label>
            <label className="search-field">
              <span>Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SearchSortBy)}>
                <option value="relevance">Relevance</option>
                <option value="year">Year</option>
                <option value="title">Title</option>
              </select>
            </label>
          </div>

          <details className="search-advanced-panel">
            <summary>Advanced options</summary>
            <div className="search-filter-grid search-filter-grid-advanced">
              <label className="search-field">
                <span>Retrieve</span>
                <input
                  type="number"
                  min={5}
                  max={200}
                  step={5}
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  aria-label="Retrieval cap"
                />
              </label>
              <label className="search-field">
                <span>Order</span>
                <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SearchSortOrder)}>
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </label>
              <label className="search-field search-checkbox-field">
                <span>Customize page size</span>
                <div className="search-checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={customizePageSize}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCustomizePageSize(checked);
                      if (!checked) setPageSize(10);
                    }}
                  />
                  <span>Choose your own results-per-page value</span>
                </div>
              </label>
              {customizePageSize ? (
                <label className="search-field">
                  <span>Results per page</span>
                  <select value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
                    <option value="5">5</option>
                    <option value="10">10</option>
                    <option value="20">20</option>
                  </select>
                </label>
              ) : null}
            </div>
          </details>


          <div className="search-toolbar-footer" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="search-secondary-action" onClick={resetControls} disabled={loading}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {compatibilityNotice ? <p className="muted">{compatibilityNotice}</p> : null}
      {loading ? (
        <div className="loading-state-card" aria-live="polite">
          <strong>Searching the index...</strong>
          <p>Finding the most relevant academic documents for your query.</p>
        </div>
      ) : null}

      {semanticResult ? (
        <div className="stack">
          <div className="result-summary result-summary-card">
            <span>{semanticResult.total ?? semanticResult.semanticResults.length} results</span>
            <span>Page {semanticResult.page ?? page}</span>
            <span>Semantic latency: {semanticResult.latencyMs?.semantic ?? "N/A"} ms</span>
          </div>

          <h3 className="results-heading">Results</h3>
          <div className="results-list">
            {semanticResult.semanticResults.length === 0 ? (
              <div className="empty-state search-empty-state">
                <strong>No results found.</strong>
                <p>Try a broader topic, a different keyword, or clear the year filter.</p>
              </div>
            ) : (
              semanticResult.semanticResults.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onFindSimilar={() =>
                    navigate(
                      `/related-works?documentId=${encodeURIComponent(doc.id)}&title=${encodeURIComponent(doc.title)}`
                    )
                  }
                  onDownload={onDownloadDocument}
                  onPreview={setPreviewDoc}
                  onToggleSave={onToggleSaveDocument}
                  isSaved={isDocumentSaved(doc.id)}
                />
              ))
            )}
          </div>

          <div className="pager-row pager-row-card">
            <button type="button" onClick={() => void runSearch(Math.max(1, page - 1))} disabled={loading || page <= 1}>
              Previous
            </button>
            <span>
              Page {page}
              {semanticResult.total ? ` of ${totalPages}` : ""}
            </span>
            <button
              type="button"
              onClick={() => void runSearch(page + 1)}
              disabled={loading || (Boolean(semanticResult.total) && page >= totalPages)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      <PreviewModal doc={previewDoc} query={effectiveQuery} open={Boolean(previewDoc)} onClose={() => setPreviewDoc(null)} />
    </section>
  );
}
