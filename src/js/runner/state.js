// AnEdiKit - Job-runner shared state (owns all module state).
export const runnerState = {
  isRunning: false,
  isBatchRunning: false,
  batchCancelRequested: false,
  currentProgressUnlisten: null,
  currentLogUnlisten: null,
  currentFinishedUnlisten: null,
  activeJobInfo: null,
  jobStartTime: 0,
  jobCompletionResolver: null,
  activeJobCallbacks: null,
};

export function isJobRunning() {
  return runnerState.isRunning || runnerState.isBatchRunning;
}


export function isCancelRequested() {
  return runnerState.batchCancelRequested;
}


export function resetCancelFlag() {
  runnerState.batchCancelRequested = false;
}
