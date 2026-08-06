# Upstream Sync

This fork is desktop-first. Keep upstream syncs selective and do not blindly merge
large upstream branches into `main`.

## Pruned Surfaces

The following upstream surfaces are intentionally removed from this fork:

- `apps/mobile`
- `apps/marketing`
- mobile EAS workflow and mobile native static-check scripts

Do not restore these directories during upstream sync unless Bernardo explicitly
asks for them.

## Last Reviewed Upstream

- Last reviewed upstream commit: `a483337a02d4ac641db0219517816c300a33be6b`
- Reviewed on: `2026-08-06`

Use this marker for selective syncs that manually port or skip upstream commits.
Those commits may continue to appear in `HEAD..upstream/main` because they were
not merged by ancestry.

### 2026-08-05 review

- Ported desktop/web/server fixes through `9697b765e`, including thread pinning,
  configurable fonts, browser and diff-panel improvements, durable titles,
  pairing QR endpoint selection, project grouping, and terminal reliability.
- Kept `apps/mobile` deleted while reviewing mobile-only commits `94331c58e`,
  `70de6e178`, and `e0c85a20e`, plus the mobile portions of `da6e1a967` and
  `47dfc6526`.
- Skipped `2b1d4fecb` because the fork remains on Effect beta.78; a beta.103
  upgrade needs a dedicated dependency migration rather than a broad lockfile
  rewrite.
- Skipped upstream self-update and release automation from `7b38fb5c6` and
  `9697b765e` because their cloud launcher, hosted app, relay, and release
  workflow surfaces are intentionally removed here.
- Skipped the portal-specific composer menu change from `9235c83eb`; Mognet's
  menu is already anchored inside the composer with CSS positioning.

### 2026-08-06 review

- Ported desktop/server subagent and workflow observability from `a2ca89aa1`,
  including the Agents panel, background-work liveness, and Codex/Claude
  collaboration activity ingestion.
- Ported model-picker shortcut refresh, terminal font reliability and previews,
  terminal split/loading fixes, MCP payload slimming, persistent plan-sidebar
  dismissal, and time-format-aware snooze labels through `a483337a0`.
- Kept `apps/mobile` and `scripts/mobile-showcase-environment.ts` deleted while
  reviewing the mobile portions of `de592a00e` and `a2ca89aa1`.
- Skipped `990bb0b68` because it only changes the removed cloud launcher and
  self-update flow.

Every sync, including scheduled task runs, must:

- read this marker before listing candidate upstream commits
- compare with `git log --oneline <last-reviewed-sha>..upstream/main`
- update this marker to the newest upstream commit that was reviewed, whether
  the change was merged, manually ported, or intentionally skipped
- mention the marker update in the PR body

## Recommended Flow

1. Fetch upstream.

   ```bash
   git fetch upstream
   ```

2. Inspect candidate commits.

   ```bash
   git log --oneline fbd77420f..upstream/main
   git diff --stat fbd77420f...upstream/main
   ```

   If the last reviewed upstream marker already matches `upstream/main`, stop:
   the fork is already reviewed against upstream.

3. Prefer cherry-picking or manually porting relevant changes in these areas:

   - `apps/server`
   - `apps/desktop`
   - `apps/web`
   - `packages/contracts`
   - `packages/shared`
   - `packages/client-runtime`
   - `packages/ssh`
   - `packages/tailscale`
   - `packages/effect-*`
   - desktop build/release scripts

4. If an upstream change touches a pruned surface plus shared code, port only the
   shared/server/desktop behavior needed by this fork.

5. Run the desktop-core quality path before finishing:

   ```bash
   pnpm run quality:core
   ```

6. For broad dependency or protocol updates, also run:

   ```bash
   pnpm run typecheck:full
   pnpm run test:full
   ```

## Conflict Policy

- Keep local branding and package/runtime names unless the sync explicitly needs
  otherwise.
- Keep `@t3tools/*` package names unless doing a deliberate package rename.
- Treat deleted mobile/marketing files as deleted when resolving conflicts.
- If upstream changes are mostly in pruned surfaces, skip them.
