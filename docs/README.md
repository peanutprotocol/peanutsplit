# Peanut Split documentation

Only documents under [`current/`](current/) describe the current supported understanding of the
product. When source and prose disagree, source wins and the documentation is a defect.

## Current

- [Architecture](current/ARCHITECTURE.md)
- [Data model](current/DATA-MODEL.md)
- [Generated model inventory](current/generated/DATA-MODEL-INVENTORY.md)
- [HTTP surface and trust model](current/API.md)
- [Generated route inventory](current/generated/API-ROUTES.md)
- [Security and data lifecycle](current/SECURITY-MODEL.md)
- [Self-hosting](current/SELF-HOSTING.md)
- [Testing](current/TESTING.md)
- [Licensing decision](current/LICENSING.md)
- [Rights register](current/RIGHTS-REGISTER.md)
- [FOSS-posture audit](audits/2026-08-24-foss-posture.md)

Generated inventories are derived from the current web source. `pnpm docs:check` fails when the
committed inventory differs from a fresh generation.

## Historical or decision context

The following material can explain how a feature arrived, but it is not an operational contract:

- [`apps/web/docs/SPEC.md`](../apps/web/docs/SPEC.md) — historical build brief
- [`docs-split-rooms-spike.md`](../docs-split-rooms-spike.md) — original spike
- [`changelog-july-25.md`](../changelog-july-25.md) — early design decisions
- [`ROADMAP.md`](../ROADMAP.md) — planning and historical decisions, not a current API/schema reference

Historical documents must retain a visible historical label. They must not be linked as the current
architecture, schema, API, security, or self-host contract.
