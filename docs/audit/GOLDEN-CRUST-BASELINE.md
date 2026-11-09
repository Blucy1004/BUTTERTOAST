# Golden Crust baseline — 2026-11-09

Source: `d332ebf9d56a2090d30c27d206af8ba6a4a8e1d1`, version 0.4.2, branch `work`; clean working tree before changes. Owner reports v0.4.1 launching and browsing on physical Windows. This is not our direct Windows verification or evidence for 0.5.0.

Environment: Linux 6.18.57 x64; Node 24.22.1; Electron 45.2.3 / Chromium 156.0.8078.80; container CPU quota 4 cores, memory limit 32 GiB. Chromium sandbox stays enabled. Authenticated Xvfb is available for Linux GUI tests. No real AI API credential is configured. Local mock/provider fixtures do not establish model quality or production OAuth success.

`npm run test:security` completed with exit 0 before edits: 123 unit tests, 146 Electron PASS groups (including 13 file-transfer groups), npm audit 0 reported vulnerabilities, supported secret patterns absent. Audit/scanner coverage is limited; this does not establish absence of all vulnerabilities.

| Area | Existing implementation | 0.5 work |
|---|---|---|
| Browser | BrowserTabs lifecycle, pins, mute, ordering, native find/zoom, opt-in idle saver, encrypted URL restoration | Groups, two live split panes, window transfer |
| Butter | Owner-designed left tabs/tools, local tab filtering | Unified Ctrl+K search across tabs/history/bookmarks; group controls |
| Toast | Three isolated AI workspaces, native approval, ephemeral workflow/events, separate opt-in conversation archive | Durable metadata journal, draft/context drag path, explicit safe retry |
| New tab | Empty placeholder; normal omnibox search and local suggestions | Search, favorites, recent task shortcuts |
| Layout | Main-owned geometry, width adjustment/collapse, responsive light/dark/system tokens | Split geometry and readability improvements; preserve owner identity |
| AI | OpenAI, Anthropic, Gemini, compatible and local transports; bounded ToastIR snapshot/delta/actions | Reuse pipeline; add lifecycle history and real DOM/mock regressions |
| Security | Sandbox, isolated world, strict IPC, native per-action approvals, protected storage | Preserve boundaries; attack new IPC/drafts/split/journal locally |
| Files | 0.4.2 native download/upload with 13 automated groups and prior Windows CI | Retain and regression-test |

ToastIR serializes bounded DOM semantics into validated JSON; the model proposes operations and main-owned ToastGuard validates document/version/target/approval before execution. It is not general permission to run code. UI styles and main-owned browser/AI authority remain separate.

Existing limits: no signed Windows build, no live model inference in this environment, URL-only recovery cannot reconstruct unsaved page form state after process termination, OS storage availability required for persistence, closed Shadow DOM/iframes outside the current ToastIR extraction scope. Existing release/artifacts and user profiles must remain intact.

Sequence: command bar/new tab → panels/themes/groups → split view/window compatibility → Drag to Toast → durable tasks/recovery → integration QA/performance → 0.5.0 development distribution. Each stage has a build and relevant regression gate. No public Release or paid activation is authorized for this operation.
