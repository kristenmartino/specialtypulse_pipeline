/**
 * domoFetch.js
 * Bridge between Domo runtime (domo.js) and local dev (mock data).
 */
import { MOCK_DATA } from "./mockData";

export const isDomo =
  typeof window !== "undefined" && typeof window.domo !== "undefined";

export const AI_API_URL = isDomo
  ? "/domo/proxy/v1/messages"
  : "/api/anthropic/v1/messages";

export function domoFetch(alias) {
  if (isDomo) {
    return window.domo.get(`/data/v1/${alias}?limit=1000`);
  }
  return Promise.resolve(MOCK_DATA[alias] || []);
}
