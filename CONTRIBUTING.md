# Contributing

Peanut Split is maintainer-led: Squirrel Labs sets the roadmap and decides what lands. Bug reports
and security reports are welcome. For a feature, open an issue first so nobody does work that
cannot land.

## Useful reports

- Reproducible product bugs may be filed through the bug-report issue form.
- Documentation errors may be filed as bugs with the incorrect page and source evidence.
- Vulnerabilities and leaked capabilities must be reported privately through [SECURITY.md](SECURITY.md),
  never in a public issue.

We answer issues as time allows; there is no response SLA. Please remove room links, expense/member IDs, member
tokens, names, amounts, receipts, screenshots containing personal data, and other live secrets from
every public report. Do not attach a real room CSV, portable JSON, or history export. The exporter
strips known live capabilities and credential-shaped fields, but the result still contains the
group's financial and personal data. Use a synthetic reproduction.

## Pull requests

Open an issue before a feature pull request. A feature PR that was not discussed first may be
closed without review, because the roadmap is set upstream. If a maintainer asks for a narrow fix,
keep it scoped and include the relevant tests and documentation.

Before an external patch can be merged, the project will publish its inbound terms (expected:
the same license as the outbound project) and confirm that the submitter has the right to provide
it. Until then a patch can be discussed in an issue but not merged.

Submitting an issue or patch does not create a promise of support, review, merge, attribution beyond
the applicable license/history, employment, payment, or roadmap influence.

## Maintainer checks

Maintainers use the repository commands documented in [README.md](README.md). Money, schema, access,
retention, or public-contract changes require tests proportionate to their risk.
