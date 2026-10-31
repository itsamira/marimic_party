/* ═══════════════ Firebase config ═══════════════
 *
 * 1. Go to https://console.firebase.google.com and create a project.
 * 2. Build → Realtime Database → Create database (pick a region, start in
 *    test mode, then paste the rules from database.rules.json).
 * 3. Project settings → Your apps → Web app (</> icon) → Register app.
 * 4. Copy the config object Firebase shows you into the values below.
 *
 * These values are safe to make public — Firebase security rules are what
 * actually protect your data.
 */
window.FIREBASE_CONFIG = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://PASTE_YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "PASTE_YOUR_PROJECT",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};
