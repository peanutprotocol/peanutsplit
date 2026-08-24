# Interacting with the Peanut Split project

Peanut Split is maintainer-led by Squirrel Labs. This repository is not organized to recruit or
onboard external contributors.

## Useful reports

- Reproducible product bugs may be filed through the bug-report issue form.
- Documentation errors may be filed as bugs with the incorrect page and source evidence.
- Vulnerabilities and leaked capabilities must be reported privately through [SECURITY.md](SECURITY.md),
  never in a public issue.

Issues have no response or resolution SLA. Please remove room links, expense/member IDs, member
tokens, names, amounts, receipts, screenshots containing personal data, and other live secrets from
every public report. Do not attach a real room CSV, portable JSON, or history export. The exporter
strips known live capabilities and credential-shaped fields, but the result still contains the
group's financial and personal data. Use a synthetic reproduction.

## Pull requests

Unsolicited feature pull requests are not solicited and may be closed without review. If a maintainer
asks for a narrow fix, keep it scoped and include the relevant tests and documentation.

Before any external patch can be accepted after publication, the project will define approved
inbound terms—normally inbound under the same license as the outbound project—and confirm that the
submitter has authority to provide it. Until that publication gate is complete, do not infer an
inbound license from this draft policy.

Submitting an issue or patch does not create a promise of support, review, merge, attribution beyond
the applicable license/history, employment, payment, or roadmap influence.

## Maintainer checks

Maintainers use the repository commands documented in [README.md](README.md). Money, schema, access,
retention, or public-contract changes require tests proportionate to their risk.
