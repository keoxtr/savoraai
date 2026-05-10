const feed = document.querySelector("#feed");
const form = document.querySelector("#postForm");
const textarea = document.querySelector("#postText");
const charCount = document.querySelector("#charCount");
const checkedCount = document.querySelector("#checkedCount");
const newPostButton = document.querySelector("#newPostButton");
const friendButton = document.querySelector("#friendButton");
const messageButton = document.querySelector("#messageButton");
const postImage = document.querySelector("#postImage");
const imagePreview = document.querySelector("#imagePreview");
const imagePreviewImg = imagePreview?.querySelector("img");
const removeImageButton = document.querySelector("#removeImageButton");
const avatarImage = document.querySelector("#avatarImage");
const coverImage = document.querySelector("#coverImage");
const galleryImage = document.querySelector("#galleryImage");
const profileAvatar = document.querySelector("#profileAvatar");
const profileCover = document.querySelector("#profileCover");
const galleryGrid = document.querySelector("#galleryGrid");
const authScreen = document.querySelector("#authScreen");
const appShell = document.querySelector("#appShell");
const loginTab = document.querySelector("#loginTab");
const registerTab = document.querySelector("#registerTab");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const authMessage = document.querySelector("#authMessage");
const adminNavButton = document.querySelector("#adminNavButton");
const adminPanel = document.querySelector("#adminPanel");
const closeAdminButton = document.querySelector("#closeAdminButton");
const adminUserCount = document.querySelector("#adminUserCount");
const adminPostCount = document.querySelector("#adminPostCount");
const adminImageCount = document.querySelector("#adminImageCount");
const adminReportCount = document.querySelector("#adminReportCount");
const adminUserList = document.querySelector("#adminUserList");
const adminQueueList = document.querySelector("#adminQueueList");
const profileName = document.querySelector(".profile-title h2");
const postLink = document.querySelector("#postLink");
const postTopic = document.querySelector("#postTopic");
const composerWarning = document.querySelector("#composerWarning");
const globalSearch = document.querySelector("#globalSearch");
const topicChips = document.querySelector("#topicChips");
const notificationText = document.querySelector("#notificationText");
const trustBadgeScore = document.querySelector("#trustBadgeScore");
const trustBadgeBar = document.querySelector("#trustBadgeBar");
const aboutTrustScore = document.querySelector("#aboutTrustScore");
const profileTabs = document.querySelector("#profileTabs");
const tabPanels = document.querySelectorAll(".tab-panel");
const tabGalleryGrid = document.querySelector("#tabGalleryGrid");
const verificationList = document.querySelector("#verificationList");
const themeToggle = document.querySelector("#themeToggle");
const reportDialog = document.querySelector("#reportDialog");
const reportForm = document.querySelector("#reportForm");
const reportReason = document.querySelector("#reportReason");
const reportDetail = document.querySelector("#reportDetail");
const closeReportButton = document.querySelector("#closeReportButton");

let selectedImage = null;
let currentUser = null;
let activeTopic = "Tümü";
let searchTerm = "";
let reportTarget = null;
const galleryImages = [];
const moderationQueue = [
  "Kahve iddiası kesinlik içeriyor",
  "Plastik atık paylaşımı kaynak bekliyor",
  "Görsel bağlamı kontrol edilecek"
];
const storageKey = "savora-users";
const sessionKey = "savora-current-user";
const themeKey = "savora-theme";
const aiUsageKey = "savora-ai-usage";
const dailyAiLimit = 3;

const moderationRules = [
  { type: "Hakaret / taciz", words: ["aptal", "salak", "gerizekalı", "pislik"] },
  { type: "Tehdit", words: ["öldürürüm", "gebertirim", "seni bitiririm", "tehdit"] },
  { type: "Cinsel içerik", words: ["porn", "porno", "çıplak", "cinsel"] },
  { type: "Nefret söylemi", words: ["ırkçı", "nefret", "defolun"] },
  { type: "Spam / dolandırıcılık", words: ["bedava para", "kesin kazanç", "iban gönder", "tıkla kazan"] }
];

function moderateContent(text) {
  const value = normalize(text);
  const match = moderationRules.find((rule) => rule.words.some((word) => value.includes(word)));

  if (!match) {
    return {
      blocked: false,
      reason: "Temiz",
      message: "İçerik topluluk kurallarına uygun görünüyor."
    };
  }

  return {
    blocked: true,
    reason: match.type,
    message: `Bu içerik ${match.type.toLocaleLowerCase("tr-TR")} riski taşıdığı için yayınlanmadı. Lütfen daha saygılı ve kurallara uygun şekilde düzenle.`
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getAiUsageKey() {
  return `${aiUsageKey}-${currentUser?.username || "guest"}`;
}

function getAiUsage() {
  try {
    const usage = JSON.parse(localStorage.getItem(getAiUsageKey()) || "{}");
    return usage.date === todayKey() ? Number(usage.count || 0) : 0;
  } catch {
    return 0;
  }
}

function getRemainingAiChecks() {
  return Math.max(0, dailyAiLimit - getAiUsage());
}

function useAiCheck() {
  const count = getAiUsage() + 1;

  try {
    localStorage.setItem(getAiUsageKey(), JSON.stringify({ date: todayKey(), count }));
  } catch {
    // Kota bilgisi kaydedilemezse sadece mevcut oturumda devam eder.
  }

  return count <= dailyAiLimit;
}

async function fetchJsonWithTimeout(url, options, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        error: true,
        status: response.status,
        message: data.message || data.error || "API yanıt vermedi."
      };
    }

    return data;
  } catch (error) {
    return {
      error: true,
      message: error.name === "AbortError" ? "AI yanıtı zaman aşımına uğradı." : "API bağlantısı kurulamadı."
    };
  } finally {
    clearTimeout(timer);
  }
}

async function moderateContentRemote(text) {
  const response = await fetchJsonWithTimeout("/api/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    }, 5000);

  return response.error ? moderateContent(text) : response;
}

async function verifyPostRemote(post) {
  return fetchJsonWithTimeout("/api/verify-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: post.text,
        link: post.link,
        topic: post.topic,
        postId: post.id || null
      })
    }, 12000);
}

async function analyzeImageRemote(post) {
  if (!post.image) {
    return null;
  }

  return fetchJsonWithTimeout("/api/analyze-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: post.image, text: post.text })
    }, 12000);
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  try {
    localStorage.setItem(themeKey, isDark ? "dark" : "light");
  } catch {
    // Tema seçimi kaydedilemezse sayfa yine seçilen tema ile çalışmaya devam eder.
  }
  document.querySelectorAll('img[src*="savora-logo"]').forEach((logo) => {
    logo.src = isDark ? "assets/savora-logo-dark.svg" : "assets/savora-logo.svg";
  });

  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.innerHTML = `<span aria-hidden="true">${isDark ? "☼" : "◑"}</span>${isDark ? "Aydınlık mod" : "Karanlık mod"}`;
  }
}

function getUsers() {
  let saved = [];

  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    saved = [];
  }

  if (!Array.isArray(saved)) {
    saved = [];
  }

  if (!Array.isArray(saved)) {
    saved = [];
  }

  const hasAdmin = saved.some((user) => user.username === "admin");

  if (!hasAdmin) {
    saved.unshift({
      name: "Savora Admin",
      username: "admin",
      password: "savora123",
      role: "admin"
    });
    saveUsers(saved);
  }

  return saved;
}

function saveUsers(users) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(users));
  } catch {
    showAuthMessage("Tarayıcı kayıt alanı kapalı olduğu için kullanıcı bilgisi saklanamadı.");
  }
}

function showAuthMessage(message, type = "error") {
  if (!authMessage) {
    return;
  }

  authMessage.textContent = message;
  authMessage.className = `auth-message ${type}`;
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  loginTab?.classList.toggle("active", isLogin);
  registerTab?.classList.toggle("active", !isLogin);
  if (loginForm) loginForm.hidden = !isLogin;
  if (registerForm) registerForm.hidden = isLogin;
  showAuthMessage("", "");
}

function applyCurrentUser(user) {
  currentUser = user;
  try {
    localStorage.setItem(sessionKey, user.username);
  } catch {
    // Oturum kaydı kapalıysa kullanıcı bu ziyaret boyunca giriş yapmış kalır.
  }

  if (authScreen) authScreen.hidden = true;
  if (appShell) appShell.hidden = false;
  if (profileName) profileName.textContent = user.name;
  if (adminNavButton) adminNavButton.hidden = user.role !== "admin";

  renderAdminPanel();
  updateTrustBadge();
}

function renderAdminPanel() {
  const users = getUsers();

  if (adminUserCount) adminUserCount.textContent = String(users.length);
  if (adminPostCount) adminPostCount.textContent = String(posts.length);
  if (adminImageCount) adminImageCount.textContent = String(galleryImages.length);
  if (adminReportCount) adminReportCount.textContent = String(moderationQueue.length);

  if (!adminUserList) {
    return;
  }

  adminUserList.innerHTML = "";
  users.forEach((user) => {
    const row = document.createElement("div");
    row.innerHTML = `
      <strong>${escapeHtml(user.name)}</strong>
      <span>@${escapeHtml(user.username)} · ${user.role === "admin" ? "admin" : "üye"}</span>
    `;
    adminUserList.append(row);
  });

  if (adminQueueList) {
    adminQueueList.innerHTML = "";
    moderationQueue.forEach((item) => {
      const row = document.createElement("div");
      row.innerHTML = `<strong>${escapeHtml(item)}</strong><span>AI ön inceleme bekliyor</span>`;
      adminQueueList.append(row);
    });
  }
}

const posts = [
  {
    author: "Ayşe Demir",
    handle: "@ayse",
    initials: "AD",
    text: "Elektrikli araç satışları Türkiye'de son yıllarda hızlı büyüdü; özellikle yerli modeller pazarı etkiledi.",
    createdAt: "12 dk önce",
    image: null,
    topic: "Ekonomi",
    link: "https://example.com/ev-satis-raporu",
    comments: ["Yıl aralığı belirtilirse daha net olur."]
  },
  {
    author: "Mert Kaya",
    handle: "@mert",
    initials: "MK",
    text: "Dünyadaki tüm plastik atıkların yarısı sadece pipetlerden oluşuyor.",
    createdAt: "28 dk önce",
    image: null,
    topic: "Gündem",
    link: "",
    comments: ["Tüm plastik atıklar ifadesi abartılı görünüyor."]
  },
  {
    author: "Selin Arı",
    handle: "@selinari",
    initials: "SA",
    text: "Kahve içmek herkes için kesin olarak kalp hastalığı riskini sıfırlar.",
    createdAt: "1 sa önce",
    image: null,
    topic: "Sağlık",
    link: "",
    comments: []
  }
];

const sourcePool = [
  "Resmi veri arşivi",
  "Bağımsız haber kontrolü",
  "Akademik özet",
  "Kurum açıklaması"
];

function normalize(text) {
  return text.toLocaleLowerCase("tr-TR");
}

function factCheck(text) {
  const value = normalize(text);

  if (value.includes("tüm") || value.includes("kesin") || value.includes("herkes") || value.includes("sıfırlar")) {
    return {
      type: "false",
      label: "Yanlış / abartılı",
      confidence: 91,
      truth: "Paylaşım mutlak bir ifade kullanıyor. Gerçek hayatta bu tür iddialar kişiye, veriye ve döneme göre değişir; doğru ifade daha sınırlı ve kaynaklı kurulmalıdır.",
      sources: sourcePool.slice(1)
    };
  }

  if (value.includes("iki kat") || value.includes("arttı") || value.includes("büyüdü") || value.includes("azaldı")) {
    return {
      type: "mixed",
      label: "Kısmen doğru",
      confidence: 78,
      truth: "Ana yön doğru olabilir, ancak oran ve dönem belirtilmediği için paylaşım eksik. Doğru hali; yıl, pazar ve resmi satış verisiyle birlikte verilmelidir.",
      sources: [sourcePool[0], sourcePool[3], sourcePool[1]]
    };
  }

  return {
    type: "mixed",
    label: "İnceleme gerekli",
    confidence: 64,
    truth: "Bu paylaşım net bir doğrulama için daha fazla bağlam istiyor. Yapay zeka önce ana iddiayı ayırır, ardından güvenilir kaynaklardan aynı iddiayı destekleyen ya da çürüten kanıt arar.",
    sources: [sourcePool[1], sourcePool[2]]
  };
}

function getPostVerification(post) {
  if (post.verification) {
    return post.verification;
  }

  if (post.verificationPending) {
    return {
      type: "mixed",
      label: "AI doğruluyor",
      confidence: 50,
      truth: "Savora yapay zekası paylaşımı ve kaynakları inceliyor. Sonuç kısa süre içinde burada görünecek.",
      sources: ["AI doğrulama kuyruğu"]
    };
  }

  return factCheck(post.text);
}

function imageCheck(post) {
  if (!post.image) {
    return "";
  }

  if (post.imageAnalysis) {
    return `
      <div class="vision-check">
        <strong>Görsel analizi</strong>
        <p>${escapeHtml(post.imageAnalysis.summary || "Görsel AI tarafından incelendi.")}</p>
        ${post.imageAnalysis.extractedText ? `<p><strong>Okunan yazı:</strong> ${escapeHtml(post.imageAnalysis.extractedText)}</p>` : ""}
        <p>${escapeHtml(post.imageAnalysis.risk || "İnceleme gerekli")}</p>
      </div>
    `;
  }

  const text = normalize(post.text);
  const risk = text.includes("bugün") || text.includes("kesin") || text.includes("son dakika")
    ? "Görsel üzerindeki iddia tarih ve bağlam açısından ayrıca doğrulanmalı."
    : "Görseldeki yazı, nesne ve bağlam iddiayla birlikte değerlendirilir.";

  return `
    <div class="vision-check">
      <strong>Görsel analizi</strong>
      <p>Yapay zeka bu görseldeki yazıları okuyabilir, görseldeki nesneleri tarayabilir ve paylaşım metniyle çelişki olup olmadığını kontrol eder.</p>
      <p>${escapeHtml(risk)}</p>
    </div>
  `;
}

function linkAnalysis(post) {
  if (!post.link) {
    return "";
  }

  return `
    <div class="link-analysis">
      <strong>Link analizi</strong>
      <a href="${escapeHtml(post.link)}" target="_blank" rel="noreferrer">${escapeHtml(post.link)}</a>
      <span>Başlık, yayın tarihi, kaynak türü ve iddia metni doğrulama kuyruğuna alındı.</span>
    </div>
  `;
}

function commentVerdict(comment) {
  const value = normalize(comment);

  if (value.includes("kesin") || value.includes("tüm") || value.includes("asla")) {
    return "Yorumda mutlak ifade var; kaynakla desteklenmeli.";
  }

  return "Yorum düşük riskli görünüyor, yine de kaynak bağlamı korunmalı.";
}

function renderComments(post, index) {
  const comments = post.comments || [];
  const list = comments.map((comment, commentIndex) => `
    <div class="comment-check">
      <strong>${escapeHtml(comment)}</strong>
      <span>${escapeHtml(commentVerdict(comment))}</span>
      <button class="text-button report-comment-button" type="button" data-post-index="${index}" data-comment-index="${commentIndex}">Yorumu şikayet et</button>
    </div>
  `).join("");

  return `
    <div class="comment-area">
      <div class="comment-list">${list}</div>
      <form class="comment-form" data-post-index="${index}">
        <input placeholder="Yorum yaz, Savora kontrol etsin" aria-label="Yorum yaz">
        <button type="submit">Gönder</button>
      </form>
    </div>
  `;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPost(post, index) {
  const result = getPostVerification(post);
  const article = document.createElement("article");
  article.className = "post";
  article.innerHTML = `
    <div class="post-head">
      <div class="avatar">${escapeHtml(post.initials)}</div>
      <div class="post-author">
        <strong>${escapeHtml(post.author)}</strong>
        <span>${escapeHtml(post.handle)} · ${escapeHtml(post.createdAt)}</span>
      </div>
    </div>
    <div class="post-topics"><span class="topic-chip">${escapeHtml(post.topic || "Gündem")}</span></div>
    <p class="post-text">${escapeHtml(post.text)}</p>
    ${linkAnalysis(post)}
    ${post.image ? `<div class="post-image"><img src="${post.image}" alt="Paylaşım görseli"></div>` : ""}
    <div class="verdict">
      <div class="verdict-top">
        <span class="badge ${result.type}">${result.label}</span>
        <span class="confidence">%${result.confidence} güven</span>
      </div>
      <p class="truth"><strong>Doğrusu:</strong> ${escapeHtml(result.truth)}</p>
      <div class="sources">
        ${result.sources.map((source) => `<span>${escapeHtml(source)}</span>`).join("")}
      </div>
      ${imageCheck(post)}
    </div>
    <div class="post-actions">
      <button class="text-button" type="button">Beğen</button>
      <button class="text-button" type="button">Yanıtla</button>
      <button class="text-button" type="button">Kaynakları gör</button>
      <button class="text-button report-button" type="button" data-report="${index}">Şikayet et</button>
    </div>
    ${renderComments(post, index)}
  `;
  return article;
}

function renderFeed() {
  feed.innerHTML = "";
  const filteredPosts = posts.filter((post) => {
    const matchesTopic = activeTopic === "Tümü" || post.topic === activeTopic;
    const haystack = `${post.author} ${post.text} ${post.topic} ${post.link}`.toLocaleLowerCase("tr-TR");
    const matchesSearch = !searchTerm || haystack.includes(searchTerm);
    return matchesTopic && matchesSearch;
  });

  filteredPosts.forEach((post) => feed.append(renderPost(post, posts.indexOf(post))));
  checkedCount.textContent = String(posts.length);
}

function renderGallery() {
  if (!galleryGrid) {
    return;
  }

  galleryGrid.innerHTML = "";
  if (tabGalleryGrid) {
    tabGalleryGrid.innerHTML = "";
  }

  if (!galleryImages.length) {
    const empty = document.createElement("div");
    empty.className = "gallery-empty";
    empty.textContent = "Henüz görsel yok. Profil fotoğrafları ve görsel paylaşımlar burada birikir.";
    galleryGrid.append(empty);
    if (tabGalleryGrid) {
      tabGalleryGrid.append(empty.cloneNode(true));
    }
    return;
  }

  galleryImages.forEach((src) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    item.innerHTML = `<img src="${src}" alt="Galeri görseli">`;
    galleryGrid.append(item);
    if (tabGalleryGrid) {
      tabGalleryGrid.append(item.cloneNode(true));
    }
  });
}

function updateCounter() {
  charCount.textContent = `${textarea.value.length}/360`;
}

function updateTrustBadge() {
  const ownPosts = posts.filter((post) => post.handle === `@${currentUser?.username || "mehmet"}`);
  const score = Math.min(94, 72 + ownPosts.length * 4 + galleryImages.length * 2);

  if (trustBadgeScore) {
    trustBadgeScore.textContent = `%${score}`;
  }
  if (aboutTrustScore) {
    aboutTrustScore.textContent = `%${score}`;
  }
  if (trustBadgeBar) {
    trustBadgeBar.style.width = `${score}%`;
  }
}

function renderVerifications() {
  if (!verificationList) {
    return;
  }

  verificationList.innerHTML = "";
  posts.forEach((post) => {
    const result = getPostVerification(post);
    const item = document.createElement("div");
    item.innerHTML = `
      <strong>${escapeHtml(result.label)}</strong>
      <span>${escapeHtml(post.topic || "Gündem")} · %${result.confidence} güven</span>
      <p>${escapeHtml(result.truth)}</p>
    `;
    verificationList.append(item);
  });
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textarea.value.trim();
  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton?.textContent || "Yayınla ve doğrulat";

  if (!text && !selectedImage) {
    textarea.focus();
    return;
  }

  const moderation = moderateContent(text);

  if (moderation.blocked) {
    if (composerWarning) {
      composerWarning.textContent = moderation.message;
      composerWarning.hidden = false;
    }
    moderationQueue.unshift(`Engellenen paylaşım: ${moderation.reason}`);
    renderAdminPanel();
    return;
  }

  if (composerWarning) {
    composerWarning.textContent = getRemainingAiChecks() > 0
      ? `Paylaşım yayınlandı. Bugün kalan ücretsiz AI doğrulama hakkın: ${getRemainingAiChecks()}.`
      : "Paylaşım yayınlandı. Bugünkü ücretsiz AI doğrulama hakkın dolduğu için yerel ön kontrol uygulanacak.";
    composerWarning.hidden = false;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Yayınlandı";
  }

  const newPost = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    author: currentUser?.name || "Mehmet Güneş",
    handle: `@${currentUser?.username || "mehmet"}`,
    initials: "MG",
    text: text || "Görsel paylaşımı",
    createdAt: "şimdi",
    image: selectedImage,
    topic: postTopic?.value || "Gündem",
    link: postLink?.value.trim() || "",
    comments: [],
    verificationPending: true
  };

  posts.unshift(newPost);

  if (selectedImage) {
    galleryImages.unshift(selectedImage);
    renderGallery();
    renderAdminPanel();
  }

  textarea.value = "";
  if (postLink) postLink.value = "";
  clearSelectedImage();
  updateCounter();
  renderFeed();
  renderVerifications();
  updateTrustBadge();

  if (!useAiCheck()) {
    newPost.verification = {
      type: "mixed",
      label: "Ücretsiz limit doldu",
      confidence: 40,
      truth: "Bugünkü ücretsiz gerçek AI doğrulama hakkı doldu. Savora bu paylaşımı şimdilik yerel ön kontrolle işaretledi; yarın yeni ücretsiz hak tanımlanır.",
      sources: ["Ücretsiz günlük limit", "Yerel ön kontrol"]
    };
    newPost.verificationPending = false;
    renderFeed();
    renderVerifications();
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
    return;
  }

  const [verification, imageAnalysis] = await Promise.all([
    verifyPostRemote(newPost),
    analyzeImageRemote(newPost)
  ]);

  if (verification && !verification.error) {
    newPost.verification = {
      type: verification.type || "mixed",
      label: verification.label || "İnceleme gerekli",
      confidence: Number(verification.confidence || 64),
      truth: verification.truth || "AI doğrulama sonucu alındı.",
      sources: verification.sources || ["AI doğrulama"]
    };
  } else {
    const aiMessage = verification?.message || "Canlı AI API yanıt vermedi. Vercel'de api klasörü, OPENAI_API_KEY ve son deploy kontrol edilmeli.";
    newPost.verification = {
      type: "mixed",
      label: "AI bağlantısı yok",
      confidence: 0,
      truth: aiMessage.includes("quota") || aiMessage.includes("429")
        ? "Ücretsiz AI sağlayıcısının günlük kotası veya yoğunluk limiti dolduğu için gerçek AI yanıtı alınamadı. Bir süre sonra tekrar denenebilir."
        : aiMessage,
      sources: ["Savora sistem kontrolü"]
    };
  }

  if (imageAnalysis && !imageAnalysis.error) {
    newPost.imageAnalysis = imageAnalysis;
  }

  newPost.verificationPending = false;
  renderFeed();
  renderVerifications();

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;
  }
});

textarea?.addEventListener("input", updateCounter);

globalSearch?.addEventListener("input", () => {
  searchTerm = globalSearch.value.trim().toLocaleLowerCase("tr-TR");
  renderFeed();
});

topicChips?.addEventListener("click", (event) => {
  const button = event.target.closest("button");

  if (!button) {
    return;
  }

  activeTopic = button.dataset.topic || "Tümü";
  topicChips.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  renderFeed();
});

profileTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("button");

  if (!button) {
    return;
  }

  const tab = button.dataset.tab;
  profileTabs.querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button));
  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.panel === tab;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
  });
});

feed?.addEventListener("submit", async (event) => {
  const formElement = event.target.closest(".comment-form");

  if (!formElement) {
    return;
  }

  event.preventDefault();
  const input = formElement.querySelector("input");
  const postIndex = Number(formElement.dataset.postIndex);
  const value = input.value.trim();

  if (!value || !posts[postIndex]) {
    return;
  }

  const moderation = await moderateContentRemote(value);

  if (moderation.blocked) {
    moderationQueue.unshift(`Engellenen yorum: ${moderation.reason}`);
    if (notificationText) {
      notificationText.textContent = moderation.message;
    }
    renderAdminPanel();
    return;
  }

  posts[postIndex].comments = posts[postIndex].comments || [];
  posts[postIndex].comments.push(value);
  input.value = "";
  renderFeed();
});

feed?.addEventListener("click", (event) => {
  const reportButton = event.target.closest(".report-button");
  const reportCommentButton = event.target.closest(".report-comment-button");

  if (!reportButton && !reportCommentButton) {
    return;
  }

  if (reportCommentButton) {
    reportTarget = {
      type: "comment",
      postIndex: Number(reportCommentButton.dataset.postIndex),
      commentIndex: Number(reportCommentButton.dataset.commentIndex)
    };
  } else {
    reportTarget = {
      type: "post",
      postIndex: Number(reportButton.dataset.report)
    };
  }

  if (reportDialog) {
    reportDialog.hidden = false;
  }
});

reportForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!reportTarget) {
    return;
  }

  const post = posts[reportTarget.postIndex];

  if (!post) {
    return;
  }

  const reason = reportReason?.value || "Diğer";
  const detail = reportDetail?.value.trim();
  const label = reportTarget.type === "comment" ? "yorum" : "paylaşım";
  moderationQueue.unshift(`${label} şikayeti: ${reason}${detail ? ` - ${detail}` : ""}`);

  if (notificationText) {
    notificationText.textContent = "Şikayet admin moderasyon kuyruğuna gönderildi";
  }

  reportForm.reset();
  reportTarget = null;
  if (reportDialog) reportDialog.hidden = true;
  renderAdminPanel();
});

closeReportButton?.addEventListener("click", () => {
  reportTarget = null;
  if (reportDialog) reportDialog.hidden = true;
});

loginTab?.addEventListener("click", () => setAuthMode("login"));
registerTab?.addEventListener("click", () => setAuthMode("register"));

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = document.querySelector("#loginUsername").value.trim();
  const password = document.querySelector("#loginPassword").value;
  const users = getUsers();
  let user = users.find((item) => item.username === username && item.password === password);

  if (!user && username === "admin" && password === "savora123") {
    user = {
      name: "Savora Admin",
      username: "admin",
      password: "savora123",
      role: "admin"
    };
    saveUsers([user, ...users.filter((item) => item.username !== "admin")]);
  }

  if (!user) {
    showAuthMessage("Kullanıcı adı veya şifre hatalı.");
    return;
  }

  applyCurrentUser(user);
});

registerForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#registerName").value.trim();
  const username = document.querySelector("#registerUsername").value.trim();
  const password = document.querySelector("#registerPassword").value;
  const users = getUsers();

  if (users.some((user) => user.username === username)) {
    showAuthMessage("Bu kullanıcı adı zaten alınmış.");
    return;
  }

  const user = { name, username, password, role: "member" };
  users.push(user);
  saveUsers(users);
  showAuthMessage("Hesabın oluşturuldu.", "success");
  registerForm.reset();
  applyCurrentUser(user);
});

newPostButton?.addEventListener("click", () => {
  textarea.focus();
});

function clearSelectedImage() {
  selectedImage = null;
  if (postImage) {
    postImage.value = "";
  }
  if (imagePreview && imagePreviewImg) {
    imagePreview.hidden = true;
    imagePreviewImg.removeAttribute("src");
  }
}

postImage?.addEventListener("change", () => {
  const file = postImage.files?.[0];

  if (!file) {
    clearSelectedImage();
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedImage = String(reader.result);
    if (imagePreview && imagePreviewImg) {
      imagePreviewImg.src = selectedImage;
      imagePreview.hidden = false;
    }
  });
  reader.readAsDataURL(file);
});

removeImageButton?.addEventListener("click", clearSelectedImage);

function readImageFile(input, callback) {
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => callback(String(reader.result)));
  reader.readAsDataURL(file);
}

avatarImage?.addEventListener("change", () => {
  readImageFile(avatarImage, (src) => {
    if (profileAvatar) {
      profileAvatar.textContent = "";
      profileAvatar.style.backgroundImage = `url("${src}")`;
    }
    galleryImages.unshift(src);
    renderGallery();
    renderAdminPanel();
    updateTrustBadge();
  });
});

coverImage?.addEventListener("change", () => {
  readImageFile(coverImage, (src) => {
    if (profileCover) {
      profileCover.style.backgroundImage = `linear-gradient(90deg, rgba(23, 32, 29, 0.74), rgba(23, 32, 29, 0.08) 58%, rgba(47, 125, 98, 0.24)), url("${src}")`;
    }
    galleryImages.unshift(src);
    renderGallery();
    renderAdminPanel();
    updateTrustBadge();
  });
});

galleryImage?.addEventListener("change", () => {
  readImageFile(galleryImage, (src) => {
    galleryImages.unshift(src);
    renderGallery();
    renderAdminPanel();
    updateTrustBadge();
    galleryImage.value = "";
  });
});

adminNavButton?.addEventListener("click", () => {
  if (adminPanel) {
    adminPanel.hidden = false;
    renderAdminPanel();
  }
});

closeAdminButton?.addEventListener("click", () => {
  if (adminPanel) {
    adminPanel.hidden = true;
  }
});

friendButton?.addEventListener("click", () => {
  friendButton.textContent = "İstek gönderildi";
  friendButton.disabled = true;
});

messageButton?.addEventListener("click", () => {
  textarea.value = "@Mehmet Merhaba, bu paylaşım hakkında konuşalım. ";
  updateCounter();
  textarea.focus();
});

themeToggle?.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

renderFeed();
renderGallery();
renderVerifications();
updateCounter();
updateTrustBadge();
setAuthMode("login");
let savedTheme = "light";

try {
  savedTheme = localStorage.getItem(themeKey) || "light";
} catch {
  savedTheme = "light";
}

applyTheme(savedTheme);

let sessionUsername = null;

try {
  sessionUsername = localStorage.getItem(sessionKey);
} catch {
  sessionUsername = null;
}

const sessionUser = getUsers().find((user) => user.username === sessionUsername);

if (sessionUser) {
  applyCurrentUser(sessionUser);
}
