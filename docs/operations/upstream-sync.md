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

- Last reviewed upstream commit: `94401d01b956828eaa989ff4a80046c20d7b6088`
- Reviewed on: `2026-08-28`

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

### 2026-08-24 follow-up review

Reviewed `5a7a7cf29..b4be33f07` (19 commits) and ported 15. This picks up where the
`beab6886f..5a7a7cf29` review left off; the three commits that review deliberately
skipped inside its own range stay skipped here.

- Ported thread reliability: `stop` no longer leaves Claude work running behind a
  killed session, tool calls stop leaving a blank page in a thread, recovered tool
  failures stop marking work logs red, and pushes fall back to the remote default
  branch instead of assuming `main`.
- Ported the Codex `/feedback` command: a thread and its Codex logs upload to
  OpenAI and the returned thread ID renders in the timeline and a copyable toast.
  The wire method, its `AuthOrchestrationOperateScope` requirement, and the adapter
  plumbing came with it.
- Ported the `$` and `/` skill menu redesign behind a new `showSkillsInSlashMenu`
  client setting, settled pinned threads moving into the Settled section, work-log
  rows being reused during streaming, the right panel toggle accepting clicks again
  after closing on desktop, server update banners sitting flush with the composer,
  configured URLs with uppercase schemes being treated as secure, a legible provider
  badge in dark themes, sidebar project menu row padding, deduplicated provider
  update progress, and release notes staying visible while downloading.
- Preserved this fork's new-thread model defaults. No commit in this range touches
  thread creation or model selection; `useHandleNewThread.test.ts` and
  `resolveNewDraftModelSelection` coverage are unchanged and passing.
- Kept `apps/mobile`, Usage, Clerk, the cloud service launcher, and
  `telemetry/AnalyticsService` deleted. Dropped the mobile halves of `3db38b881`,
  `f70eeeeb0`, and `9da0fab08`, and removed the `AnalyticsService.layerTest` layer
  from the `ProviderService` feedback test that came with `3db38b881`.
- Kept `packages/client-runtime/src/providerSkills.ts` out of the tree. `9da0fab08`
  adds `getProviderSkillsForSlashMenu` and `getProviderSlashCommandsForSlashMenu`
  there to serve `apps/mobile`; both were applied to this fork's
  `apps/web/src/providerSkillPresentation.ts` instead.
- Adapted `3db38b881` to this fork's composer. Upstream's `sendDisabledReason`
  change lands inside the `chat-composer-glass-shell` JSX this fork replaced, so
  only the `feedbackUploading` branch was taken and the fork's composer layout,
  `terminalPanelOpenByThreadRef`, and `gitCwd` wiring were kept. Its
  `RpcAuthorization` test hunk was trimmed to the feedback assertion, dropping the
  relay-scope assertion for a surface removed here.
- Rebranded incoming strings to Mognet: `T3 Code` in `docs/user/composer.md` and
  `docs/providers/codex.md`, and the `t3code-git-manager-` temp-dir prefixes in
  `GitManager.test.ts` that broke this file's existing `mognet-` convention.

Skipped 4 commits:

- `55c909334`, `5a7a7cf29` — mobile-only.
- `25dcee00a` — restructures upstream's `release.yml` and its Windows `server.asar`
  packaging. This fork has no release workflow and no `WINDOWS_SERVER_ASAR_IGNORE_GLOBS`
  (`c9063f03e` remains skipped). Its one portable win, the `pnpm-workspace.yaml`
  overrides dropping unused Claude SDK binaries, needs a lockfile change and belongs
  in a dedicated dependency PR.
- `2433f4c1c` — `.macroscope/approvability.md`, not present here.

Still skipped from the previous review's range, unchanged: `9167622a4` (`.plans/`
removal, a repo content decision for Bernardo), `9f12eab38` (PR-asset CI guard),
`292c6dd8c` (model picker double border, which would strip Mognet's
`dropdown-glass model-picker-surface` styling), plus `aa17ec6e7`, `035058a23`,
`11f051373`, `d7b9a689f`, `8f7da3b99`, `7107a98a2`, and `45a2c4b2a`.

### 2026-08-25 review

Reviewed `b4be33f07..99960383d` (30 commits) and ported 19.

- Ported server reliability: a thread's worktree is recreated before a turn starts
  instead of failing, deleting a thread whose worktree is already gone no longer
  errors (and prunes the stale registration), new worktrees check out submodules,
  a failed provider interrupt recovers instead of wedging the thread, merged pull
  request badges survive branch deletion, live pull request reads are no longer
  served from a stale cache, OpenCode honours auto-accept edits, OpenCode skill
  discovery output is bounded, and a subagent snapshot racing `task_started` no
  longer overwrites the authoritative model.
- Ported the CLI entrypoint fix (`3fd506433`): `import.meta.main` is undefined on
  Node 22.16, 22.17 and 23.11, all inside `engines.node`, so the CLI loaded every
  module and exited 0 without output. `isEntrypoint` falls back to comparing
  `process.argv[1]`, resolving symlinks the way npm and npx install the binary.
- Ported attachment pre-upload (`e9f50c3ef`): images upload while the user is still
  typing, with a per-image queue, progress and retry affordances, a server-side
  upload endpoint, and cleanup of orphaned uploads when a dispatch fails.
- Ported web fixes: terminal sidebar groups read as Single/Stacked/Side by side with
  a shared tab close button, terminal links only look clickable when they are, agent
  and Windows file links open in the file viewer, client and server versions compare
  as semver (so a server ahead of the client is not skew, and two nightlies on one
  release still compare by build), and update notices stop showing through the
  composer.
- Preserved this fork's new-thread model defaults. No ported commit touches thread
  creation or model selection; `useHandleNewThread.test.ts` and
  `resolveNewDraftModelSelection` coverage are unchanged and passing.
- Added `HostProcessExecutablePath` to `packages/shared/src/hostProcess.ts`. It
  arrived upstream with the removed `t3 connect` surface, so this fork never had it,
  and the incoming OpenCode inventory test needs it.
- Adapted `e9f50c3ef` to this fork's composer and dispatch. Upstream's `ChatView`
  hunk rewrites the composer glass wrapper and terminal state this fork replaced, so
  only the `attachmentUploadsCapabilityKnown` and `supportsAttachmentUploads` props
  were taken. `cleanupFailedUploadedAttachments` was wired into both the
  `ThreadTurnBootstrapDispatcher` and engine dispatch paths, and the
  `recordClientCommandAnalytics` call that came with the `ws.ts` hunk was dropped
  with the rest of `AnalyticsService`. Its `ComposerPreviewAnnotationCards` test
  asserting `data-slot="button"` on the removal control was dropped because this
  fork's removal control is a plain element.
- Rebranded incoming strings to Mognet: the `t3-entrypoint-test-` temp-dir prefix and
  `t3` symlink name in `entrypoint.test.ts`, the `t3-opencode-inventory-` prefix and
  `T3_TEST_*` env vars in `opencodeRuntime.inventory.test.ts`, and
  `t3code/bootstrap-refName` in `server.test.ts`.
- Fixed the incoming symlink case in `entrypoint.test.ts` for macOS, where
  `os.tmpdir()` is itself reached through a symlink. The test now realpaths the
  module URL the way Node hands it to a module; upstream's version only passes on
  Linux.
- Kept `apps/mobile`, `apps/marketing`, Usage, the cloud service launcher, and
  `telemetry/AnalyticsService` deleted. Dropped `apps/server/src/serviceLauncher.ts`
  from `3fd506433` and the mobile halves of `7c6163c67` and `99960383d`.

Skipped 11 commits:

- `17dbe8dda`, `8287f2c3a`, `a1379db81` — Usage-only.
- `9eba1252c`, `2d2efff28`, `f9a726e62` — mobile-only.
- `e31e568bd` — `apps/marketing` Vercel configuration.
- `a00218741` — upstream contributor vouching.
- `643daa516`, `c0047c252` — both only edit `patches/@legendapp__list@3.3.5.patch`.
  Their `react.js`/`react.mjs` hunks are real web fixes (expanded tool calls hiding
  thread content, follow-ups leaving blank space), but pnpm keys patches by exact
  version and this fork pins `@legendapp/list` at `3.3.3` with no patch entry.
  Adopting them means a version bump plus a lockfile change, which belongs in a
  dedicated dependency PR.
- `7c6163c67` (Codex app access approval prompts) — blocked on the Effect upgrade.
  Codex sends the approval choices as `requestedSchema.properties.<field>.enum`, and
  the generated `McpElicitationPrimitiveSchema` is
  `Union([EnumSchema, StringSchema, NumberSchema, BooleanSchema])`. On this fork's
  Effect beta.78 that union resolves `{ type: "string", enum: [...] }` to the plain
  string member and drops `enum` during decode, so `toMcpElicitationResponse` finds
  no acceptable option and every form elicitation is declined before it can reach the
  user. Decoding `McpElicitationEnumSchema` on its own keeps `enum`, so the defect is
  union member selection, not the schema. Upstream runs Effect beta.103, where its
  own five elicitation integration tests pass. Porting it here would ship a feature
  that declines exactly the prompts it exists to surface, so it was reverted in full
  and should be revisited with the beta.103 migration.

Still skipped from earlier reviews, unchanged: `9167622a4`, `9f12eab38`, `292c6dd8c`,
`25dcee00a`, `2433f4c1c`, `c9063f03e`, `9885a845c`, plus `aa17ec6e7`, `035058a23`,
`11f051373`, `d7b9a689f`, `8f7da3b99`, `7107a98a2`, `45a2c4b2a`, `55c909334`, and
`5a7a7cf29`.

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

### 2026-08-20 follow-up review

Reviewed `105cd5e0c..beab6886f` (6 commits) and ported 5.

- Ported composer state drawers (`792a1404f`): the command menu, stash menu,
  banner stack, and thread sync pill now attach to the composer as masked
  drawers, the stash moves to a shoulder tab, and a new tasks badge/drawer shows
  live plan progress with per-step durations.
- Ported the one-line tool activity collapse (`4a9edff4c`): a turn's tool calls
  fold into a single animated row with a "Worked for" summary.
- Ported the server-side tool lifecycle identity fix (`b2e2ccfdb`) so
  `tool.started`/`tool.updated` carry `toolCallId` and Claude/OpenCode command
  inputs normalize before slimming. This is the wire half the collapsed
  timeline reads.
- Ported larger Open VSX import limits (`beab6886f`) and the redundant timestamp
  assertion cleanup (`f708f63fa`).
- Preserved this fork's new-thread model defaults. No incoming commit touched
  thread creation or model selection; `useHandleNewThread.test.ts` and
  `resolveNewDraftModelSelection` coverage are unchanged and passing.
- Kept `packages/client-runtime/src/providerSkills.ts` out of the tree.
  `792a1404f` extracts this fork's `apps/web/src/providerSkillPresentation.ts`
  into a shared package purely to serve `apps/mobile`; the new
  `resolveProviderSkillSourceKind` API was applied in place instead.
- Adapted the drawer CSS to this fork's composer glass. Upstream scopes the
  attachment rules to `.chat-composer-glass-shell`, a wrapper this fork dropped
  when it rebuilt the composer glass (`9885a845c` and `d79f975d0` remain
  skipped). The equivalent rules are scoped to `.chat-composer-glass-host`, and
  only the `live-activity-focus` utilities were taken from `4a9edff4c`'s CSS —
  the rest of that hunk was `@utility` refactor fallout.
- Backfilled the `compact`, `icon-micro`, and `ghost-muted` button variants the
  new drawer components need, without taking upstream's `glass` variant or its
  `default`/`outline` restyling, which would overwrite this fork's button look.
- Rebranded the incoming `html[data-theme-id="t3-chat"]` composer rules to
  `mognet`, and cleaned the two pre-existing `t3-chat` theme selectors in
  `index.css` that no longer matched any theme id in this fork.
- Skipped `9027d6267` (stable Clerk Electron release). Clerk is removed here;
  the commit only touches `pnpm-workspace.yaml` Clerk overrides and the lockfile.

### 2026-08-24 review

Reviewed `beab6886f..5a7a7cf29` (56 commits) and ported 46.

- Ported server reliability: orphaned provider sessions reconciled at startup so a
  thread that lost its process settles into an actionable error instead of showing
  as working, failed thread bootstraps now retry with a fresh id (the wire error
  carries `bootstrapThreadDisposition`), completed Codex threads no longer stay
  stuck on working, mixed tool runs stop being marked failed, Daybreak models stay
  out of legacy model lists, HTML assets are served as UTF-8, the Cursor provider is
  enabled by default like every other provider, and `git worktree add` gets a 300s
  timeout so large checkouts stop failing at 30s.
- Ported composer and thread UX: `mod+enter` starts a thread in the background and
  opens a fresh composer, skills are listed alongside slash commands, the chat header
  title renames on double-click, messages stay clear of composer banners, follow-up
  messages stop being pushed to the top, and the stream keeps following after
  scrolling back to the live edge.
- Ported sidebar fixes: pinned threads no longer reshuffle after a drop, threads
  stop jumping after reorder, provider icons resolve from each thread's own
  environment, jump hints hide while the terminal is focused, and the un-settle
  button gained a tooltip.
- Ported terminal fixes: selection copies instead of emptying the clipboard, shifted
  characters encode correctly, oversized graphemes render without crashing, and mouse
  motion reports are deduped.
- Ported markdown work: workspace images render inline in chat, file-link tooltips
  show the full path, command-clicking folder links with spaces works, and wide
  ordered-list markers lay out correctly.
- Ported the appearance contrast control, external project icon picking, theme library
  polish, GitHub clones defaulting to HTTPS, restricted editor deep links, SSH user
  PATH restoration for remote servers, tailscale spawn defects no longer breaking
  advertised endpoints, oversized thread search queries no longer crashing clients,
  readable Codex service tier labels, and preview loading without rerenders.
- Preserved this fork's new-thread model defaults. `e0b4f4639` is the only incoming
  commit touching thread creation: it tightens draft reuse so a draft is only reused
  when it has no `promotedTo` and no server thread shell, which strengthens rather
  than weakens the invariant. `useHandleNewThread.test.ts` coverage is unchanged and
  passing for both fresh and reused draft paths.
- Adapted `6e9c57f7b` (appearance contrast) to this fork's CSS. Upstream's version is
  written against the `9885a845c` global-styling refactor this fork skipped, so its
  `@utility` blocks, `@variant dark` nesting, and `[data-workspace-titlebar-controls]`
  rename were dropped. Mognet's selectors were kept and repointed at the new
  `--contrast-*` variables instead. The upstream `glass` button variant and its
  `default`/`outline` restyling were again left out; only the
  `--contrast-muted-foreground` icon-color swap was taken.
- Kept `apps/mobile`, Usage, Clerk, the cloud service launcher, and
  `telemetry/AnalyticsService` deleted. Dropped the mobile halves of `e72350122`,
  `549201fcf`, `2274444e9`, `77c9d1eb5`, and `6c693baec`; dropped the Clerk and Usage
  files from `6e9c57f7b`; and trimmed the removed-surface layers plus the
  `buildThreadFeed` mobile assertion from the incoming server tests.
- Skipped `aa17ec6e7` (Usage hourly breakdown revert), `035058a23` and `5a7a7cf29`
  (mobile-only), `7107a98a2` (upstream vouching), and `45a2c4b2a` (upstream user-count
  claim in AGENTS.md).
- Skipped `11f051373` (client attribution for threads and turns). Its only consumer is
  the analytics surface this fork does not have, and its migration `041` collides with
  this fork's own `041_ProjectionThreadsPinned`.
- Skipped `d7b9a689f`, `8f7da3b99`, and `9f12eab38` (CI). This fork's CI is a single
  `quality` job; upstream's changes restructure `check`/`test`/`rust` jobs and add a
  mobile-native lint runner and a PR-asset guard that have no counterpart here.
- Skipped `9167622a4` (moving `.plans/` out of the repository). Deleting 33 tracked
  planning documents and adopting upstream's agent work-artifact process is a repo
  content decision for Bernardo, not sync fallout.
- Skipped `292c6dd8c` (model picker double border). This fork already avoids the double
  border by neutralizing the popover instead of the content surface; taking upstream's
  fix would strip Mognet's `dropdown-glass model-picker-surface` styling.

### 2026-08-26 review

- Ported desktop/web/server work through `994372ba4`: thread pull-request linking
  (migration renumbered `042` -> `045` to clear this fork's numbering), Claude
  auto-compaction with the resume-compaction banner, HEIC/HEIF composer attachments,
  the `mod+shift+s` settle/restore shortcut, chat file chips that reveal in the system
  file manager, the ACP cumulative tool-output bound, the projection-refresh skip for
  routine events, query retry after connection interruption, provider settings surviving
  upgrades, Cursor now defaulting to disabled, grouped project renames, the dictation
  jump-hint fix, the shortcut-hint delay, and the push-to-base-branch fix.
- Adapted the macOS signing batch from `63eb0429f` by hand: this fork has no Windows
  `server.asar` sidecar, so only `MAC_FILE_EXCLUSIONS`, the `scripts/sign-macos.ts`
  batching hook, the mac-only stage-dependency narrowing, and the verbose signing
  namespaces were taken. `selectCliRuntimeExternalDependencies` was reintroduced in
  `scripts/lib/cli-external-packages.ts` for the mac path only. Needs a real signed mac
  build to confirm.
- Rebranded incoming fixtures and strings: `pingdotgg/t3code` test repositories became
  `bcotrim/mognet`, the resume-compaction localStorage key became
  `mognet:resume-compaction-dismissed:*`, and the compaction paragraph in
  `docs/providers/claude.md` says Mognet.
- Dropped the `apps/mobile` halves of `3c75eb113` and skipped `bce680926` entirely: it
  is mobile device/OS analytics plumbing, and its shared `appendClientConnectionParams`
  branch is gated on `surface === "mobile"`.
- Skipped `1baf99195` (`apps/server/src/cloud/bootService.ts` is removed here) and
  `1a4a7596c` (release doc for the remote self-update surface this fork does not ship).
- Skipped `c6b8bb825` (macOS preview builds from a PR label). It needs upstream's
  Blacksmith macOS runners and a `preview:mac` label workflow; the accompanying
  `isDesktopPreviewVersion` build-script branch is unreachable without it.
- Kept the removed `ChatHeader` pull-request button out of `3c75eb113`, so upstream's
  new `openProjectPullRequest` callback was dropped as dead code while the linked
  pull-request `openThreadPullRequest` path was kept.
- Kept `.macroscope/check-run-agents/ui-consistency.md` deleted when `082e6ea52`
  extended it.

### 2026-08-27 review

- Ported `3b86ef941`: un-settled threads return to the top of the thread list. The new
  `unsettled_at` projection column, the `unsettledAt` contract field, the projector and
  pipeline re-entry stamp, and the `activeThreadAnchorTimestampMs` sidebar anchor were
  all taken, along with the focused projector/decider/sidebar regression tests. The
  migration was renumbered `043` -> `046` to clear this fork's numbering.
- Ported `badae6a5c`: legacy model classification now comes from a hosted
  `model-manifest.json` instead of hardcoded `CURRENT_CLAUDE_MODELS` /
  `CURRENT_CODEX_MODELS` sets. The manifest URL was rebranded to
  `raw.githubusercontent.com/bcotrim/mognet/main/...` so this fork refreshes from its own
  `main` rather than upstream's.
- Kept `docs/internals/providers.md` deleted; only the glossary entry landed, in this
  fork's renamed `docs/reference/encyclopedia.md`.
- Dropped the `apps/mobile` half of `3b86ef941`.
- Skipped `a3a8cbd60` (release CI). This fork has no `.github/workflows/release.yml`; its
  CI is a single `quality` job.
- Skipped `b0a028126` and `504177797` (Clerk). Clerk is removed from this fork, so there
  is no `main.tsx` Clerk mount to fix and no `@clerk/electron` dependency to bump.
- Skipped `860caaa60` (upstream's v0.0.34 version bump). This fork tracks its own version
  line at `0.0.28`.

### 2026-08-28 review

- Ported `ead4ce52a` (Grok skills, plans, and turn reliability): the new
  `GrokSkills` driver module, ACP session-update/plan handling in `AcpRuntimeModel`,
  reasoning-effort propagation through `applyGrokAcpModelSelection`, xAI ACP extension
  work, and the expanded adapter/provider regression suites.
- Ported `f925d6394` and `94401d01b` (Codex 0.150): regenerated
  `effect-codex-app-server` schemas for multi-agent events and the new account plans,
  plus `CodexProvider` plan mapping. This also restored the package's
  `schema.test.ts`, which this fork had been missing.
- Ported `a6797b3b9`: projection bootstrap now replays every un-applied event instead
  of stopping at the first gap.
- Ported `230c5d4a5`: stale Codex approval callbacks are recovered instead of leaving
  the turn wedged.
- Ported `e2d4d12a8` (provider settings split into a list pane and an editor pane).
  Upstream's files were taken wholesale, then this fork's divergences were re-applied:
  the `ConnectionStatusDot` import stays pointed at `./ConnectionsSettings`, and the
  `RelayConnectionTarget` / `relayManaged` "T3 Connect" branches stay deleted because
  relay is removed here.
- Ported the test-pruning commits `73f8cfc02`, `f6f2be32d`, and `64ca3b650`, except
  `apps/web/src/components/threadSidebarWidth.test.ts`. That test was rewritten in this
  fork to assert the Mognet sidebar wordmark against shipped CSS, so it is regression
  coverage for our branding rather than upstream's trivial layout assertion; the
  `THREAD_SIDEBAR_DEFAULT_WIDTH` export it needs was kept as well.
- Dropped the usage-tracking half of `ead4ce52a` (`apps/server/src/usage`,
  `packages/shared/src/usageMerge.ts`, `packages/contracts/src/usage.ts`,
  `apps/web/src/components/usage`) and its `docs/user/{install,permission-modes,usage}.md`
  updates. Those surfaces are removed from this fork.
- Dropped the `apps/mobile` half of `ead4ce52a`.
- Skipped `348367dcc` (Android adaptive launcher icon). Mobile is removed here.
- Skipped `33b650a5b` (macOS preview DMG downloads). This fork has no
  `.github/workflows/desktop-macos-preview.yml`; its CI is a single `quality` job.
- Skipped `d3c24a14b` (upstream's v0.0.35 version bump). This fork tracks its own
  version line at `0.0.28`.
- Fixed two `ead4ce52a` fallout points that typecheck did not catch, both in
  `GrokAdapter.ts`. Upstream imported `stableStringify` from
  `@t3tools/shared/relaySigning`, which does not exist here because relay is removed,
  so six server suites failed at import; the function is now defined locally at its only
  call site. Upstream also called `Clock.monotonicTimeNanos`, which Effect beta.78 does
  not export, so all five liveness-watchdog reads yielded `undefined`; they now use
  `Clock.currentTimeNanos`, which is the same bigint nanosecond source, is TestClock
  aware, and is only ever read as an elapsed-time delta here. Revisit both if this fork
  ever takes the beta.103 upgrade.
