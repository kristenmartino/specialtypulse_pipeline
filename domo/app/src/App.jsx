import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { domoFetch, isDomo } from "./data/domoFetch";
import { fmt } from "./data/constants";
import TabBar from "./components/TabBar";
import ExecutiveBrief from "./components/ExecutiveBrief";
import MarketIntelligence from "./pages/MarketIntelligence";
import ProcedureDetail from "./pages/ProcedureDetail";
import PipelineIntelligence from "./pages/PipelineIntelligence";
import AdoptionTracking from "./pages/AdoptionTracking";
import PdpGovernance from "./pages/PdpGovernance";

const TAB_LABELS = {
  market:    "Market Intelligence",
  procedure: "Procedure Detail",
  pipeline:  "Pipeline Intelligence",
  adoption:  "Adoption Tracking",
  pdp:       "PDP Governance",
};

// The signature mark: an ECG trace beside the wordmark whose beat rate is
// driven by the top pressure index — the market's pulse, literally.
const PULSE_PATH = "M0 15 H34 L40 15 L45 4 L52 26 L57 15 H88 L94 15 L99 7 L105 23 L110 15 H150";

function HeaderPulse({ benchmarks }) {
  const topPressure = useMemo(() => {
    if (!benchmarks.length) return null;
    const maxY = Math.max(...benchmarks.map(r => Number(r.year)));
    const latest = benchmarks.filter(r => Number(r.year) === maxY);
    return Math.max(...latest.map(r => Number(r.pressure_index)));
  }, [benchmarks]);

  if (topPressure == null || !isFinite(topPressure)) return null;
  // Map pressure 0–100 → beat period 2.6s–1.0s.
  const dur = Math.max(1.0, 2.6 - (topPressure / 100) * 1.6).toFixed(2);

  return (
    <svg
      className="header-pulse"
      width="150"
      height="30"
      viewBox="0 0 150 30"
      aria-hidden="true"
      style={{ "--pulse-dur": `${dur}s` }}
    >
      <path className="pulse-track" d={PULSE_PATH} />
      <path className="pulse-trace" d={PULSE_PATH} pathLength="400" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState("market");
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);
  // Drill-down focus: a specialty selected on Market Intelligence narrows
  // Procedure Detail. Persists until cleared via the focus chip.
  const [focusSpecialty, setFocusSpecialty] = useState(null);
  const drillToSpecialty = (specialty) => { setFocusSpecialty(specialty); setTab("procedure"); };
  const contentRef = useRef(null);

  // DataSet state
  const [config, setConfig]           = useState([]);
  const [checks, setChecks]           = useState([]);
  const [benchmarks, setBenchmarks]   = useState([]);
  const [pipeline, setPipeline]       = useState([]);
  const [mart, setMart]               = useState([]);
  const [engagement, setEngagement]   = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, chk, bench, pipe, m, eng] = await Promise.all([
        domoFetch("pdp_config"),
        domoFetch("pdp_verify_results"),
        domoFetch("specialty_benchmarks"),
        domoFetch("pipeline_intelligence"),
        domoFetch("mart"),
        domoFetch("engagement"),
      ]);
      setConfig(cfg || []);
      setChecks(chk || []);
      setBenchmarks(bench || []);
      setPipeline(pipe || []);
      setMart(m || []);
      setEngagement(eng || []);
      setLastFetch(new Date());
    } catch (err) {
      console.error("Failed to fetch Domo DataSets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (isDomo && window.domo?.onDataUpdate) {
      window.domo.onDataUpdate(() => fetchData());
    }
  }, [fetchData]);

  // Each tab is its own view: reset scroll and title on switch.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    document.title = `SpecialtyPulse · ${TAB_LABELS[tab]}`;
  }, [tab]);

  const renderPage = () => {
    if (loading) {
      return (
        <div className="page-loading">
          <div className="skeleton" style={{ width: "60%", height: 20 }} />
          <div className="skeleton" style={{ width: "80%", height: 200, marginTop: 16 }} />
          <div className="skeleton" style={{ width: "45%", height: 160, marginTop: 12 }} />
        </div>
      );
    }
    switch (tab) {
      case "market":    return <MarketIntelligence benchmarks={benchmarks} onDrill={drillToSpecialty} />;
      case "procedure": return <ProcedureDetail mart={mart} focusSpecialty={focusSpecialty} onClearFocus={() => setFocusSpecialty(null)} />;
      case "pipeline":  return <PipelineIntelligence pipeline={pipeline} />;
      case "adoption":  return <AdoptionTracking engagement={engagement} config={config} />;
      case "pdp":       return <PdpGovernance config={config} checks={checks} loading={false} />;
      default:          return null;
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-logo">SP</div>
          <div>
            <div className="header-title">SpecialtyPulse</div>
            <div className="header-subtitle">{TAB_LABELS[tab]}</div>
          </div>
          {!loading && <HeaderPulse benchmarks={benchmarks} />}
        </div>
        <div className="header-right">
          <div className="header-meta">
            <span>{isDomo ? "Last fetched" : "Data vintage"}</span>
            <span className="val">
              {isDomo
                ? (lastFetch ? fmt.date(lastFetch.toISOString()) : "—")
                : "Representative · CY2021–2023"}
            </span>
          </div>
        </div>
      </header>

      <TabBar active={tab} onChange={setTab} />

      {!loading && (
        <ExecutiveBrief benchmarks={benchmarks} mart={mart} pipeline={pipeline} />
      )}

      <main
        className="page-content"
        ref={contentRef}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        <div className="page-fade" key={tab}>
          {renderPage()}
        </div>
      </main>

      {!isDomo && (
        <footer className="standalone-note">
          Standalone demo build on representative data — originally delivered as a Domo
          custom app behind PDP row-level security. The Reimbursement Pressure Index is
          computed in your browser from the pipeline's mart (a JavaScript port of the Domo
          SQL DataFlow), not hard-coded. The PDP policies shown are the verified
          configuration from the pipeline repo.
        </footer>
      )}
    </div>
  );
}
