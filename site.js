/**
 * Enchanted Place — front-end behaviour
 * - Mobile nav
 * - Letter + About form posts → POST /api/messages
 * - Booking sheet (calendar → details → Stripe Checkout)
 * Keep EXP rates in sync with OFFERS in server.js.
 */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Optional per-letter reveal animation (data-line="…")
  $$('[data-line]').forEach((line) => {
    const text = line.dataset.line || '';
    const mid = (text.length - 1) / 2;
    line.textContent = '';
    [...text].forEach((ch, i) => {
      const span = document.createElement('span');
      span.style.setProperty('--i', String(i));
      span.style.setProperty('--mid', String(mid));
      span.style.setProperty('--lift', line.dataset.lift || '0px');
      if (ch === ' ') {
        span.className = 'gap';
        span.innerHTML = '&nbsp;';
      } else {
        span.textContent = ch;
      }
      line.append(span);
    });
  });

  const menuBtn = $('.menu-btn');
  const nav = $('.nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // --- Letter signup + About forms ---
  const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  async function postMessage(body) {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something didn’t go through. Please try again, or write to us.');
    return data;
  }

  $$('[data-letter]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('input[type="email"]', form);
      const note = $('[data-letter-note]', form);
      if (!validEmail(input.value.trim())) {
        if (note) note.textContent = 'Enter a full email address, like name@example.com';
        input.focus();
        return;
      }
      const button = $('button', form);
      button.disabled = true;
      try {
        await postMessage({ kind: 'letter', email: input.value.trim() });
        form.outerHTML = `<div class="welcome"><h2>Welcome.</h2><p>Your first letter arrives at the start of next month. Until then, try this: step outside, find one tree, and stay with it for three breaths.</p></div>`;
      } catch (error) {
        button.disabled = false;
        if (note) note.textContent = error.message;
      }
    });
  });

  const HOST_SESSIONS = {
    family: { kicker: 'Family session', title: 'Breeding the Family Common Ground.' },
    team: { kicker: 'Team session', title: 'Building the Team Common Ground.' },
    community: { kicker: 'Community session', title: 'Creating Community and Care.' },
  };

  function openHostForm(session) {
    const host = $('#host');
    if (!host?.classList.contains('host-pop')) return;
    const chosen = HOST_SESSIONS[session] || null;
    const title = $('#host-title');
    const kicker = $('#host-kicker');
    const experience = $('#host-experience');
    if (title) title.textContent = chosen ? chosen.title : 'Tell us who it’s for.';
    if (kicker) kicker.textContent = chosen ? chosen.kicker : '';
    if (experience) experience.value = chosen ? chosen.title : '';
    const hint = $('#host-hint');
    if (hint) {
      hint.textContent = session === 'team'
        ? 'We’ll come back with a proposal shaped around your team.'
        : 'We’ll come back with a proposal shaped around you.';
    }
    const orgField = $('#host-org-field');
    const orgInput = $('#host-org');
    const nameLabel = $('#host-name-label');
    const askOrg = session !== 'family';
    if (orgField) orgField.hidden = !askOrg;
    if (orgInput) {
      orgInput.required = askOrg;
      orgInput.disabled = !askOrg;
      if (!askOrg) orgInput.value = '';
    }
    if (nameLabel) nameLabel.textContent = askOrg ? 'Contact name' : 'Name';
    const whoField = $('#host-who-field');
    const whoInput = $('#host-who');
    const askWho = session === 'community';
    if (whoField) whoField.hidden = !askWho;
    if (whoInput) whoInput.disabled = !askWho;
    const sizeChoice = $('#host-size-choice-field');
    const sizeChoiceInput = $('#host-size-choice');
    const sizeText = $('#host-size-field');
    const sizeTextInput = $('#host-size');
    const askSizeList = session === 'family';
    if (sizeChoice) sizeChoice.hidden = !askSizeList;
    if (sizeText) sizeText.hidden = askSizeList;
    if (sizeChoiceInput) sizeChoiceInput.disabled = !askSizeList;
    if (sizeTextInput) {
      sizeTextInput.disabled = askSizeList;
      sizeTextInput.required = !askSizeList;
    }
    host.hidden = false;
    document.body.style.overflow = 'hidden';
    (askOrg ? $('#host-org') : $('#host-name'))?.focus();
  }

  function closeHostForm() {
    const host = $('#host');
    if (!host?.classList.contains('host-pop')) return;
    host.hidden = true;
    document.body.style.overflow = '';
  }

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-open-host]');
    if (opener && $('#host')?.classList.contains('host-pop')) {
      event.preventDefault();
      openHostForm(opener.dataset.openHost || '');
      return;
    }
    if (event.target.closest('[data-host-close]')) closeHostForm();
  });

  document.addEventListener('keydown', (event) => {
    const host = $('#host');
    if (!host || host.hidden || !host.classList.contains('host-pop')) return;
    if (event.key === 'Escape') closeHostForm();
  });

  $$('[data-message]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', form);
      const body = Object.fromEntries(new FormData(form).entries());
      body.kind = form.dataset.message;
      if (!validEmail(String(body.email || '').trim())) {
        showFormError(form, 'Enter a full email address, like name@example.com');
        return;
      }
      button.disabled = true;
      try {
        await postMessage(body);
        const thanks = document.createElement('p');
        thanks.textContent = 'Thank you. We read every message ourselves and reply within a week.';
        form.replaceWith(thanks);
      } catch (error) {
        button.disabled = false;
        showFormError(form, error.message);
      }
    });
  });

  function showFormError(form, message) {
    let err = $('.error', form);
    if (!err) {
      err = document.createElement('p');
      err.className = 'error';
      err.setAttribute('role', 'alert');
      form.append(err);
    }
    err.textContent = message;
  }

  // Session catalog shown in the booking sheet (prices CAD per person).
  const EXP = {
    family: {
      title: 'Breeding the Family Common Ground.',
      short: '3–5 people, private · $65 CAD per person · 2 hours',
      rate: 65,
      sizes: [3, 5],
    },
    team: {
      title: 'Building the Team Common Ground.',
      short: '15–20 people · $40 CAD per person · 2 hours',
      rate: 40,
      sizes: [15, 20],
    },
    community: {
      title: 'Creating Community and Care.',
      short: '15–20 people · $20 CAD per person · 2 hours',
      rate: 20,
      sizes: [15, 20],
    },
  };

  // Open session dates by experience. Empty array → “no dates” empty state.
  const SESSIONS = {
    family: [
      { key: '2026-10-10', time: '13:00', label: '1:00–3:00 pm', place: 'Pacific Spirit Regional Park' },
      { key: '2026-10-18', time: '10:00', label: '10:00 am–12:00 pm', place: 'Stanley Park' },
      { key: '2026-10-24', time: '13:00', label: '1:00–3:00 pm', place: 'Maple Ridge' },
    ],
    team: [
      { key: '2026-10-15', time: '09:30', label: '9:30–11:30 am', place: 'Pacific Spirit Regional Park' },
      { key: '2026-10-21', time: '13:30', label: '1:30–3:30 pm', place: 'Stanley Park' },
    ],
    community: [],
  };

  // Stripe Connect destination account for Checkout.
  const SELLER = 'acct_1UJ0tmCM3HOIK47j';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Booking dialog markup (shared by Experiences + Book pages).
  document.body.insertAdjacentHTML('beforeend', `
    <div class="book" hidden role="dialog" aria-modal="true" aria-labelledby="book-title">
      <div class="book__scrim" data-book-close></div>
      <div class="book__panel">
        <div class="book__head">
          <span class="logo">enchanted.place</span>
          <span class="book__count" data-book-count>1 of 3</span>
          <button class="book__close" type="button" data-book-close aria-label="Close booking">×</button>
        </div>
        <div class="progress" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="book__body" data-book-body></div>
        <div class="book__foot">
          <div class="row">
            <button class="linkish" type="button" data-book-back>← Back</button>
            <button class="btn" type="button" data-book-next>Continue</button>
          </div>
        </div>
      </div>
    </div>`);

  const book = $('.book');
  const body = $('[data-book-body]');
  const next = $('[data-book-next]');
  const back = $('[data-book-back]');
  const state = {
    step: 1,
    exp: 'family',
    month: monthStart(new Date()),
    pick: null,
    date: '',
    lastFocus: null,
  };

  function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function cellKey(year, month, day) { return `${year}-${pad(month + 1)}-${pad(day)}`; }
  function parseKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  function sessionsFor(exp) { return SESSIONS[exp] || []; }

  function openBook(exp) {
    state.lastFocus = document.activeElement;
    state.pick = null;
    state.date = '';
    if (EXP[exp]) {
      state.exp = exp;
      state.step = 2;
      const first = sessionsFor(exp)[0];
      state.month = first ? monthStart(parseKey(first.key)) : monthStart(new Date());
      const now = monthStart(new Date());
      if (state.month < now) state.month = now;
    } else {
      state.exp = 'family';
      state.step = 1;
      state.month = monthStart(new Date());
    }
    book.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => book.classList.add('open'));
    renderBook();
  }

  function closeBook() {
    book.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { book.hidden = true; }, 400);
    state.lastFocus?.focus?.();
  }

  function updateBookNext() {
    const experience = EXP[state.exp];
    back.hidden = state.step <= 1 || state.step > 3;
    next.hidden = state.step > 3;
    if (state.step === 1) {
      next.disabled = false;
      next.textContent = 'Continue';
    } else if (state.step === 2) {
      next.disabled = !state.pick;
      next.textContent = 'Continue';
      if (!sessionsFor(state.exp).length) next.hidden = true;
    } else if (state.step === 3) {
      next.disabled = false;
    } else if (state.step === 4) {
      next.hidden = false;
      next.disabled = false;
      next.textContent = 'Done';
    }
    if (experience && state.step === 3) return;
  }

  function renderBook(focus = true) {
    const experience = EXP[state.exp];
    $('[data-book-count]').textContent = state.step <= 3 ? `${state.step} of 3` : '';
    $$('.progress span').forEach((bar, index) => bar.classList.toggle('on', index < Math.min(state.step, 3)));

    if (state.step === 1) {
      body.innerHTML = `<h2 id="book-title">Choose your experience</h2>
        <p>Family, Team, or Community. Prices shown per person, in CAD.</p>
        <fieldset class="choices"><legend class="sr-only">Experience</legend>
          ${['family', 'team', 'community'].map((key) => `<label class="choice">
            <input type="radio" name="exp" value="${key}" ${key === state.exp ? 'checked' : ''}>
            <span><span class="eyebrow">${key}</span><strong>${EXP[key].title}</strong><small>${EXP[key].short}</small></span>
          </label>`).join('')}
        </fieldset>
        <p>Looking for a 1:1 session? <a href="about.html#one">Inquire about 1:1.</a></p>`;
      $$('input[name=exp]', body).forEach((input) => {
        input.addEventListener('change', () => {
          state.exp = input.value;
          state.pick = null;
          state.date = '';
        });
      });
    }

    if (state.step === 2) {
      const sessions = sessionsFor(state.exp);
      if (!sessions.length) {
        body.innerHTML = `<h2 id="book-title">Choose a date</h2>
          <div class="empty">
            <p class="eyebrow">No dates</p>
            <h3>No sessions are open right now.</h3>
            <p>Join the letter and you’ll hear first when the next season opens.</p>
            <p><a class="btn" href="#letter" data-book-close>Join the letter</a></p>
          </div>`;
      } else {
        const year = state.month.getFullYear();
        const month = state.month.getMonth();
        const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const openDays = new Set(sessions.map((session) => session.key));
        const selectedKey = state.pick ? state.pick.key : '';
        const cells = Array.from({ length: firstWeekday }, () => '<span></span>').concat(
          Array.from({ length: daysInMonth }, (_, index) => {
            const key = cellKey(year, month, index + 1);
            const open = openDays.has(key);
            const on = key === selectedKey;
            return `<button class="cal-day${open ? ' is-open' : ''}${on ? ' is-on' : ''}" type="button" data-day="${index + 1}" ${open ? '' : 'disabled'}>${index + 1}</button>`;
          })
        );
        const daySessions = sessions.filter((session) => session.key === selectedKey);
        const times = daySessions.length
          ? `<div class="times">${daySessions.map((session) => `<button class="time-pill${state.pick && state.pick.time === session.time && state.pick.key === session.key ? ' is-on' : ''}" type="button" data-time="${session.time}">${session.label}</button>`).join('')}</div>`
          : (selectedKey ? '<p class="cal-note">No open times that day.</p>' : '');
        const now = monthStart(new Date());
        body.innerHTML = `<h2 id="book-title">Choose a date</h2>
          <p>Open times from the booking calendar, Pacific time.</p>
          <div class="cal-head">
            <h3>${MONTHS[month]} ${year}</h3>
            <div class="cal-nav">
              <button type="button" data-cal="prev" aria-label="Previous month" ${state.month > now ? '' : 'disabled'}>‹</button>
              <button type="button" data-cal="next" aria-label="Next month">›</button>
            </div>
          </div>
          <div class="cal" role="grid" aria-label="${MONTHS[month]} ${year}">
            ${WEEKDAYS.map((day) => `<span class="dow">${day}</span>`).join('')}
            ${cells.join('')}
          </div>
          <div class="cal-times"><h3>Start time</h3>${times}</div>
          ${state.pick ? `<p class="place-note">${state.pick.place}</p>` : '<p class="cal-note">Days with a session are marked.</p>'}`;
        $('[data-cal=prev]', body)?.addEventListener('click', () => {
          state.month = new Date(year, month - 1, 1);
          state.pick = null;
          renderBook(false);
        });
        $('[data-cal=next]', body)?.addEventListener('click', () => {
          state.month = new Date(year, month + 1, 1);
          state.pick = null;
          renderBook(false);
        });
        $$('[data-day]', body).forEach((button) => {
          button.addEventListener('click', () => {
            if (button.disabled) return;
            const key = cellKey(year, month, Number(button.dataset.day));
            const match = sessions.find((session) => session.key === key);
            state.pick = match ? { ...match } : null;
            if (state.pick) {
              const day = parseKey(state.pick.key);
              state.date = `${DAY_NAMES[day.getDay()]} ${day.getDate()} ${MONTHS_SHORT[day.getMonth()]} · ${state.pick.label} · ${state.pick.place}`;
            }
            renderBook(false);
          });
        });
        $$('[data-time]', body).forEach((button) => {
          button.addEventListener('click', () => {
            const match = daySessions.find((session) => session.time === button.dataset.time);
            if (!match) return;
            state.pick = { ...match };
            const day = parseKey(match.key);
            state.date = `${DAY_NAMES[day.getDay()]} ${day.getDate()} ${MONTHS_SHORT[day.getMonth()]} · ${match.label} · ${match.place}`;
            renderBook(false);
          });
        });
      }
    }

    if (state.step === 3) {
      const [lo, hi] = experience.sizes;
      const opts = Array.from({ length: hi - lo + 1 }, (_, i) => `<option>${lo + i}</option>`).join('');
      const rateField = Array.isArray(experience.rate)
        ? `<div class="field"><label for="b-rate">Amount per person</label><select id="b-rate">${Array.from({ length: experience.rate[1] - experience.rate[0] + 1 }, (_, i) => `<option value="${experience.rate[0] + i}">$${experience.rate[0] + i} CAD</option>`).join('')}</select><p class="hint">Choose an amount from $${experience.rate[0]} to $${experience.rate[1]} CAD per person.</p></div>`
        : '';
      body.innerHTML = `<h2 id="book-title">Your details</h2>
        <p>${experience.title}<br>${state.date}</p>
        <form data-book-form>
          <div class="field"><label for="b-name">Name</label><input id="b-name" autocomplete="name" required></div>
          <div class="field"><label for="b-email">Email</label><input id="b-email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
          <div class="field"><label for="b-size">Number of people</label><select id="b-size">${opts}</select></div>
          ${rateField}
          <div class="field"><label for="b-note">Access needs, or anything we should know</label><textarea id="b-note"></textarea><p class="hint">Optional.</p></div>
          <p data-book-total></p>
        </form>`;
      const refreshTotal = () => {
        const people = Number($('#b-size', body).value);
        const rate = Array.isArray(experience.rate) ? Number($('#b-rate', body).value) : experience.rate;
        const total = people * rate;
        $('[data-book-total]', body).textContent = `${people} × $${rate} CAD = $${total} CAD`;
        next.textContent = `Book · $${total} CAD`;
      };
      $('#b-size', body).addEventListener('change', refreshTotal);
      $('#b-rate', body)?.addEventListener('change', refreshTotal);
      refreshTotal();
    }

    if (state.step === 4) {
      body.innerHTML = `<p class="eyebrow">Booked</p>
        <h2 id="book-title">See you at the trailhead.</h2>
        <p>${experience.title}</p>
        <p>${state.date}</p>
        <p>We’ll email the meeting point, what to bring, and your receipt.</p>`;
    }

    if (focus) body.scrollTop = 0;
    updateBookNext();
    const heading = $('h2', body);
    if (focus && heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  next.addEventListener('click', async () => {
    const experience = EXP[state.exp];
    if (state.step === 1) {
      state.step = 2;
      const first = sessionsFor(state.exp)[0];
      state.month = first ? monthStart(parseKey(first.key)) : monthStart(new Date());
      const now = monthStart(new Date());
      if (state.month < now) state.month = now;
      state.pick = null;
      renderBook();
      return;
    }
    if (state.step === 2) {
      if (!state.pick) return;
      state.step = 3;
      renderBook();
      return;
    }
    if (state.step === 3) {
      const form = $('[data-book-form]', body);
      if (!form.reportValidity()) return;
      const email = $('#b-email', body).value.trim();
      if (!validEmail(email)) {
        showFormError(form, 'Enter a full email address, like name@example.com');
        return;
      }
      next.disabled = true;
      next.textContent = 'Opening Checkout…';
      try {
        const rate = Array.isArray(experience.rate) ? Number($('#b-rate', body).value) : experience.rate;
        const booking = {
          kind: 'booking',
          name: $('#b-name', body).value.trim(),
          email,
          experience: state.exp,
          date: state.date || '',
          size: $('#b-size', body).value,
          rate: String(rate),
          note: $('#b-note', body).value.trim(),
        };
        sessionStorage.setItem('enchanted_place_booking', JSON.stringify(booking));
        await postMessage(booking);
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: SELLER,
            email: booking.email,
            experience: booking.experience,
            size: Number(booking.size),
            rate,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.url) throw new Error(data.error || 'Something didn’t go through.');
        location.assign(data.url);
        return;
      } catch (error) {
        next.disabled = false;
        next.textContent = 'Book';
        body.insertAdjacentHTML('beforeend', `<p class="error" role="alert">${error.message} Nothing was charged.</p>`);
        return;
      }
    }
    if (state.step === 4) closeBook();
  });

  back.addEventListener('click', () => {
    state.step = Math.max(1, state.step - 1);
    renderBook();
  });

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-book]');
    if (opener && !opener.closest('.book')) {
      event.preventDefault();
      openBook(opener.dataset.book || '');
      return;
    }
    if (event.target.closest('[data-book-close]')) closeBook();
  });

  document.addEventListener('keydown', (event) => {
    if (book.hidden) return;
    if (event.key === 'Escape') closeBook();
  });

  const params = new URLSearchParams(location.search);
  const envVideo = $('.env-video');
  if (envVideo) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      envVideo.removeAttribute('autoplay');
      envVideo.pause();
    } else {
      envVideo.muted = true;
      const play = () => envVideo.play().catch(() => {});
      if (envVideo.readyState >= 2) play();
      else envVideo.addEventListener('canplay', play, { once: true });
      const fadeAt = 8;
      const onTime = () => {
        if (envVideo.currentTime >= fadeAt) {
          envVideo.classList.add('is-fading');
          document.body.classList.add('is-settled');
          envVideo.removeEventListener('timeupdate', onTime);
        }
      };
      envVideo.addEventListener('timeupdate', onTime);
      envVideo.addEventListener('ended', () => {
        envVideo.pause();
        envVideo.style.opacity = '0';
      });
    }
  }

  if (params.get('checkout') === 'success') {
    const saved = JSON.parse(sessionStorage.getItem('enchanted_place_booking') || '{}');
    if (saved.experience && EXP[saved.experience]) state.exp = saved.experience;
    state.date = saved.date || '';
    state.step = 4;
    book.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => book.classList.add('open'));
    renderBook();
    history.replaceState({}, '', location.pathname);
  } else if (params.get('experience') && EXP[params.get('experience')]) {
    openBook(params.get('experience'));
  }
})();
