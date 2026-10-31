# CloudMail Build and Installation Guide

This is an Expo + React Native project. Public releases must use the production keys stored by **EAS cloud builds**; local Gradle builds are only for compilation, manifest and compatibility checks.

---

## Option 1: EAS cloud build (recommended, simplest)

No Android SDK or Java needed; Expo builds the package in the cloud. The free tier is enough for personal use.

### 1. Install eas-cli

```powershell
npm install -g eas-cli
```

### 2. Sign in to Expo

```powershell
eas login
```

If you do not have an account, sign up for free at [expo.dev](https://expo.dev).

### 3. Confirm the project link

```powershell
cd cloudmail
eas project:info
```

This repository is linked to `@your-expo-username/cloudmail` with Project ID `00000000-0000-0000-0000-000000000000`. Do not create a new EAS project or replace the Project ID in `app.config.ts`.

### 4. Build the production AAB and sideload APK

```powershell
eas build --platform android --profile production --non-interactive --wait
eas build --platform android --profile apk
```

- `production` builds the `.aab` required by Google Play.
- `apk` builds the `.apk` for GitHub Releases / sideloading, signed with the same EAS production key as the AAB.
- After the build, verify the package name, version, permissions and signing certificate before uploading a release.

### 5. Install on a phone

Send the APK to your phone (messaging app or USB) and tap to install. The first time, Android warns about an untrusted source; allow it.

---

## Option 2: Local Gradle build (requires the Android SDK)

If you already have Android Studio, you can build locally, which is faster.

### Prerequisites

1. Install Java JDK 17: https://adoptium.net/ (choose Temurin 17 LTS)
2. Install Android Studio: https://developer.android.com/studio
3. Environment variables:
   - `JAVA_HOME` points to the JDK install path
   - `ANDROID_HOME` points to the Android SDK path (usually `<your-user-home>\\AppData\\Local\\Android\\Sdk`)
   - Add `%ANDROID_HOME%\platform-tools` to `PATH`

### Steps

```powershell
cd cloudmail

# 1. Install dependencies (required the first time)
npm install -g pnpm
pnpm install

# 2. Generate the native android directory
npx expo prebuild -p android --clean

# 3. Build the release APK
cd android
.\gradlew assembleRelease

# 4. APK location
# android/app/build/outputs/apk/release/app-release.apk
```

> **Signing key**: local release builds from a managed prebuild use the debug keystore by default. They are only CI/local verification artifacts and must never be uploaded as official releases. Official releases use the private production keystore stored in EAS.

### Verify the APK

```powershell
$buildTools = "$env:ANDROID_HOME\build-tools\36.0.0"
& "$buildTools\aapt2.exe" dump badging .\cloudmail-v1.1.4.apk
& "$buildTools\aapt2.exe" dump permissions .\cloudmail-v1.1.4.apk
& "$buildTools\apksigner.bat" verify --verbose --print-certs .\cloudmail-v1.1.4.apk
```

Confirm that the package name is `space.manus.cloudmail.t20260418184046`, the version is `1.1.4 (18)`, there are no notification, recording, boot, wake lock, storage or overlay permissions, and the certificate SHA-256 matches the V1.1.3 production build: `5B:F4:BF:3A:49:73:2D:2A:5A:D1:F9:57:FB:D7:62:7F:E2:13:78:6E:1F:8B:35:7A:6E:E1:15:78:15:68:CE:EB`.

---

## Development (no build, run with Expo Go)

To try changes quickly without rebuilding every time:

```powershell
# 1. Install Expo Go on your phone (from the app store)
# 2. Put the phone and computer on the same Wi-Fi
# 3. Start the dev server
cd cloudmail
pnpm install   # first time only
npx expo start
# 4. Scan the QR code in the terminal with Expo Go
```

> **Note**: Expo Go does not provide exactly the same SecureStore and native build environment as production builds. Use an EAS APK or AAB for final acceptance testing.

---

## Troubleshooting

### The domain list is still empty

Open Settings → Test connection. If the dialog says "Connected, but no domains":

1. Tap "View raw response JSON" to see which fields the server returned
2. In the Cloudflare Dashboard → Workers & Pages → your Worker → Settings → Variables, check:
   - Whether `DOMAINS` exists and is a JSON array: `["a.com","b.com"]`
   - Do not write it as `a.com,b.com` or a single string

### "Send balance is 0"

Go to the Send tab. A banner at the top shows a "Request" button for send access; tap it.

### Using it on a family member's phone

Two options:
1. Share the APK with them. After installing, they paste the **mailbox credential (JWT)** you exported into Mailboxes → Import (copy it from Mailboxes → the 🔑 icon)
2. Or let them create their own mailboxes and use them independently

---

## Directory overview

```
cloudmail/
├── app/                  # Expo Router routes (tab pages)
│   ├── (tabs)/
│   │   ├── index.tsx     # Inbox / sent
│   │   ├── compose.tsx   # Send email
│   │   ├── addresses.tsx # Mailbox management, credential export/import
│   │   └── settings.tsx  # Worker configuration, account, auto reply
│   └── mail-detail.tsx   # Email details
├── lib/
│   ├── api.ts            # API client (all backend endpoints)
│   ├── mail-context.tsx  # Global state management
│   ├── mail-parser.ts    # MIME email parsing
│   └── sha256.ts         # Pure JS SHA-256 (used by the sign-in endpoint)
├── eas.json              # EAS build configuration
└── app.config.ts         # Expo app configuration
```
