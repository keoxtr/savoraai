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

  if (!text && !selectedImage) {
    textarea.focus();
    return;
  }

  const moderation = await moderateContentRemote(text);

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
    composerWarning.hidden = true;
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
  }

  if (imageAnalysis && !imageAnalysis.error) {
    newPost.imageAnalysis = imageAnalysis;
  }

  newPost.verificationPending = false;
  renderFeed();
  renderVerifications();
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
