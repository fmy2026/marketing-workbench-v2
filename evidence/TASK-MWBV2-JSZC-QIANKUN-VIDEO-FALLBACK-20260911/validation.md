# Validation

## AC-01

`node scripts/04-video-material-executor-smoke.mjs` passed. The existing video bind plan, fail-list stop behavior, scope validation, and no-real-write guard remain intact.

## AC-02

The same smoke confirms the controlled source video ID path and no local-file-hash precondition for bind execution.

## AC-03

The same smoke confirms already-visible target material remains a no-op and missing material stays in the controlled bind plan.

## AC-04

`npm run check:project -- --phase start` passed for the active task. The checker reported no database or platform access.
