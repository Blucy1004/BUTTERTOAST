# 0.5.0 Golden Crust — changes from 0.4.2

Development build; no public Release. [Feature matrix](GOLDEN-CRUST-0.5.md) · [QA and limits](QA/GOLDEN-CRUST-REPORT.md).

- Added Ctrl+K search across tabs/windows, bookmarks and history, direct addresses, the selected search engine and `/ai` task drafts. Keyboard navigation and one-use main-owned result IDs keep execution bound to the displayed query.
- Added a minimal new tab with search, favorites and recent AI task shortcuts. Google remains the default; existing engine preferences are preserved.
- Added tab groups with names, preset colors and collapse, plus two-page Split View with adjustable ratio. Splitting, resizing, detaching and returning a live tab preserve its current WebContents and form state. Narrow windows show the active pane.
- Extended protected session storage to groups, split metadata and detached-window URLs, while reading old formats. Visible split tabs stay awake; existing optional idle saver, pins and ordering are retained.
- Added Drag to Toast drafts for selected text and links. Dropped page text is a separate untrusted attachment; source navigation invalidates context. Starting and performing sensitive actions still require approval.
- Added up to 100 encrypted AI task metadata records: lifecycle, fixed failure causes and dispatch outcomes. Interrupted tasks restart as new drafts with fresh consent; goals, page text, input values and keys are excluded from history.
- Retained the owner's pastel light/dark identity, SVG icons and resizable/collapsible panels; improved small-label sizing. Guest use, BYOK and ToastIR remain free without mandatory login.
- Fixed detached-window restoration loss, shutdown cleanup errors, stale address display, stale debounced command selection and blank/narrow split usability.

Existing bookmark/history/settings and file download/upload behavior remain covered by regressions. Live form state survives view moves, not process termination. Real model accuracy, physical Windows 0.5 installation and OS keychain behavior require separate validation; builds are unsigned.
