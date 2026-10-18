# Hestia — mobile-first shared planner (design preview)

A calm, responsive PWA concept created as an independent companion to Chronos Dashboard.

## Included

- Responsive mobile-first home screen, weekly calendar, monthly calendar, plans list and "Our space" screen
- Functional create/edit/delete/complete events with date, time, location, departure time and notes
- Local persistence in the browser via `localStorage`
- Clearly labelled sample events, removable in **Our space**
- Preference selection for future push reminders (NOT yet delivered)
- Warm cream + forest green + terracotta visual design, optional night theme
- PWA manifest, 192px and 512px icons, offline app-shell service worker
- No third-party JavaScript dependencies; optional Google Fonts will fall back when offline

## Important current limitations

**This is a functional frontend / design prototype, not yet a two-person live planner.**

- Events currently exist only in the browser where they're entered. They do NOT sync between phones.
- Google sign-in, partner invitations and Firebase database writes are deliberately not enabled.
- Reminder preferences are stored but **do not trigger background notifications**. To notify both Android phones when the app is closed, implement Firebase Cloud Messaging, a service worker push handler and a secure server-side scheduler. A PWA service worker alone cannot reliably schedule alarms at an arbitrary time while the app is closed.
- Do not rely on Hestia's preview reminders for actual appointments.

## Run locally

Open a terminal inside the `hestia-site` folder:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000` in Chrome. The app should also display using `index.html` directly, but the service worker and PWA installation require HTTPS or localhost.

## Deploy to GitHub Pages

1. Create a **new** repository named e.g. `hestia` (keep it separate from Chronos).
2. Upload the **contents** of this folder to its root (`index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, and `icons/`).
3. In repository **Settings → Pages**, deploy from `main` / root.
4. Open the generated `https://<username>.github.io/hestia/` URL in Android Chrome.
5. Choose Chrome's **⋮ → Add to Home screen / Install app**. The install label may vary.

## Next: connecting the existing Firebase project safely

The Chronos reference file uses Firebase Authentication + Cloud Firestore project `dashboard-countdown`, storing personal dashboard documents under `dashboards/{uid}`. Hestia should reuse the same Firebase project but **never modify or repurpose `dashboards/{uid}`**.

Recommended Hestia collections:

```text
hestiaSpaces/{spaceId}
  name, ownerUid, memberIds, createdAt
hestiaSpaces/{spaceId}/events/{eventId}
  title, startAt (timestamp), endAt, timezone, category, place,
  departureAt, notes, reminders, status, createdBy, updatedAt
hestiaUsers/{uid}/spaces/{spaceId}
  role, joinedAt
hestiaDevices/{uid}/tokens/{tokenId}
  FCM token metadata (protected)
```

Design principles before enabling the connector:

- Google sign-in on both sites; add Hestia's domain to Firebase Authentication authorized domains.
- Share only with authenticated, invited space members via enforced **Firestore Security Rules**.
- Never infer permissions from front-end UI, obscured URLs, or client-controlled member IDs.
- Validate invitations securely (ideally with short-lived server-issued tokens or Cloud Function invitations), and account for revocation.
- Use Firestore `onSnapshot` for live views and Chronos' read-only calendar preview; never duplicate events into existing Chronos deadline arrays.
- FCM service worker + scheduled backend jobs for reliable reminders; plan for offline phones and Android notification permissions.
- Use browser-local event dates and explicit timezone fields when syncing events (e.g. `Indian/Mauritius`).
- Review billing and hosting configuration before enabling scheduled functions.
- Deploy rules by carefully **merging** Hestia paths into your existing rules; do not overwrite existing Chronos access rules.

The public Firebase Web SDK configuration shown in Chronos has **not** been copied into this prototype. This avoids implying a working shared backend before rules and invitations are implemented.
