import { lookup } from "node:dns";
import { isIP } from "node:net";
import type { Express, Request, Response } from "express";
import axios, { type AxiosRequestConfig } from "axios";
import http from "node:http";
import https from "node:https";

const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_HEADER_COUNT = 40;
const MAX_TIMEOUT_MS = 15_000;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

type Address = { address: string; family: number };

function inV4Range(address: string, prefix: string, bits: number): boolean {
  const toInt = (value: string) => value.split(".").reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (toInt(address) & mask) === (toInt(prefix) & mask);
}

function isPublicV4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const blocked: Array<[string, number]> = [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  ];
  return !blocked.some(([prefix, bits]) => inV4Range(address, prefix, bits));
}

function ipv6ToBigInt(address: string): bigint | null {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const v4 = normalized.slice(lastColon + 1);
    if (isIP(v4) !== 4) return null;
    const v4n = v4.split(".").reduce((acc, part) => (acc << 8n) | BigInt(part), 0n);
    const left = normalized.slice(0, lastColon);
    return ipv6ToBigInt(`${left}:${((v4n >> 16n) & 0xffffn).toString(16)}:${(v4n & 0xffffn).toString(16)}`);
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const words = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  return words.reduce((acc, word) => (acc << 16n) | BigInt(`0x${word}`), 0n);
}

function isPublicV6(address: string): boolean {
  if (isIP(address) !== 6 || address.includes("%")) return false;
  const value = ipv6ToBigInt(address);
  if (value === null) return false;
  // Only global-unicast 2000::/3; exclude documentation, 6to4, and transition blocks.
  if ((value >> 125n) !== 1n) return false;
  const doc = ipv6ToBigInt("2001:db8::");
  const sixToFour = ipv6ToBigInt("2002::");
  const trans = ipv6ToBigInt("2001::");
  if (doc !== null && (value >> 96n) === (doc >> 96n)) return false;
  if (sixToFour !== null && (value >> 112n) === (sixToFour >> 112n)) return false;
  if (trans !== null && (value >> 112n) === (trans >> 112n)) return false;
  return true;
}

function isPublicAddress(address: string, family: number): boolean {
  return family === 4 ? isPublicV4(address) : family === 6 && isPublicV6(address);
}

function parseTarget(value: unknown): URL {
  if (typeof value !== "string" || value.length > 8_192) throw new Error("Masukkan URL yang valid (maksimum 8 KB).");
  let target: URL;
  try { target = new URL(value); } catch { throw new Error("URL tidak valid. Sertakan awalan https:// atau http://."); }
  if (target.protocol !== "https:" && target.protocol !== "http:") throw new Error("Hanya URL HTTP dan HTTPS yang didukung.");
  if (target.username || target.password) throw new Error("Jangan sisipkan kredensial pada URL. Gunakan tab Autentikasi.");
  if (!target.hostname || target.hostname.endsWith(".localhost") || target.hostname.endsWith(".local")) throw new Error("Host lokal tidak diizinkan.");
  if (target.port && !((target.protocol === "http:" && target.port === "80") || (target.protocol === "https:" && target.port === "443"))) throw new Error("Untuk keamanan, hanya port standar HTTP 80 dan HTTPS 443 yang diizinkan.");
  target.hash = "";
  return target;
}

async function resolvePublicAddresses(target: URL): Promise<Address[]> {
  const hostname = target.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  let addresses: Address[];
  if (literalFamily) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await new Promise<Address[]>((resolve, reject) => {
        lookup(hostname, { all: true, verbatim: true }, (error, results) => error ? reject(error) : resolve(results));
      });
    } catch {
      throw new Error("Nama host tidak dapat ditemukan.");
    }
  }
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address, entry.family))) {
    throw new Error("Tujuan harus memiliki alamat IP publik. Alamat lokal, privat, dan jaringan internal diblokir.");
  }
  return addresses;
}

async function validateTarget(value: unknown): Promise<{ url: URL; addresses: Address[] }> {
  const url = parseTarget(value);
  const addresses = await resolvePublicAddresses(url);
  return { url, addresses };
}

function createPinnedLookup(addresses: Address[]): any {
  return (( _hostname: string, options: unknown, callback: (...args: any[]) => void) => {
    const lookupOptions = typeof options === "object" && options !== null ? options as { all?: boolean; family?: number } : {};
    const available = addresses.filter((item) => !lookupOptions.family || item.family === lookupOptions.family);
    const selected = available[0] ?? addresses[0];
    if (!selected) return callback(new Error("Tidak ada alamat jaringan publik."));
    if (lookupOptions.all) return callback(null, addresses);
    return callback(null, selected.address, selected.family);
  });
}

function normalizeOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch { return null; }
}

function enforceSameOrigin(req: Request): void {
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");
  if (!origin) throw new Error("Request harus berasal dari aplikasi ScrapMe.");
  const normalized = normalizeOrigin(origin);
  if (!normalized) throw new Error("Request harus berasal dari aplikasi ScrapMe.");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) throw new Error("Request lintas-origin ditolak.");

  const allowedOrigins = new Set(
    (process.env.SCRAPME_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => normalizeOrigin(value.trim()))
      .filter((value): value is string => value !== null),
  );
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:3000");
    allowedOrigins.add("http://127.0.0.1:3000");
  }
  if (!allowedOrigins.has(normalized)) throw new Error("Request harus berasal dari origin ScrapMe yang diizinkan.");
}

function enforceRateLimit(req: Request): void {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (rateBuckets.size > 5_000) {
    for (const [ip, entry] of rateBuckets) if (now - entry.startedAt >= RATE_WINDOW_MS) rateBuckets.delete(ip);
  }
  if (bucket.count > RATE_LIMIT) throw new Error("Batas penggunaan sementara tercapai (60 request per menit). Coba lagi sebentar.");
}

function apiError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Request tidak dapat diproses.";
  const status = message.startsWith("Batas penggunaan") ? 429 : message.startsWith("Request harus") || message.startsWith("Request lintas") ? 403 : 400;
  res.status(status).json({ error: message });
}

function filteredHeaders(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Header request harus berupa objek.");
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_HEADER_COUNT) throw new Error("Maksimum 40 header per request.");
  const result: Record<string, string> = {};
  const forbidden = new Set(["host", "cookie", "set-cookie", "connection", "content-length", "transfer-encoding", "origin", "referer", "accept-encoding", "proxy-authorization", "proxy-connection"]);
  for (const [name, value] of entries) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(name)) throw new Error("Nama header tidak valid.");
    if (typeof value !== "string" || value.length > 8_192) throw new Error("Nilai header harus teks dengan panjang maksimum 8 KB.");
    const lower = name.toLowerCase();
    if (forbidden.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-")) throw new Error(`Header ${name} tidak boleh diteruskan.`);
    result[name] = value;
  }
  return result;
}

function addAuthentication(url: URL, headers: Record<string, string>, auth: unknown): void {
  if (!auth || typeof auth !== "object") return;
  const value = auth as { type?: unknown; name?: unknown; value?: unknown; placement?: unknown };
  if (value.type === "none") return;
  if (value.type !== "bearer" && value.type !== "apiKey") throw new Error("Metode autentikasi tidak didukung.");
  if (typeof value.value !== "string" || value.value.length > 8_192) throw new Error("Nilai autentikasi tidak valid.");
  if (value.type === "bearer") {
    headers.Authorization = `Bearer ${value.value}`;
    return;
  }
  if (value.type === "apiKey") {
    const name = typeof value.name === "string" ? value.name : "";
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/.test(name)) throw new Error("Nama API key tidak valid.");
    if (value.placement === "query") url.searchParams.set(name, value.value);
    else if (value.placement === "header") {
      const lower = name.toLowerCase();
      if (["host", "cookie", "set-cookie", "connection", "content-length", "transfer-encoding", "origin", "referer"].includes(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-")) throw new Error("Nama header autentikasi tidak diizinkan.");
      headers[name] = value.value;
    } else throw new Error("Lokasi API key tidak valid.");
    return;
  }
}

function validateRequestBody(body: unknown): string | undefined {
  if (body === undefined || body === "") return undefined;
  const serialized = typeof body === "string" ? body : JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > MAX_REQUEST_BYTES) throw new Error("Body request terlalu besar (maksimum 256 KB).");
  return serialized;
}

async function makeUpstreamRequest(options: {
  targetValue: unknown;
  method: string;
  headers?: unknown;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{ status: number; contentType: string; body: string; elapsedMs: number; sizeBytes: number; redirected: boolean }> {
  const { url, addresses } = await validateTarget(options.targetValue);
  const method = options.method.toUpperCase();
  if (!METHODS.has(method)) throw new Error("Metode request tidak didukung.");
  const headers = filteredHeaders(options.headers);
  const body = validateRequestBody(options.body);
  if ((method === "GET" || method === "DELETE") && body) throw new Error(`Body tidak didukung untuk ${method}.`);
  if (body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
  const pinnedLookup = createPinnedLookup(addresses);
  const httpAgent = new http.Agent({ keepAlive: false, lookup: pinnedLookup });
  const httpsAgent = new https.Agent({ keepAlive: false, lookup: pinnedLookup });
  const startedAt = Date.now();
  const config: AxiosRequestConfig = {
    url: url.toString(), method: method as AxiosRequestConfig["method"], headers,
    data: body, timeout: Math.min(Math.max(options.timeoutMs ?? MAX_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS),
    maxRedirects: 0, maxContentLength: MAX_RESPONSE_BYTES, maxBodyLength: MAX_REQUEST_BYTES,
    responseType: "arraybuffer", validateStatus: () => true, proxy: false,
    httpAgent, httpsAgent, signal: options.signal,
  };
  try {
    const response = await axios.request(config);
    const bytes = Buffer.from(response.data as ArrayBuffer);
    const text = bytes.subarray(0, MAX_RESPONSE_BYTES).toString("utf8");
    return {
      status: response.status,
      contentType: String(response.headers["content-type"] ?? "text/plain"),
      body: text,
      elapsedMs: Date.now() - startedAt,
      sizeBytes: bytes.byteLength,
      redirected: response.status >= 300 && response.status < 400,
    };
  } finally {
    httpAgent.destroy();
    httpsAgent.destroy();
  }
}

function normalizeSpec(spec: unknown, specUrl: string) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("Dokumen bukan objek OpenAPI/Swagger JSON.");
  const document = spec as Record<string, any>;
  if (!document.paths || typeof document.paths !== "object") throw new Error("Dokumen tidak memiliki daftar paths OpenAPI/Swagger.");
  const swagger2Server = typeof document.host === "string" && document.host
    ? `${Array.isArray(document.schemes) && document.schemes.includes("http") ? "http" : "https"}://${document.host}${typeof document.basePath === "string" ? document.basePath : ""}`
    : undefined;
  const serverValue = Array.isArray(document.servers) && typeof document.servers[0]?.url === "string" ? document.servers[0].url : swagger2Server ?? new URL(specUrl).origin;
  let baseUrl: string;
  try { baseUrl = new URL(serverValue, specUrl).toString().replace(/\/$/, ""); }
  catch { throw new Error("Base URL pada dokumen API tidak valid."); }
  const allowedMethods = ["get", "post", "put", "patch", "delete"];
  const endpoints = Object.entries(document.paths).flatMap(([path, rawOperations]) => {
    if (!rawOperations || typeof rawOperations !== "object") return [];
    return allowedMethods.flatMap((method) => {
      const operation = (rawOperations as Record<string, any>)[method];
      if (!operation || typeof operation !== "object") return [];
      return [{
        path,
        method: method.toUpperCase(),
        summary: String(operation.summary ?? operation.operationId ?? "Endpoint REST").slice(0, 180),
        operationId: typeof operation.operationId === "string" ? operation.operationId : "",
        parameters: Array.isArray(operation.parameters) ? operation.parameters.map((item: any) => ({ name: String(item?.name ?? ""), in: String(item?.in ?? "query"), required: Boolean(item?.required) })).filter((item: any) => item.name).slice(0, 30) : [],
      }];
    });
  }).slice(0, 300);
  return {
    title: String(document.info?.title ?? "API tanpa judul").slice(0, 160),
    version: String(document.info?.version ?? "").slice(0, 80),
    baseUrl,
    endpoints,
    truncated: Object.values(document.paths).length > 300 || endpoints.length >= 300,
  };
}

function parseJsonDocument(body: string): unknown | null {
  try { return JSON.parse(body); } catch { return null; }
}

export function registerScrapMeRoutes(app: Express): void {
  app.post("/api/discover", async (req, res) => {
    const abortController = new AbortController();
    req.once("aborted", () => abortController.abort());
    res.once("close", () => { if (!res.writableEnded) abortController.abort(); });
    try {
      enforceSameOrigin(req);
      enforceRateLimit(req);
      const start = parseTarget(req.body?.url);
      const candidates: URL[] = [];
      const pathLooksLikeSpec = /\.(json|ya?ml)$/i.test(start.pathname) || /openapi|swagger|api-docs/i.test(start.pathname);
      if (pathLooksLikeSpec) candidates.push(start);
      const commonPaths = ["/openapi.json", "/swagger.json", "/v3/api-docs", "/api-docs", "/swagger/v1/swagger.json"];
      for (const path of commonPaths) {
        const candidate = new URL(path, start.origin);
        if (!candidates.some((item) => item.href === candidate.href)) candidates.push(candidate);
      }
      const attempted: string[] = [];
      for (const candidate of candidates.slice(0, 6)) {
        if (abortController.signal.aborted || res.destroyed) return;
        attempted.push(candidate.pathname);
        try {
          const upstream = await makeUpstreamRequest({ targetValue: candidate.toString(), method: "GET", timeoutMs: 5_000, signal: abortController.signal });
          if (abortController.signal.aborted || res.destroyed) return;
          if (upstream.status < 200 || upstream.status >= 300 || upstream.redirected) continue;
          const parsed = parseJsonDocument(upstream.body);
          if (!parsed) continue;
          const normalized = normalizeSpec(parsed, candidate.toString());
          if (!normalized.endpoints.length) continue;
          res.json({ success: true, specUrl: candidate.toString(), ...normalized, attempted });
          return;
        } catch {
          if (abortController.signal.aborted || res.destroyed) return;
          // A candidate that is absent or invalid should not block later standard paths.
        }
      }
      if (abortController.signal.aborted || res.destroyed) return;
      res.status(404).json({ error: "Dokumen OpenAPI/Swagger tidak ditemukan. Masukkan endpoint API langsung untuk melanjutkan secara manual.", attempted });
    } catch (error) { if (!res.destroyed) apiError(res, error); }
  });

  app.post("/api/request", async (req, res) => {
    try {
      enforceSameOrigin(req);
      enforceRateLimit(req);
      const abortController = new AbortController();
      req.once("aborted", () => abortController.abort());
      res.once("close", () => { if (!res.writableEnded) abortController.abort(); });
      const requestUrl = parseTarget(req.body?.url);
      const headers = filteredHeaders(req.body?.headers);
      addAuthentication(requestUrl, headers, req.body?.auth);
      const upstream = await makeUpstreamRequest({
        targetValue: requestUrl.toString(),
        method: typeof req.body?.method === "string" ? req.body.method : "GET",
        headers,
        body: req.body?.body,
        signal: abortController.signal,
      });
      const parsed = parseJsonDocument(upstream.body);
      res.json({
        status: upstream.status,
        ok: upstream.status >= 200 && upstream.status < 400,
        contentType: upstream.contentType,
        body: parsed === null ? upstream.body : parsed,
        rawBody: upstream.body,
        elapsedMs: upstream.elapsedMs,
        sizeBytes: upstream.sizeBytes,
        redirectBlocked: upstream.redirected,
      });
    } catch (error) {
      if (res.destroyed) return;
      const message = error instanceof Error ? error.message : "Request gagal.";
      const isRateLimited = message.startsWith("Batas penggunaan");
      const isOrigin = message.startsWith("Request harus") || message.startsWith("Request lintas");
      const isTimeout = axios.isAxiosError(error) && ["ECONNABORTED", "ETIMEDOUT"].includes(error.code ?? "");
      const isUpstreamError = axios.isAxiosError(error);
      const safeMessage = isTimeout
        ? "API tujuan melewati batas waktu respons. Coba lagi nanti atau periksa ketersediaan API."
        : isUpstreamError
          ? "API tujuan tidak dapat dijangkau atau responsnya melampaui batas ScrapMe."
          : message;
      res.status(isRateLimited ? 429 : isOrigin ? 403 : isTimeout ? 504 : isUpstreamError ? 502 : 400).json({ error: safeMessage });
    }
  });
}
