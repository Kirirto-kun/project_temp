# Full-window call room and connection recovery

The owner reported a real failed Connect after importing ElevenLabs TTS and explicitly requested a human video avatar and a Zoom-like full-window call interface. Earlier instructions delegate implementation choices and ask for speed; proceed without another design approval round.

Use the existing Next.js/TypeScript/PostgreSQL/LiveAvatar FULL architecture. Diagnose the actual upstream token refusal, preserve useful safe error codes, and fix its cause with RED→GREEN coverage. Do not treat a successful TTS probe as a successful avatar call. Sandbox Wayne is a technical human test asset, not the approved final product character. Keep provider limits and one speaking connection.

The call route fills the browser viewport: large video stage, small local-only camera overlay, compact header, persistent bottom microphone/camera/captions/fullscreen/End controls. The brief and device setup live in a collapsible panel, opened for explicit form entry or review. A truthful provider preview may show before connection; only decoded video is live. The landing remains intact. Keep guest/Origin/owner/CAS/epoch/deadline and cancellation invariants, explicit microphone consent, no paid session before Connect, accessible controls and mobile safe areas.

Public config may expose avatarPreviewUrl=/intake/wayne-sandbox.webp only for sandbox; no provider credentials/bindings. This locally bundled public provider preview is labeled as preview. Non-sandbox retains the approved illustrated fallback. Calls still use actual media from the SDK.

Validate a bounded real call after the token fix, plus focused/full tests and responsive browser flows. Any test quota adjustment is local, explicit and bounded; preserve ledger entries and conservative accounting. No purchase, overage or independent database.
