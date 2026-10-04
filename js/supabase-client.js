/**
 * Creates and exports the shared Supabase client.
 * Requires config.js (SUPABASE_URL + SUPABASE_ANON_KEY) and the CDN supabase-js lib.
 */
(function (global) {
  'use strict';

  function createClient() {
    const url = global.SUPABASE_URL;
    const key = global.SUPABASE_ANON_KEY;

    if (!url || !key || url === 'YOUR_SUPABASE_URL' || key === 'YOUR_SUPABASE_ANON_KEY') {
      console.warn(
        '[Fittest Fleet] Supabase is not configured. Copy js/config.example.js → js/config.js and add your project URL and anon key.'
      );
      return null;
    }

    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      console.error('[Fittest Fleet] supabase-js CDN not loaded.');
      return null;
    }

    // detectSessionInUrl (default true) reads the email-confirm redirect.
    // Implicit flow puts access_token / type=signup in the URL hash, which
    // this static site can consume. PKCE would require the same browser.
    return global.supabase.createClient(url, key, {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'implicit',
      },
    });
  }

  global.ffSupabase = createClient();
})(window);
