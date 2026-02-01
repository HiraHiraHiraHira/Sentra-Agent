import { executePlan } from '../planners.js';

export async function executePlanWithPlanPatch(runId, objective, mcpcore, plan, opts = {}) {
  return executePlan(runId, objective, mcpcore, plan, opts);
}

export default { executePlanWithPlanPatch };
