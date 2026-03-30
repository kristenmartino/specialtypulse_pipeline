import React, { useState, useEffect, useCallback } from "react";
import { domoFetch, isDomo } from "./data/domoFetch";
import { fmt } from "./data/constants";
import TabBar from "./components/TabBar";
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

export default function App() {
  const [tab, setTab] = useState("market");
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

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
      case "market":    return <MarketIntelligence benchmarks={benchmarks} />;
      case "procedure": return <ProcedureDetail mart={mart} />;
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
        </div>
        <div className="header-right">
          <div className="header-meta">
            <span>Last fetched</span>
            <span className="val">{lastFetch ? fmt.date(lastFetch.toISOString()) : "\u2014"}</span>
          </div>
        </div>
      </header>

      <TabBar active={tab} onChange={setTab} />

      <main className="page-content">
        {renderPage()}
      </main>
    </div>
  );
}
