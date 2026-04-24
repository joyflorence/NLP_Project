import { useMemo, useState, useEffect, type KeyboardEventHandler } from "react";
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

const FEATURED_TOPICS = SEARCH_IDEAS.slice(0, 6);

const DEPARTMENT_SUGGESTIONS = [
  "Computer Science",
  "Information Systems",
  "Software Engineering",
  "Data Science",
  "Business Administration",
  "Accounting",
  "Economics",
  "Education",
  "Public Health",
  "Nursing",
  "Agriculture",
  "Sociology"
];

const LEVEL_OPTIONS = ["undergraduate", "postgrad"];
const SORT_BY_OPTIONS: SearchSortBy[] = ["relevance", "year", "title"];
const SORT_ORDER_OPTIONS: SearchSortOrder[] = ["desc", "asc"];
const PAGE_SIZE_OPTIONS = [5, 10, 20];

type FilterFieldKey = "year" | "level" | "department" | "sortBy" | "sortOrder" | "pageSize";

type SuggestionFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  suggestions: string[];
  activeField: FilterFieldKey | null;
  fieldKey: FilterFieldKey;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  onPick: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

function SuggestionField({
  label,
  value,
  placeholder,
  ariaLabel,
  suggestions,
  activeField,
  fieldKey,
  onFocus,
  onBlur,
  onChange,
  onPick,
  onKeyDown
}: SuggestionFieldProps) {
  const panelOpen = activeField === fieldKey && suggestions.length > 0;

  return (
    <label className="search-field search-suggestion-field">
      <span>{label}</span>
      <div className="search-suggestion-shell">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
        {panelOpen ? (
          <div className="search-suggestion-panel" role="listbox" aria-label={`${label} suggestions`}>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="search-suggestion-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function SearchPanel({ onDownloadDocument, onToggleSaveDocument, isDocumentSaved }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [topK, setTopK] = useState(20);
  const [year, setYear] = useState<string>("");
  const [level, setLevel] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
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
  const [activeFilterField, setActiveFilterField] = useState<FilterFieldKey | null>(null);
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1899 }, (_, i) => String(currentYear - i));
  const effectiveQuery = query.trim();
  const totalPages = semanticResult?.total
    ? Math.max(1, Math.ceil(semanticResult.total / (semanticResult.pageSize ?? pageSize)))
    : 1;

  const activeFilters = useMemo(() => {
    const chips: string[] = [];
    if (year) chips.push(`Year ${year}`);
    if (level) chips.push(level === "postgrad" ? "Postgraduate" : "Undergraduate");
    if (department) chips.push(`Department: ${department}`);
    if (sortBy !== "relevance") chips.push(`Sort: ${sortBy}`);
    if (sortOrder !== "desc") chips.push(`Order: ${sortOrder === "asc" ? "Ascending" : "Descending"}`);
    if (pageSize !== 10) chips.push(`Page size ${pageSize}`);
    if (topK !== 20) chips.push(`Retrieve ${topK}`);
    return chips;
  }, [year, level, department, sortBy, sortOrder, pageSize, topK]);

  const departmentOptions = useMemo(() => {
    const fromResults = (semanticResult?.semanticResults ?? [])
      .map((doc) => doc.department)
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => value.trim());
    return [...DEPARTMENT_SUGGESTIONS, ...fromResults]
      .filter((item, index, arr) => arr.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index)
      .slice(0, 16);
  }, [semanticResult]);

  const suggestMatches = (value: string, options: string[], limit = 6) => {
    const term = value.trim().toLowerCase();
    const ranked = options
      .filter((item, index, arr) => arr.findIndex((value) => value.toLowerCase() === item.toLowerCase()) === index)
      .map((item) => {
        const lower = item.toLowerCase();
        const score = !term
          ? 0
          : lower === term
            ? 0
            : lower.startsWith(term)
              ? 1
              : lower.includes(term)
                ? 2
                : 3;
        return { item, score };
      })
      .filter(({ item, score }) => !term || score < 3 || item.toLowerCase().split(/\s+/).some((part) => part.startsWith(term)));

    return ranked
      .sort((left, right) => left.score - right.score || left.item.localeCompare(right.item))
      .map(({ item }) => item)
      .slice(0, limit);
  };

  const yearSuggestions = useMemo(() => suggestMatches(year, yearOptions.slice(0, 24), 8), [year, yearOptions]);
  const levelSuggestions = useMemo(() => suggestMatches(level, LEVEL_OPTIONS, 2), [level]);
  const departmentSuggestions = useMemo(() => suggestMatches(department, departmentOptions, 8), [department, departmentOptions]);
  const sortBySuggestions = useMemo(() => suggestMatches(sortBy, SORT_BY_OPTIONS, 3), [sortBy]);
  const sortOrderSuggestions = useMemo(() => suggestMatches(sortOrder, SORT_ORDER_OPTIONS, 2), [sortOrder]);
  const pageSizeSuggestions = useMemo(() => suggestMatches(String(pageSize), PAGE_SIZE_OPTIONS.map(String), 3), [pageSize]);

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
    setDepartment("");
    setSortBy("relevance");
    setSortOrder("desc");
    setPageSize(10);
    setCustomizePageSize(false);
    setPage(1);
  }

  function normalizeYearFilter(value: string) {
    const trimmed = value.trim();
    return /^\d{4}$/.test(trimmed) ? trimmed : "";
  }

  function normalizeLevelFilter(value: string) {
    const cleaned = value.trim().toLowerCase();
    return LEVEL_OPTIONS.includes(cleaned as (typeof LEVEL_OPTIONS)[number]) ? cleaned : "";
  }

  function normalizeSortByFilter(value: string) {
    return SORT_BY_OPTIONS.includes(value as SearchSortBy) ? (value as SearchSortBy) : "relevance";
  }

  function normalizeSortOrderFilter(value: string) {
    return SORT_ORDER_OPTIONS.includes(value as SearchSortOrder) ? (value as SearchSortOrder) : "desc";
  }

  function normalizePageSizeFilter(value: string) {
    const numeric = Number(value);
    return PAGE_SIZE_OPTIONS.includes(numeric) ? numeric : 10;
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
      const normalizedYear = normalizeYearFilter(year);
      const normalizedLevel = normalizeLevelFilter(level);
      const normalizedSortBy = normalizeSortByFilter(sortBy);
      const normalizedSortOrder = normalizeSortOrderFilter(sortOrder);
      const filters: SearchFilters = {
        ...(normalizedYear ? { year: Number(normalizedYear) } : {}),
        ...(normalizedLevel ? { level: normalizedLevel as "undergraduate" | "postgrad" } : {}),
        ...(department.trim() ? { department: department.trim() } : {})
      };
      const payload = {
        query: submittedQuery,
        topK,
        filters,
        sortBy: normalizedSortBy,
        sortOrder: normalizedSortOrder,
        page: nextPage,
        pageSize
      };
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
            try { localStorage.setItem("recentAcademicSearches", JSON.stringify(next)); } catch { }
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

  function applyFilterSuggestion(field: FilterFieldKey, suggestion: string) {
    switch (field) {
      case "year":
        setYear(suggestion);
        break;
      case "level":
        setLevel(suggestion);
        break;
      case "department":
        setDepartment(suggestion);
        break;
      case "sortBy":
        setSortBy(normalizeSortByFilter(suggestion));
        break;
      case "sortOrder":
        setSortOrder(normalizeSortOrderFilter(suggestion));
        break;
      case "pageSize":
        setPageSize(normalizePageSizeFilter(suggestion));
        break;
      default:
        break;
    }
    setActiveFilterField(null);
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem("recentAcademicSearches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch { }
  }, []);

  useEffect(() => {
    if (semanticResult !== null) {
      void runSearch(1);
    }
  }, [topK, sortBy, sortOrder, pageSize, year, level, department]);

  return (
    <section className="panel scholar-panel search-panel">
      <div className="search-hero">
        <div className="search-hero-copy">
          <h2>Search</h2>
          <p className="search-intro">Explore academic work with focused search experience.</p>
          <div className="search-hero-meta" aria-hidden="true">
            <span>Semantic ranking</span>
            <span>Year filters</span>
            <span>Saved library</span>
          </div>
        </div>
        <div className="search-hero-note">Search across documents</div>
      </div>

      <div className="search-topic-rail" aria-label="Popular search topics">
        <div className="search-topic-rail-head">
          <strong>Popular research paths</strong>
          <span>Start broad and refine from there.</span>
        </div>
        <div className="search-topic-chips">
          {FEATURED_TOPICS.map((topic) => (
            <button key={topic} type="button" className="search-topic-chip" onClick={() => applySuggestion(topic)}>
              {topic}
            </button>
          ))}
        </div>
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

        <div className="search-controls-card search-controls-sticky">
          <div className="search-filter-grid search-filter-grid-primary">
            <SuggestionField
              label="Filter by year"
              value={year}
              placeholder="All years"
              ariaLabel="Year"
              suggestions={yearSuggestions}
              activeField={activeFilterField}
              fieldKey="year"
              onFocus={() => setActiveFilterField("year")}
              onBlur={() => window.setTimeout(() => setActiveFilterField((current) => (current === "year" ? null : current)), 120)}
              onChange={setYear}
              onPick={(value) => applyFilterSuggestion("year", value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setActiveFilterField(null);
              }}
            />
            <SuggestionField
              label="Level"
              value={level}
              placeholder="All levels"
              ariaLabel="Level"
              suggestions={levelSuggestions}
              activeField={activeFilterField}
              fieldKey="level"
              onFocus={() => setActiveFilterField("level")}
              onBlur={() => window.setTimeout(() => setActiveFilterField((current) => (current === "level" ? null : current)), 120)}
              onChange={setLevel}
              onPick={(value) => applyFilterSuggestion("level", value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setActiveFilterField(null);
              }}
            />
            <SuggestionField
              label="Department"
              value={department}
              placeholder="e.g. Computer Science"
              ariaLabel="Department"
              suggestions={departmentSuggestions}
              activeField={activeFilterField}
              fieldKey="department"
              onFocus={() => setActiveFilterField("department")}
              onBlur={() => window.setTimeout(() => setActiveFilterField((current) => (current === "department" ? null : current)), 120)}
              onChange={setDepartment}
              onPick={(value) => applyFilterSuggestion("department", value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setActiveFilterField(null);
              }}
            />
            <SuggestionField
              label="Sort by"
              value={sortBy}
              placeholder="Relevance"
              ariaLabel="Sort by"
              suggestions={sortBySuggestions}
              activeField={activeFilterField}
              fieldKey="sortBy"
              onFocus={() => setActiveFilterField("sortBy")}
              onBlur={() => window.setTimeout(() => setActiveFilterField((current) => (current === "sortBy" ? null : current)), 120)}
              onChange={(value) => setSortBy(value as SearchSortBy)}
              onPick={(value) => applyFilterSuggestion("sortBy", value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setActiveFilterField(null);
              }}
            />
          </div>

          <details className="search-advanced-panel">
            <summary>Advanced Search</summary>
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
              <SuggestionField
                label="Order"
                value={sortOrder}
                placeholder="Descending"
                ariaLabel="Order"
                suggestions={sortOrderSuggestions}
                activeField={activeFilterField}
                fieldKey="sortOrder"
                onFocus={() => setActiveFilterField("sortOrder")}
                onBlur={() => window.setTimeout(() => setActiveFilterField((current) => (current === "sortOrder" ? null : current)), 120)}
                onChange={(value) => setSortOrder(value as SearchSortOrder)}
                onPick={(value) => applyFilterSuggestion("sortOrder", value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setActiveFilterField(null);
                }}
              />
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
                <SuggestionField
                  label="Results per page"
                  value={String(pageSize)}
                  placeholder="10"
                  ariaLabel="Results per page"
                  suggestions={pageSizeSuggestions}
                  activeField={activeFilterField}
                  fieldKey="pageSize"
                  onFocus={() => setActiveFilterField("pageSize")}
                  onBlur={() => window.setTimeout(() => setActiveFilterField((current) => (current === "pageSize" ? null : current)), 120)}
                  onChange={(value) => setPageSize(normalizePageSizeFilter(value))}
                  onPick={(value) => applyFilterSuggestion("pageSize", value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setActiveFilterField(null);
                  }}
                />
              ) : null}
            </div>
          </details>


          {activeFilters.length > 0 ? (
            <div className="search-active-filters" aria-label="Active filters">
              <div className="search-active-filters-head">
                <strong>Active filters</strong>
                <span>{activeFilters.length} applied</span>
              </div>
              <div className="search-active-filter-chips">
                {activeFilters.map((filter) => (
                  <span key={filter} className="search-active-filter-chip">
                    {filter}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

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

      {!semanticResult && !loading ? (
        <div className="search-explore-card search-browse-card" aria-label="Browse documents">
          <div className="search-browse-copy">
            <p className="search-browse-kicker">Start broad</p>
            <h3>Browse the full collection</h3>
            <p>
              Explore all available university documents first, then narrow down by year, level, sort order, or advanced search.
            </p>
            <div className="search-browse-chips" aria-hidden="true">
              <span>All years</span>
              <span>All levels</span>
              <span>Semantic search</span>
            </div>
          </div>
          <div className="search-browse-actions">
            <button
              type="button"
              onClick={() => {
                setQuery("");
                void runSearch(1, "");
              }}
              className="search-browse-button"
            >
              Browse All Documents
            </button>
            <p className="search-browse-hint">This shows the full index with the default filters cleared.</p>
          </div>
        </div>
      ) : null}

      {semanticResult ? (
        <div className="stack">
          <div className="result-summary result-summary-card search-result-summary">
            <div className="search-result-stat">
              <span className="search-result-label">Results</span>
              <strong>{semanticResult.total ?? semanticResult.semanticResults.length}</strong>
            </div>
            <div className="search-result-stat">
              <span className="search-result-label">Page</span>
              <strong>{semanticResult.page ?? page}</strong>
            </div>
            <div className="search-result-stat">
              <span className="search-result-label">Semantic latency</span>
              <strong>{semanticResult.latencyMs?.semantic ?? "N/A"} ms</strong>
            </div>
          </div>

          <h3 className="results-heading">Results</h3>
          <div className="results-list">
            {semanticResult.semanticResults.length === 0 ? (
              <div className="empty-state search-empty-state search-results-empty">
                <div className="search-empty-state-copy">
                  <strong>No results found.</strong>
                  <p>
                    Try a broader topic, change the year or level, or use a featured research path above to restart with an academic theme.
                  </p>
                </div>
                <div className="search-empty-state-actions">
                  <button type="button" className="search-browse-button" onClick={resetControls} disabled={loading}>
                    Clear Filters
                  </button>
                  <button
                    type="button"
                    className="search-secondary-action"
                    onClick={() => {
                      setQuery("");
                      void runSearch(1, "");
                    }}
                    disabled={loading}
                  >
                    Browse All Documents
                  </button>
                </div>
              </div>
            ) : (
              semanticResult.semanticResults.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  searchQuery={effectiveQuery}
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
