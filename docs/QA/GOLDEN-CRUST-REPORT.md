# Golden Crust 0.5.0 QA

2026-11-09. [Feature matrix and usage](../GOLDEN-CRUST-0.5.md) · [pre-change audit](../audit/GOLDEN-CRUST-BASELINE.md).

## Environment and scope

Linux x64, kernel 6.18.57, Node 24.22.1, Electron 45.2.3, Chromium 156.0.8078.80. Container quota: 4 CPU cores and 32 GiB. Electron tests retain the Chromium sandbox and Site Isolation; an authenticated Xvfb display provides Linux native input/screenshots. Local fixtures and isolated test profiles only. No real user API key or live AI inference was used. Test AES-GCM injection verifies persistence plumbing, not the platform keychain/Windows DPAPI.

Baseline: clean `d332ebf9d56a2090d30c27d206af8ba6a4a8e1d1` (0.4.2). Owner-reported physical Windows launch/browsing is for 0.4.1, not this version. The delivery receipt records the exact final source and artifacts.

## Test results

Before edits: `npm run test:security` exited 0: 123 unit tests, 146 Electron PASS groups, npm audit 0 reported vulnerabilities, no supported secret pattern found.

The complete post-change `test:security` run passed: **130 unit tests and 157 Electron PASS groups**. Subsequent final unit (130), AI (16) and Crust (10 plus two fresh-process restore groups) reruns passed and cover the untrusted-selection transport, edited-goal refresh and address-display corrections. The final Electron matrix contains **158 groups**, with no known remaining regression failure; this is not a claim that the earlier full run contained 158. [Local receipt, source manifest and sanitized PASS labels](data/crust-local-validation.json).

The five targeted Torture suites also passed: 9 mock-provider tests including an actual 60-second timeout, 27 AI/DOM groups, blocked-renderer cancellation, fresh-process restoration and four native-input checks. Local media/multipart compatibility passed. [Suite receipt](data/crust-targeted-suite.json). Four actual window widths (1500/1080/760/600) showed no horizontal overflow and 12px-or-larger small-label tokens; [visual receipt](data/crust-visual.json) and [light](../design/crust-light-newtab.png), [dark split](../design/crust-dark-split.png), [command bar](../design/crust-command-bar.png) captures. Final npm audit reported zero vulnerabilities and the limited secret-pattern scanner found none. These are bounded checks, not proof of absence of all vulnerabilities.

 Mock/provider fixtures exercise transport, consent, ToastIR execution and observations; they do not prove real model accuracy, token billing or live OAuth success.

New automated coverage includes native Ctrl+K/list execution, new-tab search/favorites, opaque command expiry/replay/schema, group lifecycle and v1/v2/v3 persistence, split focus/ratio/narrow layout/live input, same-WebContents window transfer/return, native text drop, cancelled/stale source rejection, real mock-driven DOM click with fresh ToastIR confirmation, fixed provider failure causes, metadata encryption/no-secret persistence, inert retry, blank split navigation, edited omnibox switching, and fresh-process group/split/detached-window/history recovery.

## Performance

Two sequential 20-second runs per version, order 0.4.2 / 0.5.0 / 0.5.0 / 0.4.2. Same Electron/Chromium, 10 pages, local deterministic 120-section fixture, 1050×720 viewport, fresh profile per run, memory saver off, 100ms switching/scrolling schedule. No other test or build workload ran concurrently. Baseline compiled code was copied before editing. Reproduction: `test/crust-benchmark.cjs` with `BT_CRUST_CORE`, `BT_CRUST_LABEL`, `BT_CRUST_BENCH_OUTPUT`; raw JSON is retained in `QA/data/crust-core-*.json`.

| Metric, range across two runs | 0.4.2 | 0.5.0 |
|---|---:|---:|
| Actual timed interval | 20.024–20.040 s | 20.040–20.121 s |
| Page-load median | 54.58–62.10 ms | 50.19–52.90 ms |
| Tab-switch + JS round-trip median | 1.347–1.416 ms | 1.346–1.373 ms |
| Process-tree RSS median | 708.14–712.22 MiB | 708.01–709.31 MiB |
| Process-tree PSS median | 264.67–268.49 MiB | 264.97–266.37 MiB |
| Process-tree CPU, one core = 100% | 5.29–5.74% | 5.44–5.52% |
| Unexpected crash / unresponsive events | 0 / 0 | 0 / 0 |

These are BrowserTabs-core measurements, not full product startup or real-site/Chrome comparisons. RSS double-counts shared pages; PSS and `/proc` sampling have host-specific limits. Two short runs do not establish a speed improvement or long-duration stability. No new 15/30/5-minute soak or Chrome comparison is claimed for 0.5.0. Earlier 0.4 measurements remain historical evidence only.

### ToastIR versus fixed-selector automation

Same Electron, local fixture and 900×800 viewport; alternating methods, three repetitions per task. All **42 trials passed**. `npm run benchmark:torture` runs `test/torture/ir-benchmark.cjs`; [raw measurements](data/crust-ir-performance.json) retain min/max/standard deviation, operation counts, retries, payload bytes, CPU and memory. Native immediate test consent excludes human think time. No live AI request occurs.

| Task | CDP median ms | ToastIR median ms | Success |
|---|---:|---:|---|
| search | 6.80 | 27.24 | 3/3 each |
| form fields | 7.46 | 25.47 | 3/3 each |
| dynamic button | 154.53 | 171.54 | 3/3 each |
| multi-page navigation | 70.53 | 84.68 | 3/3 each |
| table extraction | 1.09 | 8.70 | 3/3 each |
| SPA | 6.08 | 15.89 | 3/3 each |
| nested Shadow DOM | 4.52 | 15.38 | 3/3 each |

ToastIR was slower in these small deterministic fixtures because it captures and validates the document and authorization boundaries. This does not measure a real model's reasoning or task accuracy. Protocol command units and payload contents differ; lower counts are not directly equivalent work. The observed full/delta example was 1,584/700 bytes and reconstructed successfully, not a claim of billed token savings. CPU figures are `/proc` live-process lower bounds at 10ms tick resolution; external shared-host activity is uncontrolled.

## Failures found and corrections

| Priority | Finding | Correction and evidence |
|---|---|---|
| P1 | Legacy input hooks may return a WebContents despite a void contract; treating every truthy return as a cleanup caused shutdown errors | Only function returns are cleanup callbacks; destroyed popup owners are guarded. Existing lifecycle suite rerun; unhandled test rejections now fail the test |
| P1 | Live detached tabs would leave the primary checkpoint and be lost from restart restoration | Eight separate protected window checkpoints, preserved on app quit; fresh-process test confirms all three fixture URLs, groups and split |
| P1 | Address editing focus could leave the previous omnibox text after switching tabs | Active logical tab change always updates the URL; native app regression added |
| P1, preventive | Dropped page selections could be promoted into the user's goal text | Separate preview and `untrusted_selection` wire field, independent user goal, no record persistence; approved mock wire assertions |
| P2 | Split stayed cramped at narrow window widths | Active pane only below the supported width; both WebContents restored when wide, without reload |
| P2 | A blank split pane needed a reachable activation/search surface | Main-owned pane headers and a correctly bounded trusted new-tab view; real navigation test |
| P2 | Enter before the search debounce could select an earlier result | Query-matched result execution; pending Enter waits for its own query; capabilities remain one-use |
| Test harness | Bookmark test clicked before toolbar activation had crossed its IPC queue | Wait for the enabled button and committed address; original bookmark-storage assertion retained |
| Test harness | Old geometry test queried the removed empty-page placeholder | Permanent Browser content anchor; retain the same exact native bounds assertion |
| Test fixture | Plain model prose was incorrectly used as a malformed API response | Keep existing display-only prose behavior; use an invalid provider envelope to exercise the response-error branch |

Initial failed runs were not counted as passes. Their causes and reruns are retained here rather than hidden.

## Remaining validation and release readiness

No known failing implemented-feature regression remains in the executed local matrix. This is an unsigned development build, suitable for further owner testing rather than a claim of production-grade security.

Unverified categories for this version: (1) physical Windows installation/update/uninstall and DPAPI, (2) real AI inference/accuracy/billing, (3) live Google/ChatGPT/Supabase login flows, (4) long-duration real-site browsing and third-party extensions, (5) code signing and production update feed, (6) closed Shadow DOM/iframe extraction beyond the existing scope. These are six validation categories, not six executed test failures.

Restart restores URLs and metadata, not unsaved DOM/form state. Job retries create fresh drafts and consent; they cannot undo already-dispatched server effects. Split and transfer preserve live state only while the process survives. Separate windows use a minimal toolbar and main-window AI. OS crypto absence disables persistence with a visible notice; corrupted task history is preserved for recovery. Account switching does not isolate the OS browser profile.

Next priorities: physical Windows 0.5 installation and daily browsing, owner-supplied BYOK/local-model evaluation against complex sites, longer repeatable UI/idle soaks, and signing/update infrastructure. No public Release or paid feature was activated by this operation.
