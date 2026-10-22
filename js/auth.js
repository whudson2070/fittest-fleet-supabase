/**
 * Email/password auth: sign up, sign in, sign out, session UI.
 * Depends on: window.ffSupabase, showToast (from page), DOM auth elements.
 */
(function (global) {
  'use strict';

  let currentUser = null;
  let displayNameHint = '';

  // Phone-only fit for the auth modals (sign up / sign in / forgot password / set new password).
  // Desktop (768px+) is untouched. The overlay scrolls when the card is taller than the screen
  // (small phones, landscape, keyboard open); inputs use 16px so iOS Safari doesn't zoom on focus.
  (function injectPhoneModalCss() {
    if (!global.document || document.getElementById('ff-auth-phone-css')) return;
    const css = '@media (max-width: 767px){' +
      '#auth-modal,#auth-recovery-modal{align-items:flex-start!important;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px!important}' +
      '#auth-modal>.modal,#auth-recovery-modal>[role=dialog]{margin:auto;flex-shrink:0;padding:28px 20px 24px!important}' +
      '#auth-modal input,#auth-recovery-modal input{font-size:16px!important}' +
      '#auth-close-btn{top:8px!important;right:8px!important;width:44px!important;height:44px!important}' +
      '#auth-error,#auth-recovery-error{overflow-wrap:anywhere}' +
      '#toast{left:12px!important;right:12px!important;transform:none!important;justify-content:center;text-align:left}' +
      '}';
    const style = document.createElement('style');
    style.id = 'ff-auth-phone-css';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  })();

  // Production site. Confirmation emails must land here, not localhost.
  const EMAIL_REDIRECT_TO = 'https://fittestfleet.com/';

  // Read the redirect before supabase-js initialize strips the hash.
  const authCallback = (function readAuthCallback() {
    const hash = new URLSearchParams(String(global.location.hash || '').replace(/^#/, ''));
    const query = new URLSearchParams(global.location.search || '');
    const pick = (key) => hash.get(key) || query.get(key) || '';
    return {
      type: pick('type'),
      error: pick('error_description') || pick('error'),
      hasSessionGrant:
        hash.has('access_token') ||
        hash.has('refresh_token') ||
        query.has('code') ||
        query.has('token_hash'),
    };
  })();

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
    const nameInputWrap = document.getElementById('comment-name-input-wrap');
    const nameInput = document.getElementById('comment-name');
    const displayNameWrap = document.getElementById('comment-display-name-wrap');
    const displayNameText = document.getElementById('comment-display-name');
    const postGate = document.getElementById('post-auth-gate');
    const commentForm = document.getElementById('comment-form');
    const mobileSignin = document.getElementById('auth-mobile-signin');
    const mobileSignup = document.getElementById('auth-mobile-signup');
    const joinButtons = document.querySelectorAll('#auth-open-signup, #auth-mobile-signup');
    const signInButtons = document.querySelectorAll('#auth-open-signin, #auth-mobile-signin');

    if (currentUser) {
      if (signedOut) signedOut.classList.add('hidden');
      if (signedIn) signedIn.classList.remove('hidden');
      const displayName = getDisplayName();
      if (userLabel) userLabel.textContent = displayName;
      if (nameInputWrap) nameInputWrap.classList.add('hidden');
      if (nameInput) nameInput.setAttribute('aria-hidden', 'true');
      if (displayNameWrap) displayNameWrap.classList.remove('hidden');
      if (displayNameText) displayNameText.textContent = displayName;
      if (postGate) postGate.classList.add('hidden');
      if (commentForm) commentForm.classList.remove('opacity-50', 'pointer-events-none');
      if (mobileSignin) mobileSignin.classList.add('hidden');
      if (mobileSignup) mobileSignup.classList.add('hidden');
      joinButtons.forEach((button) => button.classList.add('hidden'));
      signInButtons.forEach((button) => button.classList.add('hidden'));
    } else {
      if (signedOut) signedOut.classList.remove('hidden');
      if (signedIn) signedIn.classList.add('hidden');
      if (userLabel) userLabel.textContent = '';
      if (nameInputWrap) nameInputWrap.classList.remove('hidden');
      if (nameInput) nameInput.removeAttribute('aria-hidden');
      if (displayNameWrap) displayNameWrap.classList.add('hidden');
      if (displayNameText) displayNameText.textContent = '';
      if (postGate) postGate.classList.remove('hidden');
      if (commentForm) commentForm.classList.add('opacity-50', 'pointer-events-none');
      if (mobileSignin) mobileSignin.classList.remove('hidden');
      if (mobileSignup) mobileSignup.classList.remove('hidden');
      joinButtons.forEach((button) => button.classList.remove('hidden'));
      signInButtons.forEach((button) => button.classList.remove('hidden'));
      const avatarImg = document.getElementById('auth-user-avatar');
      if (avatarImg) {
        avatarImg.classList.add('hidden');
        avatarImg.removeAttribute('src');
      }
      const avatarIcon = document.getElementById('auth-user-icon');
      if (avatarIcon) avatarIcon.classList.remove('hidden');
    }

    document.querySelectorAll('[data-signed-in-nav]').forEach((el) => {
      el.classList.toggle('hidden', !currentUser);
    });
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
    const pwInput = document.getElementById('auth-password');
    const pwWrap = pwInput ? pwInput.parentElement : null;
    if (pwWrap) pwWrap.classList.toggle('hidden', modal.dataset.mode === 'reset');
    if (pwInput) {
      if (modal.dataset.mode === 'reset') pwInput.removeAttribute('required');
      else pwInput.setAttribute('required', '');
    }
    if (modal.dataset.mode === 'reset') {
      if (title) title.textContent = 'Reset your password';
      if (submitBtn) submitBtn.textContent = 'Send reset link';
      if (toggleHint) toggleHint.innerHTML = 'Remembered it? <button type="button" id="auth-switch-btn" class="text-[#BE0F34] font-semibold underline">Back to sign in</button>';
      if (nameWrap) nameWrap.classList.add('hidden');
    } else if (modal.dataset.mode === 'signup') {
      if (title) title.textContent = 'Create your account';
      if (submitBtn) submitBtn.textContent = 'Sign up';
      if (toggleHint) toggleHint.innerHTML = 'Already have an account? <button type="button" id="auth-switch-btn" class="text-[#BE0F34] font-semibold underline">Sign in</button>';
      if (nameWrap) nameWrap.classList.remove('hidden');
    } else {
      if (title) title.textContent = 'Welcome back';
      if (submitBtn) submitBtn.textContent = 'Sign in';
      if (toggleHint) toggleHint.innerHTML = '<button type="button" id="auth-forgot-btn" class="block mx-auto mb-3 text-[#414042]/80 hover:text-[#BE0F34] font-semibold underline">Forgot password?</button>New here? <button type="button" id="auth-switch-btn" class="text-[#BE0F34] font-semibold underline">Create an account</button>';
      if (nameWrap) nameWrap.classList.add('hidden');
    }

    const switchBtn = document.getElementById('auth-switch-btn');
    if (switchBtn) {
      switchBtn.addEventListener('click', () => {
        openAuthModal(modal.dataset.mode === 'signin' ? 'signup' : 'signin');
      });
    }
    const forgotBtn = document.getElementById('auth-forgot-btn');
    if (forgotBtn) forgotBtn.addEventListener('click', () => openAuthModal('reset'));

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

  function friendlyAuthError(err) {
    const msg = String((err && err.message) || '');
    if ((err && err.status === 429) || /for security purposes|rate limit|too many/i.test(msg)) {
      return 'Too many attempts in a short time. Please wait about a minute, then try again.';
    }
    if (/invalid login credentials/i.test(msg)) {
      return 'That email and password don’t match. Try again, or use “Forgot password?”.';
    }
    if (/email not confirmed/i.test(msg)) {
      return 'Please confirm your email first. Check your inbox (and spam) for the confirmation link.';
    }
    return msg || 'Something went wrong. Please try again.';
  }

  async function sendPasswordReset(email) {
    const client = global.ffSupabase;
    if (!client) throw new Error('Supabase is not configured.');
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: EMAIL_REDIRECT_TO });
    if (error) throw error;
  }

  // Set-new-password screen shown when the user returns from the recovery email.
  function showRecoveryScreen() {
    if (document.getElementById('auth-recovery-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'auth-recovery-modal';
    wrap.className = 'fixed inset-0 z-[120] flex items-center justify-center p-4';
    wrap.innerHTML = `
      <div class="absolute inset-0 bg-black/40"></div>
      <div class="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-[#E6E7E8]" role="dialog" aria-modal="true" aria-labelledby="auth-recovery-title">
        <h3 id="auth-recovery-title" class="text-2xl font-bold tracking-tight mb-1">Set a new password</h3>
        <p class="text-sm text-[#414042]/70 mb-6">Choose a new password for your Fittest Fleet account.</p>
        <div id="auth-recovery-error" class="hidden mb-4 text-sm text-[#BE0F34] bg-[#BE0F34]/10 rounded-2xl px-4 py-3"></div>
        <form id="auth-recovery-form" class="space-y-4">
          <div>
            <label for="auth-new-password" class="block text-xs font-semibold tracking-wider text-[#414042]/70 mb-1.5">NEW PASSWORD</label>
            <input type="password" id="auth-new-password" required minlength="6" autocomplete="new-password" placeholder="At least 6 characters"
                   class="w-full border border-[#E6E7E8] focus:border-[#BE0F34] rounded-2xl px-5 py-3 text-sm outline-none">
          </div>
          <div>
            <label for="auth-new-password2" class="block text-xs font-semibold tracking-wider text-[#414042]/70 mb-1.5">CONFIRM NEW PASSWORD</label>
            <input type="password" id="auth-new-password2" required minlength="6" autocomplete="new-password"
                   class="w-full border border-[#E6E7E8] focus:border-[#BE0F34] rounded-2xl px-5 py-3 text-sm outline-none">
          </div>
          <button type="submit" id="auth-recovery-submit" class="w-full py-3.5 bg-[#BE0F34] hover:bg-[#D7153A] text-white font-bold rounded-2xl transition-all">Save new password</button>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('#auth-recovery-form');
    const errEl = wrap.querySelector('#auth-recovery-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = wrap.querySelector('#auth-new-password').value;
      const b = wrap.querySelector('#auth-new-password2').value;
      const showErr = (m) => { errEl.textContent = m; errEl.classList.remove('hidden'); };
      if (a.length < 6) return showErr('Password must be at least 6 characters.');
      if (a !== b) return showErr('The two passwords don’t match.');
      const btn = wrap.querySelector('#auth-recovery-submit');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const { error } = await global.ffSupabase.auth.updateUser({ password: a });
        if (error) throw error;
        wrap.remove();
        if (typeof global.showToast === 'function') global.showToast('Password updated. You’re signed in.');
      } catch (err) {
        showErr(friendlyAuthError(err));
        btn.disabled = false; btn.textContent = 'Save new password';
      }
    });
    setTimeout(() => wrap.querySelector('#auth-new-password')?.focus(), 50);
  }

  function blankToNull(value) {
    const trimmed = String(value || '').trim();
    return trimmed || null;
  }

  async function saveSignupProfile(client, userId, displayName, jobTitle, location) {
    if (!userId) return;
    const row = { id: userId };
    if (displayName) row.display_name = displayName;
    if (jobTitle) row.job_title = jobTitle;
    if (location) row.location = location;
    if (!row.job_title && !row.location) return;

    // Trigger may already have inserted the row. Upsert only the fields we have
    // so avatar_url is left alone when the row exists.
    const { error } = await client.from('profiles').upsert(row, { onConflict: 'id' });
    if (error) console.warn('[auth] could not save job title / location', error);
  }

  async function signUp(email, password, displayName, jobTitle, location) {
    const client = global.ffSupabase;
    if (!client) throw new Error('Supabase is not configured. Add your keys to js/config.js.');

    const name = displayName || email.split('@')[0];
    const title = blankToNull(jobTitle);
    const place = blankToNull(location);
    const meta = { display_name: name };
    if (title) meta.job_title = title;
    if (place) meta.location = place;

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: meta,
        emailRedirectTo: EMAIL_REDIRECT_TO,
      },
    });
    if (error) throw error;

    // Supabase hides whether an email is registered: for an existing account it
    // returns a user with no identities and sends no email.
    if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      const dup = new Error('If you already have an account, sign in or reset your password.');
      dup.code = 'ff_existing_account';
      throw dup;
    }

    // When a session exists, write the profile now. If email confirmation is on,
    // the handle_new_user_profile trigger copies the same metadata instead.
    if (data && data.session && data.user) {
      await saveSignupProfile(client, data.user.id, name, title, place);
    }
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
    const jobTitle = (document.getElementById('auth-job-title') || {}).value || '';
    const location = (document.getElementById('auth-location') || {}).value || '';

    if (mode === 'reset') {
      if (!email.trim()) { showAuthError('Enter your email address.'); return; }
      const btn = document.getElementById('auth-submit-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
      try {
        await sendPasswordReset(email.trim());
        closeAuthModal();
        if (typeof global.showToast === 'function') {
          global.showToast('If that email has an account, a reset link is on its way. Check your inbox (and spam).');
        }
      } catch (err) {
        showAuthError(friendlyAuthError(err));
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Send reset link'; }
      }
      return;
    }

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
        const result = await signUp(email.trim(), password, name.trim(), jobTitle, location);
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
          // Email confirmation required (typical Supabase: no session until confirmed).
          closeAuthModal();
          window.alert(
            "You're almost there. We sent a confirmation email to the address you entered. Open it and confirm your account to finish signing up. If you don't see it in a few minutes, check your spam folder."
          );
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
      showAuthError(err && err.code === 'ff_existing_account' ? err.message : friendlyAuthError(err));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'signup' ? 'Sign up' : 'Sign in';
      }
    }
  }

  function announceAuthCallback() {
    if (!authCallback.error && !authCallback.hasSessionGrant) return;
    if (typeof global.showToast !== 'function') return;
    if (authCallback.error) {
      let message = authCallback.error;
      try {
        message = decodeURIComponent(message.replace(/\+/g, ' '));
      } catch (e) {
        /* keep raw */
      }
      global.showToast(message);
      return;
    }
    if (currentUser) {
      global.showToast('Email confirmed. You’re signed in.');
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
    if (authCallback.type === 'recovery' && currentUser) {
      showRecoveryScreen();
    } else {
      announceAuthCallback();
    }

    // Clear the leftover "#" (or token fragment) after an email-link redirect.
    if ((authCallback.hasSessionGrant || authCallback.error || global.location.href.endsWith('#')) && global.history && global.history.replaceState) {
      global.history.replaceState(global.history.state, '', global.location.pathname + global.location.search);
    }

    client.auth.onAuthStateChange((_event, session) => {
      if (_event === 'PASSWORD_RECOVERY') showRecoveryScreen();
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
