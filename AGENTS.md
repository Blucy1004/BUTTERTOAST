# ButterToast development instructions

## Working agreement

- The development source of truth is GitHub `Blucy1004/BUTTERTOAST`.
- Use the existing checkout in the cloud workspace. Cloud tasks are already isolated; do not create a Git worktree unless the user explicitly requests one.
- The owner's local Windows folder is `C:\Users\fly_t\Downloads\ButterToast`, but it is not mounted in this cloud workspace. Do not claim to have edited it.
- Continue development and normal build/test checks in the repository. Produce downloadable Windows distribution archives at completion or when explicitly requested; do not repeatedly ask the owner to transfer intermediate ZIPs.
- Read `docs/PRODUCT-REQUIREMENTS.md`, `SECURITY.md`, `docs/ARCHITECTURE.md` and `docs/SECURITY-VALIDATION.md` before changing the relevant architecture. Original requirements are goals, not a claim that the features exist.

## Security and validation

- Prioritize security. Preserve Chromium sandboxing, Site Isolation, TLS verification and the separation of privileged main, application UI and untrusted website content.
- Treat model output and external pages as untrusted. Keep authorization in the main process. Do not expose arbitrary JavaScript, OS commands, secrets or permission-granting methods to model/web IPC.
- Never store API keys in plaintext or silently fall back from OS-protected storage.
- Reproduce attacks against local fixtures or explicitly authorized targets, fix defects, and retain meaningful regression tests. Do not disable protections to make tests pass.
- Keep implemented, integrated, tested and untested status distinct. A standalone policy test is not an end-to-end AI security test. Do not claim Windows execution or signed publication from Linux packaging evidence.
- Run `npm test` for relevant code changes. `npm run test:electron` exercises real Electron against local malicious fixtures and requires OpenSSL and an operational Chromium sandbox. Never add a sandbox-disabling switch.
- `npm run test:toastir` exercises the isolated DOM mapping, document-bound approvals and AI-task storage separation in real Electron. Keep Action protocol and operational document versions aligned.
- Use `npm run audit:deps`, `npm run scan:secrets` and `npm run sbom` when dependency or release changes warrant them. Check scanner and audit limitations in SECURITY.md.
- `npm run package:win` builds an unsigned Windows x64 test folder and verifies its payload, PE architecture, fuses and embedded ASAR hash. Code signing and Windows execution remain separate checks.
- Keep generated binaries, node_modules, profiles and credentials out of Git.

## UI ownership

- The project owner makes final UI/UX design decisions. Implement only the temporary UI needed to validate behavior until design specifications are provided.
- Keep tabs, navigation, future AI panels and settings replaceable and separate from browser logic.
- Manage colors, fonts, spacing, radii and animation through design tokens. Avoid inventing a final visual style or adding dashboard/card layouts without direction.
- UI changes must preserve ToastIR, ToastCore and ToastGuard security boundaries.
