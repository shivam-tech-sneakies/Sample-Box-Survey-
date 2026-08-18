/* ============================================================
   Sneakies Sample Box Survey

   Questions, options and copy all live in QUESTIONS / FLAVORS
   below — edit those to change the survey, nothing else. The
   state shape, validation and the submitted payload are all
   derived from it, so adding or removing a question is a
   one-place edit.

   Answers POST to /api/submit on this origin, which forwards to
   a Google Apps Script Web App that appends one row per response
   to the response spreadsheet. See apps-script/Code.gs.
   ============================================================ */
(function () {
  'use strict';

  var CONFIG = window.SNEAKIES_SURVEY_CONFIG || {};
  var DRAFT_KEY = 'sneakies-survey-draft-v2';
  var SUBMIT_TIMEOUT_MS = 20000;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------------------------------------------------------------
     Flavor lineup for the per-flavor rating grid
     --------------------------------------------------------------- */
  var FLAVORS = [
    { key: 'banana',     name: 'Banana Bonanza',   veg: 'With carrots',     tint: 'var(--flavor-banana-tint)',     hero: 'var(--flavor-banana)',     img: 'assets/img/carrot.png',      w: 108, h: 90 },
    { key: 'apple',      name: 'Apple Pie Agents', veg: 'With spinach',     tint: 'var(--flavor-apple-tint)',      hero: 'var(--flavor-apple)',      img: 'assets/img/spinach.png',     w: 85,  h: 108 },
    { key: 'berry',      name: 'Berry Bandits',    veg: 'With beets',       tint: 'var(--flavor-berry-tint)',      hero: 'var(--flavor-berry)',      img: 'assets/img/strawberry.png',  w: 60,  h: 108 },
    { key: 'buttermilk', name: 'Buttermilk Blast', veg: 'With cauliflower', tint: 'var(--flavor-buttermilk-tint)', hero: 'var(--flavor-buttermilk)', img: 'assets/img/cauliflower.png', w: 71,  h: 108 }
  ];

  var FLAVOR_OPTIONS = ['Loved it', 'Liked it', 'It was fine', 'Not for me', "Haven't tried it yet"];

  var BADGE_COLORS = [
    'var(--flavor-banana)', 'var(--flavor-apple)', 'var(--flavor-berry)',
    'var(--flavor-buttermilk)', 'var(--flavor-banana)', 'var(--flavor-apple)',
    'var(--flavor-berry)'
  ];

  /* ---------------------------------------------------------------
     The survey. Types: email | text | textarea | single | multi | flavors
     `required: true` blocks submit until answered.
     --------------------------------------------------------------- */
  var QUESTIONS = [
    {
      id: 'email', type: 'email', required: true,
      prompt: "What's your email address?",
      placeholder: 'you@example.com',
      note: 'So we can match this to your sample box order.',
      error: 'Please add the email address you ordered with.'
    },
    {
      id: 'verdict', type: 'single', required: true,
      prompt: 'What did you think of your Sneakies Sample Box?',
      options: ['Loved it', 'Liked it', 'It was okay', 'Not for me', 'Something else'],
      otherOption: 'Something else'
    },
    {
      id: 'flavorRatings', type: 'flavors', required: false,
      prompt: 'How would you rate each flavor?'
    },
    {
      id: 'likedMost', type: 'textarea', required: false,
      prompt: 'What did you (and your kids) like the most about Sneakies?',
      placeholder: 'Anything at all — taste, texture, how easy it was, what the kids said…'
    },
    {
      id: 'improve', type: 'textarea', required: false,
      prompt: 'What (if anything) would you change about Sneakies or want us to improve?',
      placeholder: "Be blunt — this is the most useful thing you can tell us."
    },
    {
      id: 'flavorsNext', type: 'textarea', required: false,
      prompt: 'What flavors do you want to see us launch next?',
      placeholder: 'Chocolate chip, pumpkin spice, something we would never think of…'
    },
    {
      id: 'ceoCall', type: 'single', required: true,
      prompt: 'Are you open to having a 15 min conversation with me (Arun, CEO of Sneakies) to get more of your feedback?',
      options: ['Yes', 'No'],
      note: "If yes, I'll email you to find a time that suits you."
    }
  ];

  /* ---------------------------------------------------------------
     State, derived from QUESTIONS
     --------------------------------------------------------------- */
  function blankState() {
    var state = {};
    QUESTIONS.forEach(function (q) {
      if (q.type === 'flavors') {
        state[q.id] = {};
        FLAVORS.forEach(function (f) { state[q.id][f.key] = null; });
      } else if (q.type === 'multi') {
        state[q.id] = [];
      } else if (q.type === 'single') {
        state[q.id] = null;
      } else {
        state[q.id] = '';
      }
      if (q.otherOption) state[q.id + 'Other'] = '';
    });
    return state;
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
      // Copy only keys we still recognise, so an old draft can never
      // reintroduce a question that has since been removed.
      Object.keys(fresh).forEach(function (k) {
        if (saved[k] === undefined) return;
        if (fresh[k] && typeof fresh[k] === 'object' && !Array.isArray(fresh[k])) {
          if (!saved[k] || typeof saved[k] !== 'object') return;
          Object.keys(fresh[k]).forEach(function (sub) {
            var v = saved[k][sub];
            if (typeof v === 'string' || v === null) fresh[k][sub] = v;
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

    if (q.type === 'email' || q.type === 'text') {
      card.appendChild(textField(q));
    } else if (q.type === 'textarea') {
      card.appendChild(textArea(q));
    } else if (q.type === 'flavors') {
      card.appendChild(flavorGrid(q));
    } else {
      card.appendChild(chipGroup(q));
      if (q.otherOption) card.appendChild(otherField(q));
    }

    if (q.note) card.appendChild(el('p', 'qnote', q.note));

    var error = el('p', 'field-error');
    error.id = 'error-' + q.id;
    error.textContent = q.error || 'Please pick an answer to carry on.';
    card.appendChild(error);

    return card;
  }

  function textField(q) {
    var input = el('input', 'input');
    input.type = q.type === 'email' ? 'email' : 'text';
    input.id = 'field-' + q.id;
    input.name = q.id;
    input.placeholder = q.placeholder || '';
    input.autocomplete = q.type === 'email' ? 'email' : 'off';
    if (q.type === 'email') {
      input.inputMode = 'email';
      input.spellcheck = false;
      input.autocapitalize = 'off';
    }
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

  function textArea(q) {
    // The wrapper mirrors the value in a ::after so the box grows with
    // the text via CSS grid — see .grow-wrap in survey.css.
    var wrap = el('div', 'grow-wrap');

    var area = el('textarea', 'input textarea');
    area.id = 'field-' + q.id;
    area.name = q.id;
    area.rows = 3;
    area.maxLength = 2000;
    area.placeholder = q.placeholder || '';
    area.value = state[q.id] || '';
    area.setAttribute('aria-labelledby', 'label-' + q.id);
    area.setAttribute('aria-describedby', 'error-' + q.id);
    area.addEventListener('input', function () {
      state[q.id] = area.value;
      wrap.dataset.replicatedValue = area.value;
      clearError(q.id);
      saveDraft();
    });

    wrap.dataset.replicatedValue = area.value;
    wrap.appendChild(area);
    return wrap;
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

    var note = el('p', 'qnote', 'Optional, only if you want to');

    wrap.appendChild(input);
    wrap.appendChild(note);
    return wrap;
  }

  function flavorGrid(q) {
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
      group.dataset.question = q.id;

      FLAVOR_OPTIONS.forEach(function (label) {
        var chip = el('button', 'chip chip--flavor', label);
        chip.type = 'button';
        chip.setAttribute('role', 'radio');
        chip.dataset.value = label;
        chip.addEventListener('click', function () { setFlavor(q, f.key, label); });
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

  function setFlavor(q, key, value) {
    state[q.id][key] = state[q.id][key] === value ? null : value;
    clearError(q.id);
    syncQuestion(q);
    saveDraft();
  }

  /* ---------------------------------------------------------------
     View sync — called after any change, and once on load so a
     restored draft shows correctly.
     --------------------------------------------------------------- */
  function syncQuestion(q) {
    var field;

    if (q.type === 'email' || q.type === 'text') {
      field = $('field-' + q.id);
      if (field && field.value !== state[q.id]) field.value = state[q.id] || '';
      return;
    }

    if (q.type === 'textarea') {
      field = $('field-' + q.id);
      if (field) {
        if (field.value !== state[q.id]) field.value = state[q.id] || '';
        if (field.parentElement) field.parentElement.dataset.replicatedValue = field.value;
      }
      return;
    }

    if (q.type === 'flavors') {
      FLAVORS.forEach(function (f) {
        var group = container.querySelector('[data-flavor="' + f.key + '"]');
        if (!group) return;
        var chips = group.querySelectorAll('.chip--flavor');
        var checkedIndex = -1;
        Array.prototype.forEach.call(chips, function (chip, i) {
          var on = state[q.id][f.key] === chip.dataset.value;
          chip.setAttribute('aria-checked', on ? 'true' : 'false');
          if (on) checkedIndex = i;
        });
        var focusIndex = checkedIndex === -1 ? 0 : checkedIndex;
        Array.prototype.forEach.call(chips, function (chip, i) {
          chip.tabIndex = i === focusIndex ? 0 : -1;
        });
      });
      return;
    }

    var multi = q.type === 'multi';
    var group = container.querySelector('.chips[data-question="' + q.id + '"]');
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

  function syncAll() { QUESTIONS.forEach(syncQuestion); }

  /* ---------------------------------------------------------------
     Validation
     --------------------------------------------------------------- */
  function isAnswered(q) {
    var value = state[q.id];
    if (q.type === 'email') return EMAIL_RE.test(String(value || '').trim());
    if (q.type === 'text' || q.type === 'textarea') return String(value || '').trim().length > 0;
    if (q.type === 'multi') return value.length > 0;
    if (q.type === 'flavors') {
      return Object.keys(value).some(function (k) { return value[k]; });
    }
    return !!value;
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
    var answers = {};
    Object.keys(state).forEach(function (k) {
      var v = state[k];
      answers[k] = typeof v === 'string' ? v.trim() : v;
    });
    answers.submissionId = uuid();
    answers.submittedAt = new Date().toISOString();
    answers.meta = collectMeta();
    return answers;
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
    var heading = thanks.querySelector('.thanks__title');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  function reset(showForm) {
    state = blankState();
    clearDraft();
    hideNotice();
    QUESTIONS.forEach(function (q) {
      clearError(q.id);
      var field = $('field-' + q.id);
      if (field) field.value = '';
      if (q.otherOption) {
        var otherInput = $('field-' + q.id + '-other');
        if (otherInput) otherInput.value = '';
      }
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

  // Enter in a single-line field should not submit a half-filled survey.
  // Textareas keep Enter for new lines.
  form.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.preventDefault();
  });

  // Exposed so the Apps Script column order and the page can be checked
  // against each other from the console.
  window.SNEAKIES_SURVEY = {
    questions: QUESTIONS,
    flavors: FLAVORS,
    getState: function () { return JSON.parse(JSON.stringify(state)); }
  };
})();
