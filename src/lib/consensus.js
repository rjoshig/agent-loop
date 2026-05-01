// Approval bookkeeping. Phases reset their own approval set; the helpers here
// just answer "are the parties for this phase aligned yet?".

export function bothApproved(approvals) {
  return approvals?.csc === true && approvals?.compliance === true;
}

export function techApproved(approvals) {
  return approvals?.tech === true;
}

export function allApproved(approvals) {
  return bothApproved(approvals) && techApproved(approvals);
}

export function emptyApprovals() {
  return { csc: false, compliance: false, tech: false };
}

export function summarizeConcerns(turns) {
  const concerns = [];
  for (const turn of turns) {
    const list = turn?.payload?.concerns;
    if (Array.isArray(list)) {
      for (const c of list) concerns.push({ agent: turn.agent, concern: c });
    }
  }
  return concerns;
}
