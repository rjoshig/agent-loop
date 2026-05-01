// Conditional edge functions. Each takes the latest state and returns the
// name of the next node, or END.

import { END } from '@langchain/langgraph';

export function afterHumanGate(state) {
  if (state.humanDecision?.approved === true) return 'build';
  return END;
}

export function afterTechReview(state) {
  // techReview node either approves (→ humanGate) or halts the run.
  if (state.haltReason) return END;
  return 'humanGate';
}

export function afterEnrichment(state) {
  if (state.haltReason) return END;
  return 'techReview';
}

export function afterQc(_state) {
  return END;
}
