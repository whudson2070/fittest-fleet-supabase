/**
 * Replaces the hero member count with the live number of registered accounts
 * and Progress check-ins that contain at least one logged workout activity.
 * Calls public.get_member_count() and public.get_workout_activity_count().
 */
(function (global) {
  'use strict';

  function parseCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function formatCount(n) {
    return n.toLocaleString('en-US');
  }

  function applyCounts(memberCount, activityCount) {
    const memberFormatted = memberCount === null ? '—' : formatCount(memberCount);
    const activityFormatted = activityCount === null ? '—' : formatCount(activityCount);
    const label = document.getElementById('hero-member-count');
    const join = document.getElementById('hero-member-join');
    const stat = document.getElementById('member-count-stat');
    if (label) {
      label.textContent = memberFormatted + ' members strong • ' + activityFormatted + ' workout activities logged';
    }
    if (join) {
      join.textContent = memberCount === null
        ? 'Join others on the journey'
        : 'Join ' + formatCount(memberCount) + ' others on the journey';
    }
    if (stat) stat.textContent = memberFormatted;
  }

  async function loadMemberCount() {
    const client = global.ffSupabase;
    if (!client) {
      applyCounts(null, null);
      return;
    }

    const [memberResult, activityResult] = await Promise.all([
      client.rpc('get_member_count'),
      client.rpc('get_workout_activity_count'),
    ]);

    let memberCount = null;
    if (memberResult.error) {
      console.warn('[Fittest Fleet] Member count unavailable.', memberResult.error.message || memberResult.error);
    } else {
      memberCount = parseCount(memberResult.data);
      if (memberCount === null) {
        console.warn('[Fittest Fleet] Member count unavailable: invalid response.');
      }
    }

    let activityCount = null;
    if (activityResult.error) {
      console.warn('[Fittest Fleet] Workout activity count unavailable.', activityResult.error.message || activityResult.error);
    } else {
      activityCount = parseCount(activityResult.data);
      if (activityCount === null) {
        console.warn('[Fittest Fleet] Workout activity count unavailable: invalid response.');
      }
    }

    applyCounts(memberCount, activityCount);
  }

  global.FFMembers = { loadMemberCount };
})(window);
