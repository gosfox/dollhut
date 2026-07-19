// worker/src/index.ts

import { handleAuthCallback, handleLogout } from "./routes/auth";
import { handleReindex } from "./routes/reindex";

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  FRONTEND_URL: string;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/auth/callback" && request.method === "GET") {
      return handleAuthCallback(request, env);
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }

    if (url.pathname === "/reindex" && request.method === "POST") {
      return handleReindex(request, env);
    }

    // stubs -- implemented later, kept here so routes/ has a fixed home from day one
    if (url.pathname === "/search") {
      return new Response("Not implemented yet", { status: 501 });
    }
    if (url.pathname === "/stars" ) {
      return new Response("Not implemented yet", { status: 501 });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;