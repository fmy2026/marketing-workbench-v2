# Validation record

Verified at `2026-09-21T02:54:22Z` against commit
`3761a9f60eb1b27d4dcf664e8a43fd6e603f1957`.

- AC-01 / AC-02: `npm run test:project-video-append` passed. The isolated
  suite covers one material push, immediate 0/1 observation, later 1/1
  observation on the same consumed Plan, safe evidence/readback persistence,
  query failure counted as zero verified, and a stale observation that cannot
  overwrite a newer result.
- AC-03: `npm run test:workbench-progress` and
  `npm run test:workbench-client-pages` passed. They cover the exact
  `检查推送结果` command, Gate action, button label, no-repush message, and
  server-projected progress rendering.
- AC-04 (partial): `npm run workbench:release` built release
  `3761a9f60eb1b27d4dcf664e8a43fd6e603f1957`; company mode was applied on
  `192.168.42.7`, the root returned HTTP 200, and LaunchAgent ran from that
  release root. The remaining owner-only runtime acceptance is to open the
  original Case and click `检查推送结果`; it is a readonly platform query and
  must not click confirmation, material push, or append.

No OAuth refresh, schema migration, material push, or project-video append was
performed for this Task.
