# CI quality gates

- `.github/workflows/ci.yml` runs `vp check`, `vp lint`, `vp run typecheck`, and `vp run test` on pull requests and pushes to `main`.
- `.github/workflows/release.yml` is manual-only for now. It can still publish GitHub Release desktop artifacts when run through `workflow_dispatch`, but it does not run from tags or normal CI.
- The release workflow auto-enables signing only when platform credentials are present. Without signing credentials, it still releases unsigned artifacts.
- See [Release Checklist](./release.md) for the full release/signing setup checklist.
