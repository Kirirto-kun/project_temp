# Release checklist

Record for each release: commit SHA, deployment URL, date, and the results below.

- [ ] `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:engine`, `npm run test:server`,
      `npm run test:ui`, `npm run test:intake`, `npm run build`, `npm run test:e2e` all exit 0
- [ ] `npm run test:classifier:live` 30/30 with the configured model (report saved)
- [ ] `GET /api/config` advertises only verified capabilities
- [ ] Real voice smoke on the production URL: microphone allowed and denied, voice dropped and
      continued by text, reload, timeout, replay
- [ ] Coach: text path; audio call if enabled (connect, interrupt, end, review, practice)
- [ ] No agreement, zero gap, rent month/year, spoken amount equals displayed amount
- [ ] Chrome and real Safari on macOS; iOS and Android smoke
- [ ] Payments only if Polar is configured: sandbox purchase, direct API without purchase refused
- [ ] Budget set, demo pool token shared privately, bucket lifecycle rule active
- [ ] Secret scan over the working tree and git history before making the repository public
