const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const tls = require("node:tls");
const { URL } = require("node:url");
const zlib = require("node:zlib");

const ROOT = __dirname;
const STATIC_DIR = path.join(ROOT, "outputs");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const LIBRARY_PATH = path.join(DATA_DIR, "artbee-library.json");
const USERS_PATH = path.join(DATA_DIR, "artbee-users.json");
const COMMENTS_PATH = path.join(DATA_DIR, "artbee-comments.json");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8787);
const SESSION_COOKIE = "artbee_session";
const SESSION_DAYS = 7;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const MAX_STORED_SHOTS = 1200;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_COMMENTS_PER_SHOT = 200;
const PROXY_REQUEST_TIMEOUT_MS = 10000;
const DIRECT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_SCAN_PAGES = 1;

const DEFAULT_USERS = [
  {
    account: process.env.ADMIN_USER || "admin",
    password: process.env.ADMIN_PASSWORD || "picbee2026"
  }
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function parseUsers() {
  const raw = process.env.ARTBEE_USERS || "";
  const users = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [account, ...passwordParts] = entry.split(":");
      return { account: account.trim(), password: passwordParts.join(":") };
    })
    .filter((user) => user.account && user.password);
  return users.length ? users : DEFAULT_USERS;
}

const STATIC_USERS = parseUsers();

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function unbase64url(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function createSession(account) {
  const payload = base64url(
    JSON.stringify({
      account,
      exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
      nonce: crypto.randomBytes(12).toString("hex")
    })
  );
  return `${payload}.${sign(payload)}`;
}

function readSession(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".", 2);
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    const data = JSON.parse(unbase64url(payload));
    if (!data.account || Number(data.exp) < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function sessionCookie(token) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`
  ];
  if (process.env.COOKIE_SECURE === "true") parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function parseCookies(header) {
  const result = {};
  for (const chunk of header.split(";")) {
    const [key, ...valueParts] = chunk.trim().split("=");
    if (!key) continue;
    result[key] = decodeURIComponent(valueParts.join("=") || "");
  }
  return result;
}

function send(response, status, body, contentType = "text/plain; charset=utf-8", headers = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const corsOrigin = response.getHeader("Access-Control-Allow-Origin") || "*";
  const corsCredentials = response.getHeader("Access-Control-Allow-Credentials");
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    ...(corsCredentials ? { "Access-Control-Allow-Credentials": corsCredentials } : {}),
    ...headers
  });
  response.end(bytes);
}

function sendJson(response, status, payload, headers = {}) {
  send(response, status, JSON.stringify(payload), "application/json; charset=utf-8", headers);
}

async function readBody(request) {
  let total = 0;
  const chunks = [];
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function requireSession(request, response) {
  const session = readSession(request);
  if (!session) {
    sendJson(response, 401, { ok: false, authenticated: false, message: "Not signed in" });
    return null;
  }
  return session;
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizeAccount(account) {
  return String(account || "").trim().toLowerCase();
}

function normalizeNickname(nickname, account) {
  return String(nickname || account || "").trim().slice(0, 24) || "PicBee User";
}

function normalizeAvatar(avatar) {
  const text = String(avatar || "").trim();
  if (!text) return "";
  if (text.length > 2000) return "";
  if (/^https?:\/\//i.test(text) || /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(text)) return text;
  return "";
}

function normalizeEmail(email) {
  const text = String(email || "").trim().slice(0, 120);
  if (!text) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

function normalizeBio(bio) {
  return String(bio || "").trim().slice(0, 160);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":", 2);
  if (!salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return safeEqual(candidate, hash);
}

function publicUser(user) {
  return {
    account: user.account,
    nickname: normalizeNickname(user.nickname, user.account),
    avatar: normalizeAvatar(user.avatar),
    email: normalizeEmail(user.email),
    bio: normalizeBio(user.bio)
  };
}

function seedUsers() {
  return STATIC_USERS.map((user) => ({
    account: normalizeAccount(user.account),
    passwordHash: hashPassword(user.password),
    nickname: normalizeNickname(user.account, user.account),
    avatar: "",
    email: "",
    bio: "",
    createdAt: new Date().toISOString()
  })).filter((user) => user.account);
}

async function readUsers() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(USERS_PATH, "utf8");
    const payload = JSON.parse(raw);
    const users = Array.isArray(payload.users) ? payload.users : [];
    return users
      .map((user) => ({
        account: normalizeAccount(user.account),
        passwordHash: String(user.passwordHash || ""),
        nickname: normalizeNickname(user.nickname, user.account),
        avatar: normalizeAvatar(user.avatar),
        email: normalizeEmail(user.email),
        bio: normalizeBio(user.bio),
        createdAt: user.createdAt || new Date().toISOString(),
        updatedAt: user.updatedAt || null
      }))
      .filter((user) => user.account && user.passwordHash);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const users = seedUsers();
    await writeUsers(users);
    return users;
  }
}

async function writeUsers(users) {
  await ensureDataDir();
  await fs.writeFile(
    USERS_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), users }, null, 2),
    "utf8"
  );
}

async function findUserByAccount(account) {
  const normalized = normalizeAccount(account);
  const users = await readUsers();
  return users.find((user) => user.account === normalized) || null;
}

async function authenticateUser(account, password) {
  const user = await findUserByAccount(account);
  if (user && verifyPassword(password, user.passwordHash)) return user;
  const fallback = STATIC_USERS.find((candidate) => safeEqual(normalizeAccount(candidate.account), normalizeAccount(account)) && safeEqual(candidate.password, password));
  return fallback ? { account: normalizeAccount(fallback.account), nickname: normalizeNickname(fallback.account, fallback.account), avatar: "", email: "", bio: "" } : null;
}

async function registerUser(body) {
  const account = normalizeAccount(body.account);
  const password = String(body.password || "");
  const nickname = normalizeNickname(body.nickname, account);
  const avatar = normalizeAvatar(body.avatar);
  const email = normalizeEmail(body.email);
  const bio = normalizeBio(body.bio);
  if (!/^[a-z0-9_.-]{3,32}$/.test(account)) {
    return { ok: false, status: 400, message: "账号需要 3-32 位，可使用字母、数字、点、下划线和短横线" };
  }
  if (password.length < 6 || password.length > 72) {
    return { ok: false, status: 400, message: "密码至少 6 位" };
  }

  const users = await readUsers();
  if (users.some((user) => user.account === account)) {
    return { ok: false, status: 409, message: "这个账号已经被注册" };
  }

  const user = {
    account,
    passwordHash: hashPassword(password),
    nickname,
    avatar,
    email,
    bio,
    createdAt: new Date().toISOString(),
    updatedAt: null
  };
  users.push(user);
  await writeUsers(users);
  return { ok: true, user: publicUser(user) };
}

async function updateUserProfile(account, body) {
  const users = await readUsers();
  const user = users.find((item) => item.account === normalizeAccount(account));
  if (!user) return null;
  user.nickname = normalizeNickname(body.nickname, user.account);
  user.avatar = normalizeAvatar(body.avatar);
  user.email = normalizeEmail(body.email);
  user.bio = normalizeBio(body.bio);
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
  return publicUser(user);
}

async function readComments() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(COMMENTS_PATH, "utf8");
    const payload = JSON.parse(raw);
    return Array.isArray(payload.comments) ? payload.comments.filter(Boolean) : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeComments(comments) {
  await ensureDataDir();
  await fs.writeFile(
    COMMENTS_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), comments }, null, 2),
    "utf8"
  );
}

function publicComment(comment) {
  return {
    id: comment.id,
    shotId: comment.shotId,
    account: comment.account,
    nickname: normalizeNickname(comment.nickname, comment.account),
    avatar: normalizeAvatar(comment.avatar),
    text: String(comment.text || ""),
    createdAt: comment.createdAt
  };
}

async function readLibrary() {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(LIBRARY_PATH, "utf8");
    const payload = JSON.parse(raw);
    return {
      ok: true,
      updatedAt: payload.updatedAt || null,
      scanPage: Math.max(1, Number(payload.scanPage || 1)),
      favorites: Array.isArray(payload.favorites) ? payload.favorites.filter(Boolean) : [],
      items: Array.isArray(payload.items) ? payload.items.filter(Boolean).slice(0, MAX_STORED_SHOTS) : []
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ok: true, updatedAt: null, scanPage: 1, favorites: [], items: [] };
    }
    throw error;
  }
}

async function writeLibrary(payload) {
  await ensureDataDir();
  const items = Array.isArray(payload.items) ? payload.items.filter(Boolean).slice(0, MAX_STORED_SHOTS) : [];
  const favorites = Array.isArray(payload.favorites) ? payload.favorites.filter(Boolean) : [];
  const backup = {
    ok: true,
    updatedAt: new Date().toISOString(),
    scanPage: Math.max(1, Number(payload.scanPage || 1)),
    favorites,
    items
  };
  await fs.writeFile(LIBRARY_PATH, JSON.stringify(backup, null, 2), "utf8");
  return { ok: true, count: items.length, updatedAt: backup.updatedAt };
}

function property(object, names) {
  if (!object || typeof object !== "object") return null;
  for (const name of names) {
    const value = object[name];
    if (value !== undefined && value !== null && String(value) !== "") return value;
  }
  return null;
}

function isImageUrl(value) {
  const text = String(value || "").trim();
  if (!/^https?:\/\//i.test(text)) return false;
  return !/\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(text);
}

function itemsFromPayload(payload) {
  for (const name of ["data", "results", "items", "projects"]) {
    const value = property(payload, [name]);
    if (value) return Array.isArray(value) ? value : [value];
  }
  return Array.isArray(payload) ? payload : [];
}

function getImageCandidate(item) {
  const direct = property(item, [
    "cover_url",
    "coverUrl",
    "smaller_square_cover_url",
    "image_url",
    "imageUrl",
    "thumbnail_url",
    "thumbnailUrl",
    "preview_url"
  ]);
  if (direct) return String(direct);

  for (const containerName of ["cover", "image", "thumbnail", "preview"]) {
    const container = property(item, [containerName]);
    const nested = property(container, ["url", "src", "small", "medium", "large"]);
    if (nested) return String(nested);
  }

  const assets = property(item, ["assets"]);
  for (const asset of Array.isArray(assets) ? assets : []) {
    const assetUrl = property(asset, ["image_url", "imageUrl", "url", "src"]);
    if (assetUrl) return String(assetUrl);
  }
  return "";
}

function getFullImageCandidate(detail, fallback) {
  const candidates = [];

  function addCandidate(url, width, height) {
    if (!isImageUrl(url)) return;
    const w = Number(width || 0);
    const h = Number(height || 0);
    candidates.push({
      url: String(url),
      width: Number.isFinite(w) ? w : 0,
      height: Number.isFinite(h) ? h : 0
    });
  }

  const assets = property(detail, ["assets"]);
  for (const asset of Array.isArray(assets) ? assets : []) {
    const type = String(property(asset, ["asset_type", "assetType", "type"]) || "").toLowerCase();
    if (type && !/image|photo|picture|cover/.test(type)) continue;
    const width = property(asset, ["width", "image_width", "imageWidth"]);
    const height = property(asset, ["height", "image_height", "imageHeight"]);
    for (const field of [
      "full_image_url",
      "fullImageUrl",
      "original_url",
      "originalUrl",
      "large_image_url",
      "largeImageUrl",
      "image_url",
      "imageUrl",
      "url",
      "src"
    ]) {
      addCandidate(property(asset, [field]), width, height);
    }
  }

  for (const field of ["full_image_url", "fullImageUrl", "original_url", "originalUrl", "large_image_url", "largeImageUrl", "image_url", "imageUrl"]) {
    addCandidate(property(detail, [field]), property(detail, ["width"]), property(detail, ["height"]));
  }
  addCandidate(fallback, property(detail, ["width"]), property(detail, ["height"]));

  candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return candidates[0] || { url: fallback || "", width: 0, height: 0 };
}

function getTags(item) {
  const tags = [];
  for (const name of ["tags", "categories"]) {
    const values = property(item, [name]);
    for (const value of Array.isArray(values) ? values : []) {
      if (!value) continue;
      if (typeof value === "string") tags.push(value);
      else {
        const tag = property(value, ["name", "title", "slug"]);
        if (tag) tags.push(String(tag));
      }
    }
  }
  return [...new Set(tags)];
}

function convertArtStationItem(item, detail, minLikes, source) {
  const likesRaw = property(detail, ["likes_count", "likesCount", "like_count", "likes"]) ?? property(item, ["likes_count", "likesCount", "like_count", "likes"]);
  const likes = Number(String(likesRaw || "").replaceAll(",", ""));
  if (!Number.isFinite(likes) || likes < minLikes) return null;

  const title = String(property(detail, ["title", "name"]) || property(item, ["title", "name"]) || "");
  let url = String(property(item, ["url", "permalink", "html_url"]) || "");
  const hash = String(property(detail, ["hash_id", "hashId", "slug", "id"]) || property(item, ["hash_id", "hashId", "slug", "id"]) || "");
  if (!url && hash) url = `https://www.artstation.com/artwork/${hash}`;

  const coverUrl = getImageCandidate(item) || getImageCandidate(detail);
  if (!title || !url || !coverUrl) return null;
  const fullImage = getFullImageCandidate(detail, coverUrl);

  const user = property(detail, ["user", "artist", "owner"]) || property(item, ["user", "artist", "owner"]);
  const artist = String(property(user, ["full_name", "fullName", "username", "name"]) || "ArtStation artist");
  const username = String(property(user, ["username", "slug"]) || "");
  const tags = getTags(detail);
  if (!tags.length) tags.push(...getTags(item));

  const text = `${title} ${tags.join(" ")}`.toLowerCase();
  const looksEnvironmental = /environment|environmental|landscape|world|scene|city|urban|interior|exterior|architecture|building|forest|mountain|concept|design|ruins|vista/.test(text);
  if (!looksEnvironmental) return null;

  let width = property(detail, ["width"]);
  let height = property(detail, ["height"]);
  const assets = property(detail, ["assets"]);
  if ((!width || !height) && Array.isArray(assets) && assets.length) {
    width ||= property(assets[0], ["width"]);
    height ||= property(assets[0], ["height"]);
  }
  width ||= fullImage.width;
  height ||= fullImage.height;

  return {
    id: hash,
    title,
    url,
    coverUrl,
    fullImageUrl: fullImage.url || coverUrl,
    artist,
    username,
    likes,
    tags,
    width,
    height,
    source
  };
}

function normalizeProxyUrl(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) text = `http://${text}`;
  try {
    const url = new URL(text);
    return url.href.replace(/\/$/, "");
  } catch {
    return text;
  }
}

function buildProxyCandidates(preferred) {
  const preferredProxy = normalizeProxyUrl(preferred);
  const envProxy = normalizeProxyUrl(process.env.ARTBEE_PROXY);
  if (preferredProxy) return [...new Set([preferredProxy, ""])];
  if (envProxy) return [...new Set([envProxy, ""])];

  const candidates = [
    "http://127.0.0.1:7897",
    "http://127.0.0.1:7890",
    "http://127.0.0.1:7891",
    ""
  ];
  return [...new Set(candidates.map(normalizeProxyUrl))];
}

function splitHttpMessage(buffer) {
  const index = buffer.indexOf("\r\n\r\n");
  if (index < 0) return null;
  return {
    head: buffer.subarray(0, index).toString("latin1"),
    body: buffer.subarray(index + 4)
  };
}

function parseHttpHeaders(head) {
  const lines = head.split(/\r\n/);
  const statusLine = lines.shift() || "";
  const match = statusLine.match(/HTTP\/\d(?:\.\d)?\s+(\d+)/i);
  const headers = {};
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index > 0) {
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
  }
  return { statusCode: match ? Number(match[1]) : 0, headers, statusLine };
}

function decodeChunkedBody(buffer) {
  const chunks = [];
  let offset = 0;
  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf("\r\n", offset, "latin1");
    if (lineEnd < 0) break;
    const size = Number.parseInt(buffer.subarray(offset, lineEnd).toString("latin1").split(";")[0].trim(), 16);
    if (!Number.isFinite(size)) break;
    offset = lineEnd + 2;
    if (size === 0) break;
    chunks.push(buffer.subarray(offset, offset + size));
    offset += size + 2;
  }
  return Buffer.concat(chunks);
}

function decodeHttpBody(headers, body) {
  const transfer = headers["transfer-encoding"] || "";
  const encoding = (headers["content-encoding"] || "").toLowerCase();
  const raw = /chunked/i.test(transfer) ? decodeChunkedBody(body) : body;
  if (encoding.includes("br")) return zlib.brotliDecompressSync(raw);
  if (encoding.includes("gzip")) return zlib.gunzipSync(raw);
  if (encoding.includes("deflate")) return zlib.inflateSync(raw);
  return raw;
}

function fetchJsonViaHttpProxy(targetUrl, proxyUrl, headers) {
  const target = new URL(targetUrl);
  const proxy = new URL(proxyUrl);
  if (target.protocol !== "https:" || proxy.protocol !== "http:") {
    throw new Error("Only HTTPS targets through HTTP proxies are supported");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let socket;
    let tlsSocket;
    const timeout = setTimeout(() => finish(new Error("proxy request timeout")), PROXY_REQUEST_TIMEOUT_MS);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket?.destroy();
      tlsSocket?.destroy();
      if (error) reject(error);
      else resolve(value);
    }

    let connectBuffer = Buffer.alloc(0);
    socket = net.connect(Number(proxy.port || 80), proxy.hostname, () => {
      socket.write(`CONNECT ${target.hostname}:443 HTTP/1.1\r\nHost: ${target.hostname}:443\r\nProxy-Connection: Keep-Alive\r\n\r\n`);
    });
    socket.on("error", finish);
    socket.on("data", (chunk) => {
      connectBuffer = Buffer.concat([connectBuffer, chunk]);
      const message = splitHttpMessage(connectBuffer);
      if (!message) return;

      const connectInfo = parseHttpHeaders(message.head);
      if (connectInfo.statusCode !== 200) {
        finish(new Error(`proxy CONNECT ${connectInfo.statusCode}`));
        return;
      }

      socket.removeAllListeners("data");
      socket.removeAllListeners("error");
      tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
        const requestHeaders = {
          ...headers,
          Host: target.host,
          Connection: "close",
          "Accept-Encoding": "gzip, deflate, br"
        };
        const headerText = Object.entries(requestHeaders).map(([key, value]) => `${key}: ${value}`).join("\r\n");
        tlsSocket.write(`GET ${target.pathname}${target.search} HTTP/1.1\r\n${headerText}\r\n\r\n`);
      });

      let responseBuffer = Buffer.alloc(0);
      tlsSocket.on("data", (part) => {
        responseBuffer = Buffer.concat([responseBuffer, part]);
      });
      tlsSocket.on("error", finish);
      tlsSocket.on("end", () => {
        try {
          const response = splitHttpMessage(responseBuffer);
          if (!response) throw new Error("empty HTTP response");
          const responseInfo = parseHttpHeaders(response.head);
          const text = decodeHttpBody(responseInfo.headers, response.body).toString("utf8");
          if (responseInfo.statusCode < 200 || responseInfo.statusCode >= 300) {
            throw new Error(`HTTP ${responseInfo.statusCode}: ${text.slice(0, 180)}`);
          }
          finish(null, JSON.parse(text));
        } catch (error) {
          finish(error);
        }
      });
    });
  });
}

async function fetchJson(url, headers, proxyCandidates = []) {
  if (typeof fetch !== "function") throw new Error("Node 18+ fetch is required");
  const errors = [];

  for (const proxyUrl of proxyCandidates.filter(Boolean)) {
    try {
      return await fetchJsonViaHttpProxy(url, proxyUrl, headers);
    } catch (error) {
      errors.push(`proxy ${proxyUrl}: ${error.message}`);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIRECT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    errors.push(`direct: ${error.message}`);
    throw new Error(errors.join(" | "));
  } finally {
    clearTimeout(timeout);
  }
}

async function scanArtStation(searchParams) {
  const minLikes = Math.max(0, Number(searchParams.get("minLikes") || 1000));
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 60)));
  const pageStart = Math.max(1, Number(searchParams.get("page") || 1));
  const pagesToScan = Math.max(1, Math.min(2, Number(searchParams.get("pages") || DEFAULT_SCAN_PAGES)));
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: "https://www.artstation.com/",
    "X-Requested-With": "XMLHttpRequest"
  };
  const templates = [
    { name: "search environmental concept art design", url: "https://www.artstation.com/api/v2/search/projects.json?query=environmental%20concept%20art%20design&page={page}&per_page=50&sorting=likes" },
    { name: "search environment concept art", url: "https://www.artstation.com/api/v2/search/projects.json?query=environment%20concept%20art&page={page}&per_page=50&sorting=likes" },
    { name: "search environment design", url: "https://www.artstation.com/api/v2/search/projects.json?query=environment%20design&page={page}&per_page=50&sorting=likes" }
  ];
  const itemsById = new Map();
  const warnings = [];
  let requests = 0;
  let lastPage = pageStart;
  const proxyCandidates = buildProxyCandidates(searchParams.get("proxy"));

  for (const template of templates) {
    for (let page = pageStart; page < pageStart + pagesToScan; page += 1) {
      if (itemsById.size >= limit) break;
      const url = template.url.replace("{page}", String(page));
      lastPage = Math.max(lastPage, page);
      requests += 1;
      try {
        const payload = await fetchJson(url, headers, proxyCandidates);
        for (const raw of itemsFromPayload(payload)) {
          const hash = String(property(raw, ["hash_id", "hashId", "slug", "id"]) || "");
          if (!hash || itemsById.has(hash)) continue;

          // Fast mode: only use the public search result payload.
          // ArtStation's project detail JSON endpoint often returns 403 or is too slow through proxies,
          // which causes the browser-side 4-minute scan timeout. The search payload already contains
          // enough data for a visual reference index: title, artist, source URL, likes and cover image.
          const detail = raw;
          const item = convertArtStationItem(raw, detail, minLikes, template.name);
          if (!item) continue;
          itemsById.set(item.id || item.url, item);
          if (itemsById.size >= limit) break;
        }
      } catch (error) {
        warnings.push(`${template.name} page ${page}: ${error.message}`);
      }
    }
    if (itemsById.size >= limit) break;
  }

  const items = [...itemsById.values()].sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0)).slice(0, limit);
  if (!items.length && warnings.length) {
    const warningText = warnings.join(" ");
    const blocked = /403|Forbidden|已禁止/i.test(warningText);
    return {
      ok: false,
      message: blocked
        ? "ArtStation 拒绝了采集请求（403）。代理已经连上，但当前节点或会话被 ArtStation 拦截；请换一个全局节点，或稍后再试。"
        : "没有获取到可用的 ArtStation 结果。可能是网络不可达、站点拦截，或公开接口发生变化。",
      warnings,
      requests
    };
  }

  return {
    ok: true,
    source: "ArtStation Environmental Concept Art and Design",
    minLikes,
    count: items.length,
    pageStart,
    pageEnd: lastPage,
    nextPage: lastPage + 1,
    requests,
    warnings,
    items
  };
}

function extractArtStationHash(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const direct = text.match(/^[a-z0-9]+$/i);
  if (direct) return text;
  try {
    const url = new URL(text);
    const match = url.pathname.match(/\/(?:artwork|projects)\/([^/?#]+)/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

async function getArtStationProjectImage(searchParams) {
  const hash = extractArtStationHash(searchParams.get("hash") || searchParams.get("url"));
  if (!hash) {
    return { ok: false, message: "Missing ArtStation project hash" };
  }
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: "https://www.artstation.com/",
    "X-Requested-With": "XMLHttpRequest"
  };
  const proxyCandidates = buildProxyCandidates(searchParams.get("proxy"));
  const detail = await fetchJson(`https://www.artstation.com/projects/${hash}.json`, headers, proxyCandidates);
  const fullImage = getFullImageCandidate(detail, getImageCandidate(detail));
  return {
    ok: Boolean(fullImage.url),
    hash,
    fullImageUrl: fullImage.url,
    width: fullImage.width || property(detail, ["width"]),
    height: fullImage.height || property(detail, ["height"])
  };
}

async function serveStatic(request, response, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const fullPath = path.resolve(STATIC_DIR, relative);
  if (fullPath !== STATIC_DIR && !fullPath.startsWith(`${STATIC_DIR}${path.sep}`)) {
    sendJson(response, 404, { ok: false, message: "Not found" });
    return;
  }

  try {
    const bytes = await fs.readFile(fullPath);
    const type = MIME_TYPES[path.extname(fullPath).toLowerCase()] || "application/octet-stream";
    send(response, 200, bytes, type, { "Cache-Control": type.startsWith("text/html") ? "no-store" : "public, max-age=3600" });
  } catch {
    sendJson(response, 404, { ok: false, message: "Not found" });
  }
}

async function route(request, response) {
  const origin = request.headers.origin;
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/health") {
    const users = await readUsers();
    sendJson(response, 200, { ok: true, service: "ArtBee PicBee", users: users.map((user) => user.account), dataFile: LIBRARY_PATH });
    return;
  }

  if (pathname === "/api/session" && request.method === "GET") {
    const session = readSession(request);
    const user = session ? await findUserByAccount(session.account) : null;
    sendJson(response, 200, {
      ok: true,
      authenticated: Boolean(session),
      account: session?.account || "",
      user: user ? publicUser(user) : session ? { account: session.account, nickname: session.account, avatar: "", email: "", bio: "" } : null
    });
    return;
  }

  if (pathname === "/api/login" && request.method === "POST") {
    const body = await readBody(request);
    const user = await authenticateUser(body.account || "", body.password || "");
    if (!user) {
      sendJson(response, 401, { ok: false, authenticated: false, message: "账号或密码不正确" });
      return;
    }
    const token = createSession(user.account);
    sendJson(response, 200, { ok: true, authenticated: true, account: user.account, user: publicUser(user) }, { "Set-Cookie": sessionCookie(token) });
    return;
  }

  if (pathname === "/api/register" && request.method === "POST") {
    const result = await registerUser(await readBody(request));
    if (!result.ok) {
      sendJson(response, result.status || 400, result);
      return;
    }
    const token = createSession(result.user.account);
    sendJson(response, 200, { ok: true, authenticated: true, account: result.user.account, user: result.user }, { "Set-Cookie": sessionCookie(token) });
    return;
  }

  if (pathname === "/api/logout" && request.method === "POST") {
    sendJson(response, 200, { ok: true, authenticated: false }, { "Set-Cookie": clearSessionCookie() });
    return;
  }

  if (pathname === "/api/profile") {
    const session = requireSession(request, response);
    if (!session) return;
    if (request.method === "GET") {
      const user = await findUserByAccount(session.account);
      sendJson(response, 200, { ok: true, user: user ? publicUser(user) : { account: session.account, nickname: session.account, avatar: "", email: "", bio: "" } });
      return;
    }
    if (request.method === "POST") {
      const user = await updateUserProfile(session.account, await readBody(request));
      if (!user) {
        sendJson(response, 404, { ok: false, message: "账号不存在" });
        return;
      }
      sendJson(response, 200, { ok: true, user });
      return;
    }
    sendJson(response, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  if (pathname === "/api/comments") {
    const session = requireSession(request, response);
    if (!session) return;
    if (request.method === "GET") {
      const shotId = String(url.searchParams.get("shotId") || "").trim();
      if (!shotId) {
        sendJson(response, 400, { ok: false, message: "Missing shotId" });
        return;
      }
      const comments = (await readComments())
        .filter((comment) => comment.shotId === shotId)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .slice(-MAX_COMMENTS_PER_SHOT)
        .map(publicComment);
      sendJson(response, 200, { ok: true, comments });
      return;
    }
    if (request.method === "POST") {
      const body = await readBody(request);
      const shotId = String(body.shotId || "").trim();
      const text = String(body.text || "").trim();
      if (!shotId || !text) {
        sendJson(response, 400, { ok: false, message: "评论内容不能为空" });
        return;
      }
      if (text.length > 500) {
        sendJson(response, 400, { ok: false, message: "评论最多 500 字" });
        return;
      }
      const user = await findUserByAccount(session.account);
      const comments = await readComments();
      const comment = {
        id: crypto.randomUUID(),
        shotId,
        account: session.account,
        nickname: normalizeNickname(user?.nickname, session.account),
        avatar: normalizeAvatar(user?.avatar),
        text,
        createdAt: new Date().toISOString()
      };
      comments.push(comment);
      await writeComments(comments.slice(-5000));
      sendJson(response, 200, { ok: true, comment: publicComment(comment) });
      return;
    }
    sendJson(response, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  if (pathname === "/api/library") {
    if (!requireSession(request, response)) return;
    if (request.method === "GET") {
      sendJson(response, 200, await readLibrary());
      return;
    }
    if (request.method === "POST") {
      sendJson(response, 200, await writeLibrary(await readBody(request)));
      return;
    }
    sendJson(response, 405, { ok: false, message: "Method not allowed" });
    return;
  }

  if (pathname === "/api/scan-artstation" && request.method === "GET") {
    if (!requireSession(request, response)) return;
    const payload = await scanArtStation(url.searchParams);
    sendJson(response, payload.ok ? 200 : 502, payload);
    return;
  }

  if (pathname === "/api/artstation-project" && request.method === "GET") {
    if (!requireSession(request, response)) return;
    const payload = await getArtStationProjectImage(url.searchParams);
    sendJson(response, payload.ok ? 200 : 502, payload);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { ok: false, message: "Not found" });
    return;
  }

  await serveStatic(request, response, pathname);
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error(error);
    sendJson(response, 500, { ok: false, message: error.message || "Internal server error" });
  });
});

ensureDataDir()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log(`ArtBee PicBee is running on http://${HOST}:${PORT}/`);
      console.log(`Account: ${STATIC_USERS.map((user) => user.account).join(", ")}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
