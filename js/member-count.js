/**
 * Replaces the hero member count with the live number of registered accounts.
 * Calls public.get_member_count() (see sql/get-member-count.sql). Anon key only.
 */
(function (global) {
  'use strict';

  function formatCount(n) {
    return Number(n).toLocaleString('en-US');
  }

  function applyCount(n) {
    const formatted = formatCount(n);
    const label = document.getElementById('hero-member-count');
    const join = document.getElementById('hero-member-join');
    const stat = document.getElementById('member-count-stat');
    if (label) {
      label.textContent = formatted + ' members strong • 47,300+ pounds lost together';
    }
    if (join) {
      join.textContent = 'Join ' + formatted + ' others on the journey';
    }
    if (stat) stat.textContent = formatted;
  }

  function applyFallback() {
    const label = document.getElementById('hero-member-count');
    const join = document.getElementById('hero-member-join');
    const stat = document.getElementById('member-count-stat');
    if (label) label.textContent = 'Members strong • 47,300+ pounds lost together';
    if (join) join.textContent = 'Join others on the journey';
    if (stat) stat.textContent = '—';
  }

  async function loadMemberCount() {
    const client = global.ffSupabase;
    if (!client) {
      applyFallback();
      return;
    }

    try {
      const { data, error } = await client.rpc('get_member_count');
      if (error) throw error;
      const n = typeof data === 'number' ? data : Number(data);
      if (!Number.isFinite(n) || n < 0) throw new Error('Invalid member count');
      applyCount(n);
    } catch (err) {
      console.warn('[Fittest Fleet] Member count unavailable.', err && err.message ? err.message : err);
      applyFallback();
    }
  }

  global.FFMembers = { loadMemberCount };
})(window);
