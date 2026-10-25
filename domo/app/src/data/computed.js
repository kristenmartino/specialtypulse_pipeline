/**
 * computed.js
 * ---------------------------------------------------------------------------
 * Live-computed datasets for the standalone build. The specialty benchmarks,
 * Reimbursement Pressure Index, and pipeline overlay are derived in the browser
 * from the pipeline's mart (sourceData.json) via the DataFlow port in
 * pressureIndex.js — so the numbers shown are the scoring formula's actual
 * output, not hard-coded.
 *
 * dashboardData serves these for the three mart-derived aliases and falls back to
 * mockData.js for the governance/telemetry aliases (access_config,
 * access_examples, engagement).
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
