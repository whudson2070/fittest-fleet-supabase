/**
 * Profile + avatar helpers.
 * Depends on: window.ffSupabase, window.FFAuth, showToast (optional).
 */
(function (global) {
  'use strict';

  const PRESET_AVATARS = [
    { id: 'runner', url: 'assets/avatars/runner.svg', label: 'Runner' },
    { id: 'lifter', url: 'assets/avatars/lifter.svg', label: 'Lifter' },
    { id: 'cyclist', url: 'assets/avatars/cyclist.svg', label: 'Cyclist' },
    { id: 'yoga', url: 'assets/avatars/yoga.svg', label: 'Yoga' },
    { id: 'swimmer', url: 'assets/avatars/swimmer.svg', label: 'Swimmer' },
    { id: 'hiker', url: 'assets/avatars/hiker.svg', label: 'Hiker' },
    { id: 'coach', url: 'assets/avatars/coach.svg', label: 'Coach' },
    { id: 'spark', url: 'assets/avatars/spark.svg', label: 'Spark' },
  ];

  const DEFAULT_AVATAR = PRESET_AVATARS[0].url;
  const profileCache = new Map(); // userId -> { avatar_url, display_name }

  function toast(msg) {
    if (typeof global.showToast === 'function') global.showToast(msg);
  }

  function resolveAvatarUrl(url) {
    if (!url) return DEFAULT_AVATAR;
    // Absolute or data URLs stay as-is; relative paths work from site root
    return url;
  }

  function getPresetAvatars() {
    return PRESET_AVATARS.slice();
  }

  function isPresetUrl(url) {
    if (!url) return false;
    return PRESET_AVATARS.some((p) => url === p.url || url.endsWith('/' + p.url) || url.includes('/assets/avatars/' + p.id));
  }

  async function fetchProfile(userId) {
    if (!userId) return null;
    if (profileCache.has(userId)) return profileCache.get(userId);

    const client = global.ffSupabase;
    if (!client) return null;

    const { data, error } = await client
      .from('profiles')
      .select('id, avatar_url, display_name, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[profile] fetch failed', error);
      return null;
    }
    if (data) profileCache.set(userId, data);
    return data;
  }

  async function fetchProfiles(userIds) {
    const client = global.ffSupabase;
    const unique = [...new Set((userIds || []).filter(Boolean))];
    const missing = unique.filter((id) => !profileCache.has(id));
    if (!client || !missing.length) {
      const map = {};
      unique.forEach((id) => {
        if (profileCache.has(id)) map[id] = profileCache.get(id);
      });
      return map;
    }

    const { data, error } = await client
      .from('profiles')
      .select('id, avatar_url, display_name, updated_at')
      .in('id', missing);

    if (error) {
      console.warn('[profile] batch fetch failed', error);
    } else {
      (data || []).forEach((row) => profileCache.set(row.id, row));
    }

    const map = {};
    unique.forEach((id) => {
      if (profileCache.has(id)) map[id] = profileCache.get(id);
    });
    return map;
  }

  function invalidateCache(userId) {
    if (userId) profileCache.delete(userId);
    else profileCache.clear();
  }

  async function ensureOwnProfile(user) {
    if (!user) return null;
    const existing = await fetchProfile(user.id);
    if (existing) return existing;

    const client = global.ffSupabase;
    if (!client) return null;

    const meta = user.user_metadata || {};
    const displayName =
      meta.display_name || meta.full_name || (user.email ? user.email.split('@')[0] : 'Community Member');

    const row = {
      id: user.id,
      display_name: displayName,
      avatar_url: DEFAULT_AVATAR,
    };

    const { data, error } = await client.from('profiles').upsert(row, { onConflict: 'id' }).select().maybeSingle();
    if (error) {
      console.warn('[profile] ensure failed', error);
      return row;
    }
    if (data) profileCache.set(user.id, data);
    return data || row;
  }

  async function saveProfile({ displayName, avatarUrl }) {
    const user = global.FFAuth && global.FFAuth.getCurrentUser();
    if (!user) throw new Error('Sign in to update your profile.');

    const client = global.ffSupabase;
    if (!client) throw new Error('Supabase is not configured.');

    const payload = {
      id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (typeof displayName === 'string') payload.display_name = displayName.trim() || null;
    if (typeof avatarUrl === 'string') payload.avatar_url = avatarUrl;

    const { data, error } = await client
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (error) throw error;

    // Keep auth metadata display_name in sync when provided
    if (typeof displayName === 'string' && displayName.trim()) {
      try {
        await client.auth.updateUser({ data: { display_name: displayName.trim() } });
      } catch (e) {
        console.warn('[profile] metadata sync failed', e);
      }
    }

    invalidateCache(user.id);
    if (data) profileCache.set(user.id, data);
    return data;
  }

  async function uploadAvatarFile(file) {
    const user = global.FFAuth && global.FFAuth.getCurrentUser();
    if (!user) throw new Error('Sign in to upload an avatar.');

    const client = global.ffSupabase;
    if (!client) throw new Error('Supabase is not configured.');

    if (!file || !file.type || !file.type.startsWith('image/')) {
      throw new Error('Please choose an image file (JPEG, PNG, WebP, or GIF).');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new Error('Image must be 2 MB or smaller.');
    }

    const extMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const ext = extMap[file.type] || 'jpg';
    const path = `${user.id}/avatar.${ext}`;

    const { error: upErr } = await client.storage.from('avatars').upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    });
    if (upErr) throw upErr;

    const { data: pub } = client.storage.from('avatars').getPublicUrl(path);
    let publicUrl = pub && pub.publicUrl ? pub.publicUrl : null;
    if (!publicUrl) throw new Error('Could not get public avatar URL.');

    // Bust CDN/browser cache after replace
    publicUrl = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;

    const saved = await saveProfile({ avatarUrl: publicUrl });
    return saved;
  }

  async function getAvatarForUser(userId, fallbackName) {
    const profile = await fetchProfile(userId);
    if (profile && profile.avatar_url) return resolveAvatarUrl(profile.avatar_url);

    // Deterministic preset fallback (no external dependency)
    const seed = (userId || fallbackName || 'guest').toString();
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    const preset = PRESET_AVATARS[hash % PRESET_AVATARS.length];
    return preset.url;
  }

  function syncHeaderAvatar(avatarUrl) {
    const img = document.getElementById('auth-user-avatar');
    if (img) {
      img.src = resolveAvatarUrl(avatarUrl) || DEFAULT_AVATAR;
      img.classList.remove('hidden');
    }
    const icon = document.getElementById('auth-user-icon');
    if (icon) icon.classList.add('hidden');
  }

  async function refreshAuthAvatar() {
    const user = global.FFAuth && global.FFAuth.getCurrentUser();
    if (!user) {
      const img = document.getElementById('auth-user-avatar');
      if (img) {
        img.classList.add('hidden');
        img.removeAttribute('src');
      }
      const icon = document.getElementById('auth-user-icon');
      if (icon) icon.classList.remove('hidden');
      return;
    }
    try {
      const profile = await ensureOwnProfile(user);
      syncHeaderAvatar(profile && profile.avatar_url);
      if (profile && profile.display_name) {
        const label = document.getElementById('auth-user-label');
        if (label) label.textContent = profile.display_name;
      }
    } catch (e) {
      console.warn('[profile] header avatar', e);
    }
  }

  // ---- Profile page UI ----
  let selectedAvatarUrl = null;

  function renderPresetGrid(currentUrl) {
    const grid = document.getElementById('preset-avatars');
    if (!grid) return;
    grid.innerHTML = '';
    PRESET_AVATARS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'preset-avatar-btn relative rounded-full overflow-hidden ring-2 ring-offset-2 transition-all focus:outline-none';
      const active = currentUrl === preset.url || (currentUrl && currentUrl.includes(preset.id + '.svg'));
      btn.classList.add(active ? 'ring-[#BE0F34]' : 'ring-transparent', 'hover:ring-[#5594CF]');
      btn.setAttribute('aria-label', preset.label);
      btn.dataset.url = preset.url;
      btn.innerHTML = `<img src="${preset.url}" alt="${preset.label}" class="w-16 h-16 object-cover">`;
      btn.addEventListener('click', () => {
        selectedAvatarUrl = preset.url;
        updatePreview(preset.url);
        grid.querySelectorAll('.preset-avatar-btn').forEach((b) => {
          b.classList.remove('ring-[#BE0F34]');
          b.classList.add('ring-transparent');
        });
        btn.classList.add('ring-[#BE0F34]');
        btn.classList.remove('ring-transparent');
      });
      grid.appendChild(btn);
    });
  }

  function updatePreview(url) {
    const preview = document.getElementById('profile-avatar-preview');
    if (preview) preview.src = resolveAvatarUrl(url) || DEFAULT_AVATAR;
  }

  async function initProfilePage() {
    const gate = document.getElementById('profile-signed-out');
    const panel = document.getElementById('profile-editor');
    const statusEl = document.getElementById('profile-status');

    function setStatus(msg, isError) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('text-[#BE0F34]', !!isError);
      statusEl.classList.toggle('text-[#414042]/70', !isError);
    }

    async function loadForUser(user) {
      if (!user) {
        if (gate) gate.classList.remove('hidden');
        if (panel) panel.classList.add('hidden');
        return;
      }
      if (gate) gate.classList.add('hidden');
      if (panel) panel.classList.remove('hidden');

      const profile = await ensureOwnProfile(user);
      const name =
        (profile && profile.display_name) ||
        (global.FFAuth && global.FFAuth.getDisplayName()) ||
        '';
      const avatar = (profile && profile.avatar_url) || DEFAULT_AVATAR;
      selectedAvatarUrl = avatar;

      const nameInput = document.getElementById('profile-display-name');
      if (nameInput) nameInput.value = name;
      updatePreview(avatar);
      renderPresetGrid(avatar);
      setStatus('');
    }

    document.getElementById('profile-open-signin')?.addEventListener('click', () => {
      if (global.FFAuth) global.FFAuth.openAuthModal('signin');
    });

    document.getElementById('profile-save-btn')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('profile-display-name');
      const displayName = nameInput ? nameInput.value.trim() : '';
      const btn = document.getElementById('profile-save-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
      }
      try {
        await saveProfile({
          displayName,
          avatarUrl: selectedAvatarUrl || DEFAULT_AVATAR,
        });
        toast('Profile saved.');
        setStatus('Saved.');
        await refreshAuthAvatar();
      } catch (err) {
        console.error(err);
        setStatus(err.message || 'Could not save profile.', true);
        toast(err.message || 'Could not save profile.');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Save profile';
        }
      }
    });

    const fileInput = document.getElementById('profile-avatar-file');
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      setStatus('Uploading…');
      try {
        const saved = await uploadAvatarFile(file);
        selectedAvatarUrl = saved && saved.avatar_url;
        updatePreview(selectedAvatarUrl);
        renderPresetGrid(selectedAvatarUrl);
        toast('Avatar uploaded.');
        setStatus('Avatar uploaded. Click Save if you also changed your name.');
        await refreshAuthAvatar();
      } catch (err) {
        console.error(err);
        setStatus(err.message || 'Upload failed.', true);
        toast(err.message || 'Upload failed.');
      } finally {
        fileInput.value = '';
      }
    });

    if (global.FFAuth && typeof global.FFAuth.onAuthChange === 'function') {
      global.FFAuth.onAuthChange((user) => {
        loadForUser(user);
      });
    } else {
      loadForUser(global.FFAuth && global.FFAuth.getCurrentUser());
    }
  }

  global.FFProfile = {
    PRESET_AVATARS,
    DEFAULT_AVATAR,
    getPresetAvatars,
    isPresetUrl,
    resolveAvatarUrl,
    fetchProfile,
    fetchProfiles,
    ensureOwnProfile,
    saveProfile,
    uploadAvatarFile,
    getAvatarForUser,
    refreshAuthAvatar,
    syncHeaderAvatar,
    invalidateCache,
    initProfilePage,
  };
})(window);
