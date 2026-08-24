# Security policy

## Publication status

The repository is private and has no supported public release yet. Supported-version information
will begin with the first immutable public release; mutable `main` is not a support promise.

## Report privately

Do not open a public issue for a vulnerability. Once the public repository is live, use GitHub's
private vulnerability-reporting form for this repository. If that form is not available, do not
post exploit details; contact a Squirrel Labs maintainer through an already verified private channel
and say only that you need a vulnerability-reporting route.

Never include a real room link, expense/member ID, member token, push endpoint, receipt, model key,
database URL, or personal data in an issue, screenshot, log excerpt, or proof of concept. Do not
attach a real room CSV, portable JSON, or history export. Current exports remove known live room
capabilities and credential-shaped fields, but they still contain the group's financial and personal
data. Use synthetic data.

Include:

- affected release or exact commit;
- deployment type and relevant non-secret configuration;
- concise reproduction and impact;
- whether the issue is already being exploited;
- a safe way for the maintainer to reply.

There is no response-time, remediation-time, bounty, or disclosure-date promise. Squirrel Labs will
coordinate a private fix and release process when the report is actionable.

## Public-release controls

Before publication, the repository must enable and verify private vulnerability reporting, secret
scanning/push protection, read-only default Actions permissions, pinned/allowlisted actions, and a
deploy gate bound to an exact successful commit. See
[PUBLIC-RELEASE.md](docs/current/PUBLIC-RELEASE.md).
