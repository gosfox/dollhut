// frontend/src/main.ts
//
// The whole shell is one state machine driven by GET /me:
//
//   boot -> consume ?session= from URL if present (fresh redirect from GitHub)
//        -> loading -> GET /me -> not logged in      -> "login"
//                               -> logged in, no repo -> "create-account"
//                               -> logged in, has repo -> "dashboard"
//
// Nothing here is final UI -- it exists to prove the four states / three
// endpoints actually connect end to end. Real dashboard content comes later.

import "./style.css";
import { fetchMe, createAccount, githubLoginUrl, logout, storeSession } from "./api/api";

type ViewState =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "create-account"; githubLogin: string }
  | { kind: "dashboard"; githubLogin: string; repoId: string }
  | { kind: "error"; message: string };

const STATE_TAG: Record<ViewState["kind"], string> = {
  loading: "loading",
  login: "login",
  "create-account": "setup",
  dashboard: "specimen no. 1",
  error: "error",
};

function getApp(): HTMLElement {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing <div id=\"app\"> in index.html");
  return app;
}

function shell(tagKind: ViewState["kind"], bodyHtml: string): string {
  return `
    <main class="card">
      <span class="tag">${STATE_TAG[tagKind]}</span>
      ${bodyHtml}
    </main>
  `;
}

function renderLoading() {
  getApp().innerHTML = shell(
    "loading",
    `
      <h1 class="wordmark">Dollhut</h1>
      <p class="muted">Opening the cabinet&hellip;</p>
    `
  );
}

function renderLogin() {
  getApp().innerHTML = shell(
    "login",
    `
      <h1 class="wordmark">Dollhut</h1>
      <p class="muted">Your characters. Your repository. Your rules.</p>
      <a class="button" href="${githubLoginUrl()}">Continue with GitHub</a>
    `
  );
}

function renderCreateAccount(githubLogin: string) {
  getApp().innerHTML = shell(
    "create-account",
    `
      <h1 class="wordmark">Welcome, ${githubLogin}</h1>
      <p class="muted">
        Dollhut keeps every character in a repository you own.
        This creates one on your GitHub account and seeds it with the files Dollhut needs.
      </p>
      <button class="button" id="create-account-btn">Create my Dollhut</button>
      <p class="muted small" id="create-account-status"></p>
    `
  );

  const button = document.querySelector<HTMLButtonElement>("#create-account-btn")!;
  const status = document.querySelector<HTMLParagraphElement>("#create-account-status")!;

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Creating your repository\u2026";
    try {
      const result = await createAccount();
      renderDashboard(githubLogin, result.repo_id);
    } catch (err) {
      button.disabled = false;
      status.textContent = (err as Error).message;
    }
  });
}

function renderDashboard(githubLogin: string, repoId: string) {
  getApp().innerHTML = shell(
    "dashboard",
    `
      <h1 class="wordmark">Dollhut</h1>
      <p class="muted">Logged in as <strong>${githubLogin}</strong></p>
      <p class="muted small">repo_id: <code>${repoId}</code></p>
      <p class="muted">The actual dashboard isn't built yet -- but the account exists and is indexed.</p>
      <button class="button button--ghost" id="logout-btn">Log out</button>
    `
  );

  document.querySelector<HTMLButtonElement>("#logout-btn")!.addEventListener("click", async () => {
    await logout();
    boot();
  });
}

function renderError(message: string) {
  getApp().innerHTML = shell(
    "error",
    `
      <h1 class="wordmark">Dollhut</h1>
      <p class="muted">Something didn't fit back in its box.</p>
      <p class="muted small">${message}</p>
      <button class="button button--ghost" id="retry-btn">Try again</button>
    `
  );
  document.querySelector<HTMLButtonElement>("#retry-btn")!.addEventListener("click", boot);
}

/** If we just landed here from /auth/callback, the session id is in the URL -- stash it and clean the URL. */
function consumeSessionFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session");
  if (!sessionId) return;

  storeSession(sessionId);
  params.delete("session");
  const cleanQuery = params.toString();
  const newUrl = window.location.pathname + (cleanQuery ? `?${cleanQuery}` : "") + window.location.hash;
  window.history.replaceState({}, "", newUrl);
}

async function boot() {
  consumeSessionFromUrl();
  renderLoading();
  try {
    const me = await fetchMe();

    if (!me.loggedIn) {
      renderLogin();
      return;
    }

    if (!me.hasAccount || !me.repo_id) {
      renderCreateAccount(me.githubLogin!);
      return;
    }

    renderDashboard(me.githubLogin!, me.repo_id);
  } catch (err) {
    renderError((err as Error).message);
  }
}

boot();