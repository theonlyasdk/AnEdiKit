// AnEdiKit - Central error reporting (leaf, no imports).
// Replaces silent `catch (_) {}` blocks: every swallowed error now carries
// the call-site context so failures are diagnosable instead of invisible.
// Deliberately warning-level (not throwing): these sites are best-effort
// UI/teardown paths where propagating would break unrelated flows.

export function reportError(context, err) {
  try {
    const detail = err instanceof Error ? (err.stack || err.message) : String(err);
    console.warn(`[AnEdiKit] ${context}:`, detail ?? err);
  } catch (_) {
    // Last resort: reporting itself must never throw.
  }
}
