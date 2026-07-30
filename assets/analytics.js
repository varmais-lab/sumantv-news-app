"use strict";

const ANALYTICS_CONFIG = Object.freeze({
  supabaseUrl: "https://njxwfgcayotvjmozhlab.supabase.co",
  supabasePublishableKey: "sb_publishable_Qo_hvPXG8qJfMgUZ12ILDQ_FlaZypMm",
});

const SESSION_KEY = "sumantv_shorts_editor_session_v1";

const state = {
  session: null,
  days: 7,
  loading: false,
};

const elements = {
  accessPanel: document.querySelector("#accessPanel"),
  accessMessage: document.querySelector("#accessMessage"),
  editorLoginLink: document.querySelector("#editorLoginLink"),
  dashboard: document.querySelector("#dashboard"),
  dashboardMessage: document.querySelector("#dashboardMessage"),
  generatedAt: document.querySelector("#generatedAt"),
  metricGrid: document.querySelector("#metricGrid"),
  trendChart: document.querySelector("#trendChart"),
  contentTypeList: document.querySelector("#contentTypeList"),
  categoryList: document.querySelector("#categoryList"),
  storyTableBody: document.querySelector("#storyTableBody"),
  rangeButtons: [...document.querySelectorAll(".range-button")],
  logoutButton: document.querySelector("#logoutButton"),
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

async function request(path, options = {}, canRetry = true) {
  if (!state.session) throw new Error("Sign in through the Editorial Desk first.");

  if (Date.now() >= Number(state.session.expires_at || 0) - 60000) {
    const refreshResponse = await fetch(
      `${ANALYTICS_CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: ANALYTICS_CONFIG.supabasePublishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: state.session.refresh_token }),
      },
    );
    const refreshed = await parseResponse(refreshResponse);
    if (!refreshResponse.ok) throw new Error("Your session has ended. Please sign in again.");
    storeSession(refreshed);
  }

  const response = await fetch(`${ANALYTICS_CONFIG.supabaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      apikey: ANALYTICS_CONFIG.supabasePublishableKey,
      Authorization: `Bearer ${state.session.access_token}`,
      ...options.headers,
    },
    mode: "cors",
    referrerPolicy: "strict-origin-when-cross-origin",
    signal: AbortSignal.timeout(15000),
  });
  const payload = await parseResponse(response);

  if (response.status === 401 && canRetry) {
    state.session.expires_at = 0;
    return request(path, options, false);
  }
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Request failed with HTTP ${response.status}`);
  }
  return payload;
}

function makeElement(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

function number(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
}

function formatType(value) {
  return {
    article: "Article",
    gallery: "Gallery",
    youtube_short: "YT Short",
    youtube_video: "YT Long",
  }[value] || value || "Unknown";
}

function renderMetrics(summary) {
  const metrics = [
    ["Views", number(summary.views)],
    ["Unique readers", number(summary.readers)],
    ["Completion rate", `${Number(summary.completionRate) || 0}%`],
    ["Engagement rate", `${Number(summary.engagementRate) || 0}%`],
    ["Shares", number(summary.shares)],
    ["Video plays", number(summary.videoPlays)],
  ];
  elements.metricGrid.replaceChildren(...metrics.map(([label, value]) => {
    const card = makeElement("article", "metric-card");
    card.append(
      makeElement("span", "metric-label", label),
      makeElement("strong", "metric-value", value),
    );
    return card;
  }));
}

function renderTrend(rows) {
  const maximum = Math.max(1, ...rows.flatMap((row) => [
    Number(row.views) || 0,
    Number(row.engagements) || 0,
  ]));
  elements.trendChart.replaceChildren(...rows.map((row) => {
    const day = makeElement("div", "trend-day");
    const group = makeElement("div", "bar-group");
    const views = makeElement("span", "bar views");
    const engagements = makeElement("span", "bar engagements");
    views.style.height = `${Math.max(1.5, (Number(row.views) || 0) / maximum * 100)}%`;
    engagements.style.height =
      `${Math.max(1.5, (Number(row.engagements) || 0) / maximum * 100)}%`;
    views.title = `${number(row.views)} views`;
    engagements.title = `${number(row.engagements)} engagements`;
    group.append(views, engagements);
    const label = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
    }).format(new Date(`${row.date}T00:00:00`));
    day.append(group, makeElement("span", "day-label", label));
    return day;
  }));
}

function renderBreakdown(container, rows, formatter = (value) => value) {
  const maximum = Math.max(1, ...rows.map((row) => Number(row.views) || 0));
  container.replaceChildren(...rows.map((row) => {
    const item = makeElement("div", "breakdown-row");
    const label = makeElement("span", "breakdown-label", formatter(row.label));
    const track = makeElement("span", "breakdown-track");
    const fill = makeElement("span", "breakdown-fill");
    fill.style.width = `${(Number(row.views) || 0) / maximum * 100}%`;
    track.append(fill);
    item.append(
      label,
      track,
      makeElement(
        "span",
        "breakdown-value",
        `${number(row.views)} views · ${number(row.engagements)} actions`,
      ),
    );
    return item;
  }));
}

function tableCell(text, className = "") {
  return makeElement("td", className, text);
}

function renderStories(stories) {
  elements.storyTableBody.replaceChildren(...stories.map((story) => {
    const row = document.createElement("tr");
    const titleCell = document.createElement("td");
    const link = makeElement("a", "story-link", story.title);
    link.href = `/stories/${encodeURIComponent(story.slug)}`;
    link.target = "_blank";
    link.rel = "noopener";
    titleCell.append(link);

    const formatCell = document.createElement("td");
    formatCell.append(makeElement("span", "format-pill", formatType(story.contentType)));
    const mediaActions =
      (Number(story.videoPlays) || 0) + (Number(story.gallerySwipes) || 0);
    row.append(
      titleCell,
      formatCell,
      tableCell(number(story.views)),
      tableCell(`${Number(story.completionRate) || 0}%`),
      tableCell(number(story.likes)),
      tableCell(number(story.saves)),
      tableCell(number(story.shares)),
      tableCell(number(mediaActions)),
    );
    return row;
  }));
}

function renderDashboard(data) {
  renderMetrics(data.summary || {});
  renderTrend(data.daily || []);
  renderBreakdown(elements.contentTypeList, data.contentTypes || [], formatType);
  renderBreakdown(elements.categoryList, data.categories || []);
  renderStories(data.topStories || []);
  elements.generatedAt.textContent =
    `Updated ${new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(data.generatedAt))} · ${data.rangeDays} day view`;
}

async function loadDashboard() {
  if (state.loading) return;
  state.loading = true;
  elements.dashboardMessage.textContent = "Refreshing analytics…";
  elements.rangeButtons.forEach((button) => {
    button.disabled = true;
    button.classList.toggle("is-active", Number(button.dataset.days) === state.days);
  });
  try {
    const data = await request("/rest/v1/rpc/shorts_analytics_dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_days: state.days }),
    });
    renderDashboard(data);
    elements.dashboardMessage.textContent = "";
  } catch (error) {
    elements.dashboardMessage.textContent = error.message || "Unable to load analytics.";
  } finally {
    state.loading = false;
    elements.rangeButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

async function restoreAnalyticsSession() {
  state.session = readSession();
  if (!state.session) {
    elements.accessMessage.textContent =
      "Open the Editorial Desk, sign in as an admin, then select Analytics.";
    elements.editorLoginLink.hidden = false;
    return;
  }

  try {
    const user = await request("/auth/v1/user");
    if (user?.app_metadata?.shorts_role !== "admin") {
      throw new Error("This dashboard is available to SumanTV admins only.");
    }
    elements.accessPanel.hidden = true;
    elements.dashboard.hidden = false;
    await loadDashboard();
  } catch (error) {
    elements.accessMessage.textContent = error.message || "Unable to verify admin access.";
    elements.editorLoginLink.hidden = false;
  }
}

elements.rangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.days = Number(button.dataset.days) || 7;
    loadDashboard();
  });
});

elements.logoutButton.addEventListener("click", async () => {
  try {
    if (state.session?.access_token) {
      await fetch(`${ANALYTICS_CONFIG.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: ANALYTICS_CONFIG.supabasePublishableKey,
          Authorization: `Bearer ${state.session.access_token}`,
        },
      });
    }
  } finally {
    clearSession();
    window.location.assign("/editor");
  }
});

restoreAnalyticsSession();
