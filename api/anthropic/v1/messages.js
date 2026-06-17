// Repo-root re-export of the dashboard's Edge AI proxy.
//
// The Vercel project's Root Directory is the repository root for the GitHub
// integration (PR/preview) deployments, while the production CLI deploys use
// domo/app as the root. Vercel only picks up Edge Functions under <root>/api,
// so this shim exposes the real handler (in domo/app) at /api/anthropic/v1/messages
// for the repo-root build path. The CLI deploys keep using domo/app/api directly.
export { default } from "../../../domo/app/api/anthropic/v1/messages.js";
export const config = { runtime: "edge" };
