/**
 * Profile + avatar helpers.
 * Depends on: window.ffSupabase, window.FFAuth, showToast (optional).
 */
(function (global) {
  'use strict';

  const PRESET_AVATARS = [
    { id: 'dumbbell', url: 'assets/avatars/dumbbell.svg', label: 'Weight loss' },
    { id: 'treadmill', url: 'assets/avatars/treadmill.svg', label: 'Exercise' },
    { id: 'jumprope', url: 'assets/avatars/jumprope.svg', label: 'Heart' },
    { id: 'kettlebell', url: 'assets/avatars/kettlebell.svg', label: 'Nutrition' },
    { id: 'bike', url: 'assets/avatars/bike.svg', label: 'Bike' },
    { id: 'stopwatch', url: 'assets/avatars/stopwatch.svg', label: 'Stopwatch' },
    { id: 'bottle', url: 'assets/avatars/bottle.svg', label: 'Water bottle' },
    { id: 'spark', url: 'assets/avatars/spark.svg', label: 'Spark' },
  ];

  const DEFAULT_AVATAR = PRESET_AVATARS[0].url;
  const profileCache = new Map(); // userId -> { avatar_url, display_name, job_title, location }

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
      .select('id, avatar_url, display_name, job_title, location, updated_at')
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
      .select('id, avatar_url, display_name, job_title, location, updated_at')
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

  async function saveProfile({ displayName, avatarUrl, jobTitle, location }) {
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
    if (typeof jobTitle === 'string') payload.job_title = jobTitle.trim() || null;
    if (typeof location === 'string') payload.location = location.trim() || null;

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
        if (global.FFComments && typeof global.FFComments.updateCommentAuthor === 'function') {
          global.FFComments.updateCommentAuthor(profile.display_name);
        }
      }
    } catch (e) {
      console.warn('[profile] header avatar', e);
    }
  }

  const CROP_VIEW = 320;
  const CROP_EXPORT = 512;
  const CROP_MAX_SOURCE = 15 * 1024 * 1024;

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image.'));
      };
      img.src = url;
    });
  }

  function loadImageSource(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImageElement(file));
    }
    return loadImageElement(file);
  }

  /**
   * Drag + zoom crop. Resolves to a square JPEG File, or null if cancelled.
   * Does not upload or change the saved avatar.
   */
  function openAvatarCropper(file) {
    const modal = document.getElementById('avatar-crop-modal');
    const canvas = document.getElementById('avatar-crop-canvas');
    const stage = document.getElementById('avatar-crop-stage');
    const zoomInput = document.getElementById('avatar-crop-zoom');
    const confirmBtn = document.getElementById('avatar-crop-confirm');
    const cancelBtn = document.getElementById('avatar-crop-cancel');
    const backdrop = document.getElementById('avatar-crop-backdrop');
    if (!modal || !canvas || !stage || !zoomInput || !confirmBtn || !cancelBtn) {
      return Promise.reject(new Error('Crop tool is not available on this page.'));
    }

    const ctx = canvas.getContext('2d');

    return loadImageSource(file).then((loaded) => {
      if (!loaded || !loaded.width || !loaded.height) {
        throw new Error('Could not read that image.');
      }

      let img = loaded;
      let scale = Math.max(CROP_VIEW / img.width, CROP_VIEW / img.height);
      let originX = (CROP_VIEW - img.width * scale) / 2;
      let originY = (CROP_VIEW - img.height * scale) / 2;
      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let settled = false;

      function coverScale() {
        return Math.max(CROP_VIEW / img.width, CROP_VIEW / img.height);
      }

      function clamp() {
        const w = img.width * scale;
        const h = img.height * scale;
        if (w <= CROP_VIEW) originX = (CROP_VIEW - w) / 2;
        else originX = Math.min(0, Math.max(CROP_VIEW - w, originX));
        if (h <= CROP_VIEW) originY = (CROP_VIEW - h) / 2;
        else originY = Math.min(0, Math.max(CROP_VIEW - h, originY));
      }

      function draw() {
        ctx.clearRect(0, 0, CROP_VIEW, CROP_VIEW);
        ctx.fillStyle = '#E6E7E8';
        ctx.fillRect(0, 0, CROP_VIEW, CROP_VIEW);
        ctx.drawImage(img, originX, originY, img.width * scale, img.height * scale);
      }

      function applyZoom(zoom, anchorX, anchorY) {
        const next = coverScale() * zoom;
        const ax = anchorX == null ? CROP_VIEW / 2 : anchorX;
        const ay = anchorY == null ? CROP_VIEW / 2 : anchorY;
        const ix = (ax - originX) / scale;
        const iy = (ay - originY) / scale;
        scale = next;
        originX = ax - ix * scale;
        originY = ay - iy * scale;
        clamp();
        draw();
      }

      function canvasPoint(event) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: ((event.clientX - rect.left) * canvas.width) / rect.width,
          y: ((event.clientY - rect.top) * canvas.height) / rect.height,
        };
      }

      zoomInput.value = '1';
      clamp();
      draw();

      return new Promise((resolve, reject) => {
        function cleanup() {
          stage.removeEventListener('pointerdown', onPointerDown);
          stage.removeEventListener('pointermove', onPointerMove);
          stage.removeEventListener('pointerup', onPointerUp);
          stage.removeEventListener('pointercancel', onPointerUp);
          stage.removeEventListener('wheel', onWheel);
          zoomInput.removeEventListener('input', onZoomInput);
          confirmBtn.removeEventListener('click', onConfirm);
          cancelBtn.removeEventListener('click', onCancel);
          if (backdrop) backdrop.removeEventListener('click', onCancel);
          document.removeEventListener('keydown', onKey);
          modal.classList.add('hidden');
          modal.classList.remove('flex');
          stage.classList.remove('is-dragging');
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Use this photo';
          if (img && typeof img.close === 'function') {
            try { img.close(); } catch (e) { /* bitmap already closed */ }
          }
          img = null;
        }

        function finish(value) {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        }

        function fail(err) {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        }

        function onPointerDown(event) {
          if (event.button != null && event.button !== 0) return;
          dragging = true;
          stage.classList.add('is-dragging');
          const pt = canvasPoint(event);
          lastX = pt.x;
          lastY = pt.y;
          if (stage.setPointerCapture) {
            try { stage.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
          }
        }

        function onPointerMove(event) {
          if (!dragging) return;
          const pt = canvasPoint(event);
          originX += pt.x - lastX;
          originY += pt.y - lastY;
          lastX = pt.x;
          lastY = pt.y;
          clamp();
          draw();
        }

        function onPointerUp() {
          dragging = false;
          stage.classList.remove('is-dragging');
        }

        function onZoomInput() {
          applyZoom(Number(zoomInput.value) || 1);
        }

        function onWheel(event) {
          event.preventDefault();
          const current = Number(zoomInput.value) || 1;
          const next = Math.min(3, Math.max(1, current + (event.deltaY < 0 ? 0.06 : -0.06)));
          zoomInput.value = String(next);
          const pt = canvasPoint(event);
          applyZoom(next, pt.x, pt.y);
        }

        function onKey(event) {
          if (event.key === 'Escape') finish(null);
        }

        function onCancel() {
          finish(null);
        }

        async function onConfirm() {
          if (settled) return;
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Preparing…';
          try {
            const out = document.createElement('canvas');
            out.width = CROP_EXPORT;
            out.height = CROP_EXPORT;
            const octx = out.getContext('2d');
            const ratio = CROP_EXPORT / CROP_VIEW;
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, CROP_EXPORT, CROP_EXPORT);
            octx.drawImage(
              img,
              originX * ratio,
              originY * ratio,
              img.width * scale * ratio,
              img.height * scale * ratio
            );
            const blob = await new Promise((res) => out.toBlob(res, 'image/jpeg', 0.9));
            if (!blob) throw new Error('Could not export the cropped image.');
            finish(new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
          } catch (err) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Use this photo';
            fail(err);
          }
        }

        stage.addEventListener('pointerdown', onPointerDown);
        stage.addEventListener('pointermove', onPointerMove);
        stage.addEventListener('pointerup', onPointerUp);
        stage.addEventListener('pointercancel', onPointerUp);
        stage.addEventListener('wheel', onWheel, { passive: false });
        zoomInput.addEventListener('input', onZoomInput);
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        if (backdrop) backdrop.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey);

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        confirmBtn.focus();
      });
    });
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
      btn.innerHTML = `<img src="${preset.url}" alt="" class="w-16 h-16 object-cover">`;
      const wrap = document.createElement('div');
      wrap.className = 'preset-avatar-wrap';
      const tip = document.createElement('span');
      tip.className = 'preset-avatar-tip';
      tip.textContent = preset.label;
      wrap.appendChild(btn);
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
      wrap.appendChild(tip);
      grid.appendChild(wrap);
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
      const jobTitleInput = document.getElementById('profile-job-title');
      if (jobTitleInput) jobTitleInput.value = (profile && profile.job_title) || '';
      const locationInput = document.getElementById('profile-location');
      if (locationInput) locationInput.value = (profile && profile.location) || '';
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
      const jobTitleInput = document.getElementById('profile-job-title');
      const locationInput = document.getElementById('profile-location');
      const btn = document.getElementById('profile-save-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving…';
      }
      try {
        await saveProfile({
          displayName,
          avatarUrl: selectedAvatarUrl || DEFAULT_AVATAR,
          jobTitle: jobTitleInput ? jobTitleInput.value : '',
          location: locationInput ? locationInput.value : '',
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
      fileInput.value = '';
      if (!file) return;
      if (!file.type || !file.type.startsWith('image/')) {
        setStatus('Please choose an image file (JPEG, PNG, WebP, or GIF).', true);
        return;
      }
      if (file.size > CROP_MAX_SOURCE) {
        setStatus('Image must be 15 MB or smaller.', true);
        return;
      }
      setStatus('Adjust the crop, then confirm. Cancel leaves your avatar unchanged.');
      try {
        const cropped = await openAvatarCropper(file);
        if (!cropped) {
          setStatus('');
          return;
        }
        setStatus('Uploading…');
        const saved = await uploadAvatarFile(cropped);
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
