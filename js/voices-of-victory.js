/**
 * Renders real registered members in the Voices of Victory section.
 * Uses the anon-readable public.profiles and public.comments tables.
 */
(function (global) {
  'use strict';

  const MAX_VOICES = 3;
  const DEFAULT_AVATAR = 'assets/avatars/dumbbell.svg';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function profileText(value) {
    return String(value ?? '').trim();
  }

  function avatarUrl(profile) {
    const url = profileText(profile && profile.avatar_url);
    if (!url) return DEFAULT_AVATAR;

    // Keep user-provided image URLs usable without allowing an executable URL
    // into the image attribute.
    if (/^(https?:\/\/|data:image\/|\/|\.\/|\.\.\/|assets\/)/i.test(url)) return url;
    return DEFAULT_AVATAR;
  }

  function formatDetails(profile) {
    return [profileText(profile.job_title), profileText(profile.location)]
      .filter(Boolean)
      .map(escapeHtml)
      .join(' · ');
  }

  function latestComments(rows) {
    const latest = new Map();
    (rows || []).forEach((row) => {
      if (!row || !row.user_id || !profileText(row.message)) return;
      const previous = latest.get(row.user_id);
      if (!previous || new Date(row.created_at).getTime() > new Date(previous.created_at).getTime()) {
        latest.set(row.user_id, row);
      }
    });
    return latest;
  }

  function chooseProfiles(profiles, commentsByUser) {
    const usable = (profiles || []).filter((profile) => profile && profile.id && profileText(profile.display_name));
    const withComments = usable.filter((profile) => commentsByUser.has(profile.id));
    const withoutComments = usable.filter((profile) => !commentsByUser.has(profile.id));

    withComments.sort((a, b) => {
      const aTime = new Date(commentsByUser.get(a.id).created_at).getTime() || 0;
      const bTime = new Date(commentsByUser.get(b.id).created_at).getTime() || 0;
      return bTime - aTime;
    });
    withoutComments.sort((a, b) => {
      const aTime = new Date(a.updated_at).getTime() || 0;
      const bTime = new Date(b.updated_at).getTime() || 0;
      return bTime - aTime;
    });

    return withComments.concat(withoutComments).slice(0, MAX_VOICES);
  }

  function emptyState(message) {
    return `<div class="md:col-span-3 text-center py-10 text-[#414042]/70">${escapeHtml(message)}</div>`;
  }

  function render(profiles, commentsByUser) {
    const container = document.getElementById('voices-of-victory-list');
    if (!container) return;

    const selected = chooseProfiles(profiles, commentsByUser);
    if (!selected.length) {
      container.innerHTML = emptyState('No community voices are available yet.');
      return;
    }

    const accents = [
      ['#BE0F34', 'fa-tachometer-alt'],
      ['#5594CF', 'fa-running'],
      ['#D9E364', 'fa-heart'],
    ];

    container.innerHTML = selected
      .map((profile, index) => {
        const comment = commentsByUser.get(profile.id);
        const name = escapeHtml(profileText(profile.display_name));
        const details = formatDetails(profile);
        const story = comment ? escapeHtml(profileText(comment.message)) : '';
        const [accent, icon] = accents[index % accents.length];
        const detailsHtml = details
          ? `<div class="text-xs text-[#414042]/60">${details}</div>`
          : '';
        const storyHtml = story
          ? `<div class="motivation-quote pl-4 text-[#414042]/90">${story}</div>`
          : '<div class="text-sm text-[#414042]/65">This member has not shared a story yet.</div>';

        return `
          <article class="success-story bg-white rounded-3xl p-7 border border-[#E6E7E8]">
            <div class="flex items-center gap-x-4 mb-5">
              <img src="${escapeHtml(avatarUrl(profile))}" alt="${name}" class="w-12 h-12 rounded-full object-cover ring-2 ring-[#E6E7E8]" loading="lazy">
              <div class="min-w-0">
                <div class="font-bold truncate">${name}</div>
                ${detailsHtml}
              </div>
            </div>
            ${storyHtml}
            <div class="mt-5 flex items-center gap-x-2 text-xs font-semibold" style="color: ${accent}">
              <i class="fa-solid ${icon}" aria-hidden="true"></i>
              <span>${comment ? 'Shared with the community' : 'Fittest Fleet member'}</span>
            </div>
          </article>
        `;
      })
      .join('');
  }

  async function load() {
    const container = document.getElementById('voices-of-victory-list');
    const client = global.ffSupabase;
    if (!container || !client) {
      if (container) container.innerHTML = emptyState('Community voices are unavailable right now.');
      return;
    }

    const [profilesResult, commentsResult] = await Promise.all([
      client
        .from('profiles')
        .select('id, avatar_url, display_name, job_title, location, updated_at')
        .order('updated_at', { ascending: false }),
      client.from('comments').select('user_id, message, created_at').order('created_at', { ascending: false }),
    ]);

    if (profilesResult.error) {
      console.error('[voices] profile fetch failed', profilesResult.error);
      container.innerHTML = emptyState('Community voices are unavailable right now.');
      return;
    }

    if (commentsResult.error) {
      console.warn('[voices] comment fetch failed; showing profiles without stories', commentsResult.error);
    }

    render(profilesResult.data || [], latestComments(commentsResult.data || []));
  }

  global.FFVoicesOfVictory = { load };
})(window);
