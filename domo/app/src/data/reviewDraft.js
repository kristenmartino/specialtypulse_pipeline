const emptyDraft = { evidence: [], observation: '', question: '', reviewer: '', nextCheck: '' };
const initialReviewState = { specialty: '', drafts: {} };
const draftFields = ['observation', 'question', 'reviewer', 'nextCheck'];
const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));
const { buildProcedureComparison, evidenceReferences } = require('./procedureFacts');
const { selectedDiscovery } = require('./accountDiscovery');

function getReviewDraft(state, specialty) {
  return state.drafts[specialty] || emptyDraft;
}

// One specialty selection drives both the investigation and its draft. Drafts
// stay separate so switching specialties cannot relabel another brief's notes.
function reviewReducer(state, action) {
  if (action.type === 'select') return { ...state, specialty: action.specialty };
  const specialty = action.specialty;
  if (!specialty) return state;
  const draft = getReviewDraft(state, specialty);
  let next;
  if (action.type === 'edit' && action.field === 'accountDiscoveryId') {
    if (action.value !== '' && !selectedDiscovery(specialty, action.value)) return state;
    next = { ...draft, accountDiscoveryId: action.value };
  } else if (action.type === 'edit' && draftFields.includes(action.field)) {
    next = { ...draft, [action.field]: action.value };
  } else if (action.type === 'add-procedure') {
    const row = action.procedure;
    if (!row || row.provider_specialty !== specialty || !row.hcpcs_code || !numeric(row.year)) return state;
    const comparison = buildProcedureComparison(action.mart || [row], specialty, row.hcpcs_code, row.year);
    if (!comparison) return state;
    const evidence = { ...comparison, references: evidenceReferences(comparison) };
    next = { ...draft, evidence: [...draft.evidence.filter(item => item.id !== evidence.id), evidence] };
  } else if (action.type === 'remove-procedure') {
    next = { ...draft, evidence: draft.evidence.filter(item => item.id !== action.id) };
  } else return state;
  return { specialty, drafts: { ...state.drafts, [specialty]: next } };
}

function draftCompleteness(draft = emptyDraft) {
  const checks = [
    { label: 'Procedure evidence', complete: draft.evidence.length > 0 },
    { label: 'Analyst observation', complete: Boolean(draft.observation.trim()) },
    { label: 'Open question', complete: Boolean(draft.question.trim()) },
    { label: 'Next reviewer and requested check', complete: Boolean(draft.reviewer.trim() && draft.nextCheck.trim()) },
  ];
  return { checks, count: checks.filter(item => item.complete).length };
}

module.exports = { initialReviewState, getReviewDraft, reviewReducer, draftCompleteness };
