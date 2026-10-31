# CloudMail Design Document

## Overview

CloudMail is a mobile client for the Cloudflare temporary email backend. Users enter their own Cloudflare Worker URL and credentials to connect to a self-hosted temporary email service and send, receive and manage mail.

## Screens

| Screen | Description | Tab |
|---------|------|-----|
| Inbox | Mail list with pull-to-refresh and automatic polling | Tab 1 |
| Compose | Write and send email | Tab 2 |
| Addresses | Manage email addresses, create new ones | Tab 3 |
| Settings | Server configuration, app settings | Tab 4 |
| Mail Detail | View the email body and attachments | Stack Screen |

## Main content and features

### Inbox
- Mail list cards: sender, subject, time, preview
- Pull-to-refresh + automatic polling (configurable interval of 10/30/60 seconds)
- Swipe left to delete
- Tap to open mail details
- Current email address shown at the top, with quick switching
- Empty state message

### Mail Detail
- Header info: sender, recipient, subject, time
- HTML body rendering (WebView)
- Plain-text body
- Attachment list and download

### Compose
- Sender name input
- Recipient address and name input
- Subject input
- Body editor (plain text / HTML toggle)
- Send button

### Addresses
- Shows the current active email address
- Create a new address (name + domain)
- List of saved addresses
- Switch the active mailbox
- Delete addresses
- Show/copy JWT credentials

### Settings
- Server URL (Worker URL)
- Admin password (optional, for the Admin API)
- Site access password (optional)
- Auto-refresh interval
- Dark/light mode toggle
- About

## Key user flows

### First use
1. The user opens the app → Settings
2. Enters the Worker URL → Save
3. Optionally enters the admin password and site password
4. Switches to Addresses → creates a new mailbox
5. Enters a mailbox name, picks a domain → Create
6. The app switches to the inbox and starts receiving mail

### Reading mail
1. Inbox list → tap a mail card
2. The mail detail page opens
3. View the body and attachments
4. Go back to the list

### Sending mail
1. Tap the Compose tab
2. Fill in the recipient, subject and body
3. Tap Send → the result is shown

### Switching mailboxes
1. Addresses page → tap a saved address
2. It becomes the active mailbox
3. The inbox refreshes with that mailbox's mail

## Color scheme

| Use | Light mode | Dark mode |
|------|---------|---------|
| Primary (brand) | #2563EB (blue) | #3B82F6 |
| Background | #F8FAFC | #0F172A |
| Surface (cards) | #FFFFFF | #1E293B |
| Foreground (text) | #0F172A | #F1F5F9 |
| Muted (secondary text) | #64748B | #94A3B8 |
| Border | #E2E8F0 | #334155 |
| Success | #10B981 | #34D399 |
| Warning | #F59E0B | #FBBF24 |
| Error | #EF4444 | #F87171 |

The design uses the Slate palette with blue as the primary brand color for a professional, clean email client feel.

## Interaction design

- The mail list uses FlatList with pull-to-refresh
- Mail cards give opacity feedback on tap
- Haptic feedback after a successful send
- Delete actions require confirmation
- Loading states use ActivityIndicator
- Error states use toast messages
