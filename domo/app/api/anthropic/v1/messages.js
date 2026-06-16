// Vercel Edge proxy for the dashboard's AI governance summary.
// Mirrors the local webpack devServer proxy: the API key stays server-side
// (set ANTHROPIC_API_KEY in the Vercel project). Streams the response through.
export const config = { runtime: "edge" };

const ALLOWED_MODELS = ["claude-sonnet-4-6"];
const MAX_TOKENS_CAP = 400;
const PROMPT_PREFIX = "You are a data governance analyst";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: "AI summary is not configured on this deployment." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // This proxy serves exactly one feature — the PDP governance summary.
  // Reject anything outside that shape so the endpoint can't be repurposed.
  const message = Array.isArray(body.messages) ? body.messages[0] : null;
  const inScope =
    ALLOWED_MODELS.includes(body.model) &&
    (body.max_tokens ?? 0) <= MAX_TOKENS_CAP &&
    body.messages?.length === 1 &&
    message?.role === "user" &&
    typeof message?.content === "string" &&
    message.content.startsWith(PROMPT_PREFIX);
  if (!inScope) {
    return new Response("Request outside demo scope", { status: 403 });
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": req.headers.get("anthropic-version") || "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store",
    },
  });
}
