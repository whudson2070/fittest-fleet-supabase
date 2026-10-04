/**
 * Comments CRUD + Realtime subscription + likes (encourage).
 * Depends on: window.ffSupabase, window.FFAuth, showToast (from page).
 */
(function (global) {
  'use strict';

  let comments = [];
  let currentFilter = 'all';
  let realtimeChannel = null;

  function avatarFor(name, userId, profileAvatarUrl) {
    if (profileAvatarUrl && global.FFProfile) {
      return global.FFProfile.resolveAvatarUrl(profileAvatarUrl);
    }
    if (profileAvatarUrl) return profileAvatarUrl;
    // Deterministic local preset (no external dependency)
    const presets = (global.FFProfile && global.FFProfile.PRESET_AVATARS) || [];
    if (presets.length) {
      const seed = (userId || name || 'guest').toString();
      let hash = 0;
      for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
      return presets[hash % presets.length].url;
    }
    return 'assets/avatars/dumbbell.svg';
  }

  function formatTimestamp(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  function mapRow(row, profilesById) {
    const profile = profilesById && row.user_id ? profilesById[row.user_id] : null;
    const avatarUrl = profile && profile.avatar_url;
    return {
      id: row.id,
      user_id: row.user_id,
      name: (profile && profile.display_name) || row.display_name,
      job_title: profileText(profile && profile.job_title),
      location: profileText(profile && profile.location),
      category: row.category,
      message: row.message,
      likes: row.likes ?? 0,
      created_at: row.created_at,
      timestamp: formatTimestamp(row.created_at),
      avatar: avatarFor(row.display_name, row.user_id, avatarUrl),
    };
  }

  function profileText(value) {
    const trimmed = String(value ?? '').trim();
    return trimmed;
  }

  function authorDetailsHtml(comment) {
    const bits = [];
    if (comment.job_title) bits.push(escapeHtml(comment.job_title));
    if (comment.location) bits.push(escapeHtml(comment.location));
    if (!bits.length) return '';
    return `<div class="text-xs text-[#414042]/55 mt-0.5">${bits.join(' · ')}</div>`;
  }

  function getCategoryColor(category) {
    if (category === 'Weight Loss') return 'bg-[#BE0F34]';
    if (category === 'Exercise') return 'bg-[#5594CF]';
    if (category === 'Nutritional Discipline') return 'bg-[#D9E364]';
    return 'bg-[#414042]';
  }

  function renderComments(filteredComments) {
    const container = document.getElementById('comments-list');
    if (!container) return;
    container.innerHTML = '';

    if (!filteredComments.length) {
      container.innerHTML = `
        <div class="text-center py-12 bg-white border border-[#E6E7E8] rounded-3xl">
          <i class="fa-solid fa-comments text-4xl text-[#E6E7E8] mb-4"></i>
          <p class="text-[#414042]/70">No posts yet in this category. Be the first to share some encouragement!</p>
        </div>
      `;
      return;
    }

    filteredComments.forEach((comment) => {
      const card = document.createElement('div');
      card.className = 'comment-card bg-white border border-[#E6E7E8] rounded-3xl p-6';
      card.dataset.commentId = comment.id;

      const categoryColor = getCategoryColor(comment.category);
      const categoryTextColor =
        comment.category === 'Nutritional Discipline' ? 'text-[#414042]' : 'text-white';

      const safeName = escapeHtml(comment.name);
      const safeMessage = escapeHtml(comment.message);
      const safeCategory = escapeHtml(comment.category);
      const safeTimestamp = escapeHtml(comment.timestamp);

      card.innerHTML = `
        <div class="flex items-start gap-x-4">
          <div class="flex-shrink-0">
            <img src="${comment.avatar}" alt="${safeName}" class="w-11 h-11 rounded-full ring-2 ring-[#E6E7E8]">
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-x-3 min-w-0">
                <div class="min-w-0">
                  <span class="font-bold">${safeName}</span>
                  ${authorDetailsHtml(comment)}
                </div>
                ${safeTimestamp ? `<span class="text-xs text-[#414042]/50 flex-shrink-0">${safeTimestamp}</span>` : ''}
              </div>
              <span class="category-badge ${categoryColor} ${categoryTextColor}">${safeCategory}</span>
            </div>
            <div class="text-[#414042]/90 leading-relaxed mb-4">${safeMessage}</div>
            <div class="flex items-center">
              <button type="button" data-encourage-id="${comment.id}"
                      class="encourage-btn flex items-center gap-x-2 px-4 py-1.5 text-sm font-semibold text-[#414042] hover:text-[#BE0F34] border border-[#E6E7E8] hover:border-[#BE0F34] rounded-full transition-all">
                <i class="fa-solid fa-heart text-[#BE0F34]"></i>
                <span class="like-count">${comment.likes}</span>
                <span class="hidden sm:inline text-xs ml-0.5">Encourage</span>
              </button>
            </div>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    container.querySelectorAll('[data-encourage-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        encourageComment(btn.getAttribute('data-encourage-id'), btn);
      });
    });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function applyFilterAndRender() {
    let filtered = comments;
    if (currentFilter !== 'all') {
      filtered = comments.filter((c) => c.category === currentFilter);
    }
    filtered = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    renderComments(filtered);
  }

  function filterComments(filter) {
    currentFilter = filter;

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.classList.remove('active', 'bg-[#BE0F34]', 'text-white', 'border-[#BE0F34]');
      btn.classList.add('border-[#E6E7E8]');

      if (filter === 'all' && btn.id === 'filter-all') {
        btn.classList.add('active', 'bg-[#BE0F34]', 'text-white', 'border-[#BE0F34]');
        btn.classList.remove('border-[#E6E7E8]');
      } else if (btn.id === `filter-${filter}`) {
        btn.classList.add('active', 'bg-[#BE0F34]', 'text-white', 'border-[#BE0F34]');
        btn.classList.remove('border-[#E6E7E8]');
      }
    });

    applyFilterAndRender();
  }

  async function upsertLocal(row) {
    let profilesById = {};
    if (row.user_id && global.FFProfile) {
      profilesById = await global.FFProfile.fetchProfiles([row.user_id]);
    }
    const mapped = mapRow(row, profilesById);
    const idx = comments.findIndex((c) => c.id === mapped.id);
    if (idx >= 0) comments[idx] = mapped;
    else comments.unshift(mapped);
  }

  function removeLocal(id) {
    comments = comments.filter((c) => c.id !== id);
  }

  async function fetchComments() {
    const client = global.ffSupabase;
    if (!client) {
      comments = [];
      applyFilterAndRender();
      return;
    }

    const { data, error } = await client
      .from('comments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[comments] fetch failed', error);
      if (typeof global.showToast === 'function') {
        global.showToast('Could not load comments. Check your Supabase setup.');
      }
      comments = [];
      applyFilterAndRender();
      return;
    }

    const rows = data || [];
    let profilesById = {};
    if (global.FFProfile) {
      profilesById = await global.FFProfile.fetchProfiles(rows.map((r) => r.user_id));
    }
    comments = rows.map((row) => mapRow(row, profilesById));
    applyFilterAndRender();
  }

  function subscribeRealtime() {
    const client = global.ffSupabase;
    if (!client) return;

    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    realtimeChannel = client
      .channel('comments-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments' },
        async (payload) => {
          await upsertLocal(payload.new);
          applyFilterAndRender();
          const user = global.FFAuth && global.FFAuth.getCurrentUser();
          if (user && payload.new && payload.new.user_id === user.id) {
            refreshEngagementTracker();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'comments' },
        async (payload) => {
          await upsertLocal(payload.new);
          applyFilterAndRender();
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments' },
        (payload) => {
          const removed = comments.find((c) => c.id === payload.old.id);
          removeLocal(payload.old.id);
          applyFilterAndRender();
          const user = global.FFAuth && global.FFAuth.getCurrentUser();
          if (user && removed && removed.user_id === user.id) {
            refreshEngagementTracker();
          }
        }
      )
      .subscribe();
  }

  async function postComment(e) {
    e.preventDefault();

    const user = global.FFAuth && global.FFAuth.getCurrentUser();
    if (!user) {
      if (typeof global.showToast === 'function') {
        global.showToast('Please sign in to post.');
      }
      if (global.FFAuth) global.FFAuth.openAuthModal('signin');
      return;
    }

    const client = global.ffSupabase;
    if (!client) {
      if (typeof global.showToast === 'function') {
        global.showToast('Supabase is not configured. Add your keys to js/config.js.');
      }
      return;
    }

    const nameInput =
      document.getElementById('comment-name').value.trim() ||
      (global.FFAuth.getDisplayName() || 'Community Member');
    const category = document.getElementById('comment-category').value;
    const message = document.getElementById('comment-message').value.trim();

    if (!message) {
      if (typeof global.showToast === 'function') {
        global.showToast('Please share a message before posting.');
      }
      return;
    }

    const { error } = await client.from('comments').insert({
      user_id: user.id,
      display_name: nameInput,
      category,
      message,
      likes: 0,
    });

    if (error) {
      console.error('[comments] insert failed', error);
      if (typeof global.showToast === 'function') {
        global.showToast(error.message || 'Could not post. Try again.');
      }
      return;
    }

    document.getElementById('comment-form').reset();
    const nameField = document.getElementById('comment-name');
    if (nameField) nameField.value = global.FFAuth.getDisplayName() || nameInput;

    if (typeof global.showToast === 'function') {
      global.showToast('Thank you for sharing! Your encouragement means everything to this community.');
    }

    refreshEngagementTracker();

    // Realtime INSERT will refresh the list; fetch as fallback
    setTimeout(() => {
      document.getElementById('comments-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
  }

  async function encourageComment(id, buttonElement) {
    const user = global.FFAuth && global.FFAuth.getCurrentUser();
    if (!user) {
      if (typeof global.showToast === 'function') {
        global.showToast('Sign in to encourage a post.');
      }
      if (global.FFAuth) global.FFAuth.openAuthModal('signin');
      return;
    }

    const client = global.ffSupabase;
    if (!client) return;

    const comment = comments.find((c) => c.id === id);
    if (!comment) return;

    const nextLikes = (comment.likes || 0) + 1;

    // Optimistic UI
    comment.likes = nextLikes;
    const countSpan = buttonElement && buttonElement.querySelector('.like-count');
    if (countSpan) countSpan.textContent = nextLikes;
    if (buttonElement) {
      buttonElement.classList.add('!text-[#BE0F34]', '!border-[#BE0F34]');
      setTimeout(() => {
        buttonElement.classList.remove('!text-[#BE0F34]', '!border-[#BE0F34]');
      }, 600);
    }

    const { error } = await client.from('comments').update({ likes: nextLikes }).eq('id', id);

    if (error) {
      console.error('[comments] like failed', error);
      comment.likes = Math.max(0, nextLikes - 1);
      if (countSpan) countSpan.textContent = comment.likes;
      if (typeof global.showToast === 'function') {
        global.showToast(error.message || 'Could not update likes.');
      }
      return;
    }

    // comments.likes is only a total. Record this user's click when it is
    // on someone else's post so the final CTA can count real encourage clicks.
    if (comment.user_id && comment.user_id !== user.id) {
      const { error: encourageError } = await client.from('encouragements').insert({
        user_id: user.id,
        comment_id: id,
      });
      if (encourageError) {
        console.error('[comments] encouragement record failed', encourageError);
      }
      refreshEngagementTracker();
    }

    if (nextLikes === 1 || nextLikes === 5 || nextLikes === 10) {
      if (typeof global.showToast === 'function') {
        global.showToast("You just made someone's day brighter!");
      }
    }
  }

  function scrollToCommunityWithFilter(category) {
    const communitySection = document.getElementById('community');
    if (communitySection) {
      communitySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setTimeout(() => {
      const select = document.getElementById('comment-category');
      if (select) select.value = category;
      filterComments(category);
      const messageBox = document.getElementById('comment-message');
      if (messageBox) messageBox.focus();
    }, 900);
  }

  function categoryForChallengePillar(pillar) {
    const pillarToCategory = {
      'Nutritional Discipline': 'Nutritional Discipline',
      'Sustainable Weight Loss': 'Weight Loss',
      'Purposeful Movement': 'Exercise',
    };
    return pillarToCategory[pillar] || 'General';
  }

  async function acceptDailyChallenge() {
    if (typeof global.showToast === 'function') {
      global.showToast("Challenge accepted! You've taken a powerful step today. 💪");
    }

    const user = global.FFAuth && global.FFAuth.getCurrentUser();
    if (!user) {
      setTimeout(() => {
        if (global.FFAuth) global.FFAuth.openAuthModal('signin');
      }, 800);
      return;
    }

    const client = global.ffSupabase;
    if (!client) return;

    setTimeout(async () => {
      const name = global.FFAuth.getDisplayName() || 'You';
      const challengeApi = global.FFDailyChallenge;
      const challenge =
        challengeApi && typeof challengeApi.challengeForDate === 'function'
          ? challengeApi.challengeForDate(new Date())
          : '';
      const pillar =
        challengeApi && typeof challengeApi.pillarForDate === 'function'
          ? challengeApi.pillarForDate(new Date())
          : '';
      const category = categoryForChallengePillar(pillar);
      const message = challenge
        ? `I accepted today’s challenge: ${challenge}. Who’s with me?`
        : "I accepted today’s challenge! Committing to show up for myself and encourage at least one person in this amazing community. Who’s with me?";
      const { error } = await client.from('comments').insert({
        user_id: user.id,
        display_name: `${name} (via Challenge)`,
        category,
        message,
        likes: 0,
      });
      if (error) {
        console.error('[comments] challenge post failed', error);
      } else {
        refreshEngagementTracker();
      }
    }, 1000);
  }


  let engagementRequest = 0;

  function setEngagementNote(message) {
    const note = document.getElementById('final-cta-encourage-note');
    if (!note) return;
    if (!message) {
      note.textContent = '';
      note.classList.add('hidden');
      return;
    }
    note.textContent = message;
    note.classList.remove('hidden');
  }

  async function refreshEngagementTracker() {
    const el = document.getElementById('final-cta-engagement');
    if (!el) return;

    const requestId = ++engagementRequest;
    const personal = document.getElementById('final-cta-personal-engagement');
    const user = global.FFAuth && global.FFAuth.getCurrentUser();
    const client = global.ffSupabase;
    if (!user || !client) {
      if (personal) personal.classList.add('hidden');
      setEngagementNote('');
      return;
    }

    const [commentRes, encourageRes] = await Promise.all([
      client.from('comments').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      client.from('encouragements').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    if (requestId !== engagementRequest) return;
    const still = global.FFAuth && global.FFAuth.getCurrentUser();
    if (!still || still.id !== user.id) {
      if (personal) personal.classList.add('hidden');
      return;
    }

    const commentEl = document.getElementById('final-cta-comment-count');
    const encourageEl = document.getElementById('final-cta-encourage-count');

    if (commentRes.error) {
      console.error('[comments] engagement comment count failed', commentRes.error);
      if (commentEl) commentEl.textContent = '—';
    } else if (commentEl) {
      commentEl.textContent = String(commentRes.count ?? 0);
    }

    if (encourageRes.error) {
      console.error('[comments] engagement encourage count failed', encourageRes.error);
      if (encourageEl) encourageEl.textContent = '—';
      setEngagementNote('Encourage clicks are not available until sql/encouragements.sql has been run in Supabase.');
    } else {
      if (encourageEl) encourageEl.textContent = String(encourageRes.count ?? 0);
      setEngagementNote('');
    }

    if (personal) personal.classList.remove('hidden');
  }

  async function initComments() {
    // Wire filter buttons (IDs may contain spaces)
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.id || '';
        if (id === 'filter-all') filterComments('all');
        else if (id.startsWith('filter-')) filterComments(id.slice('filter-'.length));
      });
    });

    const form = document.getElementById('comment-form');
    if (form) {
      form.addEventListener('submit', postComment);
      form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          postComment(e);
        }
      });
    }

    await fetchComments();
    subscribeRealtime();
    await refreshEngagementTracker();

    const allFilterBtn = document.getElementById('filter-all');
    if (allFilterBtn) {
      allFilterBtn.classList.add('active', 'bg-[#BE0F34]', 'text-white', 'border-[#BE0F34]');
    }
  }

  global.FFComments = {
    initComments,
    filterComments,
    postComment,
    encourageComment,
    scrollToCommunityWithFilter,
    acceptDailyChallenge,
    refreshEngagementTracker,
  };

  // Keep onclick helpers used in the HTML
  global.filterComments = filterComments;
  global.postComment = postComment;
  global.encourageComment = encourageComment;
  global.scrollToCommunityWithFilter = scrollToCommunityWithFilter;
  global.acceptDailyChallenge = acceptDailyChallenge;
})(window);
