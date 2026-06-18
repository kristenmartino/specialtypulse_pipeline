/**
 * computed.js
 * ---------------------------------------------------------------------------
 * Live-computed datasets for the standalone build. The specialty benchmarks,
 * Reimbursement Pressure Index, and pipeline overlay are derived in the browser
 * from the pipeline's mart (sourceData.json) via the DataFlow port in
 * pressureIndex.js — so the numbers shown are the scoring formula's actual
 * output, not hard-coded.
 *
 * domoFetch serves these for the three mart-derived aliases and falls back to
 * mockData.js for the governance/telemetry aliases (pdp_config,
 * pdp_verify_results, engagement).
 */
import sourceData from "./sourceData.json";
import { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } from "./pressureIndex";

const specialty_benchmarks = enrichBenchmarks(aggregateMart(sourceData.mart));
const pipeline_intelligence = buildPipelineIntelligence(sourceData.sfdc, specialty_benchmarks);

export const COMPUTED = {
  specialty_benchmarks,
  pipeline_intelligence,
  mart: sourceData.mart,
};
