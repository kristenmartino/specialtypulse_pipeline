import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useReducer, useMemo } from "react";
import { dashboardData } from "./data/dashboardData";
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
import { readReviewLocation, reviewSearch } from "./data/reviewLocation";
import { businessSetting } from "./data/salesContext";

const TAB_LABELS = {
  market:    "Market Intelligence",
  procedure: "Procedure Detail",
  pipeline:  "Pipeline Intelligence",
  adoption:  "Adoption Tracking",
  pdp:       "Access examples",
};

export default function App() {
  const [initialLocation] = useState(() => readReviewLocation(window.location.search));
  const [tab, setTab] = useState(initialLocation.tab);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [reviewState, dispatchReview] = useReducer(reviewReducer, { ...initialReviewState, specialty: initialLocation.specialty });
  const [procedureCode, setProcedureCode] = useState(initialLocation.code);
  const [comparisonYear, setComparisonYear] = useState(initialLocation.year);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [focusEditor, setFocusEditor] = useState(0);
  const selectSpecialty = specialty => {
    if (specialty !== reviewState.specialty) { setProcedureCode(''); setComparisonYear(null); }
    dispatchReview({ type: 'select', specialty });
  };
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
    dispatchReview({ type: 'add-procedure', specialty: procedure.provider_specialty, procedure, mart });
    openBrief();
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [cfg, chk, bench, pipe, m, eng] = await Promise.all([
        dashboardData("access_config"),
        dashboardData("access_examples"),
        dashboardData("specialty_benchmarks"),
        dashboardData("pipeline_intelligence"),
        dashboardData("mart"),
        dashboardData("engagement"),
      ]);
      setConfig(cfg || []);
      setChecks(chk || []);
      setBenchmarks(bench || []);
      setPipeline(pipe || []);
      setMart(m || []);
      setEngagement(eng || []);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);


  // Each tab is its own view: reset scroll and title on switch.
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    document.title = `SpecialtyPulse · ${TAB_LABELS[tab]}`;
  }, [tab]);

  useEffect(() => {
    if (!loading) window.history.replaceState(null, '', reviewSearch({ tab, specialty: selectedSpecialty, code: procedureCode, year: comparisonYear }));
  }, [tab, selectedSpecialty, procedureCode, comparisonYear, loading]);

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
      case "market":    return <><ReviewHandoff benchmarks={benchmarks} pipeline={pipeline} onNavigate={navigateToResult} selected={selectedSpecialty} onSelect={selectSpecialty} draft={draft} onEdit={(field, value) => dispatchReview({ type: 'edit', specialty: selectedSpecialty, field, value })} onRemove={id => dispatchReview({ type: 'remove-procedure', specialty: selectedSpecialty, id })} open={reviewOpen} onOpenChange={setReviewOpen} focusEditor={focusEditor} /><MarketIntelligence benchmarks={benchmarks} onDrill={drillToSpecialty} /></>;
      case "procedure": return <ProcedureDetail mart={mart} focusSpecialty={selectedSpecialty} onSelectSpecialty={selectSpecialty} onAddProcedure={addProcedure} onOpenBrief={openBrief} procedureCode={procedureCode} onSelectProcedure={setProcedureCode} comparisonYear={comparisonYear} onSelectYear={setComparisonYear} />;
      case "pipeline":  return <PipelineIntelligence pipeline={pipeline} isSample={true} />;
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
            <span>Portfolio demo</span>
            <span className="val">{tab === 'pipeline' ? 'Static sales fixture' : 'Reimbursement CY2021–2023'}</span>
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
        <>
          <div className="demo-intro">
            <p>For specialty analysts supporting healthcare-software sales. Compare payment patterns and prepare questions for a sales or operations lead.</p>
            <nav aria-label="Project links">
              <a href="https://kristenmartino.ai/work/specialtypulse-pipeline" target="_blank" rel="noreferrer">Case study ↗</a>
              <a href="https://github.com/kristenmartino/specialtypulse_pipeline" target="_blank" rel="noreferrer">Source ↗</a>
            </nav>
          </div>
          <p className="demo-disclosure">Demo: synthetic CMS-schema records; 2021–2022 are generated comparison scenarios. Sales, usage and access rules are illustrative. This public demo does not enforce user-specific access.</p>
          <details className="review-evaluation"><summary>Assumed business setting</summary><p>{businessSetting}</p><p>Reimbursement signals help frame discovery questions. Account conversations must establish customer needs before recommending software or prioritizing outreach.</p></details>
        </>
        <div className="page-fade" key={tab}>
          {renderPage()}
        </div>
        {!loading && !fetchError && ["market", "procedure", "pipeline"].includes(tab) && (
          <DashboardSummary benchmarks={benchmarks} mart={mart} pipeline={pipeline} onNavigate={navigateToResult} isSample={true} />
        )}

      </main>
    </div>
  );
}
