# CloudMail Backup and Dual-Remote Release Workflow

This document describes how to sync CloudMail to a **GitHub main repository + a Gitee mirror repository** and keep a tag for every version so you can roll back.

## Recommended setup

- **GitHub**: main repository for source, tags, releases and APKs.
- **Gitee**: mirror backup repository for source and tags, for access from mainland China and disaster recovery.
- **Local `releases/`**: keep only the latest 3 APKs; GitHub Releases is the long-term source of installers.

APKs are not committed to the Git source repository; they are distributed through GitHub Releases.

## Release signing rules

- `android/app/build/outputs/apk/release/app-release.apk` is a local/CI verification artifact. The current managed prebuild uses the debug certificate by default, so it must not be published as a long-term public release.
- Official GitHub APKs and Google Play AABs must be built with the EAS `production` keystore, and the signing fingerprint must be verified.
- Public APKs for V1.1.2 and earlier use certificate SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (Android Debug).
- From V1.1.3, the EAS production certificate SHA-256 is `5B:F4:BF:3A:49:73:2D:2A:5A:D1:F9:57:FB:D7:62:7F:E2:13:78:6E:1F:8B:35:7A:6E:E1:15:78:15:68:CE:EB`.
- The two certificates cannot upgrade over each other. Release notes must keep the migration steps: back up credentials, uninstall the old version, install the new one, import again.

## Set up the Gitee remote for the first time

Create an empty repository on Gitee first, for example:

```text
https://gitee.com/YOUR_USERNAME/CloudMail.git
```

Then run in the local repository:

```bash
git remote add gitee https://gitee.com/YOUR_USERNAME/CloudMail.git
git remote -v
```

If the remote already exists but the URL needs changing:

```bash
git remote set-url gitee https://gitee.com/YOUR_USERNAME/CloudMail.git
```

## Sync source and version tags day to day

Make sure the working tree is clean:

```bash
git status -sb
```

Sync to GitHub and Gitee:

```bash
git push origin main --tags
git push gitee main --tags
```

Or use the project script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-remotes.ps1
```

The first time, you can pass the Gitee URL directly:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync-remotes.ps1 -GiteeUrl "https://gitee.com/YOUR_USERNAME/CloudMail.git"
```

## Standard release process

Using `v1.1.3` as an example:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm lint
EXPO_NO_DOTENV=1 NODE_ENV=production pnpm exec expo export --platform web --output-dir dist-web --clear

git add -A
git commit -m "release: prepare v1.1.3"
git tag -a v1.1.3 -m "CloudMail v1.1.3"

git push origin main --tags
git push gitee main --tags
```

Then:

1. From the committed and tagged source, run `eas build --platform android --profile production --non-interactive --wait` to build the Google Play AAB.
2. Run `eas build --platform android --profile apk --non-interactive --wait` to build the sideload APK with the same EAS production key.
3. After downloading, use `aapt2 dump badging`, `aapt2 dump permissions` and `apksigner verify --print-certs` to verify the package name, `1.1.3 (17)`, permissions and the production certificate fingerprint.
4. Generate a SHA-256 checksum file, create the `v1.1.3` GitHub Release and upload the official APK, the AAB (if needed) and the checksum file.
5. Use `scripts/publish-gitee-release.ps1` to upload the same APK to a Gitee release.
6. Keep only the latest 3 APKs in the local `releases/` folder.

The `Android production artifact` GitHub Actions workflow needs `EXPO_TOKEN` configured in the repository's `production` environment. Without it, a signed-in maintainer can run the same EAS commands locally, but must never copy local sign-in credentials into the repository.

## Create a Gitee release and upload the APK

The Gitee Release API does not reuse your Git HTTPS sign-in; you need a separate **personal access token**:

1. Open <https://gitee.com/profile/personal_access_tokens>
2. Create a token with at least the project/repository permissions.
3. Set a temporary environment variable in the current PowerShell session:

```powershell
$env:GITEE_TOKEN="YOUR_GITEE_TOKEN"
```

Publish the current version to Gitee:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-gitee-release.ps1
```

To publish another version, pass parameters:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish-gitee-release.ps1 `
  -Repo "YOUR_USERNAME/cloud-mail" `
  -Tag "v1.1.3" `
  -Title "CloudMail V1.1.3" `
  -NotesFile "releases/v1.1.3-release-notes.md" `
  -AssetPath "releases/cloudmail-v1.1.3-secure.apk"
```

> Note: do not commit Gitee release attachments to Git; APKs belong in release attachments.

## Rollback

List versions:

```bash
git tag --sort=-v:refname
```

Temporarily check out a version:

```bash
git checkout v1.1.2
```

Start a fix branch from a version:

```bash
git checkout -b fix/from-v1.1.2 v1.1.2
```

If you need to roll the main branch back to a version, create a backup branch first:

```bash
git checkout main
git branch backup/main-before-rollback
git reset --hard v1.1.2
git push origin main --force-with-lease
git push gitee main --force-with-lease
```

> Note: force pushing rewrites remote history. For public repositories, a new fix commit is usually better than resetting the main branch.

## What not to upload

Do not commit:

- `node_modules/`
- `.env.local`, real passwords, tokens, API keys
- `.android-sdk/`
- `.jdk17/`
- `.expo/`
- `.omx/`
- `.playwright-mcp/`
- `.trellis/`
- Temporary Android build directories
- APKs in the repository root

The current `.gitignore` already covers these local files.
