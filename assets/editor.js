"use strict";

const EDITOR_CONFIG = Object.freeze({
  supabaseUrl: "https://njxwfgcayotvjmozhlab.supabase.co",
  supabasePublishableKey: "sb_publishable_Qo_hvPXG8qJfMgUZ12ILDQ_FlaZypMm",
  imageBucket: "shorts-news-images",
  maxImageBytes: 5 * 1024 * 1024,
  allowedImageTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]),
});

const SESSION_KEY = "sumantv_shorts_editor_session_v1";
const EDITOR_ROLES = new Set(["editor", "admin"]);

const state = {
  session: null,
  user: null,
  role: null,
  categories: [],
  stories: [],
  selectedStory: null,
  galleryMedia: [],
  toastTimer: null,
  busy: false,
};

const elements = {
  authView: document.querySelector("#authView"),
  workspaceView: document.querySelector("#workspaceView"),
  sessionSummary: document.querySelector("#sessionSummary"),
  analyticsLink: document.querySelector("#analyticsLink"),
  loginForm: document.querySelector("#loginForm"),
  loginButton: document.querySelector("#loginButton"),
  loginMessage: document.querySelector("#loginMessage"),
  email: document.querySelector("#email"),
  password: document.querySelector("#password"),
  logoutButton: document.querySelector("#logoutButton"),
  userEmail: document.querySelector("#userEmail"),
  roleBadge: document.querySelector("#roleBadge"),
  storySearch: document.querySelector("#storySearch"),
  statusFilter: document.querySelector("#statusFilter"),
  storyList: document.querySelector("#storyList"),
  refreshStoriesButton: document.querySelector("#refreshStoriesButton"),
  newStoryButton: document.querySelector("#newStoryButton"),
  draftCount: document.querySelector("#draftCount"),
  reviewCount: document.querySelector("#reviewCount"),
  publishedCount: document.querySelector("#publishedCount"),
  storyForm: document.querySelector("#storyForm"),
  storyId: document.querySelector("#storyId"),
  contentType: document.querySelector("#contentType"),
  titleTe: document.querySelector("#titleTe"),
  summaryTe: document.querySelector("#summaryTe"),
  titleEn: document.querySelector("#titleEn"),
  slug: document.querySelector("#slug"),
  categoryId: document.querySelector("#categoryId"),
  sourceName: document.querySelector("#sourceName"),
  sourceUrl: document.querySelector("#sourceUrl"),
  imageUrl: document.querySelector("#imageUrl"),
  imageFile: document.querySelector("#imageFile"),
  imageAltTe: document.querySelector("#imageAltTe"),
  youtubeFields: document.querySelector("#youtubeFields"),
  youtubeUrl: document.querySelector("#youtubeUrl"),
  youtubeHelp: document.querySelector("#youtubeHelp"),
  youtubePreview: document.querySelector("#youtubePreview"),
  youtubePreviewFrame: document.querySelector("#youtubePreviewFrame"),
  galleryFields: document.querySelector("#galleryFields"),
  galleryFiles: document.querySelector("#galleryFiles"),
  galleryEditor: document.querySelector("#galleryEditor"),
  publishAt: document.querySelector("#publishAt"),
  isBreaking: document.querySelector("#isBreaking"),
  isLive: document.querySelector("#isLive"),
  imagePreview: document.querySelector("#imagePreview"),
  imagePreviewElement: document.querySelector("#imagePreviewElement"),
  titleCount: document.querySelector("#titleCount"),
  summaryCount: document.querySelector("#summaryCount"),
  formEyebrow: document.querySelector("#formEyebrow"),
  formTitle: document.querySelector("#formTitle"),
  previewLink: document.querySelector("#previewLink"),
  currentStatus: document.querySelector("#currentStatus"),
  versionLabel: document.querySelector("#versionLabel"),
  workflowMessage: document.querySelector("#workflowMessage"),
  saveDraftButton: document.querySelector("#saveDraftButton"),
  submitReviewButton: document.querySelector("#submitReviewButton"),
  publishButton: document.querySelector("#publishButton"),
  archiveButton: document.querySelector("#archiveButton"),
  generateSlugButton: document.querySelector("#generateSlugButton"),
  editorMessage: document.querySelector("#editorMessage"),
  toast: document.querySelector("#toast"),
};

function readSession() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!value?.access_token || !value?.refresh_token) return null;
    return value;
  } catch {
    return null;
  }
}

function storeSession(payload) {
  const expiresIn = Number(payload?.expires_in) || 3600;
  state.session = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
}

function clearSession() {
  state.session = null;
  state.user = null;
  state.role = null;
  sessionStorage.removeItem(SESSION_KEY);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(payload, fallback) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  return payload?.message || payload?.msg || payload?.error_description || payload?.error || fallback;
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${EDITOR_CONFIG.supabaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      apikey: EDITOR_CONFIG.supabasePublishableKey,
      ...options.headers,
    },
    mode: "cors",
    referrerPolicy: "strict-origin-when-cross-origin",
    signal: AbortSignal.timeout(15000),
  });
  const payload = await parseResponse(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `Authentication failed with HTTP ${response.status}`));
  }
  return payload;
}

async function refreshSession() {
  if (!state.session?.refresh_token) throw new Error("Your session has ended. Please sign in again.");

  const payload = await authRequest("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: state.session.refresh_token }),
  });
  storeSession(payload);
  return state.session;
}

async function validSession({ forceRefresh = false } = {}) {
  if (!state.session) state.session = readSession();
  if (!state.session) throw new Error("Please sign in to continue.");

  const expiresSoon = Date.now() >= Number(state.session.expires_at || 0) - 60000;
  if (forceRefresh || expiresSoon) await refreshSession();
  return state.session;
}

async function dataRequest(path, options = {}, canRetry = true) {
  const session = await validSession();
  const response = await fetch(`${EDITOR_CONFIG.supabaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      apikey: EDITOR_CONFIG.supabasePublishableKey,
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
    mode: "cors",
    referrerPolicy: "strict-origin-when-cross-origin",
    signal: AbortSignal.timeout(18000),
  });

  if (response.status === 401 && canRetry) {
    await validSession({ forceRefresh: true });
    return dataRequest(path, options, false);
  }

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(errorMessage(payload, `Request failed with HTTP ${response.status}`));
  }
  return payload;
}

async function loadCurrentUser() {
  const session = await validSession();
  const user = await authRequest("/auth/v1/user", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const role = user?.app_metadata?.shorts_role;

  if (!EDITOR_ROLES.has(role)) {
    clearSession();
    throw new Error("This account has not been assigned a SumanTV Shorts editor role.");
  }

  state.user = user;
  state.role = role;
}

function showAuth() {
  elements.authView.hidden = false;
  elements.workspaceView.hidden = true;
  elements.sessionSummary.hidden = true;
}

function showWorkspace() {
  elements.authView.hidden = true;
  elements.workspaceView.hidden = false;
  elements.sessionSummary.hidden = false;
  elements.userEmail.textContent = state.user?.email || "";
  elements.roleBadge.textContent = state.role === "admin" ? "Admin" : "Editor";
  elements.analyticsLink.hidden = state.role !== "admin";
  elements.publishButton.hidden = state.role !== "admin";
  elements.archiveButton.hidden = state.role !== "admin";
}

function setFormMessage(element, message = "", success = false) {
  element.textContent = message;
  element.classList.toggle("is-success", success);
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2800);
}

function setBusy(busy) {
  state.busy = busy;
  [
    elements.loginButton,
    elements.logoutButton,
    elements.refreshStoriesButton,
    elements.newStoryButton,
    elements.saveDraftButton,
    elements.submitReviewButton,
    elements.publishButton,
    elements.archiveButton,
    elements.generateSlugButton,
  ].forEach((button) => {
    button.disabled = busy;
  });

  if (!busy) updateWorkflowControls();
}

async function signIn(email, password) {
  const payload = await authRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  storeSession(payload);
  await loadCurrentUser();
}

async function signOut() {
  try {
    if (state.session?.access_token) {
      await authRequest("/auth/v1/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${state.session.access_token}` },
      });
    }
  } catch {
    // Local session removal still prevents further editor access in this tab.
  } finally {
    clearSession();
    state.stories = [];
    state.categories = [];
    resetStoryForm();
    showAuth();
  }
}

function categoriesUrl() {
  const url = new URL("/rest/v1/shorts_categories", EDITOR_CONFIG.supabaseUrl);
  url.searchParams.set("select", "id,slug,name_te,name_en,color,sort_order,is_active");
  url.searchParams.set("order", "sort_order.asc,id.asc");
  return `${url.pathname}${url.search}`;
}

function storiesUrl() {
  const url = new URL("/rest/v1/shorts_stories", EDITOR_CONFIG.supabaseUrl);
  url.searchParams.set(
    "select",
    [
      "id",
      "slug",
      "category_id",
      "title_te",
      "title_en",
      "summary_te",
      "summary_en",
      "source_name",
      "source_url",
      "image_url",
      "image_alt_te",
      "content_type",
      "youtube_video_id",
      "status",
      "is_breaking",
      "is_live",
      "published_at",
      "created_at",
      "updated_at",
      "reviewed_at",
      "version",
      "media:shorts_story_media(id,position,image_url,image_alt_te,caption_te)",
      "category:shorts_categories(slug,name_te,name_en,color)",
    ].join(","),
  );
  url.searchParams.set("order", "updated_at.desc,id.desc");
  url.searchParams.set("limit", "200");
  return `${url.pathname}${url.search}`;
}

async function loadEditorialData({ announce = false } = {}) {
  setBusy(true);
  setFormMessage(elements.editorMessage);
  try {
    const [categories, stories] = await Promise.all([
      dataRequest(categoriesUrl()),
      dataRequest(storiesUrl()),
    ]);
    state.categories = Array.isArray(categories) ? categories : [];
    state.stories = Array.isArray(stories) ? stories : [];
    renderCategoryOptions();
    renderQueue();

    if (state.selectedStory) {
      const refreshed = state.stories.find((story) => story.id === state.selectedStory.id);
      if (refreshed) selectStory(refreshed);
      else resetStoryForm();
    }

    if (announce) showToast("Editorial queue refreshed");
  } finally {
    setBusy(false);
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderCategoryOptions() {
  const selected = elements.categoryId.value;
  elements.categoryId.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select category";
  elements.categoryId.append(placeholder);

  state.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = String(category.id);
    option.textContent = `${category.name_te} — ${category.name_en}`;
    option.disabled = !category.is_active;
    elements.categoryId.append(option);
  });

  if (selected && state.categories.some((category) => String(category.id) === selected)) {
    elements.categoryId.value = selected;
  }
}

function storyCategoryName(story) {
  const category = Array.isArray(story.category) ? story.category[0] : story.category;
  return category?.name_te || category?.name_en || "Uncategorised";
}

function filteredStories() {
  const query = elements.storySearch.value.trim().toLocaleLowerCase("en-IN");
  const status = elements.statusFilter.value;
  return state.stories.filter((story) => {
    const statusMatches = status === "all" || story.status === status;
    const haystack = `${story.title_te || ""} ${story.title_en || ""} ${story.slug || ""}`
      .toLocaleLowerCase("en-IN");
    return statusMatches && (!query || haystack.includes(query));
  });
}

function renderQueue() {
  const counts = state.stories.reduce(
    (result, story) => {
      if (Object.hasOwn(result, story.status)) result[story.status] += 1;
      return result;
    },
    { draft: 0, review: 0, published: 0 },
  );
  elements.draftCount.textContent = String(counts.draft);
  elements.reviewCount.textContent = String(counts.review);
  elements.publishedCount.textContent = String(counts.published);
  elements.storyList.replaceChildren();

  const stories = filteredStories();
  if (!stories.length) {
    elements.storyList.append(
      makeElement(
        "p",
        "empty-queue",
        state.stories.length ? "No stories match this filter." : "No stories yet. Create the first verified short.",
      ),
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  stories.forEach((story) => {
    const button = makeElement("button", "story-row");
    button.type = "button";
    button.dataset.storyId = String(story.id);
    button.classList.toggle("is-selected", story.id === state.selectedStory?.id);

    const title = makeElement(
      "span",
      "story-row-title",
      story.title_te || story.title_en || story.slug,
    );
    const meta = makeElement("span", "story-row-meta");
    const status = makeElement("span", "status-chip", story.status);
    status.dataset.status = story.status;
    const category = makeElement("span", "", storyCategoryName(story));
    meta.append(status, category);
    button.append(title, meta);
    button.addEventListener("click", () => selectStory(story));
    fragment.append(button);
  });
  elements.storyList.append(fragment);
}

function formatLocalDateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function safeHttpsUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function updateImagePreview() {
  const url = safeHttpsUrl(elements.imageUrl.value.trim());
  elements.imagePreview.hidden = !url;
  if (!url) {
    elements.imagePreviewElement.removeAttribute("src");
    elements.imagePreviewElement.alt = "";
    return;
  }
  elements.imagePreviewElement.src = url;
  elements.imagePreviewElement.alt = elements.imageAltTe.value.trim() || "Story image preview";
}

function updateCounters() {
  elements.titleCount.textContent = String(elements.titleTe.value.length);
  elements.summaryCount.textContent = String(elements.summaryTe.value.length);
}

function youtubeVideoId(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        id = url.pathname.split("/").filter(Boolean)[1] || "";
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

function youtubeUrlFromId(id, type) {
  if (!id) return "";
  return type === "youtube_short"
    ? `https://www.youtube.com/shorts/${id}`
    : `https://www.youtube.com/watch?v=${id}`;
}

function updateContentTypeFields() {
  const type = elements.contentType.value;
  const isYoutube = type === "youtube_short" || type === "youtube_video";
  elements.youtubeFields.hidden = !isYoutube;
  elements.galleryFields.hidden = type !== "gallery";
  elements.youtubeUrl.required = isYoutube;
  elements.youtubePreview.classList.toggle("is-short", type === "youtube_short");

  const id = youtubeVideoId(elements.youtubeUrl.value.trim());
  elements.youtubePreview.hidden = !isYoutube || !id;
  if (!isYoutube || !id) {
    elements.youtubePreviewFrame.removeAttribute("src");
  } else {
    elements.youtubePreviewFrame.src =
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  }
}

function renderGalleryEditor() {
  elements.galleryEditor.replaceChildren();
  state.galleryMedia
    .sort((a, b) => a.position - b.position)
    .forEach((media, index) => {
      media.position = index + 1;
      const card = makeElement("article", "gallery-editor-card");
      const image = makeElement("img");
      image.src = media.image_url;
      image.alt = media.image_alt_te || `Gallery image ${index + 1}`;
      const fields = makeElement("div", "gallery-editor-fields");
      const caption = document.createElement("input");
      caption.type = "text";
      caption.maxLength = 300;
      caption.placeholder = `Caption for image ${index + 1}`;
      caption.value = media.caption_te || "";
      caption.addEventListener("input", () => {
        media.caption_te = caption.value.trim();
      });
      const alt = document.createElement("input");
      alt.type = "text";
      alt.maxLength = 300;
      alt.placeholder = "Telugu image description";
      alt.value = media.image_alt_te || "";
      alt.addEventListener("input", () => {
        media.image_alt_te = alt.value.trim();
      });
      const actions = makeElement("div", "gallery-editor-actions");
      const up = makeElement("button", "ghost-button compact", "↑");
      up.type = "button";
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        [state.galleryMedia[index - 1], state.galleryMedia[index]] =
          [state.galleryMedia[index], state.galleryMedia[index - 1]];
        renderGalleryEditor();
      });
      const down = makeElement("button", "ghost-button compact", "↓");
      down.type = "button";
      down.disabled = index === state.galleryMedia.length - 1;
      down.addEventListener("click", () => {
        [state.galleryMedia[index + 1], state.galleryMedia[index]] =
          [state.galleryMedia[index], state.galleryMedia[index + 1]];
        renderGalleryEditor();
      });
      const remove = makeElement("button", "danger-button compact", "Remove");
      remove.type = "button";
      remove.addEventListener("click", () => {
        state.galleryMedia.splice(index, 1);
        renderGalleryEditor();
      });
      actions.append(up, down, remove);
      fields.append(caption, alt, actions);
      card.append(image, fields);
      elements.galleryEditor.append(card);
    });
}

function resetStoryForm() {
  state.selectedStory = null;
  state.galleryMedia = [];
  elements.storyForm.reset();
  elements.storyId.value = "";
  elements.sourceName.value = "SumanTV";
  elements.contentType.value = "article";
  elements.formEyebrow.textContent = "New story";
  elements.formTitle.textContent = "Create a verified short";
  elements.currentStatus.textContent = "Unsaved";
  elements.versionLabel.textContent = "";
  elements.previewLink.hidden = true;
  elements.imagePreview.hidden = true;
  elements.imagePreviewElement.removeAttribute("src");
  renderGalleryEditor();
  updateContentTypeFields();
  setFormMessage(elements.editorMessage);
  updateCounters();
  updateWorkflowControls();
  renderQueue();
  if (!elements.workspaceView.hidden) elements.titleTe.focus();
}

function selectStory(story) {
  state.selectedStory = story;
  state.galleryMedia = Array.isArray(story.media)
    ? story.media.map((media) => ({ ...media }))
    : [];
  elements.storyId.value = String(story.id);
  elements.titleTe.value = story.title_te || "";
  elements.summaryTe.value = story.summary_te || "";
  elements.titleEn.value = story.title_en || "";
  elements.slug.value = story.slug || "";
  elements.categoryId.value = String(story.category_id || "");
  elements.sourceName.value = story.source_name || "";
  elements.sourceUrl.value = story.source_url || "";
  elements.imageUrl.value = story.image_url || "";
  elements.imageAltTe.value = story.image_alt_te || "";
  elements.contentType.value = story.content_type || "article";
  elements.youtubeUrl.value =
    youtubeUrlFromId(story.youtube_video_id, story.content_type || "article");
  elements.publishAt.value = formatLocalDateTime(story.published_at);
  elements.isBreaking.checked = Boolean(story.is_breaking);
  elements.isLive.checked = Boolean(story.is_live);
  elements.formEyebrow.textContent = "Editing story";
  elements.formTitle.textContent = story.title_te || story.title_en || story.slug;
  elements.currentStatus.textContent = story.status;
  elements.versionLabel.textContent = `Version ${story.version || 1}`;
  elements.previewLink.href = `/stories/${encodeURIComponent(story.slug)}`;
  elements.previewLink.hidden = story.status !== "published";
  setFormMessage(elements.editorMessage);
  updateCounters();
  updateImagePreview();
  renderGalleryEditor();
  updateContentTypeFields();
  updateWorkflowControls();
  renderQueue();
}

function updateWorkflowControls() {
  if (state.busy) return;
  const status = state.selectedStory?.status || "unsaved";
  const editorLocked = state.role === "editor" && ["published", "archived"].includes(status);
  const isAdmin = state.role === "admin";

  elements.saveDraftButton.disabled = editorLocked;
  elements.submitReviewButton.disabled = editorLocked;
  elements.publishButton.hidden = !isAdmin;
  elements.publishButton.disabled = !isAdmin;
  elements.archiveButton.hidden = !isAdmin || !state.selectedStory || status === "archived";
  elements.archiveButton.disabled = !isAdmin || !state.selectedStory;
  elements.isLive.disabled = !isAdmin;
  elements.publishAt.disabled = !isAdmin;

  if (editorLocked) {
    elements.workflowMessage.textContent =
      "Published and archived stories are read-only for editors. An admin can revise their status.";
  } else if (status === "review") {
    elements.workflowMessage.textContent =
      isAdmin ? "This story is ready for admin verification and publication." : "Waiting for admin review.";
  } else if (status === "published") {
    elements.workflowMessage.textContent =
      "This story is public. Publishing again safely updates the verified version.";
  } else {
    elements.workflowMessage.textContent =
      "Save a draft, verify its source and image rights, then submit it for admin review.";
  }
}

function generatedSlug() {
  const english = elements.titleEn.value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110);
  if (english) return english;

  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `story-${date}-${crypto.randomUUID().slice(0, 8)}`;
}

function validateHttpsField(element, label) {
  const value = element.value.trim();
  if (!value) return null;
  const safe = safeHttpsUrl(value);
  if (!safe) throw new Error(`${label} must start with https://`);
  return safe;
}

function storyPayload(targetStatus) {
  if (!elements.storyForm.reportValidity()) {
    throw new Error("Please complete all required fields.");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(elements.slug.value.trim())) {
    throw new Error("Story slug can contain only lowercase letters, numbers and hyphens.");
  }

  const isPublishing = targetStatus === "published";
  const contentType = elements.contentType.value;
  const isYoutube = contentType === "youtube_short" || contentType === "youtube_video";
  const videoId = isYoutube ? youtubeVideoId(elements.youtubeUrl.value.trim()) : "";
  if (isYoutube && !videoId) {
    throw new Error("Paste a valid public YouTube video or Shorts URL.");
  }
  if (contentType === "gallery" && state.galleryMedia.length < 2) {
    throw new Error("A gallery needs at least 2 images.");
  }
  if (state.galleryMedia.length > 10) {
    throw new Error("A gallery can contain a maximum of 10 images.");
  }
  let publishedAt = null;
  if (isPublishing) {
    publishedAt = elements.publishAt.value
      ? new Date(elements.publishAt.value).toISOString()
      : new Date().toISOString();
  } else if (targetStatus === "archived") {
    publishedAt = state.selectedStory?.published_at || null;
  }

  return {
    slug: elements.slug.value.trim(),
    category_id: Number(elements.categoryId.value),
    title_te: elements.titleTe.value.trim(),
    title_en: elements.titleEn.value.trim() || null,
    summary_te: elements.summaryTe.value.trim(),
    summary_en: state.selectedStory?.summary_en || null,
    source_name: elements.sourceName.value.trim(),
    source_url: validateHttpsField(elements.sourceUrl, "Source URL"),
    image_url: validateHttpsField(elements.imageUrl, "Image URL"),
    image_alt_te: elements.imageAltTe.value.trim() || null,
    content_type: contentType,
    youtube_video_id: videoId || null,
    status: targetStatus,
    is_breaking: elements.isBreaking.checked,
    is_live: isPublishing && elements.isLive.checked,
    published_at: publishedAt,
  };
}

async function saveGalleryMedia(storyId, contentType) {
  await dataRequest(`/rest/v1/shorts_story_media?story_id=eq.${encodeURIComponent(storyId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  if (contentType !== "gallery" || !state.galleryMedia.length) return;
  const payload = state.galleryMedia.map((media, index) => ({
    story_id: storyId,
    position: index + 1,
    image_url: media.image_url,
    image_alt_te: media.image_alt_te || null,
    caption_te: media.caption_te || null,
  }));
  await dataRequest("/rest/v1/shorts_story_media", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
}

async function saveStory(targetStatus) {
  if (state.busy) return;
  setFormMessage(elements.editorMessage);

  try {
    if (targetStatus === "published" || targetStatus === "archived") {
      if (state.role !== "admin") throw new Error("Only an admin can publish or archive stories.");
    }

    if (!elements.slug.value.trim()) elements.slug.value = generatedSlug();
    const payload = storyPayload(targetStatus);
    const id = state.selectedStory?.id;
    setBusy(true);

    const path = id
      ? `/rest/v1/shorts_stories?id=eq.${encodeURIComponent(id)}`
      : "/rest/v1/shorts_stories";
    const rows = await dataRequest(path, {
      method: id ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    const saved = Array.isArray(rows) ? rows[0] : null;
    if (saved?.id) await saveGalleryMedia(saved.id, payload.content_type);
    await loadEditorialData();
    if (saved?.id) {
      const refreshed = state.stories.find((story) => story.id === saved.id);
      if (refreshed) selectStory(refreshed);
    }

    const messages = {
      draft: "Draft saved",
      review: "Story submitted for review",
      published: publishedAtMessage(payload.published_at),
      archived: "Story archived",
    };
    setFormMessage(elements.editorMessage, messages[targetStatus], true);
    showToast(messages[targetStatus]);
  } catch (error) {
    setFormMessage(elements.editorMessage, error.message || "Unable to save this story.");
  } finally {
    setBusy(false);
  }
}

function publishedAtMessage(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time > Date.now() + 60000
    ? "Story scheduled for publication"
    : "Story published";
}

async function uploadImage(file) {
  if (!file) return;
  setFormMessage(elements.editorMessage);

  try {
    if (!EDITOR_CONFIG.allowedImageTypes.has(file.type)) {
      throw new Error("Choose a JPG, PNG, WebP or AVIF image.");
    }
    if (file.size > EDITOR_CONFIG.maxImageBytes) {
      throw new Error("Image must be 5 MB or smaller.");
    }

    setBusy(true);
    const extension = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif",
    }[file.type];
    const objectPath = `stories/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
    const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");

    await dataRequest(`/storage/v1/object/${EDITOR_CONFIG.imageBucket}/${encodedPath}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: file,
    });

    elements.imageUrl.value =
      `${EDITOR_CONFIG.supabaseUrl}/storage/v1/object/public/${EDITOR_CONFIG.imageBucket}/${encodedPath}`;
    if (!elements.imageAltTe.value.trim()) {
      elements.imageAltTe.value = elements.titleTe.value.trim();
    }
    updateImagePreview();
    showToast("Image uploaded");
  } catch (error) {
    setFormMessage(elements.editorMessage, error.message || "Unable to upload the image.");
    elements.imageFile.value = "";
  } finally {
    setBusy(false);
  }
}

async function uploadGalleryImages(files) {
  const selected = Array.from(files || []);
  if (!selected.length) return;
  if (state.galleryMedia.length + selected.length > 10) {
    setFormMessage(elements.editorMessage, "A gallery can contain a maximum of 10 images.");
    elements.galleryFiles.value = "";
    return;
  }

  setBusy(true);
  setFormMessage(elements.editorMessage);
  try {
    for (const file of selected) {
      if (!EDITOR_CONFIG.allowedImageTypes.has(file.type)) {
        throw new Error("Choose only JPG, PNG, WebP or AVIF images.");
      }
      if (file.size > EDITOR_CONFIG.maxImageBytes) {
        throw new Error(`${file.name} must be 5 MB or smaller.`);
      }
      const extension = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/avif": "avif",
      }[file.type];
      const objectPath =
        `galleries/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
      const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
      await dataRequest(`/storage/v1/object/${EDITOR_CONFIG.imageBucket}/${encodedPath}`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-upsert": "false",
        },
        body: file,
      });
      state.galleryMedia.push({
        position: state.galleryMedia.length + 1,
        image_url:
          `${EDITOR_CONFIG.supabaseUrl}/storage/v1/object/public/${EDITOR_CONFIG.imageBucket}/${encodedPath}`,
        image_alt_te: elements.titleTe.value.trim(),
        caption_te: "",
      });
    }
    renderGalleryEditor();
    showToast(`${selected.length} gallery image${selected.length === 1 ? "" : "s"} uploaded`);
  } catch (error) {
    setFormMessage(elements.editorMessage, error.message || "Unable to upload gallery images.");
  } finally {
    elements.galleryFiles.value = "";
    setBusy(false);
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy) return;
  setFormMessage(elements.loginMessage);
  setBusy(true);

  try {
    await signIn(elements.email.value.trim(), elements.password.value);
    elements.password.value = "";
    showWorkspace();
    resetStoryForm();
    await loadEditorialData();
  } catch (error) {
    clearSession();
    showAuth();
    setFormMessage(
      elements.loginMessage,
      error.message || "Unable to sign in. Check your credentials and assigned role.",
    );
  } finally {
    setBusy(false);
  }
});

elements.logoutButton.addEventListener("click", async () => {
  if (state.busy) return;
  setBusy(true);
  await signOut();
  setBusy(false);
});

elements.newStoryButton.addEventListener("click", resetStoryForm);
elements.refreshStoriesButton.addEventListener("click", async () => {
  try {
    await loadEditorialData({ announce: true });
  } catch (error) {
    setFormMessage(elements.editorMessage, error.message || "Unable to refresh stories.");
  }
});
elements.storySearch.addEventListener("input", renderQueue);
elements.statusFilter.addEventListener("change", renderQueue);
elements.generateSlugButton.addEventListener("click", () => {
  elements.slug.value = generatedSlug();
});
elements.titleTe.addEventListener("input", updateCounters);
elements.summaryTe.addEventListener("input", updateCounters);
elements.imageUrl.addEventListener("input", updateImagePreview);
elements.imageAltTe.addEventListener("input", updateImagePreview);
elements.imageFile.addEventListener("change", () => uploadImage(elements.imageFile.files?.[0]));
elements.contentType.addEventListener("change", updateContentTypeFields);
elements.youtubeUrl.addEventListener("input", updateContentTypeFields);
elements.galleryFiles.addEventListener("change", () => uploadGalleryImages(elements.galleryFiles.files));
elements.imagePreviewElement.addEventListener("error", () => {
  elements.imagePreview.hidden = true;
});
elements.saveDraftButton.addEventListener("click", () => saveStory("draft"));
elements.submitReviewButton.addEventListener("click", () => saveStory("review"));
elements.publishButton.addEventListener("click", () => saveStory("published"));
elements.archiveButton.addEventListener("click", () => saveStory("archived"));

async function restoreEditorSession() {
  state.session = readSession();
  if (!state.session) {
    showAuth();
    return;
  }

  setBusy(true);
  try {
    await loadCurrentUser();
    showWorkspace();
    resetStoryForm();
    await loadEditorialData();
  } catch (error) {
    clearSession();
    showAuth();
    setFormMessage(elements.loginMessage, error.message || "Please sign in again.");
  } finally {
    setBusy(false);
  }
}

restoreEditorSession();
