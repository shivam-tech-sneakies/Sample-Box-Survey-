# Sneakies — Sample Box Survey

A standalone, static survey page built from the Claude Design source
`Sample Box Survey.dc.html`, using the Sneakies design system tokens and
components. Meant to live on its own subdomain (e.g.
`survey.eatsneakies.com`) and write every response into a Google Sheet.

```
index.html          the page
config.js           client config (posts to /api/submit)
api/submit.js       same-origin proxy → Google Apps Script
survey.js           questions, options, validation, submit
styles/survey.css   design-system components as classes
tokens/*.css        Sneakies tokens (copied from the design system)
assets/fonts/       Gimlet Sans, Azo Sans Uber, Stenciletta
assets/img/         logo, cast, favicons
apps-script/Code.gs the Google Sheet collector
vercel.json         headers + caching
serve.py            local preview only, not deployed
```

No build step, no dependencies, no framework. The page itself is pure
static files; the one moving part is `api/submit.js`, a serverless
function that needs a host able to run one (Vercel, Netlify Functions,
Cloudflare Workers). See "Why the page does not call Apps Script
directly" below for why it is unavoidable.

---

## 1. Preview it locally

```bash
python3 serve.py
```

Then open <http://localhost:4321>.

`serve.py` serves static files only, so `/api/submit` does not exist
locally and a real submission will fail. For local work set
`endpoint: ''` in `config.js` — that puts the page in **dry-run mode**:
everything works, the thank-you screen appears, and the payload is logged
to the browser console instead of being sent anywhere. Good for reviewing
copy and layout. Test real submissions against a Vercel preview
deployment, where the function exists.

---

## 2. Wire up the Google Sheet

The responses land in the sheet you provided:

<https://docs.google.com/spreadsheets/d/11J_vYWuKV16CaesXnlrDvy4K9Yb9FdpBtzw-rpxQBSI/edit>

A Google Apps Script Web App is the collector. It runs as you, inside your
own Google account, so there are no service-account keys to manage and no
credentials in the page.

1. Open the sheet → **Extensions ▸ Apps Script**.
2. Delete the placeholder `myFunction` and paste the whole of
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. Save (⌘S). Give the project a name like `Sneakies Survey Collector`.
4. Run the `testWrite` function once from the editor toolbar. Google will
   ask you to authorise it — approve the Sheets access. This both proves
   the script can write and creates the `Responses` tab with its header
   row. Delete the test row from the sheet afterwards.
5. **Deploy ▸ New deployment**, gear icon → **Web app**, then:

   | Field | Value |
   | --- | --- |
   | Description | `v1` |
   | Execute as | **Me** (your account) |
   | Who has access | **Anyone** |

   "Anyone" is required — respondents are not signed in to Google. It lets
   anyone *call* the script; it does not give anyone access to the sheet.
6. Copy the **Web app URL**. It ends in `/exec` — not `/dev`.
7. Put it in [`api/submit.js`](api/submit.js) as `ENDPOINT`, or better,
   set it as a `SURVEY_ENDPOINT` environment variable in Vercel ▸
   Settings ▸ Environment Variables (it takes precedence, and then the
   URL is not in the repo at all).

### Why the page does not call Apps Script directly

Apps Script Web Apps send **no `Access-Control-Allow-Origin` header**, so
a browser is not permitted to read the response of a `fetch` made
straight to the `/exec` URL — the request is blocked by CORS before the
page ever sees it. Confirmed the hard way: posting direct works from
`http://localhost` but fails from a real HTTPS origin with

```
Access to fetch at 'https://script.google.com/…/exec' from origin
'https://…vercel.app' has been blocked by CORS policy
```

So submissions go to **`/api/submit`** on our own origin
([`api/submit.js`](api/submit.js)), which forwards to Apps Script
server-side. No CORS is involved, real success/failure comes back as
JSON, and the Apps Script URL and shared secret stay out of the page
source where anyone could read them from devtools.

The common workaround for this — `fetch(..., { mode: 'no-cors' })` — is
deliberately *not* used: it makes the response unreadable, so the page
would have to show the thank-you screen without knowing whether the row
was written.

To check the collector is alive, open that `/exec` URL in a browser. It
returns `{"ok":true,…,"responses":N}`.

> **Every time you edit `Code.gs` you must redeploy** — Deploy ▸ Manage
> deployments ▸ pencil icon ▸ Version: *New version* ▸ Deploy. The URL
> stays the same. Editing the script alone changes nothing for live users.

### Columns written

One row per submission, in this order:

`Submitted at` · `Submission ID` · `Name` · `Overall verdict` ·
`Overall — other` · `Banana Bonanza` · `Apple Pie Agents` ·
`Berry Bandits` · `Buttermilk Blast` · `Kids reaction` · `Liked most` ·
`Liked most — other` · `Would change` · `Would change — other` ·
`Purchase intent` · `Source` · `UTM source` · `UTM medium` ·
`UTM campaign` · `Referrer` · `Language` · `Screen` · `User agent`

The two multi-select questions (liked most / would change) put every
chosen option in a single cell separated by ` | `, so the column stays
sortable and filterable while keeping all answers visible.

`Source` comes from a `?src=` query parameter, so you can tell channels
apart without separate links breaking anything:

```
https://survey.eatsneakies.com/?src=email-wave-1
https://survey.eatsneakies.com/?src=instagram-dm
```

---

## 3. Deploy the page

There is no build step. The whole page is 185 KB over the wire, most of
it the two webfonts.

### Current setup — GitHub ▸ Vercel

This repo is <https://github.com/shivam-tech-sneakies/Sample-Box-Survey->
and is linked to the Vercel project **sneakies-sample-box-survey** (team
`shivam-8181's projects`). Pushing to `main` deploys to production; no
CLI and no local Node needed.

```bash
git push origin main
```

`vercel.json` handles the rest — static output, a long cache on fonts and
images, and no cache on `index.html` or `config.js` so an endpoint change
goes live immediately.

### Alternatives, if you ever move off Vercel

Netlify: drag the folder onto <https://app.netlify.com/drop>.
Cloudflare Pages: **Create ▸ Upload assets**. Neither needs a build
command; publish directory is `.`.

### Subdomain

In your DNS (wherever `eatsneakies.com` is managed), add the record the
host gives you for `survey`:

- **Vercel** — add `survey.eatsneakies.com` under Project ▸ Settings ▸
  Domains, then create the `CNAME` it shows, pointing at
  `cname.vercel-dns.com`.
- **Cloudflare Pages** — add the custom domain; if the zone is already on
  Cloudflare the record is created for you.

HTTPS is issued automatically. Give DNS up to an hour.

---

## 4. Before you send the link

- [ ] Open the live URL and submit one real response.
- [ ] Confirm the row appears in the `Responses` tab.
- [ ] Delete that row and the `testWrite` row.
- [ ] Check it on a phone — most people will answer on one.
- [ ] Try it in a private window (no localStorage draft, no cache).

---

## Notes and decisions

**Required questions.** Name, the overall verdict (Q2) and purchase intent
(Q7) block submit; everything else is optional, since per-flavor ratings
and the two multi-selects are the questions people most reasonably skip.
To change this, flip `required` on any entry in the `QUESTIONS` array in
`survey.js` — that array is the single source of truth for wording,
options and validation.

**Thank-you card.** The design showed a row of four characters above
"Survey complete"; that row was removed on request, so the card is now
type only. The cast artwork is still used in the Q3 flavor rows.

**Artwork note.** `carrot-01.png` could not be transferred out of the
design project — it exceeds the file-transfer limit and arrives
truncated. `carrot-02.png` (the same carrot character, alternate pose)
came through intact and is what the Banana Bonanza row uses.

**Drafts.** Answers are kept in `localStorage` as they're entered, so a
refresh or an accidental back-navigation doesn't lose progress. The draft
is cleared on successful submit and by the Clear button.

**Failed submits.** A failed POST retries once after 1.5s, then shows an
error and keeps the answers on screen so Submit can be pressed again.
Nothing is silently dropped and no false success is ever shown.

**Fonts.** Gimlet Sans, Azo Sans Uber and Stenciletta ship self-hosted
from `assets/fonts/`, woff2 only. The web licence on file covers
**15,000 monthly unique visitors** across eatsneakies.com — this
subdomain counts against the same allowance, so check the headroom
before a large send.

Only Gimlet (91 KB) and Stenciletta (21 KB) are actually downloaded.
Azo Sans Uber is declared for design-system parity but this page sets all
display type in Stenciletta, so no browser ever requests it — verified in
the network panel.

**Image sizes.** The design project's character art is 4501×4501. These
are resized to 108px (they render at 36px) and the logo to 450px (renders
at 150px), then quantised to a 128-colour palette — the art is flat line
work, so this is lossless to the eye. That took the images from 227 KB to
29 KB. Originals live in the design project if you ever need bigger.

**Accessibility.** Single-select questions are real `radiogroup`s with
arrow-key navigation and a roving tab stop; multi-selects are checkbox
groups. Validation errors are announced, focus moves to the first
unanswered question, and every control clears a ≥44px tap target on
touch.

**Indexing.** The page sends `noindex, nofollow` — it's a link you send,
not something to be found in search. Remove the `robots` meta tag in
`index.html` if you ever want it indexed.
