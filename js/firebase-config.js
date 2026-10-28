/* firebase-config.js — this site's Firebase project, used only for the optional
 * extras: Google sign-in, encrypted sync between devices, and Gemini analysis
 * through Firebase AI Logic.
 *
 * These values identify the project and are meant to be public (Firebase
 * console → Project settings → Your apps → Config); access is controlled by
 * Firebase Authentication, App Check and firestore.rules. While FIREBASE_CONFIG
 * is null the app stays entirely local: no sign-in button, and nothing is ever
 * loaded from Google. Setup steps: README → "Sign-in, sync and AI".
 */

const FIREBASE_CONFIG = null;

/* The reCAPTCHA Enterprise site key App Check has registered for this web app.
   Firebase enforces App Check for AI Logic, so Gemini through sign-in needs it;
   sign-in and sync work without it. Not a secret either. */
const RECAPTCHA_SITE_KEY = null;
