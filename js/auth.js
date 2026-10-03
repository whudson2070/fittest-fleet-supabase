/**
 * Email/password auth: sign up, sign in, sign out, session UI.
 * Depends on: window.ffSupabase, showToast (from page), DOM auth elements.
 */
(function (global) {
  'use strict';

  let currentUser = null;
  let displayNameHint = '';

  const listeners = [];

  function onAuthChange(cb) {
    listeners.push(cb);
    if (currentUser !== undefined) cb(currentUser);
  }

  function notify() {
    listeners.forEach((cb) => {
      try {
        cb(currentUser);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function getDisplayNameFromUser(user) {
    if (!user) return '';
    const meta = user.user_metadata || {};
    if (meta.display_name) return meta.display_name;
    if (meta.full_name) return meta.full_name;
    if (user.email) return user.email.split('@')[0];
    return 'Community Member';
  }

  function getCurrentUser() {
    return currentUser;
  }

  function getDisplayName() {
    return displayNameHint || getDisplayNameFromUser(currentUser);
  }

  function updateAuthUI() {
    const signedOut = document.getElementById('auth-signed-out');
    const signedIn = document.getElementById('auth-signed-in');
    const userLabel = document.getElementById('auth-user-label');
    const nameInput = document.getElementById('comment-name');
    const postGate = document.getElementById('post-auth-gate');
    const commentForm = document.getElementById('comment-form');
    const mobileSignin = document.getElementById('auth-mobile-signin');
    const mobileSignup = document.getElementById('auth-mobile-signup');

    if (currentUser) {
      if (signedOut) signedOut.classList.add('hidden');
      if (signedIn) signedIn.classList.remove('hidden');
      if (userLabel) userLabel.textContent = getDisplayName();
      if (nameInput && !nameInput.value) {
        nameInput.value = getDisplayName();
        nameInput.placeholder = getDisplayName();
      }
      if (postGate) postGate.classList.add('hidden');
      if (commentForm) commentForm.classList.remove('opacity-50', 'pointer-events-none');
      if (mobileSignin) mobileSignin.classList.add('hidden');
      if (mobileSignup) mobileSignup.classList.add('hidden');
    } else {
      if (signedOut) signedOut.classList.remove('hidden');
      if (signedIn) signedIn.classList.add('hidden');
      if (userLabel) userLabel.textContent = '';
      if (postGate) postGate.classList.remove('hidden');
      if (commentForm) commentForm.classList.add('opacity-50', 'pointer-events-none');
      if (mobileSignin) mobileSignin.classList.remove('hidden');
      if (mobileSignup) mobileSignup.classList.remove('hidden');
      const avatarImg = document.getElementById('auth-user-avatar');
      if (avatarImg) {
        avatarImg.classList.add('hidden');
        avatarImg.removeAttribute('src');
      }
      const avatarIcon = document.getElementById('auth-user-icon');
      if (avatarIcon) avatarIcon.classList.remove('hidden');
    }
  }

  function openAuthModal(mode) {
    const modal = document.getElementById('auth-modal');
    const title = document.getElementById('auth-modal-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleHint = document.getElementById('auth-toggle-hint');
    const nameWrap = document.getElementById('auth-name-wrap');
    const errEl = document.getElementById('auth-error');

    if (!modal) return;
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }

    modal.dataset.mode = mode || 'signin';
    if (modal.dataset.mode === 'signup') {
      if (title) title.textContent = 'Create your account';
      if (submitBtn) submitBtn.textContent = 'Sign up';
      if (toggleHint) toggleHint.innerHTML = 'Already have an account? <button type="button" id="auth-switch-btn" class="text-[#BE0F34] font-semibold underline">Sign in</button>';
      if (nameWrap) nameWrap.classList.remove('hidden');
    } else {
      if (title) title.textContent = 'Welcome back';
      if (submitBtn) submitBtn.textContent = 'Sign in';
      if (toggleHint) toggleHint.innerHTML = 'New here? <button type="button" id="auth-switch-btn" class="text-[#BE0F34] font-semibold underline">Create an account</button>';
      if (nameWrap) nameWrap.classList.add('hidden');
    }

    const switchBtn = document.getElementById('auth-switch-btn');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        openAuthModal(modal.dataset.mode === 'signup' ? 'signin' : 'signup');
      });
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function showAuthError(msg) {
    const errEl = document.getElementById('auth-error');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }

  async function signUp(email, password, displayName) {
    const client = global.ffSupabase;
    if (!client) throw new Error('Supabase is not configured. Add your keys to js/config.js.');

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || email.split('@')[0] },
      },
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    const client = global.ffSupabase;
    if (!client) throw new Error('Supabase is not configured. Add your keys to js/config.js.');

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const client = global.ffSupabase;
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const modal = document.getElementById('auth-modal');
    const mode = (modal && modal.dataset.mode) || 'signin';
    const email = (document.getElementById('auth-email') || {}).value || '';
    const password = (document.getElementById('auth-password') || {}).value || '';
    const name = (document.getElementById('auth-display-name') || {}).value || '';

    if (!email.trim() || !password) {
      showAuthError('Email and password are required.');
      return;
    }

    const submitBtn = document.getElementById('auth-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
    }

    try {
      if (mode === 'signup') {
        const result = await signUp(email.trim(), password, name.trim());
        displayNameHint = name.trim() || email.split('@')[0];
        if (result.session) {
          currentUser = result.session.user;
          updateAuthUI();
          notify();
          closeAuthModal();
          if (typeof global.showToast === 'function') {
            global.showToast('Welcome to Fittest Fleet! You’re signed in.');
          }
        } else {
          closeAuthModal();
          if (typeof global.showToast === 'function') {
            global.showToast('Check your email to confirm your account, then sign in.');
          }
        }
      } else {
        const result = await signIn(email.trim(), password);
        currentUser = result.user;
        displayNameHint = getDisplayNameFromUser(currentUser);
        updateAuthUI();
        notify();
        closeAuthModal();
        if (typeof global.showToast === 'function') {
          global.showToast('Signed in. Glad you’re here!');
        }
      }
    } catch (err) {
      showAuthError(err.message || 'Authentication failed.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'signup' ? 'Sign up' : 'Sign in';
      }
    }
  }

  async function initAuth() {
    const client = global.ffSupabase;

    document.getElementById('auth-open-signin')?.addEventListener('click', () => openAuthModal('signin'));
    document.getElementById('auth-open-signup')?.addEventListener('click', () => openAuthModal('signup'));
    document.getElementById('auth-mobile-signin')?.addEventListener('click', () => openAuthModal('signin'));
    document.getElementById('auth-mobile-signup')?.addEventListener('click', () => openAuthModal('signup'));
    document.getElementById('auth-close-btn')?.addEventListener('click', closeAuthModal);
    document.getElementById('auth-modal-backdrop')?.addEventListener('click', closeAuthModal);
    document.getElementById('auth-form')?.addEventListener('submit', handleAuthSubmit);
    document.getElementById('auth-signout-btn')?.addEventListener('click', async () => {
      try {
        await signOut();
        if (typeof global.showToast === 'function') global.showToast('Signed out. See you next time!');
      } catch (err) {
        if (typeof global.showToast === 'function') global.showToast(err.message || 'Sign out failed.');
      }
    });

    if (!client) {
      currentUser = null;
      updateAuthUI();
      notify();
      return;
    }

    const { data } = await client.auth.getSession();
    currentUser = data.session ? data.session.user : null;
    displayNameHint = getDisplayNameFromUser(currentUser);
    updateAuthUI();
    notify();

    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null;
      displayNameHint = getDisplayNameFromUser(currentUser);
      updateAuthUI();
      notify();
    });
  }

  global.FFAuth = {
    initAuth,
    getCurrentUser,
    getDisplayName,
    onAuthChange,
    openAuthModal,
    closeAuthModal,
    signOut,
  };
})(window);
