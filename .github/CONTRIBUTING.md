# Contributing Guide

Thanks for helping improve CloudMail.

CloudMail is a mobile admin app for Cloudflare temporary email, built for APIs compatible with `cloudflare_temp_email`. To keep maintenance and releases stable, please keep changes clear, verifiable and easy to roll back.

## Before you start

- For larger features or interaction changes, open an issue to discuss the approach first.
- Keep each pull request focused on one clear problem; avoid mixing UI refactors, API changes and code cleanup.
- Do not commit real passwords, admin tokens, API keys, mailbox credentials, database connection strings or private Worker URLs.
- Do not commit generated files such as APKs, build caches, Android SDK/JDK files or local logs.

## Local development

Install dependencies:

```bash
pnpm install
```

Start the development environment:

```bash
pnpm dev
```

Start Expo only:

```bash
pnpm dev:metro
```

## Checks before submitting

Before opening a PR, run:

```bash
pnpm check
pnpm test
```

If your change affects Android packaging, also build an APK locally and confirm the app starts.

## Pull request checklist

- [ ] The change is focused on a single purpose.
- [ ] TypeScript checks pass.
- [ ] Tests pass, or you explain why tests are not added yet.
- [ ] README / CHANGELOG / related docs are updated when behavior, configuration or usage changes.
- [ ] No real secrets, private service URLs or personal credentials are committed.
- [ ] No generated APK files are committed.

## Documentation style

- Write documentation in clear English.
- Keep technical terms, library names, commands, file names and API names as they are.
