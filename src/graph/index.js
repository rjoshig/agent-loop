// StateGraph assembly. The graph is intentionally linear — looping happens
// inside individual nodes (enrichment loops between CSC and Compliance until
// consensus or cap; techReview loops between Tech and CSC/Compliance; QC
// loops over all three). Keeping the loops node-internal keeps the graph
// shape easy to reason about and the round-cap logic in one place per phase.

import { END, START, StateGraph } from '@langchain/langgraph';

import { runEnrichment } from '../nodes/enrichment.js';
import { runTechReview } from '../nodes/techReview.js';
import { runHumanGate } from '../nodes/humanGate.js';
import { runBuild } from '../nodes/build.js';
import { runQc } from '../nodes/qc.js';

import { State } from './state.js';
import { afterEnrichment, afterHumanGate, afterQc, afterTechReview } from './edges.js';

export function buildGraph() {
  const graph = new StateGraph(State)
    .addNode('enrichment', runEnrichment)
    .addNode('techReview', runTechReview)
    .addNode('humanGate', runHumanGate)
    .addNode('build', runBuild)
    .addNode('qc', runQc)
    .addEdge(START, 'enrichment')
    .addConditionalEdges('enrichment', afterEnrichment, {
      techReview: 'techReview',
      [END]: END,
    })
    .addConditionalEdges('techReview', afterTechReview, {
      humanGate: 'humanGate',
      [END]: END,
    })
    .addConditionalEdges('humanGate', afterHumanGate, {
      build: 'build',
      [END]: END,
    })
    .addEdge('build', 'qc')
    .addConditionalEdges('qc', afterQc, {
      [END]: END,
    });

  return graph.compile();
}
