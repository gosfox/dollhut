// worker/src/lib/cors.ts
//
// The frontend and the Worker run on different origins (different ports
// even in local dev: 5173 vs 8787), and the session lives in a cookie, so
// every response needs explicit CORS headers with credentials allowed.
// "*" is not usable here -- browsers reject a wildcard origin combined with
// Access-Control-Allow-Credentials: true.

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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