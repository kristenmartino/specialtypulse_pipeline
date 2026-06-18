/**
 * domoFetch.js
 * Bridge between Domo runtime (domo.js) and local dev (mock data).
 */
import { MOCK_DATA } from "./mockData";
import { COMPUTED } from "./computed";

export const isDomo =
  typeof window !== "undefined" && typeof window.domo !== "undefined";

export const AI_API_URL = isDomo
  ? "/domo/proxy/v1/messages"
  : "/api/anthropic/v1/messages";

export function domoFetch(alias) {
  if (isDomo) {
    return window.domo.get(`/data/v1/${alias}?limit=1000`);
  }
  // Mart-derived aliases (specialty_benchmarks, pipeline_intelligence, mart)
  // are computed live from the pipeline output; governance/telemetry aliases
  // fall back to the static samples in mockData.js.
  return Promise.resolve(COMPUTED[alias] || MOCK_DATA[alias] || []);
}
