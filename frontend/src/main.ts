// frontend/src/main.ts
//
// The whole shell is one state machine driven by GET /me:
//
//   boot -> consume ?session= from URL if present (fresh redirect from GitHub)
//        -> loading -> GET /me -> not logged in      -> "landing"
//                               -> logged in, no repo -> "create-account"
//                               -> logged in, has repo -> "home"
//
// landing.html and home.html are real HTML files under ./templates -- kept
// separate from the TS so the visual design can be iterated on without
// touching logic. {{placeholders}} are filled in with renderTemplate().

import "./style.css";
import { fetchMe, createAccount, githubLoginUrl, logout, storeSession } from "./api/api";
import landingHtml from "./templates/landing.html?raw";
import homeHtml from "./templates/home.html?raw";

function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/{{(\w+)}}/g, (_match, key: string) => vars[key] ?? "");
}

function getApp(): HTMLElement {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error('Missing <div id="app"> in index.html');
  return app;
}

function renderLoading() {
  getApp().innerHTML = `
    <main class="card">
      <span class="tag">loading</span>
      <h1 class="wordmark">Dollhut</h1>
      <p class="muted">Opening the cabinet&hellip;</p>
    </main>
  `;
}

function renderLanding() {
  getApp().innerHTML = renderTemplate(landingHtml, {
    loginUrl: githubLoginUrl(),
    base: import.meta.env.BASE_URL,
  });
}

function renderCreateAccount(githubLogin: string) {
  getApp().innerHTML = `
    <main class="card">
      <span class="tag">setup</span>
      <h1 class="wordmark">Welcome, ${githubLogin}</h1>
      <p class="muted">
        Dollhut keeps every character in a repository you own.
        This creates one on your GitHub account and seeds it with the files Dollhut needs.
      </p>
      <button class="button" id="create-account-btn">Create my Dollhut</button>
      <p class="muted small" id="create-account-status"></p>
    </main>
  `;

  const button = document.querySelector<HTMLButtonElement>("#create-account-btn")!;
  const status = document.querySelector<HTMLParagraphElement>("#create-account-status")!;

  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "Creating your repository\u2026";
    try {
      const result = await createAccount();
      renderHome(githubLogin, result.repo_id);
    } catch (err) {
      button.disabled = false;
      status.textContent = (err as Error).message;
    }
  });
}

function renderHome(githubLogin: string, repoId: string) {
  getApp().innerHTML = renderTemplate(homeHtml, {
    githubLogin,
    repoId,
    repoUrl: `https://github.com/${githubLogin}/dollhut-data`,
  });

  document.querySelector<HTMLButtonElement>("#logout-btn")!.addEventListener("click", async () => {
    await logout();
    boot();
  });
}

function renderError(message: string) {
  getApp().innerHTML = `
    <main class="card">
      <span class="tag">error</span>
      <h1 class="wordmark">Dollhut</h1>
      <p class="muted">Something didn't fit back in its box.</p>
      <p class="muted small">${message}</p>
      <button class="button button--ghost" id="retry-btn">Try again</button>
    </main>
  `;
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
      renderLanding();
      return;
    }

    if (!me.hasAccount || !me.repo_id) {
      renderCreateAccount(me.githubLogin!);
      return;
    }

    renderHome(me.githubLogin!, me.repo_id);
  } catch (err) {
    renderError((err as Error).message);
  }
}

boot();