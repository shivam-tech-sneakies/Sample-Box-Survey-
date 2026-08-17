/* ============================================================
   Sneakies Sample Box Survey — deployment configuration.

   This is the ONLY file you need to touch between environments.
   It is plain JS loaded before survey.js, so a change here needs
   no rebuild — edit, redeploy, done.
   ============================================================ */
window.SNEAKIES_SURVEY_CONFIG = {

  /* Google Apps Script Web App URL that writes rows into the
     response spreadsheet. Paste the /exec URL you get from
     Deploy ▸ New deployment ▸ Web app.  See README.md step 2.

     Leave it empty and the page runs in DRY-RUN mode: everything
     works, answers are logged to the browser console, and nothing
     is sent anywhere. Handy for previewing before go-live. */
  endpoint: 'https://script.google.com/macros/s/AKfycbytuIIENNa6AtZL7yr9Pc_h8gXqvM-Hz2M-q73oDAyL_x-a-_ZIV513DR2SD-kZBvAudw/exec',

  /* Must match SHARED_SECRET in apps-script/Code.gs. Keeps random
     traffic from writing junk rows into the sheet. Not a security
     boundary (it ships in the page), just a cheap spam gate. */
  secret: 'sneakies-sample-box-2026',

  /* Where to send people who hit a submit error they can't clear. */
  supportEmail: 'hello@eatsneakies.com',
};
