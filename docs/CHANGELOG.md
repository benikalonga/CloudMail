# Changelog

This file records the main public version changes of CloudMail.

## V1.1.4 - 2026-10-01

V1.1.4 fixes [#17](https://github.com/Lur1N77777/CloudMail/issues/17), where Chinese emails displayed garbled characters in both HTML and plain-text views.

- Fixed Chinese email decoding in HTML and plain-text views by adding native support for GB2312, GBK, GB18030, Big5, and other charsets across bodies, subjects, sender names, and attachment names, while preserving attachment bytes.
- Reparsed legacy mailbox caches from retained source messages without losing IDs, ownership metadata, or incremental sync progress. Invalidated legacy admin summaries without source data so they refresh from page zero.
- Added regression tests for Expo's native decoder environment, multiple charsets, attachments, cache repair, and failed migration writes.
- Bumped the app to `1.1.4` with Android/iOS build number `18`.

## V1.1.3 - 2026-07-16

V1.1.3 is a production hardening release. It keeps existing workflows compatible and focuses on local credential security, connection diagnostics after deployment changes, Android permissions and reproducible releases.

- Migrated Worker admin/site passwords and mailbox JWTs/passwords to SecureStore on Android/iOS, removing plaintext only after secure writes succeed.
- Parallelized secure reads, cleaned up orphaned keys, and preserved credentials shared by duplicate mailbox identities.
- Added precise diagnostics for site/admin password failures, incompatible APIs, timeouts, rate limits, and Worker errors.
- Removed unused notification, audio, video, and image modules and blocked unrelated Android permissions.
- Disabled Android app-data backup and added privacy/terms links in Settings.
- Expanded CI with lint, production Web export, clean Android Release compilation, final manifest checks, and SecureStore dependency verification.
- Bumped the app to `1.1.3` with Android/iOS build number `17`.
- Fixed conditional Web theme-hook usage and removed release-gate lint warnings.

### Signing migration

GitHub APKs for V1.1.2 and earlier used the debug certificate. From V1.1.3, builds use the EAS production certificate, and Android does not allow the two certificates to install over each other. Existing users must first note their Worker configuration and copy any mailbox credentials they want to keep, then uninstall the old version and install V1.1.3.

## V1.1.2 - 2026-05-07

V1.1.2 is a stability and performance release. It fixes the app getting stuck when entering the admin console after the first save, the lack of a persistent cache on the addresses page, duplicate refresh indicators and slow sync of remote deletions.

- Saving Workers configuration now opens the admin console immediately; admin checks, statistics, and warm-up requests run on demand in the background.
- Added persisted cache for the address list and full address index, making addresses, groups, search, and user filters cache-first.
- Improved address and mail refresh synchronization so server-side deletions are corrected during mobile refresh.
- Fixed pagination offset after address delete/batch delete to avoid empty lists that cannot load more data.
- Improved cache, paging, and incremental refresh for inbox, sent, unknown, and single-address mail lists.
- Added Worker frontend URL configuration for one-tap login-link copying from address lists and address details.
- Removed duplicate top updating indicators and kept a single refresh spinner; RefreshControl backgrounds now match light, dark, and OLED black themes.
- Unified Worker timestamp parsing and Shanghai-time display to keep list and detail timestamps consistent.

## V1.1.1 - 2026-04-30

V1.1.1 adds support for multiple Cloudflare accounts / multiple Workers. Previously, when several Cloudflare accounts each deployed their own Worker, the app could only use one Worker.

### Added

- New multi-Worker configuration profiles (`WorkerProfile`) that store each Worker's name, URL, admin password, site password, domain list and connection status.
- The `Workers` section in settings is now a Worker list where you can add, edit, delete, make current, test the connection and refresh domains.
- A quick switcher for the current Worker at the top of the admin console; addresses, inbox, sent, unknown, send and stats use the current Worker by default.
- Creating a mailbox routes to the right Worker based on the selected domain, and the domain picker shows the source Worker.
- One-tap address creation from unknown mail resolves the Worker by the target domain instead of always using the current Worker.
- Same-domain conflict detection: when several Workers configure the same domain, the app does not silently pick the wrong one and asks the user to choose or switch Workers.

### Improved

- An old single-Worker configuration is migrated automatically to a "Default account", so there is no need to re-enter it after upgrading.
- Newly created and imported mailbox accounts record `workerProfileId / workerUrl`, so later requests always go to the right Worker.
- Mail caches, address groups, unread state and spam rules stay isolated per Worker to avoid mixing accounts.
- Test connection in settings checks a draft fingerprint, so a late async result never overwrites later edits.
- Account-level API requests support runtime Worker configuration overrides, so switching the current Worker does not affect existing mailbox account requests.

### Fixed

- Local accounts could overwrite each other when the same email address existed on different Workers.
- Inbox and user settings might not reload after switching the same address across Workers.
- Mailbox password import always used the current Worker, causing sign-in failures or wrong bindings when the domain belonged to another Worker.
- The admin cache could reuse old Worker data after switching Workers.

## V1.1.0 - 2026-04-29

V1.1.0 is an admin enhancement release after the previous GitHub release **V1.0.12**, focused on large address counts, user filtering, bulk actions and a spam folder.

### Added

- **All users / specific user** filter on the addresses page, using the web UI's actual endpoint `/admin/users/bind_address/:user_id` to show the addresses bound to a user.
- A background address index for large address counts, so groups and search no longer rely only on the current page; suitable for 800+ addresses.
- Address selection mode: long-press an address to start bulk management.
- Bulk actions: select all in the current scope, delete addresses, empty inbox, empty sent, empty all mail, delete empty mailboxes, add to / remove from local groups.
- A built-in **spam folder** on the inbox page, switched between `Inbox / Spam` from the title dropdown without taking extra top navigation space.
- Local block rules that move mail from a full sender address into spam.
- A long-press mail menu to block a sender, unblock, or delete mail.
- **Mark all read** to clear local unread dots for the current Worker and sync mounted pages.
- A shared overlay menu component for nicer long-press and lightweight pop-up menus.

### Improved

- Overlay visuals for mailbox groups, inbox switching and long-press actions, reducing the abruptness of native dialogs.
- User filtering on the addresses page no longer misuses `/admin/address?user_id=`, avoiding the false message that the backend cannot filter addresses by user.
- Request race handling when switching users, so old requests never overwrite the new user's view.
- Address cache invalidation: deleting, creating, binding, creating from unknown mail and bulk actions no longer replay stale lists.
- Ownership of refresh/sync/loading state, so stale requests never leave loading stuck.
- Local state sync between spam, regular inbox and unknown mail.

### Fixed

- Group members were not all shown when there were many addresses.
- After selecting a user, the page stayed on "Identifying users" or did not show bound addresses.
- When `/admin/address` did not return `user_id`, the app wrongly assumed the backend did not support user filtering.
- Old data could flash briefly when quickly switching users, refreshing or searching.

## V1.0.12 - 2026-04-25

- Added unread dots for new admin mail; new received and unknown mail from incremental refresh shows a local unread mark.
- Added local read-state sync between received and unknown mail.
- Added a "Code copied" message after copying a verification code, which also marks the mail as read.
- Improved the mailbox groups sheet: now a stable centered light sheet, with the flicker during keyboard input fixed.
- Improved keyboard avoidance in the single-mailbox send form.
- Improved admin page swiping: one gesture switches at most one page.
- Compacted the top toolbars on the addresses, inbox, sent and unknown pages to give the list preview more space.

## V1.0.11 - 2026-04-25

- The app now starts admin-first, and the admin settings page moved to a root-level route.
- Added an OLED black theme, and the admin quick theme button remembers the preferred dark variant.
- Added full-screen Reanimated paging for admin pages.
- Improved admin navigation responsiveness, list rendering, page warm-up and background refresh.
- Updated the README to describe the new admin-first flow.

## V1.0.10 - 2026-04-25

- Prepared CloudMail for public GitHub release.
- APKs are now distributed through GitHub Releases instead of the source repository.
- Added open-source project metadata, contributing guide and security policy.
- Added acknowledgements for the upstream project `dreamhunter2333/cloudflare_temp_email`.

## Earlier versions

Earlier versions were mainly local development builds. See the Git history for implementation details.
