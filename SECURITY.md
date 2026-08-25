# Security policy

## Supported version

Security fixes are applied to the latest production version on `main`.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, personal data, or reproduction material for an unpatched vulnerability. Use the repository's private **Security → Advisories → Report a vulnerability** flow instead.

Include the affected route or component, impact, reproduction steps, and any suggested mitigation. Credentials encountered during testing must be revoked rather than included in a report.

## Automated controls

Pull requests run dependency review and CodeQL analysis. Dependabot vulnerability alerts and automated security fixes are enabled, and GitHub Actions are pinned to immutable revisions. Production artifacts exclude source maps and deployments must pass unauthenticated and disposable authenticated canaries.
