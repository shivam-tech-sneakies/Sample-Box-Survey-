/* ============================================================
   Sneakies Sample Box Survey

   Questions, options and copy all live in QUESTIONS / FLAVORS
   below — edit those to change the survey, nothing else.

   Answers POST as JSON to a Google Apps Script Web App, which
   appends one row per response to the response spreadsheet.
   See apps-script/Code.gs and README.md.
   ============================================================ */
(function () {
  'use strict';

  var CONFIG = window.SNEAKIES_SURVEY_CONFIG || {};
  var DRAFT_KEY = 'sneakies-survey-draft-v1';
  var SUBMIT_TIMEOUT_MS = 20000;

  /* ---------------------------------------------------------------
     Survey definition
     `required: true` blocks submit until answered.
     --------------------------------------------------------------- */
  var FLAVORS = [
    { key: 'banana',     name: 'Banana Bonanza',    veg: 'With carrots',     tint: 'var(--flavor-banana-tint)',     hero: 'var(--flavor-banana)',     img: 'assets/img/carrot.png',      w: 200, h: 167 },
    { key: 'apple',      name: 'Apple Pie Agents',  veg: 'With spinach',     tint: 'var(--flavor-apple-tint)',      hero: 'var(--flavor-apple)',      img: 'assets/img/spinach.png',     w: 158, h: 200 },
    { key: 'berry',      name: 'Berry Bandits',     veg: 'With beets',       tint: 'var(--flavor-berry-tint)',      hero: 'var(--flavor-berry)',      img: 'assets/img/strawberry.png',  w: 112, h: 200 },
    { key: 'buttermilk', name: 'Buttermilk Blast',  veg: 'With cauliflower', tint: 'var(--flavor-buttermilk-tint)', hero: 'var(--flavor-buttermilk)', img: 'assets/img/cauliflower.png', w: 131, h: 200 }
  ];

  var FLAVOR_OPTIONS = ['Loved it', 'Liked it', 'It was fine', 'Not for me', "Haven't tried it yet"];

  var BADGE_COLORS = [
    'var(--flavor-banana)', 'var(--flavor-apple)', 'var(--flavor-berry)',
    'var(--flavor-buttermilk)', 'var(--flavor-banana)', 'var(--flavor-apple)',
    'var(--flavor-berry)'
  ];

  var QUESTIONS = [
    {
      id: 'name', type: 'text', required: true,
      prompt: "What's your name?",
      placeholder: 'First and last name',
      column: 'Name'
    },
    {
      id: 'q2', type: 'single', required: true,
      prompt: 'What did you think of your Sneakies Sample Box?',
      options: ['Loved it', 'Liked it', 'It was okay', 'Not for me', 'Something else'],
      otherOption: 'Something else',
      column: 'Overall verdict'
    },
    {
      id: 'q3', type: 'flavors', required: false,
      prompt: 'How would you rate each flavor?'
    },
    {
      id: 'q4', type: 'single', required: false,
      prompt: 'How did the kids react?',
      options: ['They asked for more', 'They ate it happily', 'They ate it after some convincing', "They weren't into it", 'No kids tried it'],
      column: 'Kids reaction'
    },
    {
      id: 'q5', type: 'multi', required: false,
      prompt: 'What did you like most about Sneakies?',
      options: ['The taste', 'Real fruits and veggies in every bag', 'How easy it is, one bag and no measuring', 'My kids liked it', 'The ingredients list', 'The packaging and characters', 'Something else'],
      otherOption: 'Something else',
      column: 'Liked most'
    },
    {
      id: 'q6', type: 'multi', required: false,
      prompt: 'If you could change one thing, what would it be?',
      options: ['Nothing, leave it as it is', 'Make it sweeter', 'Make it less sweet', 'The texture of the pancakes', 'Clearer instructions for making them', 'The flavor lineup', 'The price', 'Something else'],
      otherOption: 'Something else',
      column: 'Would change'
    },
    {
      id: 'q7', type: 'single', required: true,
      prompt: 'How likely are you to buy Sneakies once it launches?',
      options: ['Very likely', 'Likely', 'Not sure yet', 'Unlikely', 'Very unlikely'],
      column: 'Purchase intent'
    }
  ];

  /* ---------------------------------------------------------------
     State
     --------------------------------------------------------------- */
  function blankState() {
    return {
      name: '',
      q2: null, q2Other: '',
      q3: { banana: null, apple: null, berry: null, buttermilk: null },
      q4: null,
      q5: [], q5Other: '',
      q6: [], q6Other: '',
      q7: null
    };
  }

  var state = blankState();
  var submitting = false;

  /* ---------------------------------------------------------------
     Small helpers
     --------------------------------------------------------------- */
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function $(id) { return document.getElementById(id); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function readDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      var fresh = blankState();
      // Only copy keys we still recognise, so an old draft can never
      // reintroduce a question that has since been removed.
      Object.keys(fresh).forEach(function (k) {
        if (saved[k] === undefined) return;
        if (k === 'q3') {
          Object.keys(fresh.q3).forEach(function (f) {
            if (typeof saved.q3[f] === 'string' || saved.q3[f] === null) fresh.q3[f] = saved.q3[f];
          });
        } else if (Array.isArray(fresh[k])) {
          if (Array.isArray(saved[k])) fresh[k] = saved[k].filter(function (v) { return typeof v === 'string'; });
        } else if (typeof saved[k] === 'string' || saved[k] === null) {
          fresh[k] = saved[k];
        }
      });
      return fresh;
    } catch (e) { return null; }
  }

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------
     Rendering
     --------------------------------------------------------------- */
  var container = $('questions');

  function questionCard(q, index) {
    var card = el('section', 'card');
    card.id = 'card-' + q.id;

    var head = el('div', 'qhead');
    var badge = el('div', 'qhead__badge', String(index + 1));
    badge.style.setProperty('--badge', BADGE_COLORS[index % BADGE_COLORS.length]);
    badge.setAttribute('aria-hidden', 'true');

    var title = el('h2', 'qhead__title', q.prompt);
    title.id = 'label-' + q.id;

    head.appendChild(badge);
    head.appendChild(title);
    card.appendChild(head);

    if (q.type === 'text') {
      card.appendChild(textField(q));
    } else if (q.type === 'flavors') {
      card.appendChild(flavorGrid());
    } else {
      card.appendChild(chipGroup(q));
      if (q.otherOption) card.appendChild(otherField(q));
    }

    var error = el('p', 'field-error');
    error.id = 'error-' + q.id;
    error.textContent = q.type === 'text'
      ? 'Please add your name so we know whose box this was.'
      : 'Please pick an answer to carry on.';
    card.appendChild(error);

    return card;
  }

  function textField(q) {
    var input = el('input', 'input');
    input.type = 'text';
    input.id = 'field-' + q.id;
    input.name = q.id;
    input.placeholder = q.placeholder || '';
    input.autocomplete = 'name';
    input.value = state[q.id] || '';
    input.setAttribute('aria-labelledby', 'label-' + q.id);
    input.setAttribute('aria-describedby', 'error-' + q.id);
    input.addEventListener('input', function () {
      state[q.id] = input.value;
      clearError(q.id);
      saveDraft();
    });
    return input;
  }

  /* Single-select renders as a real radiogroup; multi-select as a
     group of checkboxes. Both use <button> so keyboard and focus
     behaviour come for free, with roles layered on top. */
  function chipGroup(q) {
    var multi = q.type === 'multi';
    var group = el('div', 'chips');
    group.setAttribute('role', multi ? 'group' : 'radiogroup');
    group.setAttribute('aria-labelledby', 'label-' + q.id);
    group.setAttribute('aria-describedby', 'error-' + q.id);
    group.dataset.question = q.id;

    q.options.forEach(function (label) {
      var chip = el('button', 'chip', label);
      chip.type = 'button';
      chip.setAttribute('role', multi ? 'checkbox' : 'radio');
      chip.dataset.value = label;
      chip.addEventListener('click', function () {
        if (multi) toggleMulti(q, label); else toggleSingle(q, label);
      });
      group.appendChild(chip);
    });

    if (!multi) group.addEventListener('keydown', radioKeydown);
    return group;
  }

  function otherField(q) {
    var wrap = el('div');
    wrap.id = 'other-' + q.id;
    wrap.hidden = true;
    wrap.style.display = 'none';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';

    var input = el('input', 'input');
    input.type = 'text';
    input.id = 'field-' + q.id + '-other';
    input.placeholder = 'Tell us more (optional)';
    input.value = state[q.id + 'Other'] || '';
    input.setAttribute('aria-label', q.prompt + ' — tell us more');
    input.maxLength = 500;
    input.addEventListener('input', function () {
      state[q.id + 'Other'] = input.value;
      saveDraft();
    });

    // In the design this note sits with the free-text box, so it
    // appears only when that box does — otherwise "optional" reads
    // as if the question itself were optional.
    var note = el('p', 'qnote', 'Optional, only if you want to');

    wrap.appendChild(input);
    wrap.appendChild(note);
    return wrap;
  }

  function flavorGrid() {
    var wrap = el('div', 'flavors');

    FLAVORS.forEach(function (f) {
      var row = el('div', 'flavor-row');
      row.style.setProperty('--tint', f.tint);
      row.style.setProperty('--hero', f.hero);

      var head = el('div', 'flavor-row__head');
      var img = el('img', 'flavor-row__img');
      img.src = f.img; img.alt = ''; img.width = f.w; img.height = f.h;
      img.loading = 'lazy';

      var names = el('div');
      var nameId = 'flavor-label-' + f.key;
      var name = el('div', 'flavor-row__name', f.name);
      name.id = nameId;
      names.appendChild(name);
      names.appendChild(el('div', 'flavor-row__veg', f.veg));

      head.appendChild(img);
      head.appendChild(names);

      var group = el('div', 'flavor-row__chips');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-labelledby', nameId);
      group.dataset.flavor = f.key;

      FLAVOR_OPTIONS.forEach(function (label) {
        var chip = el('button', 'chip chip--flavor', label);
        chip.type = 'button';
        chip.setAttribute('role', 'radio');
        chip.dataset.value = label;
        chip.addEventListener('click', function () { setFlavor(f.key, label); });
        group.appendChild(chip);
      });
      group.addEventListener('keydown', radioKeydown);

      row.appendChild(head);
      row.appendChild(group);
      wrap.appendChild(row);
    });

    return wrap;
  }

  /* Arrow keys move between radios and select as they go — the
     expected radiogroup interaction. */
  function radioKeydown(event) {
    var keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (keys.indexOf(event.key) === -1) return;

    var chips = Array.prototype.slice.call(this.querySelectorAll('[role="radio"]'));
    var current = chips.indexOf(document.activeElement);
    if (current === -1) current = 0;

    var next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = chips.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % chips.length;
    else next = (current - 1 + chips.length) % chips.length;

    event.preventDefault();
    chips[next].focus();
    chips[next].click();
  }

  /* ---------------------------------------------------------------
     Answer mutations
     --------------------------------------------------------------- */
  function toggleSingle(q, value) {
    state[q.id] = state[q.id] === value ? null : value;
    clearError(q.id);
    syncQuestion(q);
    saveDraft();
  }

  function toggleMulti(q, value) {
    var list = state[q.id];
    var at = list.indexOf(value);
    if (at === -1) list.push(value); else list.splice(at, 1);
    clearError(q.id);
    syncQuestion(q);
    saveDraft();
  }

  function setFlavor(key, value) {
    state.q3[key] = state.q3[key] === value ? null : value;
    syncFlavors();
    saveDraft();
  }

  /* ---------------------------------------------------------------
     View sync — one function per question type, called after any
     change and once on load so a restored draft shows correctly.
     --------------------------------------------------------------- */
  function syncQuestion(q) {
    if (q.type === 'text') {
      var field = $('field-' + q.id);
      if (field && field.value !== state[q.id]) field.value = state[q.id] || '';
      return;
    }
    if (q.type === 'flavors') { syncFlavors(); return; }

    var multi = q.type === 'multi';
    var group = container.querySelector('[data-question="' + q.id + '"]');
    if (!group) return;

    var chips = group.querySelectorAll('.chip');
    var checkedIndex = -1;

    Array.prototype.forEach.call(chips, function (chip, i) {
      var value = chip.dataset.value;
      var on = multi ? state[q.id].indexOf(value) !== -1 : state[q.id] === value;
      chip.setAttribute('aria-checked', on ? 'true' : 'false');
      if (on && checkedIndex === -1) checkedIndex = i;
    });

    // Roving tabindex: a radiogroup is one stop in the tab order.
    if (!multi) {
      var focusIndex = checkedIndex === -1 ? 0 : checkedIndex;
      Array.prototype.forEach.call(chips, function (chip, i) {
        chip.tabIndex = i === focusIndex ? 0 : -1;
      });
    }

    if (q.otherOption) {
      var chosen = multi ? state[q.id].indexOf(q.otherOption) !== -1 : state[q.id] === q.otherOption;
      var wrap = $('other-' + q.id);
      if (wrap) {
        wrap.hidden = !chosen;
        wrap.style.display = chosen ? 'flex' : 'none';
      }
      if (!chosen && state[q.id + 'Other']) {
        state[q.id + 'Other'] = '';
        var otherInput = $('field-' + q.id + '-other');
        if (otherInput) otherInput.value = '';
      }
    }
  }

  function syncFlavors() {
    FLAVORS.forEach(function (f) {
      var group = container.querySelector('[data-flavor="' + f.key + '"]');
      if (!group) return;
      var chips = group.querySelectorAll('.chip--flavor');
      var checkedIndex = -1;
      Array.prototype.forEach.call(chips, function (chip, i) {
        var on = state.q3[f.key] === chip.dataset.value;
        chip.setAttribute('aria-checked', on ? 'true' : 'false');
        if (on) checkedIndex = i;
      });
      var focusIndex = checkedIndex === -1 ? 0 : checkedIndex;
      Array.prototype.forEach.call(chips, function (chip, i) {
        chip.tabIndex = i === focusIndex ? 0 : -1;
      });
    });
  }

  function syncAll() {
    QUESTIONS.forEach(syncQuestion);
  }

  /* ---------------------------------------------------------------
     Validation
     --------------------------------------------------------------- */
  function isAnswered(q) {
    if (q.type === 'text') return String(state[q.id] || '').trim().length > 0;
    if (q.type === 'multi') return state[q.id].length > 0;
    if (q.type === 'flavors') {
      return Object.keys(state.q3).some(function (k) { return state.q3[k]; });
    }
    return !!state[q.id];
  }

  function clearError(id) {
    var card = $('card-' + id);
    if (card) card.classList.remove('is-invalid');
    var field = $('field-' + id);
    if (field) field.removeAttribute('aria-invalid');
  }

  function validate() {
    var missing = [];
    QUESTIONS.forEach(function (q) {
      if (!q.required) return;
      if (isAnswered(q)) { clearError(q.id); return; }
      missing.push(q);
      var card = $('card-' + q.id);
      if (card) card.classList.add('is-invalid');
      var field = $('field-' + q.id);
      if (field) field.setAttribute('aria-invalid', 'true');
    });
    return missing;
  }

  /* ---------------------------------------------------------------
     Submit
     --------------------------------------------------------------- */
  var notice = $('submit-notice');
  var submitBtn = $('submit-btn');

  function showNotice(html) {
    notice.innerHTML = html;
    notice.dataset.open = 'true';
  }

  function hideNotice() {
    notice.dataset.open = 'false';
    notice.innerHTML = '';
  }

  function collectMeta() {
    var params = new URLSearchParams(location.search);
    return {
      source: params.get('src') || params.get('source') || '',
      utmSource: params.get('utm_source') || '',
      utmMedium: params.get('utm_medium') || '',
      utmCampaign: params.get('utm_campaign') || '',
      referrer: document.referrer || '',
      userAgent: navigator.userAgent || '',
      language: navigator.language || '',
      screen: window.screen ? window.screen.width + 'x' + window.screen.height : '',
      pageUrl: location.href
    };
  }

  function buildPayload() {
    // No shared secret here on purpose — api/submit.js attaches it
    // server-side so it never reaches the browser.
    return {
      submissionId: uuid(),
      submittedAt: new Date().toISOString(),
      name: String(state.name || '').trim(),
      q2: state.q2, q2Other: state.q2Other,
      q3: state.q3,
      q4: state.q4,
      q5: state.q5, q5Other: state.q5Other,
      q6: state.q6, q6Other: state.q6Other,
      q7: state.q7,
      meta: collectMeta()
    };
  }

  /* Posts to our own origin (api/submit.js), so plain JSON is fine and
     there is no CORS in play at all. */
  function postOnce(payload) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, SUBMIT_TIMEOUT_MS);

    return fetch(CONFIG.endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      redirect: 'follow',
      signal: controller.signal
    }).then(function (response) {
      clearTimeout(timer);
      return response.text().then(function (text) {
        var data = null;
        try { data = JSON.parse(text); } catch (e) { /* non-JSON body */ }
        // Surface the proxy's own reason where it gave one — it is far
        // more useful in the console than a bare status code.
        if (!response.ok) {
          throw new Error((data && data.error) || 'HTTP ' + response.status);
        }
        if (data && data.ok === false) throw new Error(data.error || 'Rejected by the sheet');
        return data;
      });
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  function send(payload) {
    return postOnce(payload).catch(function (first) {
      // One retry covers the common case: a cold Apps Script
      // container or a phone switching between wifi and cell.
      return new Promise(function (resolve) { setTimeout(resolve, 1500); })
        .then(function () { return postOnce(payload); })
        .catch(function () { throw first; });
    });
  }

  function setSubmitting(on) {
    submitting = on;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? 'Sending…' : 'Submit';
  }

  function onSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    hideNotice();
    var missing = validate();
    if (missing.length) {
      var card = $('card-' + missing[0].id);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var focusTarget = card.querySelector('.input, .chip');
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      }
      showNotice('<strong>Nearly there</strong> — ' + missing.length +
        (missing.length === 1 ? ' question still needs' : ' questions still need') +
        ' an answer. They\'re outlined below.');
      return;
    }

    var payload = buildPayload();

    if (!CONFIG.endpoint) {
      // Dry run: no endpoint configured yet.
      console.info('[Sneakies survey] DRY RUN — no endpoint set in config.js. Payload:', payload);
      finish();
      return;
    }

    setSubmitting(true);
    send(payload).then(function () {
      setSubmitting(false);
      finish();
    }).catch(function (error) {
      setSubmitting(false);
      console.error('[Sneakies survey] submit failed:', error);
      showNotice('<strong>That didn\'t go through</strong> — your answers are still here, ' +
        'so press Submit to try again. If it keeps failing, email them to ' +
        '<a href="mailto:' + (CONFIG.supportEmail || 'hello@eatsneakies.com') + '">' +
        (CONFIG.supportEmail || 'hello@eatsneakies.com') + '</a>.');
    });
  }

  /* ---------------------------------------------------------------
     Completed / reset states
     --------------------------------------------------------------- */
  var form = $('survey');
  var thanks = $('thanks');
  var mastheadCopy = $('masthead-copy');

  function finish() {
    clearDraft();
    hideNotice();
    form.hidden = true;
    mastheadCopy.hidden = true;
    thanks.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    thanks.querySelector('.thanks__title').setAttribute('tabindex', '-1');
    thanks.querySelector('.thanks__title').focus({ preventScroll: true });
  }

  function reset(showForm) {
    state = blankState();
    clearDraft();
    hideNotice();
    QUESTIONS.forEach(function (q) { clearError(q.id); });
    var nameField = $('field-name');
    if (nameField) nameField.value = '';
    QUESTIONS.forEach(function (q) {
      if (!q.otherOption) return;
      var otherInput = $('field-' + q.id + '-other');
      if (otherInput) otherInput.value = '';
    });
    syncAll();
    if (showForm) {
      form.hidden = false;
      mastheadCopy.hidden = false;
      thanks.hidden = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /* ---------------------------------------------------------------
     Boot
     --------------------------------------------------------------- */
  var draft = readDraft();
  if (draft) state = draft;

  QUESTIONS.forEach(function (q, i) { container.appendChild(questionCard(q, i)); });
  syncAll();

  form.addEventListener('submit', onSubmit);
  $('clear-btn').addEventListener('click', function () { reset(false); });
  $('again-btn').addEventListener('click', function () { reset(true); });

  // Enter in the name field should not submit a half-filled survey.
  form.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.preventDefault();
  });

  // Expose the question map so the Apps Script column order and the
  // page can be checked against each other from the console.
  window.SNEAKIES_SURVEY = {
    questions: QUESTIONS,
    flavors: FLAVORS,
    getState: function () { return JSON.parse(JSON.stringify(state)); }
  };
})();
