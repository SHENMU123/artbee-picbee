const SCAN_BATCH_SIZE = 100;
const MIN_LIKES = 1000;
const SCAN_TIMEOUT_MS = 240000;
const DETAIL_IMAGE_LOOKUP_VERSION = 2;
const LOCAL_API_BASE = "http://127.0.0.1:8787";
const FALLBACK_API_BASES = [LOCAL_API_BASE, "http://127.0.0.1:8788", "http://127.0.0.1:8791"];
const API_BASE = window.location.protocol === "file:" ? LOCAL_API_BASE : "";
const SHOTS_STORAGE_KEY = "framescout.shots.v1";
const FAVORITES_STORAGE_KEY = "framescout.favorites.v1";
const LEGACY_SHOTS_STORAGE_KEYS = [
  SHOTS_STORAGE_KEY,
  "framescout.shots",
  "framescout.items.v1",
  "framescout.gallery.v1",
  "framescout.library.v1",
  "artbee.picbee.shots.v1",
  "artbee.picbee.items.v1",
  "artbee.picbee.library.v1",
  "picbee.shots.v1"
];
const LEGACY_FAVORITES_STORAGE_KEYS = [
  FAVORITES_STORAGE_KEY,
  "framescout.favorites",
  "artbee.picbee.favorites.v1",
  "picbee.favorites.v1"
];
const SCAN_PAGE_STORAGE_KEY = "framescout.scanPage";
const AUTH_STORAGE_KEY = "artbee.picbee.authenticated";
const THEME_STORAGE_KEY = "artbee.picbee.theme";
const LIBRARY_API = `${API_BASE}/api/library`;
const SESSION_API = `${API_BASE}/api/session`;
const LOGIN_API = `${API_BASE}/api/login`;
const REGISTER_API = `${API_BASE}/api/register`;
const LOGOUT_API = `${API_BASE}/api/logout`;
const PROFILE_API = `${API_BASE}/api/profile`;
const COMMENTS_API = `${API_BASE}/api/comments`;
const DEFAULT_PROXY_URL = "http://127.0.0.1:7897";
const AUTH_ACCOUNT = "admin";
const AUTH_PASSWORD = "picbee2026";
const PROFILE_STORAGE_KEY = "artbee.picbee.profile.v1";
const MAX_STORED_SHOTS = 1200;
let libraryBackupTimer = 0;
const authState = {
  checked: false,
  serverAvailable: false,
  authenticated: false,
  account: "",
  user: null,
  mode: "login"
};

const shots = loadStoredShots();

const state = {
  type: "全部",
  composition: "全部",
  mood: "全部",
  ratio: "全部",
  minLikes: 0,
  filtersOpen: false,
  sort: "recent",
  favoritesOnly: false,
  selectedId: null,
  query: "",
  isScanning: false,
  scanProgress: 0,
  scanPage: Math.max(1, Number(localStorage.getItem(SCAN_PAGE_STORAGE_KEY)) || 1),
  proxyUrl: normalizeProxyUrl(localStorage.getItem("framescout.proxyUrl") || DEFAULT_PROXY_URL),
  favorites: loadStoredFavorites(),
  comments: new Map(),
  loadingComments: new Set(),
  loadingDetailImages: new Set(),
  sources: [
    {
      id: "artstation-environment",
      name: "ArtStation / Environmental Concept Art & Design",
      type: "公开索引",
      count: 0,
      enabled: true
    }
  ],
  queue: []
};

const typeFilters = ["全部", "环境设计", "城市", "自然", "建筑", "交通", "室内", "雪景", "荒漠", "科幻", "奇幻", "废墟", "水域", "天空", "工业", "角色场景"];
const compositionFilters = ["全部", "引导线", "框中框", "垂直节奏", "极简负形", "对称", "单点透视", "S 曲线", "明暗分区", "前景引导", "三分法", "中心构图", "层次景深", "大远景", "俯视", "仰视", "剪影", "重复图形", "大面积天空"];
const moodFilters = ["全部", "概念", "黄昏", "雾气", "寒冷", "炽热", "潮湿", "夜景", "史诗", "宁静", "阴郁", "暖光", "冷色"];
const ratioFilters = ["全部", "横构图", "竖构图", "近方形"];
const likesFilters = [
  { label: "全部", value: 0 },
  { label: "3000+", value: 3000 },
  { label: "5000+", value: 5000 },
  { label: "1万+", value: 10000 }
];

const gallery = document.querySelector("#gallery");
const typeFilterWrap = document.querySelector("#typeFilters");
const compositionFilterWrap = document.querySelector("#compositionFilters");
const moodFilterWrap = document.querySelector("#moodFilters");
const ratioFilterWrap = document.querySelector("#ratioFilters");
const likesFilterWrap = document.querySelector("#likesFilters");
const filterSummary = document.querySelector("#filterSummary");
const filterDock = document.querySelector("#filterDock");
const toggleFiltersButton = document.querySelector("#toggleFilters");
const sourceList = document.querySelector("#sourceList");
const queueList = document.querySelector("#queueList");
const inspector = document.querySelector("#inspector");
const inspectorEmpty = document.querySelector("#inspectorEmpty");
const inspectorContent = document.querySelector("#inspectorContent");
const searchInput = document.querySelector("#searchInput");
const proxyInput = document.querySelector("#proxyInput");
const manualImportForm = document.querySelector("#manualImportForm");
const manualSourceUrl = document.querySelector("#manualSourceUrl");
const manualImageUrl = document.querySelector("#manualImageUrl");
const manualTitle = document.querySelector("#manualTitle");
const manualArtist = document.querySelector("#manualArtist");
const collectorBookmarklet = document.querySelector("#collectorBookmarklet");
const copyCollector = document.querySelector("#copyCollector");
const toast = document.querySelector("#toast");
const emptyState = document.querySelector("#emptyState");
const resultLabel = document.querySelector("#resultLabel");
const contentGrid = document.querySelector("#contentGrid");
const appShell = document.querySelector("#appShell");
const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginAccount = document.querySelector("#loginAccount");
const loginPassword = document.querySelector("#loginPassword");
const loginNickname = document.querySelector("#loginNickname");
const loginNicknameField = document.querySelector("#loginNicknameField");
const authModeToggle = document.querySelector("#authModeToggle");
const loginSubmitText = document.querySelector("#loginSubmitText");
const loginError = document.querySelector("#loginError");
const logoutButton = document.querySelector("#logoutButton");
const userProfileButton = document.querySelector("#userProfileButton");
const topbarAvatar = document.querySelector("#topbarAvatar");
const profileSheet = document.querySelector("#profileSheet");
const closeProfileSheet = document.querySelector("#closeProfileSheet");
const profileFavoritesButton = document.querySelector("#profileFavoritesButton");
const profileFavoritesGrid = document.querySelector("#profileFavoritesGrid");
const settingsSheet = document.querySelector("#settingsSheet");
const closeSettingsSheet = document.querySelector("#closeSettingsSheet");
const themeToggle = document.querySelector("#themeToggle");
const profileForm = document.querySelector("#profileForm");
const profileNickname = document.querySelector("#profileNickname");
const profileAvatar = document.querySelector("#profileAvatar");
const profileEmail = document.querySelector("#profileEmail");
const profileBio = document.querySelector("#profileBio");
const profileAvatarPreview = document.querySelector("#profileAvatarPreview");

const compactNumber = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1
});

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    return "#";
  }
  return "#";
}

function safeImageUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(text)) return text;
  const url = safeUrl(text);
  return url === "#" ? "" : url;
}

function getInitials(value) {
  const text = String(value || "AP").trim();
  return text.slice(0, 2).toUpperCase();
}

function avatarHTML(user, className = "comment-avatar") {
  const name = user?.nickname || user?.account || "AP";
  const avatar = safeImageUrl(user?.avatar);
  if (avatar) {
    return `<span class="${className}"><img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)}" referrerpolicy="no-referrer" /></span>`;
  }
  return `<span class="${className}">${escapeHTML(getInitials(name))}</span>`;
}

function loadLocalProfile() {
  return readStorageJson(PROFILE_STORAGE_KEY, { account: AUTH_ACCOUNT, nickname: "Admin", avatar: "", email: "", bio: "" });
}

function saveLocalProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile || {}));
}

function currentUser() {
  return authState.user || loadLocalProfile();
}

function updateProfileForm() {
  const user = currentUser();
  if (profileNickname) profileNickname.value = user?.nickname || user?.account || "";
  if (profileAvatar) profileAvatar.value = user?.avatar || "";
  if (profileEmail) profileEmail.value = user?.email || "";
  if (profileBio) profileBio.value = user?.bio || "";
  if (profileAvatarPreview) {
    profileAvatarPreview.innerHTML = safeImageUrl(user?.avatar)
      ? `<img src="${escapeHTML(safeImageUrl(user.avatar))}" alt="${escapeHTML(user.nickname || user.account || "avatar")}" referrerpolicy="no-referrer" />`
      : escapeHTML(getInitials(user?.nickname || user?.account || "AP"));
  }
  renderTopbarAvatar();
  renderProfileFavorites();
}

function updateProfilePreviewFromInputs() {
  if (!profileAvatarPreview) return;
  const nickname = profileNickname?.value || currentUser()?.nickname || currentUser()?.account || "AP";
  const avatar = safeImageUrl(profileAvatar?.value || "");
  profileAvatarPreview.innerHTML = avatar
    ? `<img src="${escapeHTML(avatar)}" alt="${escapeHTML(nickname)}" referrerpolicy="no-referrer" />`
    : escapeHTML(getInitials(nickname));
  if (topbarAvatar) {
    topbarAvatar.innerHTML = avatar
      ? `<img src="${escapeHTML(avatar)}" alt="${escapeHTML(nickname)}" referrerpolicy="no-referrer" />`
      : escapeHTML(getInitials(nickname));
  }
}

function renderTopbarAvatar() {
  if (!topbarAvatar) return;
  const user = currentUser();
  const name = user?.nickname || user?.account || "AP";
  const avatar = safeImageUrl(user?.avatar);
  topbarAvatar.innerHTML = avatar
    ? `<img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)}" referrerpolicy="no-referrer" />`
    : escapeHTML(getInitials(name));
}

function renderProfileFavorites() {
  if (!profileFavoritesGrid) return;
  const favoriteShots = shots.filter((shot) => state.favorites.has(shot.id)).slice(0, 9);
  if (!favoriteShots.length) {
    profileFavoritesGrid.innerHTML = `<p class="profile-empty">还没有收藏，点作品卡片上的书签即可加入。</p>`;
    return;
  }
  profileFavoritesGrid.innerHTML = favoriteShots
    .map((shot) => `
      <button class="profile-favorite-card" type="button" data-profile-favorite="${escapeHTML(shot.id)}">
        <img src="${escapeHTML(shot.image)}" alt="${escapeHTML(shot.title)}" referrerpolicy="no-referrer" />
        <span>${escapeHTML(shot.title)}</span>
      </button>
    `)
    .join("");
}

function setAuthMode(mode) {
  authState.mode = mode === "register" ? "register" : "login";
  const isRegister = authState.mode === "register";
  if (loginNicknameField) loginNicknameField.hidden = !isRegister;
  if (loginNickname) loginNickname.required = isRegister;
  if (loginSubmitText) loginSubmitText.textContent = isRegister ? "创建账号" : "继续";
  if (authModeToggle) authModeToggle.textContent = isRegister ? "已有账号，去登录" : "注册新账号";
  if (loginError) loginError.textContent = "";
}

function normalizeProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const url = new URL(withProtocol);
    return url.href.replace(/\/$/, "");
  } catch {
    return raw;
  }
}

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function getSavedTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function applyTheme(theme = getSavedTheme()) {
  const isDark = theme === "dark";
  document.body.classList.toggle("theme-dark", isDark);
  if (themeToggle) themeToggle.checked = isDark;
}

function setTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}

function isAuthenticated() {
  if (authState.serverAvailable) return authState.authenticated;
  return localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}

function applyAuthState() {
  const authenticated = isAuthenticated();
  document.body.classList.toggle("auth-locked", !authenticated);
  if (loginScreen) loginScreen.hidden = authenticated;
  if (appShell) appShell.hidden = !authenticated;
  if (!authenticated) {
    window.setTimeout(() => loginAccount?.focus(), 60);
  }
  refreshIcons();
}

function signIn(account, password) {
  if (account === AUTH_ACCOUNT && password === AUTH_PASSWORD) {
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    if (loginError) loginError.textContent = "";
    applyAuthState();
    showToast("欢迎进入 ArtBee PicBee");
    return true;
  }
  if (loginError) loginError.textContent = "账号或密码不正确";
  loginPassword?.select();
  return false;
}

function signOut() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  if (loginPassword) loginPassword.value = "";
  applyAuthState();
}

async function hydrateSession() {
  try {
    const response = await fetch(SESSION_API, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (response.status === 404) throw new Error("session api unavailable");
    const payload = await response.json().catch(() => ({}));
      authState.serverAvailable = response.ok;
    authState.authenticated = Boolean(payload.authenticated);
    authState.account = payload.account || "";
    authState.user = payload.user || null;
  } catch {
    authState.serverAvailable = false;
    authState.authenticated = false;
    authState.account = "";
    authState.user = null;
  } finally {
    authState.checked = true;
    applyAuthState();
    updateProfileForm();
  }
}

async function signIn(account, password) {
  if (!authState.checked) await hydrateSession();

  if (authState.serverAvailable) {
    try {
      const response = await fetch(LOGIN_API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ account, password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "账号或密码不正确");
      }

      authState.authenticated = true;
      authState.account = payload.account || account;
      authState.user = payload.user || { account: authState.account, nickname: authState.account, avatar: "", email: "", bio: "" };
      if (loginError) loginError.textContent = "";
      applyAuthState();
      updateProfileForm();
      await hydrateLibraryBackup();
      if (shots.length > 0) scheduleLibraryBackup();
      renderAll();
      showToast("欢迎进入 ArtBee PicBee");
      return true;
    } catch (error) {
      if (loginError) loginError.textContent = error.message || "账号或密码不正确";
      loginPassword?.select();
      return false;
    }
  }

  if (account === AUTH_ACCOUNT && password === AUTH_PASSWORD) {
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    authState.user = loadLocalProfile();
    if (loginError) loginError.textContent = "";
    applyAuthState();
    updateProfileForm();
    await hydrateLibraryBackup();
    if (shots.length > 0) scheduleLibraryBackup();
    renderAll();
    showToast("欢迎进入 ArtBee PicBee");
    return true;
  }

  if (loginError) loginError.textContent = "账号或密码不正确";
  loginPassword?.select();
  return false;
}

async function registerAccount(account, password, nickname) {
  if (!authState.checked) await hydrateSession();
  if (!authState.serverAvailable) {
    if (loginError) loginError.textContent = "注册需要启动可部署版服务器";
    return false;
  }

  try {
    const response = await fetch(REGISTER_API, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ account, password, nickname })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "注册失败");
    }
    authState.authenticated = true;
    authState.account = payload.account || account;
    authState.user = payload.user || { account, nickname: nickname || account, avatar: "", email: "", bio: "" };
    if (loginError) loginError.textContent = "";
    applyAuthState();
    updateProfileForm();
    await hydrateLibraryBackup();
    renderAll();
    showToast("账号已创建，欢迎进入 ArtBee PicBee");
    return true;
  } catch (error) {
    if (loginError) loginError.textContent = error.message || "注册失败";
    loginPassword?.select();
    return false;
  }
}

async function signOut() {
  if (authState.serverAvailable) {
    try {
      await fetch(LOGOUT_API, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" }
      });
    } catch {}
    authState.authenticated = false;
    authState.account = "";
    authState.user = null;
  }
  localStorage.removeItem(AUTH_STORAGE_KEY);
  if (loginPassword) loginPassword.value = "";
  applyAuthState();
  updateProfileForm();
}

function readStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function readBestStorageArray(keys) {
  let best = { key: "", items: [] };
  for (const key of keys) {
    const value = readStorageJson(key, []);
    if (Array.isArray(value) && value.length > best.items.length) {
      best = { key, items: value };
    }
  }
  return best;
}

function normalizeStoredShot(shot) {
  if (!shot || typeof shot !== "object" || !shot.id || !shot.image) return null;
  const tags = Array.isArray(shot.tags) ? shot.tags : [];
  const normalized = { title: shot.title || "", tags };
  const hasDetailImage = Boolean(shot.detailImage && shot.detailImage !== "#" && shot.detailImage !== shot.image);
  const { detailImageChecked, ...rest } = shot;
  return {
    ...rest,
    type: inferType(normalized),
    composition: inferComposition(normalized),
    mood: inferMood(normalized),
    tags,
    palette: Array.isArray(shot.palette) ? shot.palette : ["#111417", "#2f3d45", "#879198", "#d8d2c4"],
    analysis: shot.analysis || { subject: "", geometry: [], reuse: "" },
    collectedAt: shot.collectedAt || null,
    detailImageLookupVersion: hasDetailImage ? DETAIL_IMAGE_LOOKUP_VERSION : 0,
    detailImageUnavailable: hasDetailImage ? false : Boolean(shot.detailImageUnavailable && shot.detailImageLookupVersion === DETAIL_IMAGE_LOOKUP_VERSION)
  };
}

function loadStoredShots() {
  const stored = readBestStorageArray(LEGACY_SHOTS_STORAGE_KEYS);
  const normalized = stored.items.map(normalizeStoredShot).filter(Boolean).slice(0, MAX_STORED_SHOTS);
  if (normalized.length > 0 && stored.key !== SHOTS_STORAGE_KEY) {
    localStorage.setItem(SHOTS_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

function loadStoredFavorites() {
  const stored = readBestStorageArray(LEGACY_FAVORITES_STORAGE_KEYS);
  const favorites = Array.isArray(stored.items) ? stored.items.filter(Boolean) : [];
  if (favorites.length > 0 && stored.key !== FAVORITES_STORAGE_KEY) {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }
  return new Set(favorites);
}

function saveStoredShots() {
  const unique = new Map();
  for (const shot of shots) {
    if (shot?.id && !unique.has(shot.id)) unique.set(shot.id, shot);
  }
  const stored = [...unique.values()].slice(0, MAX_STORED_SHOTS);
  shots.splice(0, shots.length, ...stored);
  localStorage.setItem(SHOTS_STORAGE_KEY, JSON.stringify(stored));
}

function saveStoredFavorites() {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favorites]));
  renderProfileFavorites();
}

function saveScanPage() {
  localStorage.setItem(SCAN_PAGE_STORAGE_KEY, String(Math.max(1, state.scanPage)));
}

function updateSourceCounts() {
  const artstationSource = state.sources.find((source) => source.id === "artstation-environment");
  if (artstationSource) artstationSource.count = shots.length;
}

function persistLibrary() {
  updateSourceCounts();
  saveStoredShots();
  saveStoredFavorites();
  saveScanPage();
  scheduleLibraryBackup();
}

function mergeStoredShots(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const unique = new Map();
  for (const shot of shots) {
    if (shot?.id) unique.set(shot.id, shot);
  }

  let added = 0;
  for (const item of items) {
    const normalized = normalizeStoredShot(item);
    if (!normalized || unique.has(normalized.id)) continue;
    unique.set(normalized.id, normalized);
    added += 1;
  }

  if (added > 0) {
    const merged = [...unique.values()].slice(0, MAX_STORED_SHOTS);
    shots.splice(0, shots.length, ...merged);
    updateSourceCounts();
    saveStoredShots();
  }
  return added;
}

function mergeStoredFavorites(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  let added = 0;
  for (const id of items.filter(Boolean)) {
    if (state.favorites.has(id)) continue;
    state.favorites.add(id);
    added += 1;
  }
  if (added > 0) saveStoredFavorites();
  return added;
}

function scheduleLibraryBackup() {
  window.clearTimeout(libraryBackupTimer);
  libraryBackupTimer = window.setTimeout(saveLibraryBackup, 500);
}

async function saveLibraryBackup() {
  if (!shots.length) return;
  try {
    await fetch(LIBRARY_API, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        updatedAt: new Date().toISOString(),
        scanPage: state.scanPage,
        favorites: [...state.favorites],
        items: shots.slice(0, MAX_STORED_SHOTS)
      })
    });
  } catch {
    // Browser local storage remains the primary store if the local server is not writable.
  }
}

async function hydrateLibraryBackup() {
  try {
    const response = await fetch(LIBRARY_API, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return;
    const payload = await response.json();
    const addedShots = mergeStoredShots(payload.items);
    const addedFavorites = mergeStoredFavorites(payload.favorites);
    if (Number(payload.scanPage) > state.scanPage) {
      state.scanPage = Number(payload.scanPage);
      saveScanPage();
    }
    if (addedShots > 0 || addedFavorites > 0) {
      renderAll();
      showToast(`已从本地备份恢复 ${addedShots} 张采集图`);
    }
  } catch {
    // No backup exists yet.
  }
}

function isCollectedToday(shot) {
  if (!shot?.collectedAt) return false;
  const collected = new Date(shot.collectedAt);
  if (Number.isNaN(collected.getTime())) return false;
  return collected.toDateString() === new Date().toDateString();
}

function formatCount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return compactNumber.format(number);
}

function compactError(message, maxLength = 120) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function stableHash(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function inferType(item) {
  const text = `${item.title || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
  if (/character|people|person|figure|portrait|hero|warrior|traveler|crowd|soldier/.test(text)) return "角色场景";
  if (/sci[- ]?fi|science fiction|space|spaceship|cyberpunk|future|futuristic|robot|mech|alien/.test(text)) return "科幻";
  if (/fantasy|magic|dragon|castle|kingdom|wizard|myth|creature|orc|elf/.test(text)) return "奇幻";
  if (/ruin|ruins|abandoned|destroyed|decay|wreck|broken|overgrown/.test(text)) return "废墟";
  if (/ocean|sea|wave|water|river|lake|harbor|coast|shore|island|waterfall/.test(text)) return "水域";
  if (/sky|cloud|clouds|sunset|sunrise|pylon|floating/.test(text)) return "天空";
  if (/factory|industrial|machine|workshop|engine|garage|hangar|pipeline/.test(text)) return "工业";
  if (/city|urban|street|alley|skyscraper|town|metropolis/.test(text)) return "城市";
  if (/interior|room|hall|corridor|temple|palace/.test(text)) return "室内";
  if (/architecture|building|facade|structure|tower/.test(text)) return "建筑";
  if (/road|vehicle|harbor|station|ship|train/.test(text)) return "交通";
  if (/snow|winter|ice|frozen/.test(text)) return "雪景";
  if (/desert|dune|canyon|sand/.test(text)) return "荒漠";
  if (/forest|mountain|landscape|valley|river|lake|nature/.test(text)) return "自然";
  return "环境设计";
}

function inferComposition(item) {
  const text = `${item.title || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
  if (/silhouette|backlit|back light|rim light/.test(text)) return "剪影";
  if (/aerial|bird|top down|top-down|overhead|isometric/.test(text)) return "俯视";
  if (/low angle|worm|towering|looking up/.test(text)) return "仰视";
  if (/wide shot|panorama|vista|establishing|epic|landscape/.test(text)) return "大远景";
  if (/depth|layer|layers|foreground|middle ground|background/.test(text)) return "层次景深";
  if (/center|central|centered/.test(text)) return "中心构图";
  if (/pattern|repeat|repetition|rhythm|tile/.test(text)) return "重复图形";
  if (/sky|cloud|clouds|open sky/.test(text)) return "大面积天空";
  if (/symmetry|symmetric|mirror|reflection/.test(text)) return "对称";
  if (/one point|perspective|vanishing|corridor|street|road/.test(text)) return "单点透视";
  if (/frame|window|door|gate|cave|arch/.test(text)) return "框中框";
  if (/path|leading|line|trail|track/.test(text)) return "引导线";
  if (/curve|s curve|coast|river/.test(text)) return "S 曲线";
  if (/minimal|negative|skyline/.test(text)) return "极简负形";
  if (/light|shadow|chiaroscuro|noir/.test(text)) return "明暗分区";
  if (/foreground|low angle/.test(text)) return "前景引导";
  if (/pattern|rhythm|vertical/.test(text)) return "垂直节奏";
  return "三分法";
}

function inferMood(item) {
  const text = `${item.title || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
  if (/epic|grand|monumental|cinematic|trailer/.test(text)) return "史诗";
  if (/peaceful|quiet|calm|serene|monk|garden/.test(text)) return "宁静";
  if (/dark|gloom|moody|abandoned|ruin|horror/.test(text)) return "阴郁";
  if (/warm|sunset|sunrise|golden|orange/.test(text)) return "暖光";
  if (/cold|blue|ice|snow|winter/.test(text)) return "冷色";
  if (/night|neon|cyberpunk/.test(text)) return "夜景";
  if (/snow|winter|ice/.test(text)) return "寒冷";
  if (/fog|mist|haze/.test(text)) return "雾气";
  if (/sunset|dusk|golden/.test(text)) return "黄昏";
  if (/desert|sun|warm/.test(text)) return "炽热";
  if (/rain|wet/.test(text)) return "潮湿";
  return "概念";
}

function artstationItemToShot(item, index) {
  const url = safeUrl(item.url || item.permalink || "https://www.artstation.com");
  const title = item.title || "Untitled ArtStation Project";
  const artist = item.artist || item.username || "ArtStation artist";
  const likes = Number(item.likes || 0);
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean).slice(0, 8) : [];
  const normalized = { title, tags };
  const type = inferType(normalized);
  const composition = inferComposition(normalized);
  const mood = inferMood(normalized);
  const ratio = item.width && item.height ? `${Number(item.width) || 4} / ${Number(item.height) || 5}` : "4 / 5";

  return {
    id: `artstation-${item.id || stableHash(url)}`,
    title,
    image: safeUrl(item.coverUrl || item.image || ""),
    detailImage: safeUrl(item.fullImageUrl || item.fullImage || item.detailImage || item.imageUrl || item.image || item.coverUrl || ""),
    source: `ArtStation / ${artist}`,
    sourceUrl: url,
    collectedAt: new Date().toISOString(),
    artist,
    license: "ArtStation public preview",
    type,
    composition,
    mood,
    likes,
    score: likes,
    recent: 100 - Math.min(index, 99),
    depth: Math.max(70, Math.min(98, Math.round(72 + Math.log10(Math.max(likes, 1)) * 7))),
    ratio,
    angle: composition === "单点透视" ? "-9deg" : composition === "对称" ? "0deg" : "-15deg",
    angle2: composition === "单点透视" ? "9deg" : "16deg",
    palette: ["#111417", "#2f3d45", "#879198", "#d8d2c4"],
    tags,
    analysis: {
      subject: `${artist} 的公开预览作品，已按 ArtStation 返回的点赞数筛到 ${formatCount(likes)} 赞。这里索引的是预览图和原作链接，不保存原图。`,
      geometry: [
        `自动归类为「${composition}」构图，可进入原作页核对完整项目。`,
        `主题归类为「${type}」，适合放入环境概念参考板。`,
        "后续可接视觉模型进一步识别主体位置、透视线和色彩采样。"
      ],
      reuse: "适合做灵感索引、构图学习和参考板整理；正式使用图片前请查看原作者授权。"
    }
  };
}

function manualImportToShot(item) {
  const sourceUrl = safeUrl(item.sourceUrl);
  const imageUrl = safeImageUrl(item.imageUrl);
  const title = String(item.title || "").trim() || "Manual ArtStation Reference";
  const artist = String(item.artist || "").trim() || "ArtStation artist";
  const tags = ["手动导入", "环境设计"];
  const normalized = { title, tags };
  const type = inferType(normalized);
  const composition = inferComposition(normalized);
  const mood = inferMood(normalized);

  return {
    id: `manual-${stableHash(`${sourceUrl}|${imageUrl}|${title}`)}`,
    title,
    image: imageUrl,
    detailImage: imageUrl,
    source: `ArtStation / ${artist}`,
    sourceUrl,
    collectedAt: new Date().toISOString(),
    artist,
    license: "Manual ArtStation reference",
    type,
    composition,
    mood,
    likes: 0,
    score: 0,
    recent: 100,
    depth: 86,
    ratio: "4 / 5",
    angle: composition === "单点透视" ? "-9deg" : composition === "对称" ? "0deg" : "-15deg",
    angle2: composition === "单点透视" ? "9deg" : "16deg",
    palette: ["#111417", "#2f3d45", "#879198", "#d8d2c4"],
    tags,
    analysis: {
      subject: `${artist} 的手动导入参考。这里保存的是你提供的图片地址和原作链接，不保存原图文件。`,
      geometry: [
        `自动归类为「${composition}」构图，可进入原作页核对完整项目。`,
        `主题归类为「${type}」，适合放入环境概念参考板。`,
        "如果需要更准确的标签，可以后续补充标题关键词或在原作页核对。"
      ],
      reuse: "适合做灵感索引、构图学习和参考板整理；正式使用图片前请查看原作者授权。"
    }
  };
}

function addImportedShot(shot) {
  const existingIndex = shots.findIndex((item) => item.id === shot.id || item.sourceUrl === shot.sourceUrl);
  if (existingIndex >= 0) {
    shots.splice(existingIndex, 1);
  }
  shots.unshift(shot);
  state.selectedId = shot.id;
  revealFreshResults(shot.id);
  persistLibrary();
  renderAll();
  return existingIndex >= 0;
}

function handleManualImport(event) {
  event.preventDefault();
  const sourceUrl = safeUrl(manualSourceUrl?.value || "");
  const rawImageUrl = String(manualImageUrl?.value || "").trim();
  const imageUrl = safeImageUrl(rawImageUrl);
  if (sourceUrl === "#") {
    showToast("请先粘贴 ArtStation 作品链接。");
    manualSourceUrl?.focus();
    return;
  }
  if (!imageUrl) {
    showToast("请粘贴图片地址。可以在浏览器里右键图片，选择复制图片地址。");
    manualImageUrl?.focus();
    return;
  }

  const shot = manualImportToShot({
    sourceUrl,
    imageUrl,
    title: manualTitle?.value,
    artist: manualArtist?.value
  });
  const updated = addImportedShot(shot);
  manualImportForm?.reset();
  showToast(updated ? "已更新这张参考图。" : "已导入 1 张参考图。");
}

function decodeImportPayload(value) {
  try {
    const json = decodeURIComponent(escape(atob(value)));
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(value));
    } catch {
      return null;
    }
  }
}

function handleBookmarkletImport() {
  const match = window.location.hash.match(/^#import=([^&]+)/);
  if (!match) return false;
  const payload = decodeImportPayload(match[1]);
  window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  if (!payload) {
    showToast("没有读到可导入的页面信息。");
    return false;
  }

  const sourceUrl = safeUrl(payload.sourceUrl || payload.url || "");
  const imageUrl = safeImageUrl(payload.imageUrl || payload.image || payload.coverUrl || "");
  if (sourceUrl === "#" || !imageUrl) {
    if (sourceUrl !== "#" && manualSourceUrl) manualSourceUrl.value = sourceUrl;
    if (manualTitle) manualTitle.value = payload.title || "";
    if (manualArtist) manualArtist.value = payload.artist || "";
    showToast("已读取页面信息，但没有找到图片地址；请手动补一张图片地址。");
    return false;
  }

  const updated = addImportedShot(
    manualImportToShot({
      sourceUrl,
      imageUrl,
      title: payload.title,
      artist: payload.artist
    })
  );
  showToast(updated ? "已从浏览器书签更新参考图。" : "已从浏览器书签导入 1 张参考图。");
  return true;
}

function buildCollectorBookmarklet() {
  const appUrl = window.location.href.split("#")[0];
  const source = `(() => {
    const app = ${JSON.stringify(appUrl)};
    const meta = (key) => document.querySelector(\`meta[property="\${key}"],meta[name="\${key}"]\`)?.content?.trim() || "";
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const images = Array.from(document.images || [])
      .map((img) => ({
        src: img.currentSrc || img.src || "",
        area: (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0)
      }))
      .filter((item) => /^https?:\\/\\//i.test(item.src) && item.area > 24000)
      .sort((a, b) => b.area - a.area);
    const title = clean(meta("og:title") || meta("twitter:title") || document.querySelector("h1")?.innerText || document.title).replace(/\\s*-\\s*ArtStation\\s*$/i, "");
    const artistCandidates = [
      meta("article:author"),
      meta("twitter:creator"),
      document.querySelector('[class*="artist"] a, [class*="user"] a, a[href^="/"][class*="name"]')?.innerText
    ];
    const artist = clean(artistCandidates.find(Boolean) || "");
    const imageUrl = meta("og:image") || meta("twitter:image") || images[0]?.src || "";
    const payload = { sourceUrl: location.href, title, artist, imageUrl };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    window.open(app.split("#")[0] + "#import=" + encodeURIComponent(encoded), "artbee_picbee");
  })();`;
  return `javascript:${source.replace(/\s+/g, " ")}`;
}

async function copyCollectorBookmarklet() {
  const bookmarklet = buildCollectorBookmarklet();
  try {
    await navigator.clipboard.writeText(bookmarklet);
    showToast("已复制书签脚本。新建一个书签，把地址粘进去即可。");
  } catch {
    showToast("复制失败，可以直接拖动“收进 ArtBee”到书签栏。");
  }
}

collectorBookmarklet?.addEventListener("click", (event) => {
  if (collectorBookmarklet.href === "#") event.preventDefault();
});

function updateCollectorBookmarklet() {
  if (!collectorBookmarklet) return;
  collectorBookmarklet.href = buildCollectorBookmarklet();
}

function getAspectBucket(shot) {
  const [width, height] = getAspectParts(shot);
  const ratio = width / height;
  if (ratio >= 1.18) return "横构图";
  if (ratio <= 0.82) return "竖构图";
  return "近方形";
}

function getAspectParts(shot) {
  const [rawWidth, rawHeight] = String(shot?.ratio || "1 / 1")
    .split("/")
    .map((part) => Number(part.trim()));
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1;
  return [width, height];
}

function getDetailAspectClass(shot) {
  const [width, height] = getAspectParts(shot);
  return getAspectClassFromSize(width, height);
}

function getAspectClassFromSize(width, height) {
  const ratio = width / height;
  if (ratio >= 1.18) return "is-landscape";
  if (ratio <= 0.82) return "is-portrait";
  return "is-square";
}

function applyLoadedImageAspect(image) {
  const width = image?.naturalWidth || 0;
  const height = image?.naturalHeight || 0;
  if (!width || !height) return;
  const hero = image.closest(".inspector-hero");
  hero?.style.setProperty("--detail-aspect", `${width} / ${height}`);
  hero?.style.setProperty("--detail-ratio", String(width / height));
  inspectorContent.classList.remove("is-landscape", "is-portrait", "is-square");
  inspectorContent.classList.add(getAspectClassFromSize(width, height));
}

function getFilterState(overrides = {}) {
  return {
    type: state.type,
    composition: state.composition,
    mood: state.mood,
    ratio: state.ratio,
    minLikes: state.minLikes,
    favoritesOnly: state.favoritesOnly,
    query: state.query,
    ...overrides
  };
}

function shotMatchesFilters(shot, filters = getFilterState()) {
  const query = String(filters.query || "").trim().toLowerCase();
  const matchesType = filters.type === "全部" || shot.type === filters.type;
  const matchesComposition = filters.composition === "全部" || shot.composition === filters.composition;
  const matchesMood = filters.mood === "全部" || shot.mood === filters.mood;
  const matchesRatio = filters.ratio === "全部" || getAspectBucket(shot) === filters.ratio;
  const matchesLikes = Number(shot.likes || 0) >= Number(filters.minLikes || 0);
  const matchesFavorite = !filters.favoritesOnly || state.favorites.has(shot.id);
  const haystack = [shot.title, shot.artist, shot.source, shot.type, shot.composition, shot.mood, ...shot.tags].join(" ").toLowerCase();
  const matchesQuery = !query || haystack.includes(query);
  return matchesType && matchesComposition && matchesMood && matchesRatio && matchesLikes && matchesFavorite && matchesQuery;
}

function getFacetCount(facetName, value) {
  return shots.filter((shot) => shotMatchesFilters(shot, getFilterState({ [facetName]: value }))).length;
}

function renderFilterChip({ label, value = label, facetName, dataName, active }) {
  const count = getFacetCount(facetName, value);
  const isAll = value === "全部" || value === 0;
  const disabled = !active && !isAll && count === 0;
  return `
    <button class="filter-chip ${active ? "active" : ""}" type="button" data-${dataName}="${escapeHTML(value)}" ${disabled ? "disabled" : ""}>
      <span class="chip-label">${escapeHTML(label)}</span>
      <span class="chip-count">${count}</span>
    </button>
  `;
}

function getActiveFilterLabels() {
  const labels = [];
  if (state.type !== "全部") labels.push(state.type);
  if (state.composition !== "全部") labels.push(state.composition);
  if (state.mood !== "全部") labels.push(state.mood);
  if (state.ratio !== "全部") labels.push(state.ratio);
  if (state.minLikes > 0) labels.push(`${formatCount(state.minLikes)}赞以上`);
  if (state.favoritesOnly) labels.push("仅收藏");
  return labels;
}

function updateFilterDock() {
  const open = Boolean(state.filtersOpen);
  filterDock?.classList.toggle("collapsed", !open);
  if (toggleFiltersButton) {
    toggleFiltersButton.setAttribute("aria-expanded", String(open));
    toggleFiltersButton.innerHTML = open
      ? `${icon("chevron-up")}<span>收起筛选</span>`
      : `${icon("sliders-horizontal")}<span>展开筛选</span>`;
  }
}

function resetFilters() {
  state.type = "全部";
  state.composition = "全部";
  state.mood = "全部";
  state.ratio = "全部";
  state.minLikes = 0;
  state.query = "";
  state.favoritesOnly = false;
  searchInput.value = "";
  profileFavoritesButton?.classList.remove("active");
}

function renderFilters() {
  typeFilterWrap.innerHTML = typeFilters
    .map((item) => renderFilterChip({ label: item, facetName: "type", dataName: "type", active: state.type === item }))
    .join("");

  compositionFilterWrap.innerHTML = compositionFilters
    .map((item) => renderFilterChip({ label: item, facetName: "composition", dataName: "composition", active: state.composition === item }))
    .join("");

  moodFilterWrap.innerHTML = moodFilters
    .map((item) => renderFilterChip({ label: item, facetName: "mood", dataName: "mood", active: state.mood === item }))
    .join("");

  ratioFilterWrap.innerHTML = ratioFilters
    .map((item) => renderFilterChip({ label: item, facetName: "ratio", dataName: "ratio", active: state.ratio === item }))
    .join("");

  likesFilterWrap.innerHTML = likesFilters
    .map((item) => renderFilterChip({ label: item.label, value: item.value, facetName: "minLikes", dataName: "min-likes", active: state.minLikes === item.value }))
    .join("");

  const activeLabels = getActiveFilterLabels();
  if (filterSummary) {
    filterSummary.textContent = activeLabels.length ? activeLabels.join(" / ") : "全部作品";
  }
  updateFilterDock();
}

function getFilteredShots() {
  const filtered = shots.filter((shot) => shotMatchesFilters(shot));

  return filtered.sort((a, b) => Number(b[state.sort] || 0) - Number(a[state.sort] || 0));
}

function sortLabel(key) {
  return {
    score: "点赞数",
    recent: "采集顺序",
    depth: "空间感"
  }[key];
}

function renderGallery() {
  updateSourceCounts();
  const filtered = getFilteredShots();
  gallery.innerHTML = filtered
    .map((shot) => {
      const active = state.selectedId === shot.id;
      return `
        <article class="shot-card ${active ? "active" : ""}" data-shot="${escapeHTML(shot.id)}">
          <img src="${escapeHTML(shot.image)}" alt="${escapeHTML(shot.title)}" loading="lazy" referrerpolicy="no-referrer" />
        </article>
      `;
    })
    .join("");

  emptyState.hidden = filtered.length !== 0;
  const emptyTitle = emptyState.querySelector("strong");
  const emptyCopy = emptyState.querySelector("span");
  if (emptyTitle && emptyCopy) {
    emptyTitle.textContent = shots.length ? "没有匹配结果" : "等待 ArtStation 采集";
    emptyCopy.textContent = shots.length ? "换一个关键词或构图方式试试。" : "点击开始采集，索引 1000 赞以上的环境概念作品。";
  }

  resultLabel.textContent = shots.length
    ? `${filtered.length} 张匹配画面，按${sortLabel(state.sort)}排序`
    : "尚未采集，点击开始采集连接 ArtStation";
  document.querySelector("#totalCount").textContent = shots.length;
  document.querySelector("#todayCount").textContent = shots.filter(isCollectedToday).length;
  document.querySelector("#sourceCount").textContent = state.sources.filter((source) => source.enabled).length;
  document.querySelector("#savedCount").textContent = state.favorites.size;
  refreshIcons();
}

function toggleFavoriteShot(id) {
  if (!id) return;
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    showToast("已取消收藏");
  } else {
    state.favorites.add(id);
    showToast("已加入参考板");
  }
  saveStoredFavorites();
  renderAll();
}

function renderSources() {
  updateSourceCounts();
  sourceList.innerHTML = state.sources
    .map(
      (source) => `
        <article class="source-item">
          <div class="source-main">
            <span class="source-name" title="${escapeHTML(source.name)}">${escapeHTML(source.name)}</span>
            <label class="switch" title="启用来源">
              <input type="checkbox" data-source="${escapeHTML(source.id)}" ${source.enabled ? "checked" : ""} />
              <span></span>
            </label>
          </div>
          <div class="source-meta">
            <span>${escapeHTML(source.type)}</span>
            <span>${source.count} 条索引</span>
          </div>
        </article>
      `
    )
    .join("");
}

function renderQueue() {
  if (state.queue.length === 0) {
    queueList.innerHTML = `
      <article class="queue-item waiting">
        <div class="queue-main">
          <span class="queue-name">等待采集</span>
          <span class="queue-meta">待命</span>
        </div>
        <div class="source-meta">ArtStation 1000+ likes</div>
        <div class="progress"><span style="width:0%"></span></div>
      </article>
    `;
    return;
  }

  queueList.innerHTML = state.queue
    .map(
      (item) => {
        const status = item.status || "running";
        const label = {
          running: `${item.progress}%`,
          complete: "完成",
          failed: "失败",
          waiting: "待命"
        }[status] || `${item.progress}%`;
        const width = status === "failed" || status === "complete" ? 100 : Math.max(0, Math.min(100, item.progress));
        return `
        <article class="queue-item ${escapeHTML(status)}">
          <div class="queue-main">
            <span class="queue-name">${escapeHTML(item.name)}</span>
            <span class="queue-meta">${escapeHTML(label)}</span>
          </div>
          <div class="source-meta">${escapeHTML(item.meta)}</div>
          <div class="progress" aria-label="${escapeHTML(item.name)}">
            <span style="width:${width}%"></span>
          </div>
        </article>
      `;
      }
    )
    .join("");
}

function formatCommentTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderCommentsList(shotId) {
  if (state.loadingComments.has(shotId)) {
    return `<p class="comment-empty">正在加载评论...</p>`;
  }
  const comments = state.comments.get(shotId) || [];
  if (!comments.length) {
    return `<p class="comment-empty">还没有评论，留下第一条构图观察。</p>`;
  }
  return comments
    .map((comment) => `
      <article class="comment-item">
        ${avatarHTML(comment, "comment-avatar")}
        <div class="comment-main">
          <div class="comment-meta">
            <strong>${escapeHTML(comment.nickname || comment.account || "PicBee User")}</strong>
            <span>${escapeHTML(formatCommentTime(comment.createdAt))}</span>
          </div>
          <p class="comment-text">${escapeHTML(comment.text)}</p>
        </div>
      </article>
    `)
    .join("");
}

function updateCommentList(shotId) {
  const list = document.querySelector(`[data-comment-list="${CSS.escape(shotId)}"]`);
  if (list) list.innerHTML = renderCommentsList(shotId);
}

async function loadComments(shotId) {
  if (!shotId || !authState.serverAvailable || !isAuthenticated()) return;
  state.loadingComments.add(shotId);
  updateCommentList(shotId);
  try {
    const response = await fetch(`${COMMENTS_API}?shotId=${encodeURIComponent(shotId)}`, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.ok) {
      state.comments.set(shotId, Array.isArray(payload.comments) ? payload.comments : []);
    }
  } catch {
    state.comments.set(shotId, state.comments.get(shotId) || []);
  } finally {
    state.loadingComments.delete(shotId);
    updateCommentList(shotId);
  }
}

async function submitComment(shotId, text) {
  if (!authState.serverAvailable) {
    showToast("评论需要启动可部署版服务器");
    return false;
  }
  const response = await fetch(COMMENTS_API, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ shotId, text })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "评论发送失败");
  }
  const comments = state.comments.get(shotId) || [];
  comments.push(payload.comment);
  state.comments.set(shotId, comments);
  updateCommentList(shotId);
  return true;
}

async function saveProfile(nickname, avatar) {
  const profile = {
    account: authState.account || AUTH_ACCOUNT,
    nickname: String(nickname || "").trim(),
    avatar: safeImageUrl(avatar),
    email: String(profileEmail?.value || "").trim(),
    bio: String(profileBio?.value || "").trim()
  };

  if (authState.serverAvailable && isAuthenticated()) {
    const response = await fetch(PROFILE_API, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(profile)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "资料保存失败");
    }
    authState.user = payload.user;
  } else {
    authState.user = profile;
    saveLocalProfile(profile);
  }

  updateProfileForm();
  renderInspector();
  showToast("资料已保存");
}

function renderInspector() {
  const shot = shots.find((item) => item.id === state.selectedId);
  inspectorContent.classList.remove("is-landscape", "is-portrait", "is-square");
  contentGrid?.classList.toggle("inspector-active", Boolean(shot));
  document.body.classList.toggle("detail-open", Boolean(shot));
  inspector.classList.toggle("open", Boolean(shot));
  inspectorEmpty.hidden = Boolean(shot);
  inspectorContent.hidden = !shot;

  if (!shot) return;
  const saved = state.favorites.has(shot.id);
  const [aspectWidth, aspectHeight] = getAspectParts(shot);
  const aspectRatio = aspectWidth / aspectHeight;
  const hasOriginal = hasOriginalDetailImage(shot);
  const detailImage = safeUrl(shot.detailImage && shot.detailImage !== "#" ? shot.detailImage : shot.image);
  inspectorContent.classList.add(getDetailAspectClass(shot));

  inspectorContent.innerHTML = `
    <div class="inspector-hero" style="--detail-aspect:${aspectWidth} / ${aspectHeight}; --detail-ratio:${aspectRatio};">
      ${hasOriginal ? "" : `<span class="detail-image-status">正在获取原图</span>`}
      <img src="${escapeHTML(detailImage)}" alt="${escapeHTML(shot.title)}" referrerpolicy="no-referrer" data-detail-image />
    </div>
    <div class="inspector-body">
      <div class="inspector-title">
        <div class="inspector-title-row">
          <div>
            <h2>${escapeHTML(shot.title)}</h2>
            <div class="license-row">
              <span>${escapeHTML(shot.source)}</span>
              <span>${escapeHTML(shot.license)}</span>
            </div>
          </div>
          <button class="detail-favorite ${saved ? "active" : ""}" type="button" data-detail-favorite="${escapeHTML(shot.id)}" aria-label="${saved ? "取消收藏" : "收藏"}">
            ${icon(saved ? "bookmark-check" : "bookmark")}
            <span>${saved ? "已收藏" : "收藏"}</span>
          </button>
        </div>
        <div class="pill-row">
          ${shot.tags.map((tag) => `<span class="pill">${escapeHTML(tag)}</span>`).join("")}
        </div>
      </div>
      <div class="metric-grid">
        <div class="metric"><strong>${formatCount(shot.likes)}</strong><span>赞数</span></div>
        <div class="metric"><strong>${shot.depth}</strong><span>空间感</span></div>
        <div class="metric"><strong>${shot.recent}</strong><span>新鲜度</span></div>
      </div>
      <section class="analysis-card">
        <h3>来源</h3>
        <p>${escapeHTML(shot.analysis.subject)}</p>
        <a class="external-link" href="${escapeHTML(shot.sourceUrl)}" target="_blank" rel="noreferrer">${icon("external-link")} 在 ArtStation 打开</a>
      </section>
      <section class="analysis-card">
        <h3>构图骨架</h3>
        <ul class="analysis-list">
          ${shot.analysis.geometry.map((line) => `<li>${escapeHTML(line)}</li>`).join("")}
        </ul>
      </section>
      <section class="analysis-card">
        <h3>复用方向</h3>
        <p>${escapeHTML(shot.analysis.reuse)}</p>
      </section>
      <section class="analysis-card">
        <h3>色彩占位</h3>
        <div class="palette">
          ${shot.palette.map((color) => `<span class="swatch" style="background:${escapeHTML(color)}" title="${escapeHTML(color)}"></span>`).join("")}
        </div>
      </section>
      <section class="analysis-card comment-card">
        <h3>评论区</h3>
        <div class="comment-list" id="commentList" data-comment-list="${escapeHTML(shot.id)}">
          ${renderCommentsList(shot.id)}
        </div>
        <form class="comment-form" data-comment-form="${escapeHTML(shot.id)}">
          <textarea name="comment" maxlength="500" placeholder="写下你的看法、用途或构图观察"></textarea>
          <button class="primary-button full" type="submit">
            ${icon("send")}
            <span>发表评论</span>
          </button>
        </form>
      </section>
    </div>
  `;
  refreshIcons();
  const detailImageElement = inspectorContent.querySelector("[data-detail-image]");
  detailImageElement?.addEventListener("load", () => applyLoadedImageAspect(detailImageElement), { once: true });
  if (detailImageElement?.complete) applyLoadedImageAspect(detailImageElement);
  loadComments(shot.id);
  ensureOriginalDetailImage(shot);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function updateScanButton(progress = state.scanProgress) {
  const button = document.querySelector("#scanButton");
  if (!button) return;

  button.disabled = state.isScanning;
  button.classList.toggle("scanning", state.isScanning);
  button.innerHTML = state.isScanning
    ? `${icon("loader-2")}<span>采集中 ${progress}%</span>`
    : `${icon("radar")}<span>开始采集</span>`;
  refreshIcons();
}

function updateSortControls() {
  document.querySelectorAll("[data-sort]").forEach((item) => {
    item.classList.toggle("active", item.dataset.sort === state.sort);
  });
}

function revealFreshResults(firstNewId) {
  resetFilters();
  state.sort = "recent";
  state.selectedId = firstNewId;
  updateSortControls();
}

function getApiBaseCandidates() {
  const candidates = [API_BASE, ""];
  const isLocalHost = /^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname);
  if (window.location.protocol === "file:" || isLocalHost) {
    candidates.push(...FALLBACK_API_BASES);
  }
  return [...new Set(candidates.map((base) => String(base || "").replace(/\/$/, "")))];
}

function buildScanApiUrl(base = API_BASE) {
  const params = new URLSearchParams({
    minLikes: String(MIN_LIKES),
    limit: String(SCAN_BATCH_SIZE),
    page: String(state.scanPage)
  });
  if (state.proxyUrl.trim()) {
    params.set("proxy", state.proxyUrl.trim());
  }
  return `${base}/api/scan-artstation?${params.toString()}`;
}

function buildProjectApiUrl(shot, base = API_BASE) {
  const params = new URLSearchParams({
    url: shot.sourceUrl || shot.id || ""
  });
  if (state.proxyUrl.trim()) {
    params.set("proxy", state.proxyUrl.trim());
  }
  return `${base}/api/artstation-project?${params.toString()}`;
}

function describeFetchFailure(error, base) {
  const target = base || "当前页面后端";
  if (error?.name === "AbortError") return "采集超时：本轮超过 4 分钟";
  if (error instanceof TypeError || /Failed to fetch|NetworkError/i.test(error?.message || "")) {
    return `${target} 无法连接。请确认 ArtBee PicBee 服务器正在运行，常用地址是 ${FALLBACK_API_BASES.join(" 或 ")}`;
  }
  return error?.message || `${target} 请求失败`;
}

async function fetchScanPayload(signal) {
  const errors = [];
  const candidates = getApiBaseCandidates();
  for (const base of candidates) {
    try {
      const response = await fetch(buildScanApiUrl(base), {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 404 && base !== candidates[candidates.length - 1]) {
        errors.push(`${base || "当前页面后端"} 没有采集接口`);
        continue;
      }
      if (response.status === 401) {
        throw new Error("登录状态已失效，请退出后重新登录。");
      }
      if (!response.ok || !payload?.ok) {
        const warnings = Array.isArray(payload?.warnings) ? payload.warnings : [];
        const warningText = `${payload?.message || ""} ${warnings.join(" ")}`;
        const isForbidden = /403|Forbidden|已禁止/i.test(warningText);
        const message = isForbidden
          ? "ArtStation 拒绝了采集请求（403）。代理已经连上，但当前节点或会话被 ArtStation 拦截；请换一个全局节点，或稍后再试。"
          : payload?.message || `采集服务返回 ${response.status}`;
        const detail = !isForbidden && warnings.length ? `；首条错误：${warnings[0]}` : "";
        const proxyHint = state.proxyUrl.trim() ? "" : "；如果浏览器能打开 ArtStation，请在左侧填写 VPN 的 HTTP 代理地址";
        const error = new Error(`${message}${detail}${proxyHint}`);
        error.stopApiFallback = response.status !== 404;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (error?.stopApiFallback) throw error;
      errors.push(describeFetchFailure(error, base));
    }
  }
  throw new Error([...new Set(errors)].slice(0, 3).join("；") || "无法连接采集服务");
}

function hasOriginalDetailImage(shot) {
  return Boolean(shot?.detailImage && shot.detailImage !== "#" && shot.detailImage !== shot.image);
}

async function ensureOriginalDetailImage(shot) {
  const lookupIsCurrent = shot?.detailImageLookupVersion === DETAIL_IMAGE_LOOKUP_VERSION;
  if (!shot || hasOriginalDetailImage(shot) || (lookupIsCurrent && shot.detailImageUnavailable) || state.loadingDetailImages.has(shot.id)) return;
  state.loadingDetailImages.add(shot.id);
  const errors = [];
  try {
    for (const base of getApiBaseCandidates()) {
      try {
        const response = await fetch(buildProjectApiUrl(shot, base), {
          credentials: "include",
          headers: { Accept: "application/json" }
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok || !payload.fullImageUrl) {
          errors.push(payload?.message || `原图接口返回 ${response.status}`);
          continue;
        }
        const nextImage = safeUrl(payload.fullImageUrl);
        shot.detailImageLookupVersion = DETAIL_IMAGE_LOOKUP_VERSION;
        if (!nextImage || nextImage === "#" || nextImage === shot.image) {
          shot.detailImageUnavailable = true;
          saveStoredShots();
          showToast("ArtStation 暂时只返回了预览图，可以点“在 ArtStation 打开”查看原作页。");
          return;
        }
        shot.detailImage = nextImage;
        shot.detailImageUnavailable = false;
        if (payload.width && payload.height) {
          shot.ratio = `${Number(payload.width) || 1} / ${Number(payload.height) || 1}`;
        }
        saveStoredShots();
        persistLibrary();
        if (state.selectedId === shot.id) renderInspector();
        return;
      } catch (error) {
        errors.push(describeFetchFailure(error, base));
      }
    }
    if (state.selectedId === shot.id && errors.length) {
      showToast(`原图加载失败：${compactError(errors[0], 80)}`);
    }
  } finally {
    state.loadingDetailImages.delete(shot.id);
  }
}

async function startScan() {
  if (state.isScanning) {
    showToast("采集任务正在运行，稍等一下。");
    return;
  }

  const artstationSource = state.sources.find((source) => source.id === "artstation-environment");
  if (!artstationSource?.enabled) {
    showToast("先启用 ArtStation 来源，再开始采集。");
    return;
  }

  state.isScanning = true;
  state.scanProgress = 6;
  state.queue = state.queue.filter((item) => item.kind !== "artstation-scan" && item.name !== "ArtStation 实时采集");
  const job = {
    id: `q${Date.now()}`,
    kind: "artstation-scan",
    name: "ArtStation 实时采集",
    progress: state.scanProgress,
    meta: `连接 Environmental Concept Art & Design · ${MIN_LIKES}+ likes`,
    status: "running"
  };

  state.queue.unshift(job);
  state.queue = state.queue.slice(0, 8);
  renderQueue();
  updateScanButton();
  showToast(`正在采集，最多等待 ${Math.round(SCAN_TIMEOUT_MS / 60000)} 分钟。`);

  const progressTimer = window.setInterval(() => {
    state.scanProgress = Math.min(96, state.scanProgress + (state.scanProgress < 70 ? 4 : 1));
    job.progress = state.scanProgress;
    job.meta = state.scanProgress < 70 ? "请求 ArtStation 搜索索引" : "整理搜索结果封面与点赞数";
    renderQueue();
    updateScanButton();
  }, 1200);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SCAN_TIMEOUT_MS);

  try {
    const payload = await fetchScanPayload(controller.signal);

    const incoming = (payload.items || []).map(artstationItemToShot).filter((shot) => shot.image && shot.sourceUrl !== "#");
    const fresh = incoming.filter((shot) => !shots.some((existing) => existing.id === shot.id));

    if (fresh.length > 0) {
      shots.unshift(...fresh);
      state.scanPage = payload.nextPage || state.scanPage + 1;
      persistLibrary();
      revealFreshResults(fresh[0].id);
    } else {
      state.scanPage = payload.nextPage || state.scanPage + 1;
      persistLibrary();
    }

    state.scanProgress = 100;
    job.progress = 100;
    job.status = "complete";
    job.meta = fresh.length
      ? `新增 ${fresh.length} 张 · 已筛 ${MIN_LIKES}+ likes`
      : "本轮没有新的 1000+ 作品";
    renderAll();
    showToast(fresh.length ? `采集完成，新增 ${fresh.length} 张 ArtStation 作品。` : "本轮没有新的匹配作品，下一次会继续翻页。");
  } catch (error) {
    job.progress = 0;
    job.status = "failed";
    job.meta = error.name === "AbortError" ? "采集超时：本轮超过 4 分钟" : compactError(error.message);
    renderAll();
    showToast(error.name === "AbortError" ? "采集超时：ArtStation 搜索接口响应太慢，可以再点一次继续翻页。" : `采集失败：${compactError(error.message, 72)}`);
  } finally {
    window.clearInterval(progressTimer);
    window.clearTimeout(timeout);
    state.isScanning = false;
    state.scanProgress = 0;
    updateScanButton();
    renderQueue();
  }
}

function renderAll() {
  renderFilters();
  renderSources();
  renderQueue();
  renderGallery();
  renderInspector();
  renderTopbarAvatar();
  renderProfileFavorites();
  updateScanButton();
}

typeFilterWrap.addEventListener("click", (event) => {
  const button = event.target.closest("[data-type]");
  if (!button) return;
  state.type = button.dataset.type;
  renderAll();
});

compositionFilterWrap.addEventListener("click", (event) => {
  const button = event.target.closest("[data-composition]");
  if (!button) return;
  state.composition = button.dataset.composition;
  renderAll();
});

moodFilterWrap.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mood]");
  if (!button) return;
  state.mood = button.dataset.mood;
  renderAll();
});

ratioFilterWrap.addEventListener("click", (event) => {
  const button = event.target.closest("[data-ratio]");
  if (!button) return;
  state.ratio = button.dataset.ratio;
  renderAll();
});

likesFilterWrap.addEventListener("click", (event) => {
  const button = event.target.closest("[data-min-likes]");
  if (!button) return;
  state.minLikes = Number(button.dataset.minLikes) || 0;
  renderAll();
});

gallery.addEventListener("click", (event) => {
  const card = event.target.closest("[data-shot]");
  if (!card) return;
  state.selectedId = card.dataset.shot;
  renderAll();
});

sourceList.addEventListener("change", (event) => {
  const input = event.target.closest("[data-source]");
  if (!input) return;
  const source = state.sources.find((item) => item.id === input.dataset.source);
  source.enabled = input.checked;
  renderGallery();
  showToast(input.checked ? "来源已启用" : "来源已暂停");
});

if (proxyInput) {
  proxyInput.value = state.proxyUrl;
}

document.querySelector("#saveProxy").addEventListener("click", () => {
  state.proxyUrl = normalizeProxyUrl(proxyInput.value.trim());
  proxyInput.value = state.proxyUrl;
  localStorage.setItem("framescout.proxyUrl", state.proxyUrl);
  showToast(state.proxyUrl ? `代理已保存：${state.proxyUrl}` : "已清空代理设置");
});

proxyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#saveProxy").click();
  }
});

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderGallery();
});

document.querySelectorAll("[data-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    state.sort = button.dataset.sort;
    updateSortControls();
    renderGallery();
  });
});

profileFavoritesButton?.addEventListener("click", (event) => {
  state.favoritesOnly = !state.favoritesOnly;
  event.currentTarget.classList.toggle("active", state.favoritesOnly);
  profileSheet?.classList.remove("open");
  renderGallery();
});

userProfileButton?.addEventListener("click", () => {
  updateProfileForm();
  renderProfileFavorites();
  profileSheet?.classList.add("open");
  settingsSheet?.classList.remove("open");
});

document.querySelector("#clearFilters").addEventListener("click", () => {
  resetFilters();
  renderAll();
});

document.querySelector("#clearFiltersTop").addEventListener("click", () => {
  resetFilters();
  renderAll();
});

toggleFiltersButton?.addEventListener("click", () => {
  state.filtersOpen = !state.filtersOpen;
  updateFilterDock();
  refreshIcons();
});

document.querySelector("#scanButton").addEventListener("click", startScan);
manualImportForm?.addEventListener("submit", handleManualImport);
copyCollector?.addEventListener("click", copyCollectorBookmarklet);
window.addEventListener("hashchange", handleBookmarkletImport);

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const account = loginAccount?.value.trim() || "";
  const password = loginPassword?.value || "";
  if (authState.mode === "register") {
    await registerAccount(account, password, loginNickname?.value.trim() || account);
  } else {
    await signIn(account, password);
  }
});

authModeToggle?.addEventListener("click", () => {
  setAuthMode(authState.mode === "register" ? "login" : "register");
});

logoutButton?.addEventListener("click", async () => {
  state.selectedId = null;
  await signOut();
});

document.querySelector("#refreshSources").addEventListener("click", () => {
  document.querySelector("#sourceSheet").classList.add("open");
});

document.querySelector("#closeSourceSheet").addEventListener("click", () => {
  document.querySelector("#sourceSheet").classList.remove("open");
});

closeSettingsSheet?.addEventListener("click", () => {
  settingsSheet?.classList.remove("open");
});

closeProfileSheet?.addEventListener("click", () => {
  profileSheet?.classList.remove("open");
});

profileFavoritesGrid?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-profile-favorite]");
  if (!button) return;
  state.selectedId = button.dataset.profileFavorite;
  state.favoritesOnly = false;
  profileFavoritesButton?.classList.remove("active");
  profileSheet?.classList.remove("open");
  renderAll();
});

themeToggle?.addEventListener("change", () => {
  setTheme(themeToggle.checked ? "dark" : "light");
  showToast(themeToggle.checked ? "已切换深色模式" : "已切换浅色模式");
});

profileAvatar?.addEventListener("input", updateProfilePreviewFromInputs);
profileNickname?.addEventListener("input", updateProfilePreviewFromInputs);

profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveProfile(profileNickname?.value || "", profileAvatar?.value || "");
  } catch (error) {
    showToast(error.message || "资料保存失败");
  }
});

inspectorContent?.addEventListener("click", (event) => {
  const favorite = event.target.closest("[data-detail-favorite]");
  if (!favorite) return;
  toggleFavoriteShot(favorite.dataset.detailFavorite);
});

inspectorContent?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  const shotId = form.dataset.commentForm;
  const textarea = form.querySelector("textarea");
  const text = textarea?.value.trim() || "";
  if (!text) {
    showToast("评论内容不能为空");
    return;
  }
  try {
    await submitComment(shotId, text);
    textarea.value = "";
    showToast("评论已发布");
  } catch (error) {
    showToast(error.message || "评论发送失败");
  }
});

document.querySelector("#sourceForm").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#sourceSheet").classList.remove("open");
  showToast("当前采集器已固定为 ArtStation Environmental Concept Art & Design。");
});

document.querySelector("#closeInspector").addEventListener("click", () => {
  state.selectedId = null;
  renderAll();
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    if (button.dataset.view === "sources") {
      document.querySelector("#sourceSheet").classList.add("open");
    } else if (button.dataset.view === "boards") {
      state.favoritesOnly = true;
      profileFavoritesButton?.classList.add("active");
      renderGallery();
      showToast("已切到收藏参考板");
    } else if (button.dataset.view === "settings") {
      profileSheet?.classList.remove("open");
      settingsSheet?.classList.add("open");
    }
  });
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    state.selectedId = null;
    document.querySelector("#sourceSheet").classList.remove("open");
    settingsSheet?.classList.remove("open");
    profileSheet?.classList.remove("open");
    renderAll();
  }
});

setAuthMode("login");
updateProfileForm();
applyTheme();
applyAuthState();
updateSortControls();
updateCollectorBookmarklet();
handleBookmarkletImport();
renderAll();
if (shots.length > 0) scheduleLibraryBackup();
hydrateSession()
  .then(() => hydrateLibraryBackup())
  .then(() => {
    handleBookmarkletImport();
    renderAll();
  });
