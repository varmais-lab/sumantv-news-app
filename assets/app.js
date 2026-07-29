"use strict";

const APP_CONFIG = Object.freeze({
  supabaseUrl: "https://njxwfgcayotvjmozhlab.supabase.co",
  supabasePublishableKey: "sb_publishable_Qo_hvPXG8qJfMgUZ12ILDQ_FlaZypMm",
  pageSize: 8,
  maxStories: 32,
  liveWindowHours: 6,
});

const STORAGE_KEYS = Object.freeze({
  liked: "sumantv_shorts_liked_v1",
  saved: "sumantv_shorts_saved_v1",
});

const state = {
  stories: [],
  rendered: 0,
  activeIndex: 0,
  liked: readStoredSet(STORAGE_KEYS.liked),
  saved: readStoredSet(STORAGE_KEYS.saved),
  cardObserver: null,
  loadObserver: null,
  toastTimer: null,
};

const elements = {
  feed: document.querySelector("#feed"),
  storyList: document.querySelector("#storyList"),
  loadSentinel: document.querySelector("#loadSentinel"),
  loadingPanel: document.querySelector("#loadingPanel"),
  emptyPanel: document.querySelector("#emptyPanel"),
  errorPanel: document.querySelector("#errorPanel"),
  refreshButton: document.querySelector("#refreshButton"),
  emptyRefreshButton: document.querySelector("#emptyRefreshButton"),
  errorRetryButton: document.querySelector("#errorRetryButton"),
  activeCategory: document.querySelector("#activeCategory"),
  storyCounter: document.querySelector("#storyCounter"),
  feedTimestamp: document.querySelector("#feedTimestamp"),
  toast: document.querySelector("#toast"),
};

function readStoredSet(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeStoredSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    // The UI remains usable when storage is disabled.
  }
}

function safeHttpsUrl(value) {
  if (!value || typeof value !== "string") return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function cleanText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim();
}

function storyIdentity(story) {
  return String(story.id || story.slug);
}

function requestedStorySlug() {
  const querySlug = cleanText(new URLSearchParams(window.location.search).get("story"));
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(querySlug)) return querySlug;

  const match = window.location.pathname.match(/^\/stories\/([^/]+)\/?$/);
  if (!match) return "";

  try {
    const pathSlug = cleanText(decodeURIComponent(match[1]));
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathSlug) ? pathSlug : "";
  } catch {
    return "";
  }
}

function setPanel(panel) {
  elements.loadingPanel.hidden = panel !== "loading";
  elements.emptyPanel.hidden = panel !== "empty";
  elements.errorPanel.hidden = panel !== "error";
  elements.storyList.hidden = panel !== "stories";
  elements.feed.setAttribute("aria-busy", String(panel === "loading"));
}

function buildFeedUrl() {
  const url = new URL("/rest/v1/shorts_stories", APP_CONFIG.supabaseUrl);
  const requestedSlug = requestedStorySlug();

  url.searchParams.set(
    "select",
    [
      "id",
      "slug",
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
      "is_breaking",
      "is_live",
      "published_at",
      "media:shorts_story_media(position,image_url,image_alt_te,caption_te)",
      "category:shorts_categories(slug,name_te,name_en,color)",
    ].join(","),
  );
  url.searchParams.set("status", "eq.published");
  url.searchParams.set("order", "is_breaking.desc,published_at.desc,id.desc");
  url.searchParams.set("limit", requestedSlug ? "1" : String(APP_CONFIG.maxStories));

  if (requestedSlug) {
    url.searchParams.set("slug", `eq.${requestedSlug}`);
  }

  return url;
}

async function fetchStories() {
  const response = await fetch(buildFeedUrl(), {
    headers: {
      Accept: "application/json",
      apikey: APP_CONFIG.supabasePublishableKey,
    },
    method: "GET",
    mode: "cors",
    referrerPolicy: "strict-origin-when-cross-origin",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Feed request failed with HTTP ${response.status}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows.map(normalizeStory).filter(Boolean) : [];
}

function normalizeStory(row) {
  const title = cleanText(row?.title_te) || cleanText(row?.title_en);
  const summary = cleanText(row?.summary_te) || cleanText(row?.summary_en);

  if (!row?.id || !row?.slug || !title || !summary) return null;

  const category = Array.isArray(row.category) ? row.category[0] : row.category;

  return {
    id: row.id,
    slug: cleanText(row.slug),
    title,
    summary,
    imageUrl: safeHttpsUrl(row.image_url),
    imageAlt: cleanText(row.image_alt_te, title),
    contentType: cleanText(row.content_type, "article"),
    youtubeVideoId: /^[A-Za-z0-9_-]{11}$/.test(row.youtube_video_id || "")
      ? row.youtube_video_id
      : "",
    media: Array.isArray(row.media)
      ? row.media
        .map((media) => ({
          position: Number(media.position) || 0,
          imageUrl: safeHttpsUrl(media.image_url),
          imageAlt: cleanText(media.image_alt_te, title),
          caption: cleanText(media.caption_te),
        }))
        .filter((media) => media.imageUrl)
        .sort((a, b) => a.position - b.position)
      : [],
    sourceName: cleanText(row.source_name, "SumanTV"),
    sourceUrl: safeHttpsUrl(row.source_url),
    publishedAt: row.published_at,
    isBreaking: Boolean(row.is_breaking),
    isLive: Boolean(row.is_live) && isWithinLiveWindow(row.published_at),
    category: {
      slug: cleanText(category?.slug, "news"),
      name: cleanText(category?.name_te) || cleanText(category?.name_en, "వార్తలు"),
    },
  };
}

function isWithinLiveWindow(value) {
  const published = Date.parse(value);
  if (!Number.isFinite(published)) return false;
  return Date.now() - published >= 0 &&
    Date.now() - published <= APP_CONFIG.liveWindowHours * 60 * 60 * 1000;
}

function formatPublishedTime(value) {
  const published = Date.parse(value);
  if (!Number.isFinite(published)) return "";

  const elapsedMinutes = Math.max(0, Math.round((Date.now() - published) / 60000));
  const relative = new Intl.RelativeTimeFormat("te-IN", { numeric: "auto" });

  if (elapsedMinutes < 60) return relative.format(-elapsedMinutes, "minute");
  if (elapsedMinutes < 1440) return relative.format(-Math.round(elapsedMinutes / 60), "hour");

  return new Intl.DateTimeFormat("te-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(published);
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeBadge(className, text) {
  return makeElement("span", className, text);
}

function makeActionButton(label, pressed, handler) {
  const button = makeElement("button", "action-button", label);
  button.type = "button";
  button.setAttribute("aria-pressed", String(pressed));
  button.addEventListener("click", handler);
  return button;
}

function makeStoryCard(story, index) {
  const article = makeElement("article", "story-card");
  article.id = `story-${story.id}`;
  article.dataset.index = String(index);
  article.dataset.category = story.category.name;
  article.dataset.categorySlug = story.category.slug;
  article.setAttribute("aria-labelledby", `story-title-${story.id}`);

  if (story.youtubeVideoId) {
    const media = makeElement(
      "div",
      `youtube-media${story.contentType === "youtube_short" ? " is-short" : ""}`,
    );
    const iframe = makeElement("iframe");
    iframe.src =
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(story.youtubeVideoId)}`;
    iframe.title = story.title;
    iframe.loading = index < 1 ? "eager" : "lazy";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.setAttribute("allowfullscreen", "");
    media.append(iframe);
    article.append(media);
  } else if (story.contentType === "gallery" && story.media.length) {
    const gallery = makeElement("div", "story-gallery");
    gallery.setAttribute("aria-label", `${story.title} gallery`);
    story.media.forEach((media, mediaIndex) => {
      const figure = makeElement("figure", "gallery-slide");
      const image = makeElement("img");
      image.src = media.imageUrl;
      image.alt = media.imageAlt;
      image.loading = index === 0 && mediaIndex === 0 ? "eager" : "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      const counter = makeElement(
        "span",
        "gallery-counter",
        `${mediaIndex + 1} / ${story.media.length}`,
      );
      figure.append(image, counter);
      if (media.caption) figure.append(makeElement("figcaption", "", media.caption));
      gallery.append(figure);
    });
    article.append(gallery);
  } else if (story.imageUrl) {
    const image = makeElement("img", "story-media");
    image.src = story.imageUrl;
    image.alt = story.imageAlt;
    image.loading = index < 2 ? "eager" : "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    if (index === 0) image.fetchPriority = "high";
    image.addEventListener("error", () => image.remove(), { once: true });
    article.append(image);
  }

  const content = makeElement("div", "story-content");
  const meta = makeElement("div", "story-meta");
  meta.append(makeBadge("story-category", story.category.name));
  if (story.isBreaking) meta.append(makeBadge("breaking-badge", "బ్రేకింగ్"));
  if (story.isLive) meta.append(makeBadge("live-badge", "లైవ్"));

  const source = makeElement(story.sourceUrl ? "a" : "span", "story-source", story.sourceName);
  if (story.sourceUrl) {
    source.href = story.sourceUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer nofollow";
    source.setAttribute("aria-label", `${story.sourceName} మూల కథనం`);
  }
  meta.append(source);

  const time = makeElement("time", "story-time", formatPublishedTime(story.publishedAt));
  if (story.publishedAt) time.dateTime = story.publishedAt;
  meta.append(time);

  const title = makeElement("h2", "story-title", story.title);
  title.id = `story-title-${story.id}`;
  const summary = makeElement("p", "story-summary", story.summary);
  const actions = makeElement("div", "story-actions");
  const identity = storyIdentity(story);

  const likeButton = makeActionButton("ఇష్టం", state.liked.has(identity), () => {
    toggleStoredAction({
      set: state.liked,
      key: STORAGE_KEYS.liked,
      id: identity,
      button: likeButton,
      activeMessage: "ఈ కథనం మీకు నచ్చిన వాటిలో సేవ్ అయింది",
      inactiveMessage: "ఇష్టం తొలగించబడింది",
    });
  });

  const saveButton = makeActionButton("సేవ్", state.saved.has(identity), () => {
    toggleStoredAction({
      set: state.saved,
      key: STORAGE_KEYS.saved,
      id: identity,
      button: saveButton,
      activeMessage: "ఈ డివైస్‌లో కథనం సేవ్ అయింది",
      inactiveMessage: "సేవ్ తొలగించబడింది",
    });
  });

  const shareButton = makeActionButton("షేర్", false, () => shareStory(story));
  shareButton.removeAttribute("aria-pressed");
  actions.append(likeButton, saveButton, shareButton);

  if (story.sourceUrl) {
    const readMore = makeElement("a", "source-button", "పూర్తి కథనం ↗");
    readMore.href = story.sourceUrl;
    readMore.target = "_blank";
    readMore.rel = "noopener noreferrer nofollow";
    actions.append(readMore);
  }

  content.append(meta, title, summary, actions);
  article.append(content);
  return article;
}

function toggleStoredAction({ set, key, id, button, activeMessage, inactiveMessage }) {
  const isActive = set.has(id);
  if (isActive) set.delete(id);
  else set.add(id);
  writeStoredSet(key, set);
  button.setAttribute("aria-pressed", String(!isActive));
  showToast(isActive ? inactiveMessage : activeMessage);
}

async function shareStory(story) {
  const shareUrl = new URL(`/stories/${encodeURIComponent(story.slug)}`, window.location.origin);
  const data = {
    title: story.title,
    text: story.summary,
    url: shareUrl.href,
  };

  try {
    if (navigator.share) {
      await navigator.share(data);
      return;
    }
    await navigator.clipboard.writeText(`${story.title}\n${shareUrl.href}`);
    showToast("కథనం లింక్ కాపీ అయింది");
  } catch (error) {
    if (error?.name !== "AbortError") showToast("లింక్‌ను షేర్ చేయలేకపోయాం");
  }
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2600);
}

function renderNextPage() {
  const next = state.stories.slice(state.rendered, state.rendered + APP_CONFIG.pageSize);
  if (!next.length) {
    state.loadObserver?.disconnect();
    return;
  }

  const fragment = document.createDocumentFragment();
  next.forEach((story, offset) => {
    fragment.append(makeStoryCard(story, state.rendered + offset));
  });
  elements.storyList.append(fragment);
  state.rendered += next.length;
  observeCards();
}

function observeCards() {
  state.cardObserver?.disconnect();
  state.cardObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible || visible.intersectionRatio < 0.55) return;

      const index = Number(visible.target.dataset.index);
      state.activeIndex = index;
      elements.activeCategory.textContent = visible.target.dataset.category || "తాజా";
      elements.storyCounter.textContent = `${index + 1} / ${state.stories.length}`;
    },
    { root: elements.feed, threshold: [0.55, 0.75] },
  );

  elements.storyList.querySelectorAll(".story-card").forEach((card) => {
    state.cardObserver.observe(card);
  });
}

function configureProgressiveLoading() {
  state.loadObserver?.disconnect();
  state.loadObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) renderNextPage();
    },
    { root: elements.feed, rootMargin: "100% 0px" },
  );
  state.loadObserver.observe(elements.loadSentinel);
}

function updateDocumentForSingleStory() {
  if (state.stories.length !== 1 || !requestedStorySlug()) return;
  const story = state.stories[0];
  document.title = `${story.title} — SumanTV Shorts`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", story.summary.slice(0, 155));
}

async function loadStories({ announce = false } = {}) {
  setPanel("loading");
  elements.refreshButton.classList.add("is-loading");
  elements.refreshButton.disabled = true;
  elements.storyList.replaceChildren();
  elements.feed.scrollTo({ top: 0, behavior: "auto" });
  state.rendered = 0;
  state.activeIndex = 0;
  state.cardObserver?.disconnect();
  state.loadObserver?.disconnect();

  try {
    state.stories = await fetchStories();

    if (!state.stories.length) {
      setPanel("empty");
      elements.storyCounter.textContent = "0 / 0";
      elements.activeCategory.textContent = "తాజా";
      elements.feedTimestamp.textContent = "ప్రచురిత కథనాలు మాత్రమే";
      if (announce) showToast("ఇంకా కొత్త కథనాలు లేవు");
      return;
    }

    setPanel("stories");
    renderNextPage();
    configureProgressiveLoading();
    updateDocumentForSingleStory();
    elements.storyCounter.textContent = `1 / ${state.stories.length}`;
    elements.feedTimestamp.textContent = `చివరి తనిఖీ ${new Intl.DateTimeFormat("te-IN", {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date())}`;
    if (announce) showToast("వార్తలు అప్‌డేట్ అయ్యాయి");
  } catch (error) {
    console.error("Unable to load the public shorts feed", error);
    setPanel("error");
    elements.storyCounter.textContent = "—";
    elements.feedTimestamp.textContent = "కనెక్షన్ సమస్య";
  } finally {
    elements.refreshButton.classList.remove("is-loading");
    elements.refreshButton.disabled = false;
  }
}

function moveToStory(direction) {
  if (!state.stories.length) return;
  const targetIndex = Math.min(
    state.stories.length - 1,
    Math.max(0, state.activeIndex + direction),
  );
  document.querySelector(`[data-index="${targetIndex}"]`)?.scrollIntoView({ behavior: "smooth" });
}

elements.refreshButton.addEventListener("click", () => loadStories({ announce: true }));
elements.emptyRefreshButton.addEventListener("click", () => loadStories({ announce: true }));
elements.errorRetryButton.addEventListener("click", () => loadStories({ announce: true }));
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") moveToStory(1);
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") moveToStory(-1);
});

loadStories();
