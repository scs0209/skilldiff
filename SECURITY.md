# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately:

1. Use [GitHub's private vulnerability reporting](https://github.com/scs0209/skilldiff/security/advisories/new) (preferred), or
2. Email scs0209@users.noreply.github.com with "[skilldiff]" in the subject.

Include: affected component, reproduction steps or PoC, and your assessment of impact. You'll get an acknowledgment within 72 hours and a status update at least every 7 days until resolution.

## Scope

In scope:
- The skilldiff CLI (`src/`, `scripts/`)
- The GitHub Action workflow (`.github/workflows/skilldiff.yml`) — especially anything that could leak secrets or execute attacker-controlled code in CI
- Trace/scenario parsing that could enable injection (e.g. a malicious SKILL.md or trace fixture causing command execution)

Out of scope:
- The harnesses themselves (Claude Code, Cursor, Codex, Codebuff/Freebuff) — report to their respective vendors
- Prompt injection *by design*: skilldiff deliberately runs untrusted skill files in a fixture repo. This is the product's premise, not a vulnerability. However, if skilldiff's own CI could be made to run fixture content with escalated privileges, that IS in scope.

## What we will never ask you for

No one from this project will ever ask for your harness tokens, API keys, or `.credentials.json` contents — not in issues, not in email. Trace fixtures you share should have tokens redacted; if you accidentally attach one, rotate it immediately.

## Supported versions

| Version | Supported |
|---------|-----------|
| main    | ✅ |
| other   | ❌ (pre-1.0; rebase instead) |
