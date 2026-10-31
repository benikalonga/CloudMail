# CloudMail Privacy Policy

Effective date: 2026-07-15

CloudMail is an open-source client for connecting to Cloudflare temporary email Workers that users configure themselves. This policy explains how CloudMail handles data and the responsibilities users take on when using a self-hosted Worker.

## 1. Data we process

CloudMail only processes the data needed for mailbox management, including:

- The Worker URL, frontend URL and refresh settings entered by the user.
- The Worker admin password, site password, mailbox JWTs and mailbox passwords.
- Mail and attachments the user receives, views, sends or deletes through the configured Worker.
- Local UI preferences, mailbox lists and connection status.

CloudMail contains no ads, behavioral analytics, third-party analytics SDKs or developer telemetry.

## 2. Data storage

- In the native Android and iOS apps, passwords and tokens are stored in the operating system's protected SecureStore; non-sensitive settings and indexes are stored in the app's local storage.
- In the web version, browsers do not offer a system keystore equivalent to the native SecureStore, so settings are stored in the current browser's site storage. Only use the web version on trusted devices and browser profiles.
- The CloudMail maintainers do not offer a central CloudMail account and do not receive or back up this local data from the app.

The operating system may handle the Keychain, backups or data after uninstall according to its own rules. Before selling, transferring or sharing a device, delete the Worker and mailbox configurations in CloudMail and clear the app data.

## 3. Network transmission

CloudMail sends requests directly to the Worker or frontend URL entered by the user. The transmission and server-side retention of mail, passwords and tokens are controlled by whoever deployed that Worker. Only connect to services you own, manage or are explicitly authorized to use, and use valid HTTPS URLs.

When you open the privacy policy, terms of use or project page, the system browser visits GitHub; GitHub handles access logs under its own privacy policy.

## 4. System permissions

CloudMail needs internet access. When downloading or sharing attachments, the app may use the operating system's file picker or share sheet. The current version does not request location, contacts, microphone, camera, overlay or notification permissions.

## 5. Data deletion

Users can delete mailboxes and Worker configurations in the app, or delete local data with the operating system's "Clear app data" option. Because CloudMail cannot control a user's self-hosted Worker, server-side mail and logs must be deleted by that Worker's administrator according to its deployment rules.

## 6. Children's privacy

CloudMail is a technical tool for administrators of self-hosted services. It is not designed for children and does not knowingly collect children's personal information.

## 7. Policy updates

Policy changes are published through this repository's commit history and release notes. For significant changes, the effective date is updated before the new version is released.

## 8. Contact

For privacy or security issues, contact the maintainers through GitHub's [private security reporting](https://github.com/Lur1N77777/CloudMail/security/advisories/new). Do not post real passwords, JWTs, mail content or other sensitive information in public issues.
