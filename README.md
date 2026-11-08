# ButterToast

<!-- INTRODUCTION: The project owner can edit this opening description independently. -->
ButterToast is a Chromium-based desktop browser that gives people and AI assistants separate workspaces, with explicit controls for sharing page context and approving browser actions.

사람과 AI가 각자의 공간에서 작업하고, 필요한 순간에 페이지와 제어권을 공유하는 브라우저입니다.
<!-- END INTRODUCTION -->

**Development preview · Windows 11 x64 · Electron / TypeScript**

[Download](https://github.com/Blucy1004/BUTTERTOAST/releases/tag/v0.2.0-dev.1) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md) · [AI connection guide](docs/AI-CONNECTION.md)

![ButterToast browser workspace](docs/design/upgrade-workspace.png)

## How it works

ButterToast organizes the browser into three areas:

- **Butter** — human-owned tabs, bookmarks, history, downloads and browser settings.
- **Browser** — the active page used directly by the person.
- **Toast** — an AI workspace with its own browsing session, model connection and task controls.

A person can share a page for reading, authorize control of a human tab, or open an address in a separate AI session. Sending a tab to Toast opens its address while preserving the original tab; website cookies and login state are not copied into the AI session.

AI models propose structured actions. The application checks their scope, document identity, page version and target before execution. Clicks, form fills, selections, scrolling and navigation require native user approval. A global stop control revokes pending AI work across all three AI slots.

## Current capabilities

| Area | Implemented capabilities |
| --- | --- |
| Browsing | Multiple tabs, navigation, tab search, pinning, muting, address duplication, reopening, session restoration, page search and zoom |
| Browser management | Bookmarks, history, download approval and progress, site permissions, privacy settings and search-provider selection |
| AI connections | OpenAI, Anthropic Claude, Google Gemini, OpenAI-compatible endpoints and supported local model servers |
| AI collaboration | Three independent model workspaces, explicit page sharing, per-action approval, bounded multi-step tasks, handoff and emergency stop |
| Accounts | Supabase email sign-up, email confirmation, sign-in, sign-out, password recovery and password changes |
| Reliability | Human-tab restart, suspended-tab restoration and consent-based recovery of AI task pages in a fresh isolated session |
| Usage visibility | Provider-reported token usage, user-configured cost estimates, request limits and optional encrypted conversation archives |

Search opens the selected search engine's normal results page. The optional Google theme applies local styling to supported search pages.

## OpenAI integration status

The current implementation connects to the **OpenAI API using a user-provided API key**. Requests are sent from the application to the configured provider through a dedicated network session. OpenAI support currently uses the Chat Completions API; compatible and local endpoints must implement the API behavior expected by their adapter.

ChatGPT account sign-in, ChatGPT OAuth authorization and use of a ChatGPT subscription as API access are **not implemented in the current release**. API access and billing are managed by the selected provider and are separate from a ChatGPT subscription.

ButterToast is an independently developed project. This repository does not claim approval, certification or endorsement by OpenAI or other model providers.

### User control over AI access

1. Choose a provider and enter a key inside the application's connection settings. Supported local servers can be configured without a key.
2. Choose a model. Model-list retrieval confirms connectivity; it does not verify inference quality or task success.
3. Share page context explicitly, or approve a bounded workflow that can recapture the authorized task page.
4. Review proposed actions and their target site before approving execution.
5. Stop work or revoke sharing at any time. Effects already accepted by a website or model provider cannot be undone by stopping the application.

## Data handling

| Data | Handling |
| --- | --- |
| Model API keys | Kept in the main process; optionally saved using OS-protected encryption. Sent to the selected provider or configured endpoint. Not stored in Supabase. |
| Prompts and shared page context | Sent to the selected model provider when the user submits a request. Page sharing is explicit; bounded workflows require separate consent. |
| ButterToast account credentials | Sent over HTTPS to Supabase Auth for the requested authentication operation. Access and refresh tokens remain in main-process memory. |
| Bookmarks, history and application settings | Managed locally; persisted using OS-protected encryption when available. |
| Conversation archives | Saved locally only on explicit request, using OS-protected encryption. |
| AI action audit records | Limited to metadata such as time, site origin, action and outcome; input values and API keys are excluded. |

The application calls model providers directly; it does not operate a central inference relay. Model-provider and authentication-service data policies still apply to requests sent to those services.

Website sessions are handled by Chromium. Human browsing, AI task sessions, application UI, model networking and account networking have distinct security boundaries. ButterToast account sign-in does not itself grant an AI permission to access browsing data or execute actions.

When OS-protected storage is unavailable, protected application data stays in memory or saving fails explicitly. API keys are never silently stored through a plaintext fallback. See [Security](SECURITY.md) and the [AI connection guide](docs/AI-CONNECTION.md) for the precise scope and limitations.

## Security architecture

ButterToast retains Chromium sandboxing, Site Isolation, context isolation and TLS certificate verification. Website content receives no Node.js access or application IPC bridge. Application views load from a fixed local asset allowlist with a restrictive Content Security Policy.

The AI execution path has three parts:

- **ToastIR** builds a bounded page representation and maintains document and element identities.
- **ToastCore** executes supported structured operations through the browser.
- **ToastGuard** enforces permissions, document freshness, target validity and one-time approval.

Model responses and webpage content are treated as untrusted input. The model cannot submit arbitrary JavaScript, OS commands or permission grants through the action protocol. Sensitive input fields, stale targets, cross-document approvals and replayed approvals are rejected.

Downloads require native confirmation and a destination selected by the user. Redirect chains and filenames are checked, and Windows downloads receive Internet-zone metadata when the filesystem supports it. These controls do not replace malware scanning.

Security tests cover malicious page fixtures, element substitution, forged IPC, approval bypass attempts, session isolation, cancellation races, renderer crashes and update tampering. Results and remaining risks are documented in [Security](SECURITY.md), [implementation status](docs/IMPLEMENTATION-STATUS.md) and [0.2 validation notes](docs/UPGRADE-0.2.md).

## Download and run

The current downloadable preview is [**v0.2.0-dev.1**](https://github.com/Blucy1004/BUTTERTOAST/releases/tag/v0.2.0-dev.1).

- [Windows installer](https://github.com/Blucy1004/BUTTERTOAST/releases/download/v0.2.0-dev.1/ButterToast-0.2.0-Setup-x64.exe)
- [Windows portable ZIP](https://github.com/Blucy1004/BUTTERTOAST/releases/download/v0.2.0-dev.1/ButterToast-0.2.0-Windows-x64.zip)
- [SHA-256 checksums](https://github.com/Blucy1004/BUTTERTOAST/releases/download/v0.2.0-dev.1/SHA256SUMS.txt)

Close an existing ButterToast instance before running the installer. For the portable build, extract the complete archive and run `ButterToast-win32-x64/ButterToast.exe`; its DLLs and `resources` directory must remain alongside it. GitHub's source-code archives do not contain the executable.

These are **unsigned development builds**. Actual installation, upgrade and removal on end-user Windows machines remain separate validation steps. See the [Windows build guide](docs/WINDOWS-TEST-BUILD.md).

## Development

Use Node.js 24 LTS, npm and an operational Chromium sandbox.

```sh
npm ci
node scripts/install-electron.cjs
npm start
```

Validation and packaging:

```sh
npm test
npm run test:security
npm run benchmark
npm run package:win
# Requires NSIS / makensis
npm run package:installer
```

The CI workflow runs security regressions on Windows and Ubuntu. Packaging verifies the application payload, Windows executable architecture, Electron fuses and embedded ASAR integrity. Release assets include checksums, a build-verification report and an SBOM.

[CI results](https://github.com/Blucy1004/BUTTERTOAST/actions/workflows/security.yml) · [Release setup](docs/RELEASE-SETUP.md) · [Supabase configuration](docs/SUPABASE-SETUP.md)

## Project status

ButterToast is in active development. Implemented behavior, local fixture tests, CI validation and live-service validation are tracked separately. The linked release's feature and validation record is available in [the 0.2 notes](docs/UPGRADE-0.2.md).

Live model inference and complex website task success, production email delivery, end-user Windows installation, Authenticode signing and an operational update service require further validation or configuration. Automatic updates are currently disabled. Passing tests does not establish that a browser is free of vulnerabilities or that every prompt-injection attempt is prevented.

Performance targets in the project requirements are goals, not measured guarantees. The project owner retains final UI/UX direction; browser logic and replaceable UI components remain separated.

## Third-party notices

ButterToast uses Electron/Chromium and other components under their respective licenses. The bundled Pretendard font is distributed under the [SIL Open Font License](src/fonts/OFL-Pretendard.txt); its [source and checksum](src/fonts/README.md) are included in the repository and distribution.

Additional technical documentation is available in the [`docs`](docs) directory, primarily in Korean.
