// Repo-root re-export of the AI proxy availability probe (see ./v1/messages.js
// for why this shim exists). Exposes /api/anthropic/health for the repo-root
// (GitHub integration) build path; the real handler lives in domo/app.
export { default } from "../../domo/app/api/anthropic/health.js";
export const config = { runtime: "edge" };
