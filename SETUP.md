# Hestia v0.5 — Independent Firebase, Chronos-style storage

## Design decisions
- Hestia and Chronos are two completely independent Firebase **projects**.
- They use the **same style of backend**, not the same database: Firebase Google Authentication + Firestore `dashboards/{uid}` document.
- Chronos stays unchanged. Do not upload any Hestia files into the Chronos repository.
- Hestia Firestore document stores `{ events: [ ... ] }`. This is a single array field like Chronos' `items`, `groups`, `todos` etc. The array is managed via transactions to avoid overwriting another phone's concurrent changes.
- Both Android phones sign into **Hestia** with the same authorised Google account to see the same calendar.
- Nothing is migrated automatically from your old Hestia/Chronos Firebase project. Events saved only to the previous backend must be manually migrated if needed.
- Background push alerts are NOT yet implemented. Reminder choices are preferences only.

## Set up the NEW Firebase project
1. Open https://console.firebase.google.com/ and choose **Add project**. Name it `Hestia` (or any unique project ID). This must NOT be the existing `dashboard-countdown` project.
2. **Project settings > General > Your apps > Add app > Web**. Register e.g. `Hestia Web`. Firebase gives you a configuration object with `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId` (and optionally `storageBucket`).
3. Edit `firebase-settings.js` in this Hestia ZIP and replace all the `REPLACE_*` values using the **NEW Hestia project** config. Keep this file with the website. **Do not paste a service-account JSON or a private key.**
4. **Build > Authentication > Sign-in method**: enable Google. Follow prompts for project support email.
5. **Authentication > Settings > Authorized domains**: add `mistervaliant.github.io` (or your actual GitHub Pages hostname, without `https://` or the repo path). This affects ONLY Hestia's new Firebase project.
6. **Build > Firestore Database**: create a database (Production mode is recommended). Choose a suitable location. Firestore rules below will grant access to the approved Google account.
7. Go to **Firestore Database > Rules**, copy `firestore.rules` from this package, and click **Publish**. It's meant for the NEW Hestia project only; it uses the same rule style as Chronos. Change the approved email if your Hestia login differs.
8. On GitHub, extract `hestia-github-pages-v0.5.zip`, update `firebase-settings.js` in the extracted folder, then upload all the extracted contents (not the ZIP itself) into your **Hestia** GitHub Pages repository root. Make sure `index.html`, `backend.js`, `app.js`, `styles.css`, `firebase-settings.js`, `sw.js`, `manifest.webmanifest`, `icons/` are all present.
9. Wait for GitHub Pages to deploy; open the website in Android Chrome. Go to **Our space > Sign in with Google**. Once signed in, create a test event and check the Firestore console for a `dashboards` collection and a document whose ID is your Firebase Auth UID with an `events` array.
10. Open Hestia on the second Android phone, sign in with the same account, and verify two-way updates. Once working, use Chrome **Add to Home screen / Install** on both devices.

## Expected Firestore layout
```
NEW Firebase project: Hestia
└── Firestore Database
    └── dashboards (collection)
        └── {Firebase Auth UID} (document)
            └── events: [
                 { id: '...', title: '...', date: '2026-10-25', time: '10:00',
                   location: '...', departure: '08:00', reminders: [1440, 30],
                   completed: false, ... }
               ]
```

The first event automatically creates the `dashboards` collection and `{uid}` document. You do not have to create them manually.

## Security and constraints
- The Firestore Rules use the same email allow-list and `uid == request.auth.uid` pattern as Chronos. **Never** use `allow read, write: if true;` in production.
- Auth sessions are separate between websites. You can sign in with the same Google email on both, but Hestia and Chronos are no longer connected.
- **Firestore 1 MiB document limit** applies; this release caps the calendar at 300 events. We can later migrate to per-event documents if you need a larger scale without changing how it looks.
- This code uses the compat SDK `10.12.2`, consistent with the reference Chronos HTML.
- For installed Android PWAs: both Google sign-in and background sync need an internet connection; the offline cache loads the interface but does NOT guarantee editing while offline.
- Reminder selections do not generate system notifications when Hestia is closed. Future phase: separate Cloud Functions + Firebase Cloud Messaging in the **Hestia** project.
- Firebase configuration keys for a web app are public identifiers, not server-side credentials. Still restrict Firestore with security rules and do not distribute private keys.

## Troubleshooting
- **Shows LOCAL or OFFLINE after upload?** Check `firebase-settings.js` was filled in, that the `projectId` is NOT `dashboard-countdown`, and browser DevTools for SDK loading issues. Clear or refresh the installed PWA after publishing an update.
- **Auth unauthorized-domain?** Add your GitHub Pages domain in **Authentication > Settings > Authorized domains** for Hestia's new project.
- **Permission denied?** Verify the Firestore rules, approved email and the account used on the device; rules are case-sensitive.
- **No events on other phone?** Confirm BOTH Hestia installations use the same Firebase Auth user account and both are online.
- **UI still old?** Open the website URL in Chrome first and reload; service-worker updates can take a refresh or two.
