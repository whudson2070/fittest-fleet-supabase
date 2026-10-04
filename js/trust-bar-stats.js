/**
 * Public aggregate stats for the homepage trust bar.
 * Calls SECURITY DEFINER functions that return aggregate values only; the
 * underlying progress_checkins rows remain protected by their own-row RLS.
 * See sql/trust-bar-stats.sql.
 */
(function (global) {
  'use strict';

  const POUNDS_STAT_ID = 'pounds-lost-stat';
  const WORKOUTS_STAT_ID = 'workouts-month-stat';

  function setStat(id, value, fractionDigits) {
    const element = document.getElementById(id);
    if (!element) return;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      element.textContent = '—';
      return;
    }
    element.textContent = number.toLocaleString('en-US', {
      maximumFractionDigits: fractionDigits,
    });
  }

  function setFallbacks() {
    setStat(POUNDS_STAT_ID, NaN, 2);
    setStat(WORKOUTS_STAT_ID, NaN, 0);
  }

  async function loadStats() {
    const client = global.ffSupabase;
    if (!client) {
      setFallbacks();
      return;
    }

    const [poundsResult, workoutsResult] = await Promise.all([
      client.rpc('get_total_pounds_lost'),
      client.rpc('get_workouts_completed_this_month'),
    ]);

    if (poundsResult.error) {
      console.warn('[Fittest Fleet] Pounds-lost stat unavailable.', poundsResult.error.message || poundsResult.error);
      setStat(POUNDS_STAT_ID, NaN, 2);
    } else {
      setStat(POUNDS_STAT_ID, poundsResult.data, 2);
    }

    if (workoutsResult.error) {
      console.warn('[Fittest Fleet] Monthly-workouts stat unavailable.', workoutsResult.error.message || workoutsResult.error);
      setStat(WORKOUTS_STAT_ID, NaN, 0);
    } else {
      setStat(WORKOUTS_STAT_ID, workoutsResult.data, 0);
    }
  }

  global.FFTrustBar = { loadStats };
})(window);
