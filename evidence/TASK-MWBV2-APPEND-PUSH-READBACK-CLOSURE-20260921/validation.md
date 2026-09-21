# Validation record

Verified at `2026-09-21T03:29:25Z` against release candidate
`7b3e04ace9da16a2dcc122b52d0e502552c9e592`.

- AC-01: `npm run test:project-video-append` passed. It covers one material
  push, immediate 0/1 observation, planned 30-second continuation, the final
  180-second round, later 1/1 observation on the same consumed Plan, and no
  automatic append.
- AC-02: the same isolated suite passed query failure as zero verified,
  safe evidence/readback persistence, one claim per round, frozen Plan/hash
  binding, and a stale observation that cannot overwrite a newer result.
- AC-03: `npm run test:workbench-conversation`,
  `npm run test:workbench-progress`, `npm run test:workbench-client-pages`,
  and `npm run test:video-material-executor` passed. They cover the exact
  `检查推送结果` command, frozen scheduled-round binding, server-projected
  progress, the no-repush message, and the shared video-readiness fixture
  under the existing Plan-bound confirmation contract.
- AC-04: `npm run check:project -- --phase start` passed. Release
  `7b3e04ace9da16a2dcc122b52d0e502552c9e592` was built, pushed to
  `origin/main`, and applied in company mode on `192.168.42.7`; a direct
  proxy-bypassed request returned HTTP 200 and LaunchAgent reported that
  release as its working directory. A readonly Postgres check found the
  original Case at `project_video_append_completed`, with exactly one
  succeeded `oc_project_video_material_push` and one succeeded
  `oc_project_video_append` action. No new platform write was made.

No OAuth refresh, schema migration, material push, or project-video append was
performed for this Task.
