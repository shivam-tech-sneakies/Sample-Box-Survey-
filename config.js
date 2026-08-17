/* ============================================================
   Sneakies Sample Box Survey — deployment configuration.

   This is the ONLY file you need to touch between environments.
   It is plain JS loaded before survey.js, so a change here needs
   no rebuild — edit, redeploy, done.
   ============================================================ */
window.SNEAKIES_SURVEY_CONFIG = {

  /* Where answers are POSTed. This is a SAME-ORIGIN path, served by
     api/submit.js, which forwards to the Google Apps Script collector
     server-side.

     It has to work this way: Apps Script Web Apps send no
     Access-Control-Allow-Origin header, so a browser is not allowed to
     read the response of a fetch made straight to the /exec URL. Posting
     via our own origin avoids CORS altogether, and keeps the Apps Script
     URL and its shared secret out of the page source.

     The Apps Script URL lives in api/submit.js (or in the SURVEY_ENDPOINT
     environment variable). See README.md step 2.

     Leave this empty and the page runs in DRY-RUN mode: everything
     works, answers are logged to the browser console, and nothing
     is sent anywhere. Handy for previewing before go-live. */
  endpoint: '/api/submit',

  /* Where to send people who hit a submit error they can't clear. */
  supportEmail: 'hello@eatsneakies.com',
};
