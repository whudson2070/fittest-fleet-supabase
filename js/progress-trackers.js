/**
 * Progress page trackers: weight lifting, golf, steps.
 * Depends on: window.ffSupabase, window.FFAuth. Tables from sql/progress-trackers.sql.
 * If a table is missing, that tracker shows a friendly notice; check-ins keep working.
 */
(function (global) {
  'use strict';

  const LIST_LIMIT = 20;
  const SETUP_MSG = 'This tracker is being set up and will be available soon.';

  function user() {
    return global.FFAuth && global.FFAuth.getCurrentUser ? global.FFAuth.getCurrentUser() : null;
  }
  function el(id) { return document.getElementById(id); }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function isoDaysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmt(n) {
    const x = Number(n);
    return Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '';
  }
  function fmtDate(iso) {
    const p = String(iso || '').slice(0, 10).split('-');
    if (p.length !== 3) return String(iso || '');
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function isMissingTable(error) {
    if (!error) return false;
    const msg = String(error.message || '') + ' ' + String(error.code || '');
    return /42P01|PGRST205|PGRST204|does not exist|schema cache|Could not find/i.test(msg);
  }
  function setStatus(key, message, isError) {
    const s = el(key + '-status');
    if (!s) return;
    s.textContent = message || '';
    s.classList.toggle('text-[#BE0F34]', !!isError);
    s.classList.toggle('text-[#414042]/70', !isError);
  }
  function card(label, value) {
    const c = document.createElement('div');
    c.className = 'bg-[#E6E7E8]/30 border border-[#E6E7E8] rounded-2xl px-4 py-3 min-w-0';
    const l = document.createElement('div');
    l.className = 'text-[10px] font-semibold tracking-wider text-[#414042]/60';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'mt-1 text-lg font-black text-[#BE0F34] break-words';
    v.textContent = value;
    c.append(l, v);
    return c;
  }
  function renderList(key, rows, dateKey, lineFn) {
    const list = el(key + '-list');
    const empty = el(key + '-empty');
    if (!list || !empty) return;
    list.replaceChildren();
    if (!rows.length) {
      empty.textContent = 'Nothing logged yet.';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    rows.slice(0, LIST_LIMIT).forEach((row) => {
      const li = document.createElement('li');
      li.className = 'border border-[#E6E7E8] rounded-2xl px-4 py-3 bg-[#E6E7E8]/30';
      const d = document.createElement('div');
      d.className = 'text-sm font-bold text-[#414042]';
      d.textContent = fmtDate(row[dateKey]);
      const b = document.createElement('div');
      b.className = 'mt-1 text-sm text-[#414042]/80 break-words';
      b.textContent = lineFn(row);
      li.append(d, b);
      list.appendChild(li);
    });
  }
  function showUnavailable(key) {
    const sum = el(key + '-summary');
    const list = el(key + '-list');
    const empty = el(key + '-empty');
    if (sum) sum.replaceChildren();
    if (list) list.replaceChildren();
    if (empty) {
      empty.textContent = SETUP_MSG;
      empty.classList.remove('hidden');
    }
  }

  const TRACKERS = {
    lifts: {
      table: 'progress_lifts',
      dateKey: 'performed_on',
      cols: 'id, performed_on, created_at, exercise, sets, reps, weight, notes',
      line(r) {
        let t = r.exercise + ' ' + r.sets + '×' + r.reps + ' @ ' + fmt(r.weight) + ' lb';
        t += ' · Volume ' + fmt(r.sets * r.reps * Number(r.weight)) + ' lb';
        if (r.notes) t += ' · ' + r.notes;
        return t;
      },
      summary(rows) {
        const out = [];
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
          if (!best[k] || w > best[k].weight || (w === best[k].weight && r.reps > best[k].reps)) {
            best[k] = { name, weight: w, reps: r.reps };
          }
        });
        out.push(card('VOLUME LAST 7 DAYS', fmt(vol7) + ' lb'));
        out.push(card('TOTAL VOLUME', fmt(volAll) + ' lb'));
        Object.keys(best).sort((a, b) => best[b].weight - best[a].weight).slice(0, 7).forEach((k) => {
          out.push(card('PR · ' + best[k].name.toUpperCase(), fmt(best[k].weight) + ' lb × ' + best[k].reps));
        });
        return out;
      },
      read() {
        const exercise = (el('lifts-exercise').value || '').trim();
        const sets = Number.parseInt(el('lifts-sets').value, 10);
        const reps = Number.parseInt(el('lifts-reps').value, 10);
        const weight = Number(el('lifts-weight').value);
        const notes = (el('lifts-notes').value || '').trim();
        if (!exercise) return { error: 'Enter an exercise.' };
        if (!(sets >= 1 && sets <= 100)) return { error: 'Sets must be 1–100.' };
        if (!(reps >= 1 && reps <= 1000)) return { error: 'Reps must be 1–1000.' };
        if (el('lifts-weight').value === '' || !(weight >= 0 && weight <= 2000)) return { error: 'Weight must be 0–2000 lb.' };
        return { row: { performed_on: el('lifts-date').value || todayISO(), exercise: exercise.slice(0, 80), sets, reps, weight, notes: notes ? notes.slice(0, 280) : null } };
      },
      reset() { ['lifts-sets', 'lifts-reps', 'lifts-weight', 'lifts-notes'].forEach((id) => { el(id).value = ''; }); },
      saved: 'Lift saved.',
    },
    golf: {
      table: 'progress_golf_rounds',
      dateKey: 'played_on',
      cols: 'id, played_on, created_at, holes, score, course',
      line(r) {
        let t = r.holes + (r.holes === 1 ? ' hole' : ' holes') + ' · Score ' + r.score;
        if (r.course) t += ' · ' + r.course;
        return t;
      },
      summary(rows) {
        const out = [card('ROUNDS LOGGED', fmt(rows.length))];
        ['18', '9'].forEach((h) => {
          const set = rows.filter((r) => String(r.holes) === h);
          if (!set.length) return;
          const bestScore = Math.min.apply(null, set.map((r) => r.score));
          const avg = set.reduce((a, r) => a + r.score, 0) / set.length;
          out.push(card('BEST ' + h + '-HOLE', fmt(bestScore)));
          out.push(card('AVG ' + h + '-HOLE', fmt(avg)));
        });
        out.push(card('TOTAL HOLES', fmt(rows.reduce((a, r) => a + r.holes, 0))));
        return out;
      },
      read() {
        const holes = Number.parseInt(el('golf-holes').value, 10);
        const score = Number.parseInt(el('golf-score').value, 10);
        const course = (el('golf-course').value || '').trim();
        if (!(holes >= 1 && holes <= 18)) return { error: 'Holes played must be 1–18.' };
        if (!(score >= 1 && score <= 300)) return { error: 'Enter your score for the round.' };
        return { row: { played_on: el('golf-date').value || todayISO(), holes, score, course: course ? course.slice(0, 120) : null } };
      },
      reset() { el('golf-score').value = ''; },
      saved: 'Round saved.',
    },
    steps: {
      table: 'progress_steps',
      dateKey: 'walked_on',
      cols: 'id, walked_on, created_at, steps',
      line(r) { return fmt(r.steps) + ' steps'; },
      summary(rows) {
        // Sum per day so multiple entries on one date add up.
        const perDay = {};
        rows.forEach((r) => { const d = String(r.walked_on); perDay[d] = (perDay[d] || 0) + Number(r.steps || 0); });
        const days = Object.keys(perDay).sort().reverse();
        const cutoff = isoDaysAgo(6);
        const week = days.filter((d) => d >= cutoff);
        const total7 = week.reduce((a, d) => a + perDay[d], 0);
        return [
          card('LATEST DAY', days.length ? fmt(perDay[days[0]]) + ' · ' + fmtDate(days[0]) : '—'),
          card('LAST 7 DAYS', fmt(total7)),
          card('7-DAY DAILY AVG', fmt(Math.round(total7 / 7))),
        ];
      },
      read() {
        const raw = el('steps-count').value;
        const steps = Number.parseInt(raw, 10);
        if (raw === '' || !(steps >= 0 && steps <= 200000)) return { error: 'Steps must be a whole number from 0 to 200,000.' };
        return { row: { walked_on: el('steps-date').value || todayISO(), steps } };
      },
      reset() { el('steps-count').value = ''; },
      saved: 'Steps saved.',
    },
  };

  async function load(key) {
    const t = TRACKERS[key];
    const client = global.ffSupabase;
    const u = user();
    if (!client || !u) return;
    const { data, error } = await client
      .from(t.table)
      .select(t.cols)
      .eq('user_id', u.id)
      .order(t.dateKey, { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.warn('[progress-trackers] load ' + key, error);
      t.unavailable = true;
      showUnavailable(key);
      return;
    }
    t.unavailable = false;
    const rows = data || [];
    const sum = el(key + '-summary');
    if (sum) sum.replaceChildren.apply(sum, rows.length ? t.summary(rows) : []);
    renderList(key, rows, t.dateKey, t.line);
  }

  async function submit(key, event) {
    event.preventDefault();
    const t = TRACKERS[key];
    const client = global.ffSupabase;
    const u = user();
    if (!client || !u) { setStatus(key, 'Sign in to save.', true); return; }
    const parsed = t.read();
    if (parsed.error) { setStatus(key, parsed.error, true); return; }
    const btn = el(key + '-save-btn');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    setStatus(key, '');
    const row = Object.assign({ user_id: u.id }, parsed.row);
    const { error } = await client.from(t.table).insert(row);
    if (btn) { btn.disabled = false; btn.textContent = label; }
    if (error) {
      console.warn('[progress-trackers] save ' + key, error);
      setStatus(key, isMissingTable(error) ? SETUP_MSG : (error.message || 'Could not save.'), true);
      return;
    }
    t.reset();
    setStatus(key, t.saved);
    if (typeof global.showToast === 'function') global.showToast(t.saved);
    await load(key);
  }

  async function init() {
    Object.keys(TRACKERS).forEach((key) => {
      const form = el(key + '-form');
      const date = el(key + '-date');
      if (date && !date.value) date.value = todayISO();
      if (form && !form.dataset.bound) {
        form.dataset.bound = '1';
        form.addEventListener('submit', (e) => submit(key, e));
      }
    });
    if (!user()) return;
    await Promise.all(Object.keys(TRACKERS).map((k) => load(k).catch((e) => { console.warn(e); showUnavailable(k); })));
  }

  global.FFProgressTrackers = { init };
})(window);
