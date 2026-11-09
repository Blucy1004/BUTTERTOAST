# ButterToast 0.5.0 — Golden Crust

Development build. No public Release or paid feature was activated. Owner-reported physical Windows validation applies to 0.4.1 only; see the final QA report for this version's evidence.

## Feature status

| Feature | Implementation | Verification |
|---|---|---|
| Ctrl+K command bar | Local open tabs (including detached windows), bookmarks/history, selected-engine search/direct address, `/ai` draft, arrows/Enter/Esc | Unit schema/capability tests and native Electron keyboard/UI |
| New tab | Minimal search, up to 12 favorites, four recent task shortcuts; Google default, existing Brave/DDG setting | Production search and stored favorite navigation |
| Tab groups | Native tab menu creates/assigns groups; Butter edits names/colors and collapses groups; pin/order retained | Metadata schema and actual live-tab tests |
| Split View | Two live WebContents, left/right menu or drag targets, pointer/keyboard divider, close without reload; narrow windows show active pane | Form values and identities retained across ratio/exit/resize; active pane focus tested |
| Window transfer | Move a live tab to a separate human window and return; preserve current document/input/history/group | Same WebContents and input verified; separate windows checkpoint their URLs |
| Sessions/idle saver | v1/v2 still read; v3 adds groups/split; detached window sessions protected separately; visible split tabs excluded from idle release | Existing lifecycle regressions plus two-process restart |
| Drag to Toast | Native text/link drop or page context menu creates a draft; text binds current HTTPS document, link prepares an independent task | No model request before approval; navigation/stale/dismiss/malformed cases; actual ToastIR click and fresh result snapshot with mock transport |
| AI task history | Up to 100 metadata records across three slots; states, fixed failure reason, step/operation/outcome; encrypted atomic checkpoints | Persistence, invalid/corrupt/unavailable storage, restart interruption, error/retry integration |
| Safe retry | Creates a new draft; retained in-memory goal may prefill; after restart the user enters the goal again and approves fresh context/actions | No request or action on retry alone; no restored execution authority |
| Themes/panels | Existing owner light/dark/system and responsive panel widths/collapse reused; small labels use design tokens | Existing workspace/profile suites plus screenshots |
| BYOK/free/guest | Existing provider adapters and optional account; no subscription or login gate added | Existing AI/account/product tests; live model inference remains unverified |

## Usage

- `Ctrl+K`: type a tab/site/title/address/search, use arrows and Enter. `/ai …` creates a Toast draft.
- Tab menu: create/assign a group, place the tab in the left/right pane, or move it into a separate window. Butter's group editor renames/colors groups. A detached window's **주 창으로** returns its live tab.
- Split toolbar button pairs the active tab with another tab (or a new blank tab). Drag a Butter tab onto the left/right target. Drag the divider or focus it and use arrow keys. Closing the split keeps both tabs.
- Drop text or an HTTPS link onto Toast. Inspect the goal and source, then choose **초안 확인 · 공유 승인 후 시작**. For text, current-tab control and page sharing require native consent; side-effecting actions still require separate approvals. A navigated source must be attached again.

Dropped page selections are previewed separately (up to 8,000 characters) and sent as `untrusted_selection`, not promoted into the user's goal. The user can edit the goal independently. Reattaching the source preserves the edited goal. A retry creates fresh context and does not silently restore an old page selection.
- Toast **AI 작업 기록**, or a recent task on a new tab, shows metadata and retry. Dispatched means a DOM action was delivered, not that a remote server completed a purchase/submission. Completed means the model reported completion; independently verify important results.

## Data and safety

Session v3 saves URL/pin/mute/group and split indices/ratio, not web DOM or unsaved form values. Live split/transfer preserves the current WebContents, while process restart reconstructs URLs. New `window-tabs-1.enc` through `window-tabs-8.enc` preserve detached-window URL snapshots when session restoration is enabled. Closing a particular detached window removes it from the next restore; quitting the app keeps its checkpoint.

`tasks.enc` stores generated IDs, slot, timestamps, state, approved HTTPS origin, fixed reason and operation/outcome metadata. Goals, selected text, link queries/fragments, page bodies, action input values, arbitrary provider error text, credentials and API keys are not journal fields. Draft content stays in RAM. Link defaults strip query/fragment from both the copied navigation URL and goal; users may explicitly edit their goal. Conversation archives retain their existing separate opt-in behavior.

OS-protected storage is required for persistence; no plaintext fallback. Missing protection is shown in the UI. Corrupt task history is left intact instead of overwritten. Restored running/approval/draft records become interrupted; no model request, old grant, click or submission is resumed. Browser data is scoped to the OS profile, not isolated by optional ButterToast account.

Command selections are one-query, expiring opaque IDs resolved by main. IPC still verifies the real sender, main frame, exact UI URL, strict schema and rate. Geometry stays in main; split focus changes active-tab authority. Moving a tab removes only owner-specific listeners and preserves Chromium hardening. Sandbox, Site Isolation, context isolation, Node isolation, TLS validation and download/upload boundaries remain enabled.

## Remaining limits

Real model inference, billing and real-service login flows require independent validation. Closed Shadow DOM and iframe extraction remain outside current ToastIR support. Separate windows have a simple toolbar; AI stays in the main window. A narrow Browser pane temporarily shows one split page. Restoring a URL cannot restore unsaved form state after a process exit. Builds are unsigned; physical Windows install/update/uninstall and production DPAPI checks must be distinguished from automated CI and Linux packaging.

Evidence, measured performance, fixed defects and build hashes are recorded in `QA/GOLDEN-CRUST-REPORT.md` and associated receipts.
