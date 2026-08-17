/**
 * POST /api/submit — same-origin proxy in front of the Google Apps
 * Script collector.
 *
 * Why this exists: Apps Script Web Apps do not return an
 * Access-Control-Allow-Origin header, so a browser cannot read the
 * response of a cross-origin fetch to /exec. Posting from the page
 * directly is blocked by CORS. Forwarding server-side sidesteps it
 * completely — the browser only ever talks to its own origin.
 *
 * It also keeps the Apps Script URL and the shared secret out of the
 * page source, so nobody can read them out of devtools and write rows
 * into the sheet by hand.
 */

/* Overridable from Vercel ▸ Settings ▸ Environment Variables, so the
   URL can be rotated (or pointed at a staging sheet) without a commit. */
const ENDPOINT = process.env.SURVEY_ENDPOINT
  || 'https://script.google.com/macros/s/AKfycbytuIIENNa6AtZL7yr9Pc_h8gXqvM-Hz2M-q73oDAyL_x-a-_ZIV513DR2SD-kZBvAudw/exec';

/* Must match SHARED_SECRET in apps-script/Code.gs. */
const SECRET = process.env.SURVEY_SECRET || 'sneakies-sample-box-2026';

const UPSTREAM_TIMEOUT_MS = 25000;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Use POST' });
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) {
      return res.status(400).json({ ok: false, error: 'Malformed JSON' });
    }
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, error: 'Empty body' });
  }
  if (!String(payload.name || '').trim()) {
    return res.status(400).json({ ok: false, error: 'Name is required' });
  }

  // The secret is attached here, never in the browser.
  const body = JSON.stringify({ ...payload, secret: SECRET });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      // text/plain is what Apps Script expects to read out of
      // e.postData.contents without treating it as a form.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: controller.signal
    });

    const text = await upstream.text();

    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* Apps Script served HTML */ }

    if (!upstream.ok) {
      console.error('Apps Script returned HTTP %s', upstream.status);
      return res.status(502).json({ ok: false, error: 'Sheet rejected the write (HTTP ' + upstream.status + ')' });
    }

    // An HTML body means the deployment is not public — Apps Script
    // hands anonymous callers a sign-in page instead of running doPost.
    if (!data) {
      console.error('Apps Script returned non-JSON; deployment is probably not set to "Anyone".');
      return res.status(502).json({ ok: false, error: 'Collector is not publicly reachable' });
    }
    if (data.ok === false) {
      console.error('Apps Script refused the row: %s', data.error);
      return res.status(502).json({ ok: false, error: data.error || 'Rejected by the sheet' });
    }

    return res.status(200).json({ ok: true, submissionId: data.submissionId || '' });

  } catch (error) {
    const aborted = error && error.name === 'AbortError';
    console.error('Forwarding to Apps Script failed:', error);
    return res.status(504).json({
      ok: false,
      error: aborted ? 'The sheet took too long to respond' : 'Could not reach the sheet'
    });
  } finally {
    clearTimeout(timer);
  }
};
