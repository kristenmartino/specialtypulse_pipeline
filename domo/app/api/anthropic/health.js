// Reports whether the AI proxy is configured on this deployment, so the
// dashboard can show an informative state instead of a button that errors.
export const config = { runtime: "edge" };

export default function handler() {
  return new Response(
    JSON.stringify({ configured: !!process.env.ANTHROPIC_API_KEY }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
