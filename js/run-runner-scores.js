/**
 * Run Runner leaderboard helpers.
 * Depends on: window.ffSupabase, window.FFAuth, and optionally window.FFProfile.
 */
(function (global) {
  'use strict';

  const TABLE = 'run_runner_scores';

  function fallbackDisplayName(user) {
    const meta = (user && user.user_metadata) || {};
    if (meta.display_name) return String(meta.display_name).trim();
    if (meta.full_name) return String(meta.full_name).trim();
    if (user && user.email) return user.email.split('@')[0];
    return 'Community Member';
  }

  async function displayNameForUser(user) {
    if (global.FFProfile && typeof global.FFProfile.fetchProfile === 'function') {
      const profile = await global.FFProfile.fetchProfile(user.id);
      if (profile && profile.display_name && String(profile.display_name).trim()) {
        return String(profile.display_name).trim();
      }
    }
    if (global.FFAuth && typeof global.FFAuth.getDisplayName === 'function') {
      const name = String(global.FFAuth.getDisplayName() || '').trim();
      if (name) return name;
    }
    return fallbackDisplayName(user);
  }

  async function saveBestScore(score) {
    const client = global.ffSupabase;
    const user = global.FFAuth && global.FFAuth.getCurrentUser
      ? global.FFAuth.getCurrentUser()
      : null;
    const numericScore = Math.floor(Number(score));

    // Scores from logged-out play are intentionally never sent to Supabase.
    if (!client || !user || !Number.isFinite(numericScore) || numericScore <= 0) {
      return { saved: false };
    }

    const { data: existing, error: readError } = await client
      .from(TABLE)
      .select('score')
      .eq('user_id', user.id)
      .maybeSingle();
    if (readError) {
      console.warn('[run-runner] could not read existing high score', readError);
      return { saved: false, error: readError };
    }

    if (existing && Number(existing.score) >= numericScore) {
      return { saved: false, score: Number(existing.score) };
    }

    const displayName = await displayNameForUser(user);
    const { error } = await client.from(TABLE).upsert(
      { user_id: user.id, display_name: displayName, score: numericScore },
      { onConflict: 'user_id' }
    );
    if (error) {
      console.warn('[run-runner] could not save high score', error);
      return { saved: false, error: error };
    }
    return { saved: true, score: numericScore };
  }

  function emptyLeaderboard(message) {
    const list = document.getElementById('final-cta-runner-scores');
    const empty = document.getElementById('final-cta-runner-empty');
    if (list) list.replaceChildren();
    if (empty) {
      empty.textContent = message || 'No scores yet.';
      empty.classList.remove('hidden');
    }
  }

  function renderTotalPoints(total) {
    const totalElement = document.getElementById('final-cta-runner-total');
    if (!totalElement) return;
    const numericTotal = Number(total);
    totalElement.textContent = Number.isFinite(numericTotal) && numericTotal >= 0
      ? Math.floor(numericTotal).toLocaleString()
      : '—';
  }

  function renderLeaderboard(rows) {
    const list = document.getElementById('final-cta-runner-scores');
    const empty = document.getElementById('final-cta-runner-empty');
    if (!list || !empty) return;

    list.replaceChildren();
    const validRows = (rows || []).filter((row) => {
      const score = Number(row && row.score);
      return Number.isFinite(score) && score >= 0;
    }).slice(0, 3);

    if (!validRows.length) {
      emptyLeaderboard('No scores yet.');
      return;
    }

    empty.classList.add('hidden');
    validRows.forEach((row, index) => {
      const item = document.createElement('li');
      item.className = 'flex items-center justify-between gap-4 text-sm';
      const name = document.createElement('span');
      name.className = 'font-semibold text-[#414042] truncate';
      name.textContent = `${index + 1}. ${row.display_name || 'Community Member'}`;
      const score = document.createElement('span');
      score.className = 'font-black text-[#BE0F34] whitespace-nowrap';
      score.textContent = Number(row.score).toLocaleString();
      item.append(name, score);
      list.appendChild(item);
    });
  }

  async function loadLeaderboard() {
    renderTotalPoints(null);
    const client = global.ffSupabase;
    if (!client) {
      emptyLeaderboard('Leaderboard unavailable right now.');
      return;
    }

    const [leaderboardResult, totalsResult] = await Promise.all([
      client
        .from(TABLE)
        .select('user_id, display_name, score')
        .order('score', { ascending: false })
        .limit(3),
      client
        .from(TABLE)
        .select('score')
    ]);

    if (leaderboardResult.error) {
      console.warn('[run-runner] leaderboard query failed', leaderboardResult.error);
      emptyLeaderboard('Leaderboard unavailable right now.');
    } else {
      renderLeaderboard(leaderboardResult.data);
    }

    if (totalsResult.error) {
      console.warn('[run-runner] total points query failed', totalsResult.error);
      return;
    }

    const scores = (totalsResult.data || [])
      .map((row) => Number(row && row.score))
      .filter((score) => Number.isFinite(score) && score >= 0);
    if (!scores.length) return;
    renderTotalPoints(scores.reduce((total, score) => total + Math.floor(score), 0));
  }

  global.FFRunRunnerScores = { saveBestScore, loadLeaderboard };
})(window);
