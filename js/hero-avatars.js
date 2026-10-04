/**
 * Fills the hero avatar stack with random custom uploads from public.profiles.
 * Preset paths under assets/avatars/ are skipped. Anon select is already allowed.
 * If fewer than three uploads exist, or the query fails, leftover circles stay empty.
 */
(function (global) {
  'use strict';

  var MAX_FETCH = 1000;

  function isCustomUpload(url) {
    if (!url || typeof url !== 'string') return false;
    var trimmed = url.trim();
    if (!trimmed) return false;
    if (trimmed.indexOf('assets/avatars/') !== -1) return false;
    return true;
  }

  function shuffle(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function avatarImgs() {
    var root = document.getElementById('hero-member-avatars');
    if (!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll('img'));
  }

  function clearImg(img) {
    img.onerror = null;
    img.removeAttribute('src');
  }

  function applyUrls(urls) {
    var imgs = avatarImgs();
    var picked = shuffle(urls).slice(0, imgs.length);
    imgs.forEach(function (img, i) {
      var url = picked[i];
      if (!url) {
        clearImg(img);
        return;
      }
      img.onerror = function () {
        clearImg(img);
      };
      img.src = url;
    });
  }

  async function loadHeroAvatars() {
    var imgs = avatarImgs();
    imgs.forEach(clearImg);

    var client = global.ffSupabase;
    if (!client) return;

    try {
      var result = await client
        .from('profiles')
        .select('avatar_url')
        .not('avatar_url', 'is', null)
        .limit(MAX_FETCH);

      if (result.error) throw result.error;

      var seen = Object.create(null);
      var urls = [];
      (result.data || []).forEach(function (row) {
        var url = row && row.avatar_url;
        if (!isCustomUpload(url) || seen[url]) return;
        seen[url] = true;
        urls.push(url);
      });

      applyUrls(urls);
    } catch (err) {
      imgs.forEach(clearImg);
      console.warn(
        '[Fittest Fleet] Hero avatars unavailable.',
        err && err.message ? err.message : err
      );
    }
  }

  global.FFHeroAvatars = { loadHeroAvatars: loadHeroAvatars };
})(window);
