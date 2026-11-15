# Call room recovery implementation

Spec: ../specs/2026-11-15-call-room-recovery-design.md
Base: 8aed00a, current feature checkout. Use executing-plans with independent UI work under dispatching-parallel-agents. One fresh final whole-change review after integration.

## Interfaces and ownership

- Root: provider failure/root cause, runtime settings, safe errors, config avatarPreviewUrl:string|null, asset, bounded live verification and documentation.
- UI implementer: IntakeCall.tsx, a scoped call-room stylesheet, tests/e2e/intake-call.spec.ts. Keep CallController/API contracts, existing form semantics and readable button labels. Root and UI do not edit each other's files.
- Common config gets avatarPreviewUrl:string|null. Sandbox receives /intake/wayne-sandbox.webp; otherwise null. Client does not infer live connection from preview. Existing media events govern live state.

## Tasks

- [x] Diagnose upstream refusal from evidence. Write RED regression, correct configuration/request and safe user error handling; keep quotas/cleanup.
- [x] Implement full-window call stage, local camera overlay, persistent toolbar, optional brief/device panel and fullscreen gesture. Add meaningful viewport/control regressions and preserve universal form/device/cancel tests.
- [x] Integrate, run TypeScript/ESLint/Vitest/Playwright/build, inspect desktop/mobile, bounded real media check, fresh review, fix material findings RED→GREEN, update setup/evidence and feature branch.

## Review Focus

- Actual decoded video, not a poster, must establish live state; truthful preview before it.
- Empty or denied provider configuration must not hide an actionable cause behind generic connection failure.
- End/fallback/navigation must release devices and close the provider even with panels/fullscreen/late media events.
- Full-window controls remain keyboard accessible and visible at mobile widths; quick form/reload/confirmation still work.
- No provider keys, avatar credentials or session bindings enter public config or logs.
