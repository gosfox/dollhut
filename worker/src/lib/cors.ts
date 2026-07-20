// worker/src/lib/cors.ts
//
// Sessions travel as a Bearer token in the Authorization header now, not a
// cookie, so Access-Control-Allow-Credentials is no longer needed -- but
// "Authorization" must be explicitly allowed, or the browser strips it from
// cross-origin requests before they ever reach the Worker.

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export function handlePreflight(origin: string): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}