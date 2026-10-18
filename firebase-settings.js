/* HESTIA FIREBASE CONFIG — use the NEW Firebase project created for Hestia.
   Replace each REPLACE_* value below with values from:
   Firebase Console > Project settings > Your apps > Web app > SDK setup and configuration.
   This is public Firebase web configuration, NOT a service-account private key.
   Never paste any private keys here.
   WARNING: Do NOT reuse Chronos's dashboard-countdown configuration. */
window.HESTIA_CONFIG = Object.freeze({
  firebase: {
    apiKey: 'REPLACE_API_KEY',
    authDomain: 'REPLACE_PROJECT_ID.firebaseapp.com',
    projectId: 'REPLACE_PROJECT_ID',
    storageBucket: 'REPLACE_PROJECT_ID.firebasestorage.app',
    messagingSenderId: 'REPLACE_SENDER_ID',
    appId: 'REPLACE_APP_ID'
  },
  notificationsDeployed: false
});
