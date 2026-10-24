import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useReducer, useMemo } from "react";
import { domoFetch, isDomo } from "./data/domoFetch";
import { fmt } from "./data/constants";
import TabBar from "./components/TabBar";
import ReviewHandoff from "./components/ReviewHandoff";
import DashboardSummary from "./components/DashboardSummary";
import MarketIntelligence from "./pages/MarketIntelligence";
import ProcedureDetail from "./pages/ProcedureDetail";
import PipelineIntelligence from "./pages/PipelineIntelligence";
import AdoptionTracking from "./pages/AdoptionTracking";
import PdpGovernance from "./pages/PdpGovernance";
import { buildReviewHandoff } from "./data/reviewFacts";
import { initialReviewState, getReviewDraft, reviewReducer } from "./data/reviewDraft";

const TAB_LABELS = {
  market:    "Market Intelligence",
  procedure: "Procedure Detail",
  pipeline:  "Pipeline Intelligence",
  adoption:  "Adoption Tracking",
  pdp:       "PDP Governance",
};

export default function App() {
  const [tab, setTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return Object.prototype.hasOwnProperty.call(TAB_LABELS, requested) ? requested : "market";
  });
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const [reviewState, dispatchReview] = useReducer(reviewReducer, initialReviewState);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [focusEditor, setFocusEditor] = useState(0);
  const selectSpecialty = specialty => dispatchReview({ type: 'select', specialty });
  const drillToSpecialty = (specialty) => { selectSpecialty(specialty); setTab("procedure"); };
  const navigateToResult = (target, specialty) => {
    if (specialty) selectSpecialty(specialty);
    setTab(target);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  };
  const contentRef = useRef(null);

  // DataSet state
  const [config, setConfig]           = useState([]);
  const [checks, setChecks]           = useState([]);
  const [benchmarks, setBenchmarks]   = useState([]);
  const [pipeline, setPipeline]       = useState([]);
  const [mart, setMart]               = useState([]);
  const [engagement, setEngagement]   = useState([]);

  const defaultSpecialty = useMemo(() => buildReviewHandoff(benchmarks, pipeline)?.specialty || '', [benchmarks, pipeline]);
  const selectedSpecialty = reviewState.specialty || defaultSpecialty;
  const draft = getReviewDraft(reviewState, selectedSpecialty);
  const openBrief = () => { setReviewOpen(true); setFocusEditor(value => value + 1); setTab('market'); };
  const addProcedure = procedure => {
    dispatchReview({ type: 'add-procedure', specialty: procedure.provider_specialty, procedure });
    openBrief();
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
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
      setFetchError(true);
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
  useLayoutEffect(() => {
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
    if (fetchError) {
      return (
        <div className="empty-state" role="alert">
          <p>Dashboard data could not be loaded.</p>
          <button className="exec-brief-btn" onClick={fetchData}>Try again</button>
        </div>
      );
    }
    switch (tab) {
      case "market":    return <>{!isDomo && <ReviewHandoff benchmarks={benchmarks} pipeline={pipeline} onNavigate={navigateToResult} selected={selectedSpecialty} onSelect={selectSpecialty} draft={draft} onEdit={(field, value) => dispatchReview({ type: 'edit', specialty: selectedSpecialty, field, value })} onRemove={id => dispatchReview({ type: 'remove-procedure', specialty: selectedSpecialty, id })} open={reviewOpen} onOpenChange={setReviewOpen} focusEditor={focusEditor} />}<MarketIntelligence benchmarks={benchmarks} onDrill={drillToSpecialty} /></>;
      case "procedure": return <ProcedureDetail mart={mart} focusSpecialty={selectedSpecialty} onSelectSpecialty={selectSpecialty} onAddProcedure={addProcedure} onOpenBrief={openBrief} />;
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
            <span>{isDomo ? "Last fetched" : "Portfolio demo"}</span>
            <span className="val">
              {isDomo
                ? (lastFetch ? fmt.date(lastFetch.toISOString()) : "—")
                : "CY2021–2023"}
            </span>
          </div>
        </div>
      </header>

      <TabBar active={tab} onChange={setTab} />

      <main
        className="page-content"
        ref={contentRef}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {!isDomo && <>
          <div className="demo-intro">
            <p>For specialty analysts preparing a payment-pattern review for a sales or operations lead. Identify what needs investigation and what questions to hand off.</p>
            <nav aria-label="Project links">
              <a href="https://kristenmartino.ai/work/specialtypulse-pipeline" target="_blank" rel="noreferrer">Case study ↗</a>
              <a href="https://github.com/kristenmartino/specialtypulse_pipeline" target="_blank" rel="noreferrer">Source ↗</a>
            </nav>
          </div>
          <p className="demo-disclosure">Demo: synthetic CMS-schema records; 2021–2022 are generated comparison scenarios. Sales, usage and access rules are illustrative. Domo access controls are not active here.</p>
        </>}
        <div className="page-fade" key={tab}>
          {renderPage()}
        </div>
        {!loading && !fetchError && ["market", "procedure", "pipeline"].includes(tab) && (
          <DashboardSummary benchmarks={benchmarks} mart={mart} pipeline={pipeline} onNavigate={navigateToResult} />
        )}

      </main>
    </div>
  );
}
