/**
 * Progress page: one unified tracker (check-in incl. steps + cycling, weight lifting, golf).
 * Steps live in the Check-in section but still save to progress_steps; cycling_miles is a
 * nullable progress_checkins column (sql/progress-trackers.sql). Missing column => saved without it.
 * Depends on: window.ffSupabase, window.FFAuth.
 * Tables: progress_checkins (sql/progress-checkins.sql) and
 * progress_lifts / progress_golf_rounds / progress_steps (sql/progress-trackers.sql).
 * If the tracker tables are missing, check-ins still work and a friendly note is shown.
 */
(function (global) {
  'use strict';

  const LIST_LIMIT = 40;
  const SETUP_MSG = 'Lifting, golf, and steps tracking will be available soon.';

  const FIELDS = [
    { key: 'weight', label: 'Weight', unit: 'lb', summary: 'latest' },
    { key: 'pushups', label: 'Push-ups', unit: '', summary: 'total', integer: true },
    { key: 'squats', label: 'Squats', unit: '', summary: 'total', integer: true },
    { key: 'yoga_minutes', label: 'Yoga', unit: 'min', summary: 'total', integer: true },
    { key: 'miles', label: 'Miles walked / run', unit: 'mi', summary: 'total' },
    { key: 'cycling_miles', label: 'Miles cycled', unit: 'mi', summary: 'total', optional: true },
    { key: 'calories', label: 'Calories', unit: '', summary: 'total', integer: true },
    { key: 'carbohydrates', label: 'Carbohydrates', unit: 'g', summary: 'total' },
    { key: 'sugars', label: 'Sugars', unit: 'g', summary: 'total' },
  ];

  const TRACKERS = {
    lifts: { table: 'progress_lifts', dateKey: 'performed_on', cols: 'id, performed_on, created_at, exercise, sets, reps, weight, notes' },
    golf: { table: 'progress_golf_rounds', dateKey: 'played_on', cols: 'id, played_on, created_at, holes, score, course' },
    steps: { table: 'progress_steps', dateKey: 'walked_on', cols: 'id, walked_on, created_at, steps' },
  };

  const INPUT_CLS = 'w-full border border-[#E6E7E8] focus:border-[#BE0F34] rounded-2xl px-4 py-3 text-sm outline-none';
  const LABEL_CLS = 'block text-xs font-semibold tracking-wider text-[#414042]/70 mb-1.5';

  function el(id) { return document.getElementById(id); }
  function currentUser() {
    return global.FFAuth && global.FFAuth.getCurrentUser ? global.FFAuth.getCurrentUser() : null;
  }
  function toast(message) {
    if (typeof global.showToast === 'function') global.showToast(message);
  }
  function isoOf(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayISO() { return isoOf(new Date()); }
  function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return isoOf(d); }
  function fmt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '';
  }
  function withUnit(value, field) {
    const t = fmt(value);
    return t && field.unit ? t + ' ' + field.unit : t;
  }
  function fmtDate(iso) {
    const p = String(iso || '').slice(0, 10).split('-');
    if (p.length !== 3) return String(iso || '');
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  function isMissingTable(error) {
    if (!error) return false;
    const msg = String(error.message || '') + ' ' + String(error.code || '');
    return /42P01|PGRST205|PGRST204|does not exist|schema cache|Could not find/i.test(msg);
  }
  function setStatus(message, isError) {
    const s = el('progress-status');
    if (!s) return;
    s.textContent = message || '';
    s.classList.toggle('text-[#BE0F34]', !!isError);
    s.classList.toggle('text-[#414042]/70', !isError);
  }
  function setTrackerNote(message) {
    const n = el('progress-tracker-note');
    if (!n) return;
    n.textContent = message || '';
    n.classList.toggle('hidden', !message);
  }
  function showSignedIn(isSignedIn) {
    const gate = el('progress-signed-out');
    const app = el('progress-app');
    if (gate) gate.classList.toggle('hidden', isSignedIn);
    if (app) app.classList.toggle('hidden', !isSignedIn);
  }

  /* ---------- lift rows ---------- */

  function liftField(labelText, input) {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.className = LABEL_CLS;
    label.textContent = labelText;
    input.className = INPUT_CLS;
    label.htmlFor = input.id;
    wrap.append(label, input);
    return wrap;
  }

  let liftSeq = 0;
  function addLiftRow() {
    const rows = el('lift-rows');
    if (!rows) return;
    liftSeq += 1;
    const n = liftSeq;
    const row = document.createElement('div');
    row.className = 'lift-row relative grid grid-cols-2 sm:grid-cols-5 gap-3 bg-[#E6E7E8]/30 border border-[#E6E7E8] rounded-2xl p-4';

    const make = (type, cls, attrs) => {
      const i = document.createElement('input');
      i.type = type;
      i.id = 'lift-' + cls + '-' + n;
      i.dataset.f = cls;
      Object.keys(attrs).forEach((k) => i.setAttribute(k, attrs[k]));
      return i;
    };
    const ex = liftField('EXERCISE', make('text', 'exercise', { list: 'lifts-exercise-options', maxlength: '80', placeholder: 'Bench Press', autocomplete: 'off' }));
    ex.className = 'col-span-2';
    const sets = liftField('SETS', make('number', 'sets', { inputmode: 'numeric', min: '1', max: '100', step: '1', placeholder: '3' }));
    const reps = liftField('REPS', make('number', 'reps', { inputmode: 'numeric', min: '1', max: '1000', step: '1', placeholder: '8' }));
    const wt = liftField('WEIGHT (LB)', make('number', 'weight', { inputmode: 'decimal', min: '0', max: '2000', step: '0.5', placeholder: '135' }));
    const notes = liftField('NOTES', make('text', 'notes', { maxlength: '280', placeholder: 'Optional' }));
    notes.className = 'col-span-2 sm:col-span-5';
    row.append(ex, sets, reps, wt, notes);

    if (rows.children.length > 0) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border border-[#E6E7E8] text-[#414042]/70 hover:text-[#BE0F34] text-xs';
      rm.setAttribute('aria-label', 'Remove lift');
      rm.innerHTML = '<i class="fa-solid fa-times"></i>';
      rm.addEventListener('click', () => row.remove());
      row.appendChild(rm);
    }
    rows.appendChild(row);
  }
  function resetLiftRows() {
    const rows = el('lift-rows');
    if (!rows) return;
    rows.replaceChildren();
    addLiftRow();
  }

  /* ---------- reading the form ---------- */

  function readCheckin(date) {
    const row = { checked_in_on: date };
    let any = false;
    for (const field of FIELDS) {
      const input = el('progress-' + field.key);
      const text = String(input ? input.value : '').trim();
      if (!text) { if (!field.optional) row[field.key] = null; continue; }
      const n = field.integer ? Number.parseInt(text, 10) : Number(text);
      if (!Number.isFinite(n) || n < 0) return { error: field.label + ' needs a number that is zero or greater.', focus: input };
      row[field.key] = n;
      any = true;
    }
    return any ? { row } : {};
  }

  function readLifts(date) {
    const out = [];
    const rows = document.querySelectorAll('#lift-rows .lift-row');
    for (let i = 0; i < rows.length; i += 1) {
      const get = (f) => rows[i].querySelector('[data-f="' + f + '"]');
      const vals = {};
      ['exercise', 'sets', 'reps', 'weight', 'notes'].forEach((f) => { vals[f] = String(get(f).value || '').trim(); });
      if (!vals.exercise && !vals.sets && !vals.reps && !vals.weight && !vals.notes) continue;
      const label = 'Lift ' + (i + 1) + ': ';
      const sets = Number.parseInt(vals.sets, 10);
      const reps = Number.parseInt(vals.reps, 10);
      const weight = Number(vals.weight);
      if (!vals.exercise) return { error: label + 'enter an exercise.', focus: get('exercise') };
      if (!(sets >= 1 && sets <= 100)) return { error: label + 'sets must be 1–100.', focus: get('sets') };
      if (!(reps >= 1 && reps <= 1000)) return { error: label + 'reps must be 1–1000.', focus: get('reps') };
      if (vals.weight === '' || !(weight >= 0 && weight <= 2000)) return { error: label + 'weight must be 0–2000 lb.', focus: get('weight') };
      out.push({ performed_on: date, exercise: vals.exercise.slice(0, 80), sets, reps, weight, notes: vals.notes ? vals.notes.slice(0, 280) : null });
    }
    return { rows: out };
  }

  const GOLF_HOLES = [9, 18, 27, 36];
  function readGolf(date) {
    const holesRaw = String(el('golf-holes').value || '').trim();
    const scoreRaw = String(el('golf-score').value || '').trim();
    const course = String(el('golf-course').value || '').trim();
    // Holes is a select (always has a value), so only score/course decide whether golf was filled in.
    if (!scoreRaw && !course) return {};
    const holes = holesRaw ? Number.parseInt(holesRaw, 10) : 18;
    const score = Number.parseInt(scoreRaw, 10);
    if (GOLF_HOLES.indexOf(holes) === -1) return { error: 'Golf: holes played must be 9, 18, 27, or 36.', focus: el('golf-holes') };
    if (!(score >= 1 && score <= 300)) return { error: 'Golf: enter your score for the round.', focus: el('golf-score') };
    return { row: { played_on: date, holes, score, course: course ? course.slice(0, 120) : null } };
  }

  function readSteps(date) {
    const raw = String(el('steps-count').value || '').trim();
    if (!raw) return {};
    const steps = Number.parseInt(raw, 10);
    if (!(steps >= 0 && steps <= 200000) || !/^\d+$/.test(raw)) return { error: 'Steps must be a whole number from 0 to 200,000.', focus: el('steps-count') };
    return { row: { walked_on: date, steps } };
  }

  /* ---------- summary + history ---------- */

  function card(label, value, accent) {
    const c = document.createElement('div');
    c.className = 'bg-white border border-[#E6E7E8] rounded-2xl px-4 py-3 min-w-0 border-t-4';
    c.style.borderTopColor = accent || '#BE0F34';
    const l = document.createElement('div');
    l.className = 'text-[10px] font-semibold tracking-wider text-[#414042]/60';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'mt-1 text-lg sm:text-xl font-black text-[#BE0F34] break-words';
    v.textContent = value;
    c.append(l, v);
    return c;
  }

  function checkinCards(rows) {
    const sorted = rows.slice().sort((a, b) =>
      String(b.checked_in_on || '').localeCompare(String(a.checked_in_on || '')) ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const cards = FIELDS.filter((f) => !f.optional || cyclingAvailable).map((field) => {
      let display = '—';
      if (field.summary === 'latest') {
        const found = sorted.find((r) => r[field.key] != null && r[field.key] !== '');
        if (found) display = withUnit(found[field.key], field);
      } else {
        let total = 0;
        let any = false;
        rows.forEach((r) => {
          if (r[field.key] == null || r[field.key] === '') return;
          const n = Number(r[field.key]);
          if (Number.isFinite(n)) { total += n; any = true; }
        });
        if (any) display = withUnit(total, field);
      }
      return card((field.summary === 'latest' ? 'LATEST ' : 'TOTAL ') + field.label.toUpperCase(), display, '#BE0F34');
    });
    if (cyclingAvailable) {
      const cutoff = isoDaysAgo(6);
      let c7 = 0;
      let anyC = false;
      rows.forEach((r) => {
        const n = Number(r.cycling_miles);
        if (r.cycling_miles == null || !Number.isFinite(n)) return;
        anyC = true;
        if (String(r.checked_in_on) >= cutoff) c7 += n;
      });
      cards.push(card('MILES CYCLED · 7 DAYS', anyC ? fmt(c7) + ' mi' : '—', '#BE0F34'));
    }
    return cards;
  }

  function liftCards(rows) {
    if (!rows.length) return [];
    const cutoff = isoDaysAgo(6);
    let vol7 = 0;
    let volAll = 0;
    const best = {};
    rows.forEach((r) => {
      const v = r.sets * r.reps * Number(r.weight);
      if (Number.isFinite(v)) {
        volAll += v;
        if (String(r.performed_on) >= cutoff) vol7 += v;
      }
      const name = String(r.exercise || '').trim();
      const k = name.toLowerCase();
      const w = Number(r.weight);
      if (!best[k] || w > best[k].weight || (w === best[k].weight && r.reps > best[k].reps)) best[k] = { name, weight: w, reps: r.reps };
    });
    const out = [card('LIFT VOLUME · 7 DAYS', fmt(vol7) + ' lb', '#5594CF'), card('TOTAL LIFT VOLUME', fmt(volAll) + ' lb', '#5594CF')];
    Object.keys(best).sort((a, b) => best[b].weight - best[a].weight).slice(0, 6).forEach((k) => {
      out.push(card('PR · ' + best[k].name.toUpperCase(), fmt(best[k].weight) + ' lb × ' + best[k].reps, '#5594CF'));
    });
    return out;
  }

  function golfCards(rows) {
    if (!rows.length) return [];
    const out = [card('GOLF ROUNDS', fmt(rows.length), '#D9E364')];
    ['9', '18', '27', '36'].forEach((h) => {
      const set = rows.filter((r) => String(r.holes) === h);
      if (!set.length) return;
      out.push(card('BEST ' + h + '-HOLE', fmt(Math.min.apply(null, set.map((r) => r.score))), '#D9E364'));
      out.push(card('AVG ' + h + '-HOLE', fmt(Math.round((set.reduce((a, r) => a + r.score, 0) / set.length) * 10) / 10), '#D9E364'));
    });
    out.push(card('TOTAL HOLES', fmt(rows.reduce((a, r) => a + r.holes, 0)), '#D9E364'));
    return out;
  }

  function stepCards(rows) {
    if (!rows.length) return [];
    const perDay = {};
    rows.forEach((r) => { const d = String(r.walked_on); perDay[d] = (perDay[d] || 0) + Number(r.steps || 0); });
    const days = Object.keys(perDay).sort().reverse();
    const cutoff = isoDaysAgo(6);
    const total7 = days.filter((d) => d >= cutoff).reduce((a, d) => a + perDay[d], 0);
    return [
      card('LATEST STEPS', fmt(perDay[days[0]]), '#BE0F34'),
      card('STEPS · 7 DAYS', fmt(total7), '#BE0F34'),
      card('7-DAY DAILY AVG', fmt(Math.round(total7 / 7)), '#BE0F34'),
    ];
  }

  function renderSummary(data) {
    const root = el('progress-summary');
    if (!root) return;
    root.replaceChildren.apply(root, []
      .concat(checkinCards(data.checkins))
      .concat(liftCards(data.lifts))
      .concat(golfCards(data.golf))
      .concat(stepCards(data.steps)));
  }

  const TYPE_STYLE = {
    'Check-in': '#BE0F34',
    Lift: '#5594CF',
    Golf: '#D9E364',
    Steps: '#BE0F34',
  };

  function historyEntries(data) {
    const out = [];
    data.checkins.forEach((r) => {
      const parts = [];
      FIELDS.forEach((f) => {
        if (r[f.key] == null || r[f.key] === '') return;
        parts.push(f.key === 'weight' ? withUnit(r[f.key], f) : f.label + ' ' + withUnit(r[f.key], f));
      });
      out.push({ date: r.checked_in_on, created: r.created_at, type: 'Check-in', text: parts.join(' · ') || 'No numbers recorded' });
    });
    data.lifts.forEach((r) => {
      let t = r.exercise + ' ' + r.sets + '×' + r.reps + ' @ ' + fmt(r.weight) + ' lb';
      if (r.notes) t += ' · ' + r.notes;
      out.push({ date: r.performed_on, created: r.created_at, type: 'Lift', text: t });
    });
    data.golf.forEach((r) => {
      let t = r.holes + (r.holes === 1 ? ' hole' : ' holes') + ' · ' + r.score;
      if (r.course) t += ' · ' + r.course;
      out.push({ date: r.played_on, created: r.created_at, type: 'Golf', text: t });
    });
    data.steps.forEach((r) => {
      out.push({ date: r.walked_on, created: r.created_at, type: 'Steps', text: fmt(r.steps) });
    });
    out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.created || '').localeCompare(String(a.created || '')));
    return out.slice(0, LIST_LIMIT);
  }

  function renderHistory(data, emptyText) {
    const list = el('progress-list');
    const empty = el('progress-empty');
    if (!list || !empty) return;
    list.replaceChildren();
    const entries = historyEntries(data);
    if (!entries.length) {
      empty.textContent = emptyText || 'Nothing logged yet. Save your first entry above.';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    // Group by date, newest first.
    let currentDate = null;
    let group = null;
    entries.forEach((e) => {
      if (e.date !== currentDate) {
        currentDate = e.date;
        const li = document.createElement('li');
        li.className = 'border border-[#E6E7E8] rounded-2xl px-4 py-3 bg-[#E6E7E8]/30';
        const d = document.createElement('div');
        d.className = 'text-sm font-bold text-[#414042] mb-1';
        d.textContent = fmtDate(e.date);
        group = document.createElement('ul');
        group.className = 'space-y-1';
        li.append(d, group);
        list.appendChild(li);
      }
      const item = document.createElement('li');
      item.className = 'text-sm text-[#414042]/80 break-words flex items-start gap-x-2';
      const dot = document.createElement('span');
      dot.className = 'mt-1.5 inline-block w-2 h-2 rounded-full shrink-0';
      dot.style.backgroundColor = TYPE_STYLE[e.type] || '#414042';
      const txt = document.createElement('span');
      const strong = document.createElement('span');
      strong.className = 'font-semibold text-[#414042]';
      strong.textContent = e.type;
      txt.append(strong, document.createTextNode(' · ' + e.text));
      item.append(dot, txt);
      group.appendChild(item);
    });
  }

  /* ---------- data ---------- */

  const trackersAvailable = { lifts: true, golf: true, steps: true };
  const CHECKIN_BASE_COLS = 'id, checked_in_on, created_at, weight, pushups, squats, yoga_minutes, miles, calories, carbohydrates, sugars';
  const CYCLING_MSG = 'Cycling miles will save once the cycling column is set up; the rest of your check-in was saved.';
  let cyclingAvailable = true;
  function isMissingColumn(error, col) {
    if (!error) return false;
    const msg = String(error.message || '') + ' ' + String(error.code || '');
    return msg.indexOf(col) !== -1 && /42703|PGRST204|does not exist|schema cache|Could not find/i.test(msg);
  }
  function insertRows(client, job, userId) {
    const rows = job.rows.map((r) => Object.assign({ user_id: userId }, r));
    return client.from(job.table).insert(rows).then(async (res) => {
      if (job.kind === 'checkin' && res.error && isMissingColumn(res.error, 'cycling_miles')) {
        cyclingAvailable = false;
        const hadCycling = rows.some((r) => r.cycling_miles != null);
        const stripped = rows.map((r) => { const c = Object.assign({}, r); delete c.cycling_miles; return c; });
        if (!Object.keys(stripped[0]).some((k) => k !== 'user_id' && k !== 'checked_in_on' && stripped[0][k] != null)) {
          return { error: { message: CYCLING_MSG.split(';')[0] + '.' }, cyclingOnly: true };
        }
        const retry = await client.from(job.table).insert(stripped);
        return { error: retry.error, cyclingDropped: hadCycling };
      }
      return res;
    });
  }

  async function loadAll() {
    const client = global.ffSupabase;
    const user = currentUser();
    const data = { checkins: [], lifts: [], golf: [], steps: [] };
    if (!client || !user) {
      renderSummary(data);
      renderHistory(data);
      return;
    }

    const checkinQuery = (cols) => client
      .from('progress_checkins')
      .select(cols)
      .eq('user_id', user.id)
      .order('checked_in_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    const checkinQ = checkinQuery(CHECKIN_BASE_COLS + ', cycling_miles').then(async (res) => {
      if (res.error && isMissingColumn(res.error, 'cycling_miles')) {
        cyclingAvailable = false;
        return checkinQuery(CHECKIN_BASE_COLS);
      }
      if (!res.error) cyclingAvailable = true;
      return res;
    });
    const trackerQs = Object.keys(TRACKERS).map((key) => {
      const t = TRACKERS[key];
      return client.from(t.table).select(t.cols).eq('user_id', user.id)
        .order(t.dateKey, { ascending: false }).order('created_at', { ascending: false }).limit(500)
        .then((res) => ({ key, res }), (err) => ({ key, res: { error: err } }));
    });

    const [checkRes, ...trackerRes] = await Promise.all([checkinQ, ...trackerQs]);

    let checkinError = false;
    if (checkRes.error) {
      console.warn('[progress] could not load check-ins', checkRes.error);
      checkinError = true;
      setStatus('Could not load check-ins. If this is a new setup, run sql/progress-checkins.sql in Supabase.', true);
    } else {
      data.checkins = checkRes.data || [];
    }

    let anyMissing = false;
    trackerRes.forEach(({ key, res }) => {
      if (res.error) {
        console.warn('[progress] could not load ' + key, res.error);
        trackersAvailable[key] = false;
        anyMissing = true;
      } else {
        trackersAvailable[key] = true;
        data[key] = res.data || [];
      }
    });
    setTrackerNote(anyMissing ? SETUP_MSG : '');

    renderSummary(data);
    renderHistory(data, checkinError ? 'Check-ins are unavailable until the progress table exists.' : null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const client = global.ffSupabase;
    const user = currentUser();
    if (!client || !user) { setStatus('Sign in to save.', true); return; }

    const dateInput = el('progress-date');
    const date = dateInput && dateInput.value ? dateInput.value : todayISO();

    const checkin = readCheckin(date);
    const lifts = readLifts(date);
    const golf = readGolf(date);
    const steps = readSteps(date);
    const bad = [checkin, lifts, golf, steps].find((r) => r.error);
    if (bad) {
      setStatus(bad.error, true);
      if (bad.focus) {
        const det = bad.focus.closest('details');
        if (det) det.open = true;
        bad.focus.focus();
      }
      return;
    }

    const jobs = [];
    if (checkin.row) jobs.push({ kind: 'checkin', table: 'progress_checkins', rows: [checkin.row] });
    if (lifts.rows.length) jobs.push({ kind: 'lifts', table: TRACKERS.lifts.table, rows: lifts.rows });
    if (golf.row) jobs.push({ kind: 'golf', table: TRACKERS.golf.table, rows: [golf.row] });
    if (steps.row) jobs.push({ kind: 'steps', table: TRACKERS.steps.table, rows: [steps.row] });

    if (!jobs.length) {
      setStatus('Fill in at least one section. Blank sections are skipped.', true);
      return;
    }

    const button = el('progress-save-btn');
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    setStatus('');

    const results = await Promise.all(jobs.map((job) =>
      insertRows(client, job, user.id)
        .then((res) => ({ job, error: res.error, cyclingDropped: !!res.cyclingDropped }), (err) => ({ job, error: err }))));

    if (button) { button.disabled = false; button.textContent = 'Save'; }

    const saved = [];
    const pending = [];
    const failed = [];
    const NAMES = { checkin: 'check-in', lifts: 'lifting', golf: 'golf', steps: 'steps' };
    let cyclingDropped = false;
    results.forEach(({ job, error, cyclingDropped: dropped }) => {
      if (dropped) cyclingDropped = true;
      if (!error) { saved.push(job.kind); return; }
      console.warn('[progress] save ' + job.kind, error);
      if (job.kind !== 'checkin' && isMissingTable(error)) pending.push(job.kind);
      else failed.push({ kind: job.kind, message: error.message || 'Could not save.' });
    });

    // Clear only the sections that saved.
    if (saved.includes('checkin')) FIELDS.forEach((f) => { if (f.optional && cyclingDropped) return; const i = el('progress-' + f.key); if (i) i.value = ''; });
    if (saved.includes('lifts')) resetLiftRows();
    if (saved.includes('golf')) { el('golf-holes').value = '18'; el('golf-score').value = ''; el('golf-course').value = ''; }
    if (saved.includes('steps')) el('steps-count').value = '';

    const msgs = [];
    if (saved.length) msgs.push('Saved: ' + saved.map((k) => NAMES[k]).join(', ') + '.');
    if (pending.length) msgs.push('Not saved yet: ' + pending.map((k) => NAMES[k]).join(', ') + '. ' + SETUP_MSG);
    if (cyclingDropped) msgs.push(CYCLING_MSG);
    failed.forEach((f) => msgs.push('Could not save ' + NAMES[f.kind] + ': ' + f.message));
    setStatus(msgs.join(' '), !saved.length || failed.length > 0);
    if (saved.length) toast('Progress saved.');

    await loadAll();
  }

  function bindForm() {
    const form = el('progress-form');
    const dateInput = el('progress-date');
    const signIn = el('progress-open-signin');
    const addLift = el('lift-add-btn');
    if (dateInput && !dateInput.value) dateInput.value = todayISO();
    if (el('lift-rows') && !el('lift-rows').children.length) addLiftRow();
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', handleSubmit);
    }
    if (addLift && !addLift.dataset.bound) {
      addLift.dataset.bound = '1';
      addLift.addEventListener('click', addLiftRow);
    }
    if (signIn && !signIn.dataset.bound) {
      signIn.dataset.bound = '1';
      signIn.addEventListener('click', () => { if (global.FFAuth) global.FFAuth.openAuthModal('signin'); });
    }
  }

  async function initProgressPage() {
    bindForm();
    const user = currentUser();
    showSignedIn(!!user);
    if (user) await loadAll();
    else {
      const empty = { checkins: [], lifts: [], golf: [], steps: [] };
      renderSummary(empty);
      renderHistory(empty);
    }
  }

  global.FFProgress = { initProgressPage, loadCheckins: loadAll, loadAll };
})(window);
