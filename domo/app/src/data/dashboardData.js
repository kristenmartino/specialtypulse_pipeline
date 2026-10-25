/** Data loaded from the validated build artifact; no external BI runtime. */
import { MOCK_DATA } from "./mockData";
import { COMPUTED } from "./computed";

export function dashboardData(alias) {
  const data = COMPUTED[alias] || MOCK_DATA[alias];
  if (!Array.isArray(data)) return Promise.reject(new Error(`Unknown dashboard data: ${alias}`));
  return Promise.resolve(data);
}
