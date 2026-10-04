/**
 * Public aggregate stats for the homepage trust bar.
 * Calls SECURITY DEFINER functions that return aggregate values only; the
 * underlying progress_checkins rows remain protected by their own-row RLS.
 * See sql/trust-bar-stats.sql.
 */
(function (global) {
  'use strict';

  const POUNDS_STAT_ID = 'pounds-lost-stat';
  const PUSHUPS_STAT_ID = 'pushups-stat';
  const MILES_STAT_ID = 'miles-stat';
  const YOGA_HOURS_STAT_ID = 'yoga-hours-stat';
  const SQUATS_STAT_ID = 'squats-stat';

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
    setStat(PUSHUPS_STAT_ID, NaN, 0);
    setStat(MILES_STAT_ID, NaN, 2);
    setStat(YOGA_HOURS_STAT_ID, NaN, 1);
    setStat(SQUATS_STAT_ID, NaN, 0);
  }

  async function loadStats() {
    const client = global.ffSupabase;
    if (!client) {
      setFallbacks();
      return;
    }

    const [poundsResult, pushupsResult, milesResult, yogaHoursResult, squatsResult] = await Promise.all([
      client.rpc('get_total_pounds_lost'),
      client.rpc('get_total_pushups'),
      client.rpc('get_total_miles'),
      client.rpc('get_total_yoga_hours'),
      client.rpc('get_total_squats'),
    ]);

    if (poundsResult.error) {
      console.warn('[Fittest Fleet] Pounds-lost stat unavailable.', poundsResult.error.message || poundsResult.error);
      setStat(POUNDS_STAT_ID, NaN, 2);
    } else {
      setStat(POUNDS_STAT_ID, poundsResult.data, 2);
    }

    const activityStats = [
      [pushupsResult, PUSHUPS_STAT_ID, 0, 'Push-ups'],
      [milesResult, MILES_STAT_ID, 2, 'Miles'],
      [yogaHoursResult, YOGA_HOURS_STAT_ID, 1, 'Yoga-hours'],
      [squatsResult, SQUATS_STAT_ID, 0, 'Squats'],
    ];
    activityStats.forEach(([result, id, fractionDigits, label]) => {
      if (result.error) {
        console.warn(`[Fittest Fleet] ${label} stat unavailable.`, result.error.message || result.error);
        setStat(id, NaN, fractionDigits);
      } else {
        setStat(id, result.data, fractionDigits);
      }
    });
  }

  global.FFTrustBar = { loadStats };
})(window);
