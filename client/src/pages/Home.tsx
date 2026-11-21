import { useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRight, Braces, Check, ChevronDown,
  Clock3, Code2, Copy, FileJson2, FolderOpen, Globe2, History, KeyRound, Layers3,
  Link2, LoaderCircle, LockKeyhole, Play, Plus, Radar, Search, ShieldCheck,
  Square, Table2, Trash2, X,
} from "lucide-react";
import { csvCell } from "@/lib/csv";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Panel = "params" | "headers" | "auth" | "body";
type Tab = "request" | "history" | "collections";
type Pair = { id: string; key: string; value: string; enabled: boolean };
type AuthConfig = { type: "none" | "bearer" | "apiKey"; value: string; name: string; placement: "header" | "query" };
type ApiResponse = { status: number; ok: boolean; contentType: string; body: unknown; rawBody: string; elapsedMs: number; sizeBytes: number; redirectBlocked: boolean };
type Endpoint = { path: string; method: HttpMethod; summary: string; operationId: string; parameters: Array<{ name: string; in: string; required: boolean }> };
type HistoryItem = { id: string; method: HttpMethod; url: string; status: number; elapsedMs: number; createdAt: number };
type SavedCollection = { id: string; name: string; method: HttpMethod; url: string; createdAt: number };

const HISTORY_KEY = "scrapme.history.v1";
const COLLECTIONS_KEY = "scrapme.collections.v1";
const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const methodClass: Record<HttpMethod, string> = { GET: "get", POST: "post", PUT: "put", PATCH: "patch", DELETE: "delete" };
const uid = () => Math.random().toString(36).slice(2, 10);

function readLocal<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function maskUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) if (/token|secret|key|auth|password|credential|session|signature|(^|[_-])sig($|[_-])|code|jwt/i.test(key)) url.searchParams.set(key, "••••••");
    return url.toString();
  } catch { return "URL tersimpan disamarkan"; }
}

function parseDisplayBody(body: unknown, rawBody: string): unknown {
  if (typeof body !== "string") return body;
  try { return JSON.parse(body); } catch { return rawBody; }
}

function rowsFrom(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item) => item !== null && typeof item === "object") as Record<string, unknown>[];
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["data", "results", "items", "records"]) if (Array.isArray(obj[key])) return rowsFrom(obj[key]);
    return [obj];
  }
  return [];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

async function postJson<T>(path: string, value: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(value), signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Request gagal (${response.status}).`);
  return result as T;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("request");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [url, setUrl] = useState("https://jsonplaceholder.typicode.com/posts");
  const [params, setParams] = useState<Pair[]>([]);
  const [headers, setHeaders] = useState<Pair[]>([]);
  const [auth, setAuth] = useState<AuthConfig>({ type: "none", value: "", name: "X-API-Key", placement: "header" });
  const [bodyText, setBodyText] = useState('{\n  "title": "ScrapMe demo",\n  "body": "A sample request body",\n  "userId": 1\n}');
  const [activePanel, setActivePanel] = useState<Panel>("params");
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState("");
  const [apiTitle, setApiTitle] = useState("");
  const [apiVersion, setApiVersion] = useState("");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [search, setSearch] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[] | null>(null);
  const [resultMode, setResultMode] = useState<"json" | "table">("json");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>(() => readLocal(HISTORY_KEY, []));
  const [collections, setCollections] = useState<SavedCollection[]>(() => readLocal(COLLECTIONS_KEY, []));
  const [collectionName, setCollectionName] = useState("");
  const [showSaveCollection, setShowSaveCollection] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paginationOpen, setPaginationOpen] = useState(false);
  const [paginationMode, setPaginationMode] = useState("page");
  const [pageSize, setPageSize] = useState(25);
  const [maxPages, setMaxPages] = useState(5);
  const [pageDelay, setPageDelay] = useState(500);
  const [pageProgress, setPageProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const discoveryAbortRef = useRef<AbortController | null>(null);
  const stopPagination = useRef(false);

  const parsedResult = useMemo(() => result ? parseDisplayBody(result.body, result.rawBody) : null, [result]);
  const allRows = useMemo(() => rowsFrom(parsedResult), [parsedResult]);
  const fields = useMemo(() => [...new Set(allRows.flatMap((row) => Object.keys(row)))].slice(0, 40), [allRows]);
  const visibleRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return allRows;
    return allRows.filter((row) => Object.values(row).some((value) => formatValue(value).toLowerCase().includes(normalized)));
  }, [allRows, search]);
  const prettyJson = useMemo(() => JSON.stringify(parsedResult, null, 2) ?? "null", [parsedResult]);

  function setStoredHistory(next: HistoryItem[]) { setHistory(next); localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, 30))); }
  function setStoredCollections(next: SavedCollection[]) { setCollections(next); localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(next)); }
  function appendRow(setter: (value: Pair[]) => void, current: Pair[]) { setter([...current, { id: uid(), key: "", value: "", enabled: true }]); }
  function updateRow(setter: (value: Pair[]) => void, current: Pair[], id: string, key: string, value: string) { setter(current.map((row) => row.id === id ? { ...row, [key]: value } : row)); }
  function removeRow(setter: (value: Pair[]) => void, current: Pair[], id: string) { setter(current.filter((row) => row.id !== id)); }
  function editUrl(value: string) { setUrl(value); setApiBaseUrl(""); setEndpoints([]); setDiscoveryMessage(""); setApiTitle(""); }

  function buildRequestUrl(base: string, page?: number): string {
    const target = new URL(base);
    for (const item of params) if (item.enabled && item.key.trim()) target.searchParams.set(item.key.trim(), item.value);
    if (page !== undefined) {
      if (paginationMode === "page") { target.searchParams.set("page", String(page)); target.searchParams.set("pageSize", String(pageSize)); }
      else { target.searchParams.set("limit", String(pageSize)); target.searchParams.set("offset", String((page - 1) * pageSize)); }
    }
    if (auth.type === "apiKey" && auth.placement === "query" && auth.value) target.searchParams.set(auth.name || "api_key", auth.value);
    return target.toString();
  }

  function requestHeaders(): Record<string, string> {
    const values: Record<string, string> = {};
    for (const header of headers) if (header.enabled && header.key.trim()) values[header.key.trim()] = header.value;
    return values;
  }

  function authPayload() {
    if (auth.type === "none" || !auth.value) return { type: "none" };
    return { type: auth.type, value: auth.value, name: auth.name, placement: auth.placement };
  }

  function parseBody(): unknown {
    if (["GET", "DELETE"].includes(method) || !bodyText.trim()) return undefined;
    try { return JSON.parse(bodyText); } catch { return bodyText; }
  }

  async function executeOne(target: string, signal?: AbortSignal): Promise<ApiResponse> {
    const response = await postJson<ApiResponse>("/api/request", {
      url: target, method, headers: requestHeaders(), auth: authPayload(), body: parseBody(),
    }, signal);
    return response;
  }

  function recordRequest(target: string, response: ApiResponse) {
    const item: HistoryItem = { id: uid(), method, url: maskUrl(target), status: response.status, elapsedMs: response.elapsedMs, createdAt: Date.now() };
    setStoredHistory([item, ...history].slice(0, 30));
  }

  async function runRequest() {
    setBusy(true); setError(""); setResult(null); setSearch(""); setPageProgress(0);
    const target = buildRequestUrl(url);
    setResultUrl(maskUrl(target));
    setResultMode("json");
    abortRef.current = new AbortController();
    try {
      const response = await executeOne(target, abortRef.current.signal);
      setResult(response); recordRequest(target, response);
      setSelectedFields([...new Set(rowsFrom(parseDisplayBody(response.body, response.rawBody)).flatMap((row) => Object.keys(row)))].slice(0, 20));
    } catch (exception) {
      if ((exception as Error).name !== "AbortError") setError((exception as Error).message || "Request gagal. Periksa URL, autentikasi, dan koneksi.");
    } finally { setBusy(false); abortRef.current = null; }
  }

  function stopDiscovery() {
    const controller = discoveryAbortRef.current;
    if (!controller) return;
    controller.abort(); discoveryAbortRef.current = null;
    setDiscoveryBusy(false); setDiscoveryMessage("Analisis dihentikan.");
  }

  function stopRequest() { abortRef.current?.abort(); stopPagination.current = true; setBusy(false); stopDiscovery(); }

  async function analyzeUrl() {
    discoveryAbortRef.current?.abort();
    const controller = new AbortController();
    discoveryAbortRef.current = controller;
    setDiscoveryBusy(true); setDiscoveryMessage(""); setError(""); setEndpoints([]); setApiTitle("");
    try {
      const found = await postJson<{ success: true; title: string; version: string; baseUrl: string; specUrl: string; endpoints: Endpoint[]; truncated: boolean }>("/api/discover", { url }, controller.signal);
      if (controller.signal.aborted) return;
      setApiTitle(found.title); setApiVersion(found.version); setEndpoints(found.endpoints);
      setApiBaseUrl(found.baseUrl);
      setDiscoveryMessage(`${found.endpoints.length}${found.truncated ? "+" : ""} endpoint ditemukan dari ${maskUrl(found.specUrl)}`);
      const first = found.endpoints[0];
      if (first) { setMethod(first.method); setUrl(`${found.baseUrl}${first.path}`); }
    } catch (exception) {
      if (!controller.signal.aborted && (exception as Error).name !== "AbortError") setDiscoveryMessage((exception as Error).message || "Spesifikasi tidak ditemukan. Anda tetap dapat memasukkan endpoint secara manual.");
    } finally {
      if (discoveryAbortRef.current === controller) { discoveryAbortRef.current = null; setDiscoveryBusy(false); }
    }
  }

  function selectEndpoint(endpoint: Endpoint) {
    setMethod(endpoint.method);
    try {
      const base = apiBaseUrl || new URL(url).origin;
      setUrl(`${base}${endpoint.path}`);
      setParams(endpoint.parameters.filter((item) => item.in === "query").map((item) => ({ id: uid(), key: item.name, value: "", enabled: true })));
      setActivePanel("params"); setTab("request");
    } catch { setUrl(endpoint.path); }
  }

  async function runPagination() {
    if (method !== "GET") { setError("Pagination berurutan hanya tersedia untuk request GET."); return; }
    const pageLimit = Math.max(1, Math.min(20, Number(maxPages) || 1));
    const sizeLimit = Math.max(1, Math.min(500, Number(pageSize) || 25));
    stopPagination.current = false; setBusy(true); setError(""); setResult(null); setSearch(""); setPageProgress(0);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      let latest: ApiResponse | null = null;
      let accumulatedRows: Record<string, unknown>[] = [];
      for (let page = 1; page <= pageLimit && !stopPagination.current; page += 1) {
        const target = buildRequestUrl(url, page);
        latest = await executeOne(target, controller.signal);
        const pageRows = rowsFrom(parseDisplayBody(latest.body, latest.rawBody));
        if (pageRows.length) {
          accumulatedRows = [...accumulatedRows, ...pageRows];
          const combinedBody = JSON.stringify(accumulatedRows);
          setResult({ ...latest, body: accumulatedRows, rawBody: combinedBody, sizeBytes: new TextEncoder().encode(combinedBody).length });
          setSelectedFields([...new Set(accumulatedRows.flatMap((row) => Object.keys(row)))].slice(0, 20));
        } else setResult(latest);
        setResultMode("table"); setResultUrl(maskUrl(target)); setPageProgress(page);
        if (!latest.ok || pageRows.length < sizeLimit) break;
        if (page < pageLimit && !stopPagination.current) await new Promise((resolve) => setTimeout(resolve, Math.max(250, Math.min(5_000, Number(pageDelay) || 500))));
      }
      if (latest) recordRequest(buildRequestUrl(url), latest);
    } catch (exception) {
      if ((exception as Error).name !== "AbortError") setError((exception as Error).message || "Pagination gagal.");
    } finally { setBusy(false); abortRef.current = null; }
  }

  function exportJson() {
    if (parsedResult === null) return;
    downloadFile("scrapme-result.json", JSON.stringify(parsedResult, null, 2), "application/json;charset=utf-8");
  }

  function exportCsv() {
    const columns = selectedFields ?? fields;
    const content = [columns.map(csvCell).join(","), ...visibleRows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
    downloadFile("scrapme-result.csv", `\uFEFF${content}`, "text/csv;charset=utf-8");
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(prettyJson);
      setCopied(true); window.setTimeout(() => setCopied(false), 1500);
    } catch { setError("Clipboard tidak tersedia di konteks ini. Pilih dan salin JSON secara manual."); }
  }

  function saveCollection() {
    if (!collectionName.trim()) return;
    const entry: SavedCollection = { id: uid(), name: collectionName.trim(), method, url: maskUrl(url), createdAt: Date.now() };
    setStoredCollections([entry, ...collections]);
    setShowSaveCollection(false); setCollectionName("");
  }

  function selectHistory(item: HistoryItem) { setMethod(item.method); setUrl(item.url); setTab("request"); setResult(null); setError(""); }
  function selectCollection(item: SavedCollection) { setMethod(item.method); setUrl(item.url); setParams([]); setHeaders([]); setAuth({ type: "none", value: "", name: "X-API-Key", placement: "header" }); setTab("request"); setResult(null); }

  return (
    <div className="scrap-shell">
      <aside className="sidebar">
        <a className="brand" href="#request" aria-label="ScrapMe beranda"><img src="/scrapme-logo.png" alt="ScrapMe" /></a>
        <div className="workspace-label"><span className="workspace-dot" /> API WORKSPACE <ChevronDown size={14} /></div>
        <div className="side-section-label">WORKSPACE</div>
        <button className={`side-link ${tab === "request" ? "active" : ""}`} onClick={() => setTab("request")}><Radar size={17} /> <span>API Explorer</span><span className="side-count">01</span></button>
        <button className={`side-link ${tab === "collections" ? "active" : ""}`} onClick={() => setTab("collections")}><FolderOpen size={17} /> <span>Koleksi</span><span className="side-count">{collections.length || "—"}</span></button>
        <button className={`side-link ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}><History size={17} /> <span>Riwayat</span><span className="side-count">{history.length || "—"}</span></button>
        <div className="side-divider" />
        <div className="side-section-label">KONEKSI</div>
        <div className="connection-card"><div className="connection-icon"><Globe2 size={15} /></div><div><strong>Public APIs</strong><span>Proxy aman aktif</span></div><span className="pulse-dot" /></div>
        <div className="sidebar-spacer" />
        <div className="safe-note"><ShieldCheck size={16} /><div><strong>Privasi terjaga</strong><span>Token tak disimpan di riwayat.</span></div></div>
        <div className="sidebar-footer"><span className="footer-mark">SM</span><span>ScrapMe</span><span className="version-tag">BETA</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs"><span>ScrapMe</span><span className="crumb-slash">/</span><strong>{tab === "request" ? "API Explorer" : tab === "history" ? "Riwayat request" : "Koleksi tersimpan"}</strong></div><div className="topbar-right"><span className="secure-indicator"><span className="pulse-dot" /> PROXY AMAN</span><button className="icon-button" title="Panduan keamanan" onClick={() => setError("ScrapMe hanya meneruskan HTTP(S) publik, memblokir alamat privat/internal, dan tidak menyimpan token pada riwayat.")}><LockKeyhole size={17} /></button></div></header>

        {tab === "request" ? <div className="page-content">
          <section className="hero-row"><div><div className="eyebrow"><span className="eyebrow-line" /> API WORKBENCH</div><h1>Racik request.<br /><span>Lihat hasil.</span></h1><p>Jelajahi REST API, uji endpoint, dan bawa pulang data dalam hitungan detik.</p></div><div className="hero-stat"><div className="stat-orbit"><Braces size={23} /></div><span>BUILT FOR API EXPLORATION</span><strong>01 <em>/</em> REQUEST</strong></div></section>

          <section className="discovery-card panel-card">
            <div className="section-heading"><div className="section-icon purple"><Radar size={17} /></div><div><h2>Mulai dari sebuah URL</h2><p>Analisis dokumentasi API, atau langsung isi endpoint di bawah.</p></div><span className="optional-pill">OPENAPI · SWAGGER</span></div>
            <div className="discovery-input-row"><div className="input-with-icon"><Link2 size={16} /><input aria-label="URL API atau dokumentasi" value={url} onChange={(event) => editUrl(event.target.value)} placeholder="https://api.contoh.com/docs" onKeyDown={(event) => { if (event.key === "Enter") void analyzeUrl(); }} /><button className="clear-input" onClick={() => editUrl("")} title="Hapus URL"><X size={15} /></button></div><button className="button-secondary" onClick={() => discoveryBusy ? stopDiscovery() : void analyzeUrl()} disabled={!discoveryBusy && !url.trim()}>{discoveryBusy ? <><Square size={14} /> Hentikan</> : <><Radar size={16} /> Analisis API</>}</button></div>
            <div className="discovery-foot"><span><ShieldCheck size={13} /> Target privat/internal otomatis diblokir.</span><span className="discovery-hint">Memeriksa URL dan lokasi dokumentasi umum.</span></div>
            {discoveryMessage && <div className={`inline-notice ${endpoints.length ? "notice-success" : "notice-neutral"}`}><span>{endpoints.length ? <Check size={15} /> : <AlertCircle size={15} />}</span><div>{discoveryMessage}{apiTitle && <strong className="spec-label">{apiTitle}{apiVersion ? ` · v${apiVersion}` : ""}</strong>}</div></div>}
            {endpoints.length > 0 && <div className="endpoint-list"><div className="endpoint-list-heading">ENDPOINT TERDETEKSI <span>{endpoints.length}{endpoints.length >= 300 ? "+" : ""}</span></div>{endpoints.slice(0, 7).map((endpoint, index) => <button key={`${endpoint.method}:${endpoint.path}:${index}`} className="endpoint-row" onClick={() => selectEndpoint(endpoint)}><span className={`method-pill ${methodClass[endpoint.method]}`}>{endpoint.method}</span><span className="endpoint-path">{endpoint.path}</span><span className="endpoint-summary">{endpoint.summary}</span><ArrowRight size={15} /></button>)}{endpoints.length > 7 && <div className="endpoint-more">+{endpoints.length - 7} endpoint lainnya tersedia setelah Anda mempersempit spesifikasi.</div>}</div>}
          </section>

          <section className="request-card panel-card">
            <div className="section-heading request-title-row"><div className="section-icon blue"><Code2 size={17} /></div><div><h2>Request builder</h2><p>Atur request sebelum dikirim ke API tujuan.</p></div><button className="text-action" onClick={() => setShowSaveCollection(true)}><Plus size={15} /> Simpan koleksi</button></div>
            <div className="url-builder"><label className="method-select-wrap"><span className={`method-pill large ${methodClass[method]}`}>{method}</span><select aria-label="Metode HTTP" value={method} onChange={(event) => setMethod(event.target.value as HttpMethod)}>{METHODS.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><div className="url-builder-input"><input aria-label="URL endpoint" value={url} onChange={(event) => editUrl(event.target.value)} placeholder="https://api.example.com/v1/resource" onKeyDown={(event) => { if (event.key === "Enter" && !busy) void runRequest(); }} /></div><button className={`button-run ${busy ? "is-busy" : ""}`} onClick={busy ? stopRequest : () => void runRequest()} disabled={!url.trim()}>{busy ? <><Square size={14} fill="currentColor" /> Hentikan</> : <><Play size={15} fill="currentColor" /> Kirim request</>}</button></div>
            <nav className="request-tabs" aria-label="Opsi request">{(["params", "headers", "auth", "body"] as Panel[]).map((item) => <button key={item} className={activePanel === item ? "selected" : ""} onClick={() => setActivePanel(item)}>{item === "params" ? "Params" : item === "headers" ? "Headers" : item === "auth" ? "Autentikasi" : "Body"}{item === "params" && params.filter((p) => p.key).length > 0 && <span className="tab-counter">{params.filter((p) => p.key).length}</span>}{item === "headers" && headers.filter((p) => p.key).length > 0 && <span className="tab-counter">{headers.filter((p) => p.key).length}</span>}</button>)}</nav>
            <div className="request-panel-content">
              {activePanel === "params" && <div className="pair-panel"><p className="panel-helper">Parameter ditambahkan ke query URL sebelum request dikirim.</p><div className="pair-head"><span>KEY</span><span>VALUE</span><span /></div>{params.map((item) => <div className="pair-row" key={item.id}><input type="checkbox" checked={item.enabled} onChange={(event) => setParams(params.map((row) => row.id === item.id ? { ...row, enabled: event.target.checked } : row))} aria-label="Aktifkan parameter" /><input value={item.key} onChange={(event) => updateRow(setParams, params, item.id, "key", event.target.value)} placeholder="page" /><input value={item.value} onChange={(event) => updateRow(setParams, params, item.id, "value", event.target.value)} placeholder="1" /><button className="remove-row" onClick={() => removeRow(setParams, params, item.id)} aria-label="Hapus parameter"><Trash2 size={14} /></button></div>)}<button className="add-row" onClick={() => appendRow(setParams, params)}><Plus size={14} /> Tambah parameter</button></div>}
              {activePanel === "headers" && <div className="pair-panel"><p className="panel-helper">Header khusus diteruskan dengan penyaringan header transport yang sensitif.</p><div className="pair-head"><span>KEY</span><span>VALUE</span><span /></div>{headers.map((item) => <div className="pair-row" key={item.id}><input type="checkbox" checked={item.enabled} onChange={(event) => setHeaders(headers.map((row) => row.id === item.id ? { ...row, enabled: event.target.checked } : row))} aria-label="Aktifkan header" /><input value={item.key} onChange={(event) => updateRow(setHeaders, headers, item.id, "key", event.target.value)} placeholder="Accept" /><input value={item.value} onChange={(event) => updateRow(setHeaders, headers, item.id, "value", event.target.value)} placeholder="application/json" /><button className="remove-row" onClick={() => removeRow(setHeaders, headers, item.id)} aria-label="Hapus header"><Trash2 size={14} /></button></div>)}<button className="add-row" onClick={() => appendRow(setHeaders, headers)}><Plus size={14} /> Tambah header</button></div>}
              {activePanel === "auth" && <div className="auth-panel"><div className="auth-kind"><label>Jenis autentikasi</label><select value={auth.type} onChange={(event) => setAuth({ ...auth, type: event.target.value as AuthConfig["type"] })}><option value="none">Tanpa autentikasi</option><option value="bearer">Bearer token</option><option value="apiKey">API key</option></select></div>{auth.type !== "none" && <><div className="auth-fields">{auth.type === "apiKey" && <><div><label>Nama key</label><input value={auth.name} onChange={(event) => setAuth({ ...auth, name: event.target.value })} placeholder="X-API-Key" /></div><div><label>Kirim sebagai</label><select value={auth.placement} onChange={(event) => setAuth({ ...auth, placement: event.target.value as AuthConfig["placement"] })}><option value="header">Header</option><option value="query">Query parameter</option></select></div></>}</div><label>Nilai rahasia</label><div className="secret-input"><KeyRound size={15} /><input type="password" autoComplete="off" value={auth.value} onChange={(event) => setAuth({ ...auth, value: event.target.value })} placeholder={auth.type === "bearer" ? "Token Anda" : "API key Anda"} /></div></>}<div className="privacy-callout"><LockKeyhole size={15} /><span>Kredensial hanya dipakai untuk request ini. Tidak disimpan ke koleksi, riwayat, atau log.</span></div></div>}
              {activePanel === "body" && <div className="body-panel"><div className="body-panel-top"><p className="panel-helper">Body JSON atau teks mentah untuk POST, PUT, dan PATCH.</p><span className="body-format">JSON</span></div><textarea spellCheck={false} value={bodyText} onChange={(event) => setBodyText(event.target.value)} disabled={method === "GET" || method === "DELETE"} aria-label="Body request" />{(method === "GET" || method === "DELETE") && <span className="panel-helper body-disabled">Metode {method} tidak mengirim body.</span>}</div>}
            </div>
            <div className="request-footer"><span><LockKeyhole size={13} /> Request diteruskan lewat proxy ScrapMe yang terlindungi.</span><button className="pagination-toggle" onClick={() => setPaginationOpen(!paginationOpen)}><Layers3 size={14} /> Pagination <ChevronDown size={13} className={paginationOpen ? "rotate" : ""} /></button></div>
            {paginationOpen && <div className="pagination-panel"><div className="pagination-copy"><strong>Ambil beberapa halaman</strong><span>Pratinjau batas: maks. {maxPages} request · hingga {maxPages * pageSize} record · jeda {pageDelay} ms. Hasil halaman digabung.</span></div><div className="pagination-controls"><label>Pola<select value={paginationMode} onChange={(event) => setPaginationMode(event.target.value)}><option value="page">page + pageSize</option><option value="offset">offset + limit</option></select></label><label>Ukuran<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / halaman</option>)}</select></label><label>Batas<select value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value))}>{[2, 5, 10, 20].map((n) => <option key={n} value={n}>{n} halaman</option>)}</select></label><label>Jeda<select value={pageDelay} onChange={(event) => setPageDelay(Number(event.target.value))}><option value={500}>500 ms</option><option value={1000}>1 dtk</option><option value={2000}>2 dtk</option></select></label><button className="button-secondary compact" onClick={() => busy ? stopRequest() : void runPagination()}>{busy ? <Square size={14} /> : <Play size={14} />}{busy ? `Stop · ${pageProgress}` : "Mulai pagination"}</button></div></div>}
          </section>

          <section className="results-card panel-card">
            <div className="results-heading"><div><div className="results-title"><div className="section-icon green"><Activity size={17} /></div><h2>Response</h2>{result && <span className={`status-pill ${result.status >= 200 && result.status < 400 ? "status-ok" : "status-error"}`}><span /> {result.status} {result.status >= 200 && result.status < 300 ? "OK" : result.status >= 300 && result.status < 400 ? "Redirect diblokir" : "Error"}</span>}</div><p>{result ? <><span className="response-stat"><Clock3 size={12} /> {result.elapsedMs} ms</span><span className="dot-separator">·</span><span className="response-stat">{(result.sizeBytes / 1024).toFixed(1)} KB</span><span className="dot-separator">·</span><span className="response-url">{resultUrl}</span></> : "Kirim request untuk melihat response API di sini."}</p></div>{result && <div className="result-actions"><button onClick={() => void copyResult()} title="Salin JSON">{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Tersalin" : "Salin"}</button><button onClick={exportJson}><FileJson2 size={14} /> JSON</button><button onClick={exportCsv} disabled={allRows.length === 0}><ArrowDownToLine size={14} /> CSV</button></div>}</div>
            {error && <div className="error-banner"><AlertCircle size={16} /><span>{error}</span><button onClick={() => setError("")} aria-label="Tutup pesan"><X size={15} /></button></div>}
            {result?.redirectBlocked && <div className="inline-notice notice-neutral redirect-notice"><ShieldCheck size={15} /><span>ScrapMe tidak mengikuti redirect otomatis. Periksa URL tujuan baru sebelum mengirim ulang.</span></div>}
            {result ? <>
              <div className="result-tab-row"><div className="result-tabs"><button className={resultMode === "json" ? "selected" : ""} onClick={() => setResultMode("json")}><Braces size={14} /> JSON</button><button className={resultMode === "table" ? "selected" : ""} onClick={() => { if (!allRows.length) setError("Response ini belum berbentuk daftar atau objek tabel."); else setResultMode("table"); }}><Table2 size={14} /> Tabel <span className="small-count">{allRows.length}</span></button></div>{allRows.length > 0 && <div className="result-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari di response..." /></div>}</div>
              {allRows.length > 0 && <div className="field-select"><span>KOLOM CSV</span>{fields.map((field) => <label key={field}><input type="checkbox" checked={selectedFields === null || selectedFields.includes(field)} onChange={(event) => setSelectedFields(event.target.checked ? [...new Set([...(selectedFields ?? fields), field])] : (selectedFields ?? fields).filter((item) => item !== field))} /> {field}</label>)}</div>}
              {resultMode === "json" ? <div className="result-view"><div className="json-code"><div className="code-toolbar"><span><span className="code-dot" />{result.contentType.includes("json") ? "application/json" : "response body"}</span><span>{Math.min(result.sizeBytes, 1_000_000).toLocaleString()} bytes</span></div><pre>{prettyJson.length > 120_000 ? `${prettyJson.slice(0, 120_000)}\n\n… Respons dipotong pada tampilan.` : prettyJson}</pre></div></div> : <div className="table-preview active-result-table"><div className="table-scroll"><table><thead><tr>{fields.slice(0, 12).map((field) => <th key={field}>{field}</th>)}</tr></thead><tbody>{visibleRows.slice(0, 200).map((row, index) => <tr key={index}>{fields.slice(0, 12).map((field) => <td key={field}>{formatValue(row[field]).slice(0, 160)}</td>)}</tr>)}</tbody></table></div><span className="table-caption">Menampilkan {Math.min(visibleRows.length, 200)} dari {visibleRows.length} baris{visibleRows.length > 200 ? " · pratinjau dibatasi 200 baris" : ""}</span></div>}
            </> : <div className="empty-response"><div className="empty-visual"><Code2 size={27} /><span className="empty-spark">+</span></div><strong>Response Anda akan muncul di sini</strong><span>Atur URL, pilih metode, lalu kirim request.</span><div className="empty-chips"><span><span className="method-dot get-dot" /> GET</span><span>·</span><span>JSON preview</span><span>·</span><span>CSV export</span></div></div>}
            <div className="result-security"><ShieldCheck size={14} /><span>Gunakan hanya API publik atau API yang Anda berwenang akses.</span><span className="result-security-right">Batas response 1 MB · Timeout 15 dtk</span></div>
          </section>
        </div> : tab === "history" ? <div className="page-content list-page"><section className="page-title"><div className="eyebrow"><span className="eyebrow-line" /> ACTIVITY</div><h1>Riwayat <span>request</span></h1><p>Request terakhir di perangkat ini. Kredensial dan body tidak disimpan.</p></section><section className="panel-card list-card">{history.length ? history.map((item) => <div className="saved-row" key={item.id}><span className={`method-pill ${methodClass[item.method]}`}>{item.method}</span><button className="saved-url" onClick={() => selectHistory(item)}>{item.url}</button><span className={`status-pill small ${item.status >= 200 && item.status < 400 ? "status-ok" : "status-error"}`}>{item.status}</span><span className="saved-meta">{item.elapsedMs} ms</span><span className="saved-meta">{new Date(item.createdAt).toLocaleString("id-ID")}</span><button className="icon-button" onClick={() => selectHistory(item)} title="Muat ke request builder"><ArrowRight size={15} /></button></div>) : <div className="empty-list"><History size={24} /><strong>Belum ada riwayat</strong><span>Request yang berhasil dijalankan akan muncul di sini.</span></div>}</section><div className="list-note"><LockKeyhole size={14} /> URL sensitif disamarkan. Header, token, body, dan isi response tidak dimasukkan ke riwayat.</div></div> : <div className="page-content list-page"><section className="page-title"><div className="eyebrow"><span className="eyebrow-line" /> YOUR WORKSPACE</div><h1>Koleksi <span>API</span></h1><p>Simpan shortcut endpoint di browser ini. Nilai rahasia tidak ikut disimpan.</p></section><section className="panel-card list-card">{collections.length ? collections.map((item) => <div className="saved-row" key={item.id}><span className={`method-pill ${methodClass[item.method]}`}>{item.method}</span><div className="collection-name"><FolderOpen size={15} /><strong>{item.name}</strong></div><span className="saved-url muted-url">{item.url}</span><span className="saved-meta">{new Date(item.createdAt).toLocaleDateString("id-ID")}</span><button className="icon-button" onClick={() => selectCollection(item)} title="Gunakan koleksi"><ArrowRight size={15} /></button><button className="icon-button danger-icon" onClick={() => setStoredCollections(collections.filter((saved) => saved.id !== item.id))} title="Hapus koleksi"><Trash2 size={14} /></button></div>) : <div className="empty-list"><FolderOpen size={24} /><strong>Koleksi Anda masih kosong</strong><span>Simpan request dari API Explorer agar mudah dipakai lagi.</span><button className="button-secondary" onClick={() => setTab("request")}><Plus size={15} /> Buat request pertama</button></div>}</section><div className="list-note"><LockKeyhole size={14} /> Koleksi disimpan hanya di browser lokal ini. URL query yang tampak seperti token akan disamarkan.</div></div>}

        <footer className="page-footer"><span>ScrapMe <span>·</span> API exploration, made easier.</span><span><ShieldCheck size={13} /> Data request tetap milik Anda</span></footer>
      </main>

      {showSaveCollection && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSaveCollection(false); }}><div className="save-modal" role="dialog" aria-modal="true" aria-labelledby="save-title"><button className="modal-close icon-button" onClick={() => setShowSaveCollection(false)} aria-label="Tutup"><X size={17} /></button><div className="section-icon purple"><FolderOpen size={17} /></div><h2 id="save-title">Simpan ke koleksi</h2><p>Koleksi menyimpan metode dan URL, bukan token, header, body, atau response.</p><label>Nama koleksi<input autoFocus value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="Mis. Produk katalog" onKeyDown={(event) => { if (event.key === "Enter") saveCollection(); }} /></label><div className="modal-actions"><button className="button-quiet" onClick={() => setShowSaveCollection(false)}>Batal</button><button className="button-secondary" onClick={saveCollection} disabled={!collectionName.trim()}><Plus size={15} /> Simpan</button></div></div></div>}
    </div>
  );
}
