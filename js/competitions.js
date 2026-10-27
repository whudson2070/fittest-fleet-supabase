// Fittest Fleet competitions page: Weight Loss + Exercise + Nutritional Discipline challenges (same season).
// Live data comes from sql/competitions.sql RPCs. ?preview=1 (or a missing RPC) shows clearly labeled example data.
(function () {
  // Go-live is automatic and date-based. ONE set of instants drives both the countdown
  // and activation, all at midnight America/New_York (EDT -04:00 until Nov 1 2am, then EST -05:00).
  //   before START_AT: test mode (example data, "Test Challenges / Not Active" banner)
  //   from START_AT:   live (real leaderboards). No Join button: members are entered automatically by the
  //                    server (sql/competitions.sql competition_participants) from their Progress page data.
  //   from END_AT:     season complete (final standings)
  // ENTRY_CUTOFF mirrors public.competition_entry_cutoff_enabled() in SQL: a member's first relevant entry must be
  // dated on/before SEASON.joinBy (Nov 1 ET). To drop the rule set both to false (and re-run the SQL).
  const SEASON_TZ = 'America/New_York';
  const START_AT = Date.parse('2026-10-26T00:00:00-04:00');       // Mon Oct 26, 12:00 AM ET
  const JOIN_CLOSES_AT = Date.parse('2026-11-02T00:00:00-05:00'); // end of Sun Nov 1 ET
  const END_AT = Date.parse('2026-12-28T00:00:00-05:00');         // end of Sun Dec 27 ET
  const ENTRY_CUTOFF = true;
  const isActive = () => Date.now() >= START_AT;
  const isOver = () => Date.now() >= END_AT;
  let COMPETITIONS_ACTIVE = isActive();
  const SEASON = {
    name: 'Season 1',
    start: '2026-10-26', end: '2026-12-27', joinBy: '2026-11-01',
    ids: { weight: '2026-s1-weight', exercise: '2026-s1-exercise', nutrition: '2026-s1-nutrition' }
  };
  const forcePreview = new URLSearchParams(location.search).get('preview') === '1';
  let preview = forcePreview || !COMPETITIONS_ACTIVE;
  let timer = null;

  const EXAMPLE = {
    weight: [
      { display_name: 'Maria T.', pct_lost: 6.8, weigh_ins: 9, eligible: true },
      { display_name: 'Derek W.', pct_lost: 5.9, weigh_ins: 7, eligible: true },
      { display_name: 'Priya S.', pct_lost: 4.6, weigh_ins: 12, eligible: true, me: true },
      { display_name: 'Luis R.', pct_lost: 3.2, weigh_ins: 6, eligible: true },
      { display_name: 'Angela M.', pct_lost: 2.4, weigh_ins: 6, eligible: true },
      { display_name: 'Tom B.', pct_lost: 0.0, weigh_ins: 8, eligible: true },
      { display_name: 'Kevin J.', pct_lost: 3.9, weigh_ins: 3, eligible: false }
    ],
    exercise: [
      { display_name: 'Derek W.', points: 486, active_days: 37 },
      { display_name: 'Priya S.', points: 452, active_days: 39, me: true },
      { display_name: 'Chris L.', points: 418, active_days: 33 },
      { display_name: 'Maria T.', points: 377, active_days: 35 },
      { display_name: 'Nina K.', points: 301, active_days: 26 },
      { display_name: 'Luis R.', points: 244, active_days: 22 },
      { display_name: 'Sam P.', points: 198, active_days: 18 }
    ],
    nutrition: [
      { display_name: 'Angela M.', points: 890, logged_days: 40 },
      { display_name: 'Priya S.', points: 819, logged_days: 38, me: true },
      { display_name: 'Tom B.', points: 738, logged_days: 36 },
      { display_name: 'Maria T.', points: 668, logged_days: 33 },
      { display_name: 'Nina K.', points: 503, logged_days: 27 },
      { display_name: 'Chris L.', points: 360, logged_days: 19 }
    ],
    entrants: { weight: 7, exercise: 7, nutrition: 6 }
  };

  const d = (s) => new Date(s + 'T12:00:00Z'); // calendar date only; formatted in SEASON_TZ
  const fmt = (s, opts) => d(s).toLocaleDateString('en-US', Object.assign({ timeZone: SEASON_TZ }, opts || { month: 'short', day: 'numeric', year: 'numeric' }));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);

  function renderDates() {
    $('comp-season-name').textContent = SEASON.name.toUpperCase();
    $('comp-dates').textContent = fmt(SEASON.start, { month: 'short', day: 'numeric' }) + ' – ' + fmt(SEASON.end);
    $('comp-join-by').textContent = ENTRY_CUTOFF ? 'Log on Progress, first entry by ' + fmt(SEASON.joinBy, { month: 'short', day: 'numeric' }) : 'Log on the Progress page';
    if (!ENTRY_CUTOFF) document.querySelectorAll('[data-join-by]').forEach((el) => { const li = el.closest('li'); if (li) li.innerHTML = li.innerHTML.replace(/ Your first (weigh-in|entry) must be by the end of week 1 \(<span data-join-by=""><\/span>\)\./, ''); });
    document.querySelectorAll('[data-join-by]').forEach((el) => { el.textContent = fmt(SEASON.joinBy, { weekday: 'long', month: 'short', day: 'numeric' }); });
  }

  function tick() {
    const now = Date.now();
    // Countdown hit zero while the page is open: switch live in place (no reload).
    if (!COMPETITIONS_ACTIVE && isActive()) goLive();
    let target = START_AT, label = 'STARTS IN';
    if (now >= START_AT && now < END_AT) { target = END_AT; label = SEASON.name.toUpperCase() + ' IS LIVE · ENDS ' + fmt(SEASON.end, { month: 'short', day: 'numeric' }).toUpperCase(); }
    else if (now >= END_AT) { label = SEASON.name.toUpperCase() + ' COMPLETE · ENDED ' + fmt(SEASON.end, { month: 'short', day: 'numeric' }).toUpperCase(); target = now; }
    $('comp-countdown-label').textContent = label;
    const cd = $('comp-countdown'); if (cd) cd.classList.toggle('hidden', now >= END_AT);
    let ms = Math.max(0, target - now);
    const parts = { d: Math.floor(ms / 86400000), h: Math.floor(ms / 3600000) % 24, m: Math.floor(ms / 60000) % 60, s: Math.floor(ms / 1000) % 60 };
    Object.keys(parts).forEach((k) => { const el = document.querySelector('[data-cd="' + k + '"]'); if (el) el.textContent = parts[k]; });
  }

  function medal(rank) {
    const c = { 1: 'bg-[#D9E364] text-[#414042]', 2: 'bg-[#E6E7E8] text-[#414042]', 3: 'bg-[#414042] text-white' }[rank];
    return c ? '<span class="inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold ' + c + '">' + rank + '</span>'
             : '<span class="inline-flex w-7 h-7 items-center justify-center text-xs font-semibold text-[#414042]/60">' + rank + '</span>';
  }

  function rankRows(rows, key) {
    // rows arrive ordered; assign competition ranks (ties share a rank) when not provided
    let last = null, r = 0;
    return rows.map((row, i) => {
      if (row.rank) return row;
      const v = key(row);
      if (v !== last) { r = i + 1; last = v; }
      return Object.assign({ rank: r }, row);
    });
  }

  function renderWeight(rows) {
    const body = $('wl-board');
    $('wl-empty').classList.toggle('hidden', rows.length > 0);
    body.innerHTML = rows.map((r) => {
      const me = r.me || (r.user_id && r.user_id === FFAuth.getCurrentUser()?.id);
      return '<tr class="border-b border-[#E6E7E8] last:border-0 ' + (me ? 'bg-[#BE0F34]/5' : '') + (r.eligible === false ? ' opacity-60' : '') + '">' +
        '<td class="py-2.5">' + medal(r.rank) + '</td>' +
        '<td class="py-2.5 font-semibold">' + esc(r.display_name) + (me ? ' <span class="text-[10px] text-[#BE0F34] font-bold">YOU</span>' : '') +
        (r.eligible === false ? '<div class="text-[10px] font-normal text-[#414042]/60">Missed a weekly weigh-in</div>' : '') + '</td>' +
        '<td class="py-2.5 text-right font-bold text-[#BE0F34] tabular-nums">' + Number(r.pct_lost).toFixed(1) + '%</td>' +
        '<td class="py-2.5 text-right tabular-nums">' + r.weigh_ins + '</td></tr>';
    }).join('');
  }

  function renderExercise(rows) {
    const body = $('ex-board');
    $('ex-empty').classList.toggle('hidden', rows.length > 0);
    body.innerHTML = rows.map((r) => {
      const me = r.me || (r.user_id && r.user_id === FFAuth.getCurrentUser()?.id);
      return '<tr class="border-b border-[#E6E7E8] last:border-0 ' + (me ? 'bg-[#5594CF]/10' : '') + '">' +
        '<td class="py-2.5">' + medal(r.rank) + '</td>' +
        '<td class="py-2.5 font-semibold">' + esc(r.display_name) + (me ? ' <span class="text-[10px] text-[#5594CF] font-bold">YOU</span>' : '') + '</td>' +
        '<td class="py-2.5 text-right font-bold text-[#5594CF] tabular-nums">' + Number(r.points).toLocaleString() + '</td>' +
        '<td class="py-2.5 text-right tabular-nums">' + r.active_days + '</td></tr>';
    }).join('');
  }

  function renderNutrition(rows) {
    const body = $('nu-board');
    $('nu-empty').classList.toggle('hidden', rows.length > 0);
    body.innerHTML = rows.map((r) => {
      const me = r.me || (r.user_id && r.user_id === FFAuth.getCurrentUser()?.id);
      return '<tr class="border-b border-[#E6E7E8] last:border-0 ' + (me ? 'bg-[#D9E364]/30' : '') + '">' +
        '<td class="py-2.5">' + medal(r.rank) + '</td>' +
        '<td class="py-2.5 font-semibold">' + esc(r.display_name) + (me ? ' <span class="text-[10px] text-[#414042] font-bold">YOU</span>' : '') + '</td>' +
        '<td class="py-2.5 text-right font-bold text-[#414042] tabular-nums">' + Number(r.points).toLocaleString() + '</td>' +
        '<td class="py-2.5 text-right tabular-nums">' + r.logged_days + '</td></tr>';
    }).join('');
  }

  function renderStanding(w, e, n) {
    const el = $('comp-standing-body');
    const user = window.FFAuth && FFAuth.getCurrentUser();
    if (!user && !preview) {
      el.innerHTML = '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><p>Sign in to see where you rank. You are entered automatically when you log on the Progress page.</p>' +
        '<button type="button" id="comp-standing-signin" class="self-start px-6 py-2.5 bg-[#BE0F34] hover:bg-[#D7153A] text-white text-sm font-semibold rounded-full">Sign in</button></div>';
      $('comp-standing-signin').onclick = () => FFAuth.openAuthModal('signin');
      return;
    }
    const isMe = (r) => r.me || (user && r.user_id === user.id);
    const mw = w.find(isMe), me = e.find(isMe), mn = n.find(isMe);
    const closed = ENTRY_CUTOFF && Date.now() >= JOIN_CLOSES_AT;
    const notIn = (what) => closed ? 'Not entered. Entry closed ' + fmt(SEASON.joinBy, { month: 'short', day: 'numeric' }) + '.'
      : 'Not entered yet. Log ' + what + ' on the Progress page to enter' + (ENTRY_CUTOFF ? ' (first entry by ' + fmt(SEASON.joinBy, { month: 'short', day: 'numeric' }) + ')' : '') + '.';
    const card = (color, title, main, sub, joinedFlag, labelColor, what) =>
      '<div class="rounded-2xl border border-[#E6E7E8] border-l-4 px-5 py-4" style="border-left-color:' + color + '">' +
      '<div class="text-[10px] font-bold tracking-wider" style="color:' + (labelColor || color) + '">' + title + '</div>' +
      (joinedFlag ? '<div class="text-2xl font-bold mt-1 text-[#414042]">' + main + '</div><div class="text-xs text-[#414042]/70 mt-1">' + sub + '</div>'
                  : '<div class="text-sm mt-1">' + notIn(what) + '</div>') + '</div>';
    el.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
      card('#BE0F34', 'WEIGHT LOSS CHALLENGE', mw ? '#' + mw.rank + ' of ' + w.length + ' • ' + Number(mw.pct_lost).toFixed(1) + '% lost' : '',
        mw ? mw.weigh_ins + ' weigh-ins logged' + (mw.eligible === false ? ' • log a weigh-in this week to become eligible' : ' • eligible') : '', !!mw, null, 'a weigh-in') +
      card('#5594CF', 'EXERCISE CHALLENGE', me ? '#' + me.rank + ' of ' + e.length + ' • ' + Number(me.points).toLocaleString() + ' pts' : '',
        me ? me.active_days + ' active days' : '', !!me, null, 'any activity') +
      card('#D9E364', 'NUTRITIONAL DISCIPLINE', mn ? '#' + mn.rank + ' of ' + n.length + ' • ' + Number(mn.points).toLocaleString() + ' pts' : '',
        mn ? mn.logged_days + ' logged days' : '', !!mn, '#414042', 'nutrition') +
      '</div><a href="../progress/" class="inline-block mt-4 text-sm text-[#BE0F34] underline underline-offset-2">Log today on the Progress page →</a>';
  }

  async function loadLive() {
    const sb = window.ffSupabase;
    if (!sb) throw new Error('no client');
    const [w, e, n, c] = await Promise.all([
      sb.rpc('get_weight_loss_leaderboard', { p_competition_id: SEASON.ids.weight }),
      sb.rpc('get_exercise_leaderboard', { p_competition_id: SEASON.ids.exercise }),
      sb.rpc('get_nutrition_leaderboard', { p_competition_id: SEASON.ids.nutrition }),
      sb.rpc('get_competition_entry_counts')
    ]);
    if (w.error || e.error || n.error) throw (w.error || e.error || n.error);
    const counts = {};
    (c.data || []).forEach((r) => { counts[r.competition_id] = r.entrants; });
    return { weight: w.data || [], exercise: e.data || [], nutrition: n.data || [],
      entrants: { weight: counts[SEASON.ids.weight] || 0, exercise: counts[SEASON.ids.exercise] || 0, nutrition: counts[SEASON.ids.nutrition] || 0 } };
  }

  async function load() {
    let data;
    if (!preview) {
      try { data = await loadLive(); } catch (err) { console.warn('Competitions not live yet, showing example data.', err); preview = true; }
    }
    if (preview) {
      data = {
        weight: rankRows(EXAMPLE.weight.slice().sort((a, b) => (b.eligible - a.eligible) || (b.pct_lost - a.pct_lost)), (r) => r.eligible + ':' + r.pct_lost),
        exercise: rankRows(EXAMPLE.exercise, (r) => r.points),
        nutrition: rankRows(EXAMPLE.nutrition, (r) => r.points),
        entrants: EXAMPLE.entrants
      };
    }
    $('comp-preview-banner').classList.toggle('hidden', !preview);
    $('comp-preview-banner').classList.toggle('inline-flex', preview);
    const tb = $('comp-test-banner'); if (tb) tb.classList.toggle('hidden', COMPETITIONS_ACTIVE);
    $('wl-entrants').textContent = data.entrants.weight;
    $('ex-entrants').textContent = data.entrants.exercise;
    renderWeight(data.weight);
    $('nu-entrants').textContent = data.entrants.nutrition;
    renderExercise(data.exercise);
    renderNutrition(data.nutrition);
    renderStanding(data.weight, data.exercise, data.nutrition);
  }

  let goingLive = false;
  async function goLive() {
    if (goingLive) return;
    goingLive = true;
    COMPETITIONS_ACTIVE = true;
    preview = forcePreview;
    try { await load(); } finally { goingLive = false; }
  }

  async function init() {
    COMPETITIONS_ACTIVE = isActive();
    preview = forcePreview || !COMPETITIONS_ACTIVE;
    renderDates();
    tick();
    if (!timer) timer = setInterval(tick, 1000);
    await load();
  }

  // Current leader(s) per competition, from the same public leaderboard RPCs and rank logic as the
  // competitions page (server order + rankRows). Rank-1 rows only; weight loss leaders must be eligible.
  // Returns empty lists before go-live (never example data).
  async function getLeaders() {
    if (!isActive()) return { weight: [], exercise: [], nutrition: [] };
    const data = await loadLive();
    const top = (rows, key) => rankRows(rows, key).filter((r) => Number(r.rank) === 1 && r.eligible !== false);
    return {
      weight: top(data.weight, (r) => r.eligible + ':' + r.pct_lost),
      exercise: top(data.exercise, (r) => r.points),
      nutrition: top(data.nutrition, (r) => r.points)
    };
  }

  const SCORE = {
    weight: (r) => Number(r.pct_lost).toFixed(1) + '% lost',
    exercise: (r) => Number(r.points).toLocaleString() + ' pts',
    nutrition: (r) => Number(r.points).toLocaleString() + ' pts'
  };

  // Homepage pillar cards: fills every [data-leader="weight|exercise|nutrition"] element.
  async function renderHomeLeaders() {
    const els = document.querySelectorAll('[data-leader]');
    if (!els.length) return;
    let leaders = null;
    try { leaders = await getLeaders(); } catch (err) { console.warn('[competitions] leaders unavailable', err); }
    els.forEach((el) => {
      const rows = leaders ? (leaders[el.getAttribute('data-leader')] || []) : [];
      const score = SCORE[el.getAttribute('data-leader')];
      if (!rows.length) {
        el.innerHTML = '<span><i class="fa-solid fa-trophy mr-2 opacity-60"></i>No leader yet — log progress to take the lead</span>';
        return;
      }
      const names = rows.slice(0, 2).map((r) => esc(r.display_name)).join(' &amp; ') + (rows.length > 2 ? ' +' + (rows.length - 2) + ' more' : '');
      el.innerHTML = '<span><i class="fa-solid fa-trophy mr-2"></i>' + (rows.length > 1 ? 'Tied for the lead: ' : 'Current leader: ') +
        '<span class="font-bold">' + names + '</span> – <span class="font-bold tabular-nums">' + score(rows[0]) + '</span></span>';
    });
  }

  window.FFCompetitions = { init, getLeaders, renderHomeLeaders };
})();
