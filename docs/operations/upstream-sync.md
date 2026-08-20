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

- Last reviewed upstream commit: `105cd5e0c57ab8b6df3bd8af5b534a5bc682fdce`
- Reviewed on: `2026-08-20`

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

### 2026-08-07 review

- Ported thread reliability and UX improvements through `8100062a7`: reconnect
  recovery, activity deduplication, Claude and ACP lifecycle fixes, turn
  pagination, plan-mode improvements, Done/Woke behavior, bulk snooze feedback,
  branch/worktree safeguards, and lower transfer overhead.
- Ported per-device provider settings, the custom theme library/editor, and
  faster shared development startup with prewarmed dependencies, bundled dev
  defaults, and Brotli compression. All incoming names, storage keys, env vars,
  fixtures, and UI strings were adapted to Mognet.
- Preserved the project's configured model and provider options as the source of
  truth for both fresh and reused new-thread drafts, with focused regression
  coverage retained in `useHandleNewThread.test.ts`.
- Kept `apps/mobile`, `apps/marketing`, removed cloud/self-update code, and T3
  Connect configuration deleted. Skipped their dedicated commits and pruned the
  removed-surface portions of mixed commits.
- Kept Effect at beta.78, backported the stalled-connection heartbeat tolerance
  to its existing patch, and skipped the upstream beta.103 migration plus its
  transfer-budget CI harness. The broader runtime upgrade remains a separate,
  deliberate dependency change.

### 2026-08-09 review

- Ported the promoted sidebar, ordered pinned threads, chat-header thread
  actions, theme-aware artwork, browser history, timeline stabilization,
  pending-input Stop state, composer seam fix, and legacy feature settings.
- Ported GitHub PR lookup backoff, delayed reconnect warnings, terminal font
  inheritance, background-agent reaper protection, and desktop zoom shortcuts.
- Preserved Mognet's standalone Chat, project grouping, terminal actions, and
  project-configured model/provider options for both fresh and reused drafts.
- Kept `apps/mobile` deleted and skipped mobile-only, release, vouch, analytics,
  and self-update changes. Analytics and self-update infrastructure remain
  intentionally outside this fork's reduced scope.

### 2026-08-10 review

- Ported persistent diff layouts, running-agent badges, unsent draft previews,
  manual project icons, pinned-project reordering, branch-label fixes, and the
  consolidated project settings screen.
- Ported Claude resume and Codex queued-follow-up fixes, pasted-image path
  access, cleanup of monitors and development servers after settling, and the
  development-database migration helper.
- Preserved each project's configured model and provider options as authoritative
  for fresh, open, reused, and raced new-thread drafts, with focused regression
  coverage retained in `useHandleNewThread.test.ts`.
- Kept `apps/mobile` deleted and skipped mobile-only, usage analytics, vouch,
  cloud boot, and hosted-preview changes. Mognet's existing per-project workspace
  mode remains richer than upstream's fallback migration, so only its useful
  draft-race protections and settings UI were ported.

### 2026-08-10 follow-up review

- Ported contextual project settings, shared project renaming, per-checkout
  actions, settings/thread breadcrumbs, back-navigation retention, themed
  confirmations, SVG sandboxing, bounded favicon/file-link parsing, Windows
  `~/.local/bin` discovery, and the remaining theme/sidebar polish.
- Preserved Mognet's project defaults for new threads, including provider
  options, default branches, worktree-origin behavior, text-generation models,
  and `mognet.json` imports.
- Kept Clerk, Usage, `apps/mobile`, and mobile EAS automation removed; their
  dedicated commits and the Usage portion of the breadcrumb change were
  intentionally skipped.

### 2026-08-11 review

- Ported multi-provider pull-request browsing and in-app reviews for GitHub,
  GitLab, Bitbucket, and Azure DevOps, adapted to Mognet's existing project,
  diff-review, standalone Chat, and reduced server surfaces.
- Ported Windows shell startup and terminal-color improvements, OpenCode model
  parsing, theme contrast and duplication, three-hour snoozing, persisted
  sidebar shelves, oversized-image handling, resource-monitor platform
  detection, and unborn-repository status handling.
- Preserved each project's configured model and provider options as authoritative
  for fresh, open, reused, and raced new-thread drafts, with focused regression
  coverage retained in `useHandleNewThread.test.ts`.
- Kept `apps/mobile`, mobile EAS automation, removed cloud/self-update code, and
  release-only versioning changes deleted or skipped.

### 2026-08-12 review

- Ported self-hosted GitLab pull-request routing, Azure DevOps SSH detection,
  Windows drive-root normalization, and clearer pull/push action icons.
- Ported Shift-click new-thread creation, thread ID copying, durable error-banner
  dismissal, typography reset fixes, composer/model-picker polish, compact
  sidebar controls, and the right-panel surface launcher.
- Ported theme-aware environment artwork, OKLCH theme palettes, and guarded Open
  VSX theme search/import, adapting the flagship theme IDs, colors, and UI to
  Mognet.
- Preserved each project's configured model and provider options as authoritative
  for fresh and reused new-thread drafts, including the new Shift-click path,
  with focused regression coverage retained in `useHandleNewThread.test.ts`.
- Kept `apps/mobile` and Usage deleted, skipped mobile-only, mobile release,
  Usage, and vouch-only commits, and omitted the Usage portions of mixed sidebar
  changes.

### 2026-08-13 review

- Ported pull-request filters, all-environment listing, branch updates, checks,
  reactions, in-place editing, smarter diff ordering, and browser-opening
  modifier clicks across GitHub, GitLab, Bitbucket, and Azure DevOps.
- Ported changed-file and diff scrolling fixes, stable timeline minimaps,
  project/provider metadata in command-palette thread results, theme-mode
  preservation, sidebar width reset, tooltip layering, source-control discovery,
  preview zoom feedback, and tighter Codex collaboration prompts.
- Ported draft repository switching with prompt and image preservation while
  retaining each project's configured model and provider options as authoritative
  for fresh, open, reused, and raced new-thread drafts.
- Kept `apps/mobile`, Clerk, T3 Connect, hosted onboarding, account-environment
  management, and mobile showcase fixtures deleted or skipped. Retained Mognet
  names, URLs, storage keys, and test fixtures throughout the incoming changes.

### 2026-08-14 review

- Ported pull-request panel sizing, environment-scoped errors, latency tracking,
  merge-settling preferences, IME-safe renaming, sidebar artwork/alignment, and
  titlebar control consistency.
- Ported Browser panel favicons, browser-ready local-server discovery, and leaner
  Windows desktop packaging, adapting new storage and temporary-file names to Mognet.
- Preserved project-configured model and provider options as authoritative for fresh
  and reused new-thread drafts, with focused regression coverage retained in
  `useHandleNewThread.test.ts`.
- Kept `apps/mobile`, Clerk, cloud/Live Activity publishing, removed self-update
  helpers, and upstream-only contributor/instruction metadata deleted or skipped.

### 2026-08-15 review

- Ported opening remote environments in a local editor over SSH, including the
  server's advertised SSH targets, the desktop remote-editor probe, and the
  Open In picker's deep-link and unavailable states.
- Ported the terminal subprocess-polling fix that no longer floods the PID
  space, ctrl+c copying of terminal selections in the web app, git status for
  files literally named `HEAD`, and bounded OKLCH gamut mapping.
- Ported day-aware chat timestamps, sidebar action tooltips, pull-request action
  menu alignment, clearer desktop update status, and preview-browser zoom that
  no longer follows app zoom.
- Preserved each project's configured model and provider options as
  authoritative for new-thread drafts; no incoming commit touched thread
  creation or model selection, and `useHandleNewThread.test.ts` coverage is
  unchanged.
- Kept `apps/mobile` and Usage deleted. Skipped mobile-only `184d8ef33`, the
  Usage-only Codex graph contrast fix `f0ebc628c`, upstream AUR packaging
  `e25021af7`, and upstream issue-template/contributing docs `e9ae134c5`.
  `d7abd7f3b` was reverted upstream by `804cba430`, so both were skipped as a
  no-op pair.
- Skipped `9885a845c` (global styling refactor). It is a pure refactor that
  rewrites the composer-glass, titlebar, and stage-art blocks this fork has
  diverged on, with twelve conflicts in `index.css` alone and class renames
  across sixty-nine files. Merging it risks silently breaking Mognet theming
  with no user-visible gain.
- Skipped `c9063f03e` (Windows `server.asar` sidecar packaging). Its
  `build-desktop-artifact.ts` rewrite is interleaved with Clerk relay auth and
  mac passkey signing, both removed here, and it needs an `@electron/asar`
  dependency plus lockfile work against upstream's Effect beta.103 while this
  fork stays on beta.78. This fork's own Windows file-count reduction already
  landed in the previous sync.

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

### 2026-08-20 review

Reviewed `d8a6dfd31..105cd5e0c` (144 commits) and ported 115. The previous
marker recorded a malformed SHA (`d8a6dfd315...9b3c6649`); the real commit is
`d8a6dfd31539a86d08bd4fbd030f8252b3c405ac`, and the range was walked from there.

- Ported server reliability: SQLite `busy_timeout` instead of `SQLITE_BUSY`
  failures, bounded thread activity hydration, snoozed threads settling
  immediately, pending user-input requests settling when a Claude session stops,
  long-running git pushes, provider notification consumers surviving
  `startSession`, and a wire projection persisted for streaming `tool.updated`.
- Ported pull-request work: provider API budget guards with `Retry-After`
  handling, PRs no longer inherited from default upstreams, a merged PR settling
  its thread only once (change requests now carry `updatedAt`), GitLab review
  comments on context lines, and legible review verdicts in the detail panel.
- Ported web UX: file drops across the chat workspace, oversized prompts rejected
  before a provider turn starts, terminal close confirmation, right-click and
  Shift+Insert terminal paste, terminal PR badges retained across checkout
  switches via a parent-held snapshot atom, the unified `WorkspacePageHeader`
  navigation, and the styled-Tooltip lint rule (`no-native-title-tooltip`) with
  this fork's remaining native `title` tooltips migrated.
- Ported desktop: Chrome-style hold-to-quit, windows destroyed before quit
  cleanup, OS-locale timestamps, browser tab muting, hidden preview throttling,
  unthrottled cold-start boot, and mouse thumb buttons routed to the in-app
  browser.
- Preserved this fork's new-thread model defaults. Only `80c37f1a7` touched model
  selection, and it changes which trait options render, not where a new thread's
  model comes from; `resolveNewDraftModelSelection` coverage for fresh and reused
  drafts is unchanged and passing.
- Kept `apps/mobile`, `apps/marketing`, Usage, the cloud/T3 Connect and Clerk
  surfaces, the background-service CLI, `infra/relay`, and `packaging/aur`
  deleted. Skipped `a7c5ad5db`, `efe1773e9`, `6a687ee43`, `7441b3692`,
  `f2d5fc91e` (cloud/Clerk), `684d703b0`, `a4cc1367b`, `8c85b4933`, `62654d279`
  (Usage), `2aa5f095f` (launchd service), `db0659fea` (AUR), and `d23b181da`
  (mobile themes; its web half is only a shared-package extraction serving
  `apps/mobile`).
- Skipped `ad117235b`: it deletes this fork's Mognet desktop icons in favour of
  upstream `blueprint`/`black` assets and adds T3-branded DMG art.
- Skipped `324ddda31` (`npx t3 triage`): it funnels bug reports into
  `pingdotgg/t3code` issues, which is upstream support infrastructure.
- Skipped `d79f975d0`: it tunes `chat-composer-glass-shell-with-context`, a class
  this fork replaced when it rebuilt the composer glass.
