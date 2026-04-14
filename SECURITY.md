# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.1.x   | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

Email **64996768+mcp-tool-shop@users.noreply.github.com** with:

- Description of the vulnerability
- Steps to reproduce
- Affected version(s)

**Expected response time:** 72 hours for initial acknowledgment.

## Scope

Security issues for this tool include but are not limited to:

- **Path traversal** -- scanning files outside the target repository
- **Data exfiltration** -- leaking repository contents to unintended destinations
- **Output injection** -- crafted repo content that poisons generated datasets
- **Dependency vulnerabilities** -- known CVEs in runtime dependencies

Issues that are **not** in scope: bugs in generated dataset formatting, feature requests, or performance problems.

## Disclosure

We follow coordinated disclosure. Please do not open public issues for security vulnerabilities.
