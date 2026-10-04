/**
 * Personal progress check-ins.
 * Depends on: window.ffSupabase, window.FFAuth.
 */
(function (global) {
  'use strict';

  const TABLE = 'progress_checkins';
  const LIST_LIMIT = 30;

  const FIELDS = [
    { key: 'weight', label: 'Weight', unit: 'lb', summary: 'latest', step: '0.1' },
    { key: 'pushups', label: 'Push-ups', unit: '', summary: 'total', integer: true },
    { key: 'squats', label: 'Squats', unit: '', summary: 'total', integer: true },
    { key: 'yoga_minutes', label: 'Yoga', unit: 'min', summary: 'total', integer: true },
    { key: 'miles', label: 'Miles walked / run', unit: 'mi', summary: 'total', step: '0.01' },
    { key: 'calories', label: 'Calories', unit: '', summary: 'total', integer: true },
    { key: 'carbohydrates', label: 'Carbohydrates', unit: 'g', summary: 'total', step: '0.1' },
    { key: 'sugars', label: 'Sugars', unit: 'g', summary: 'total', step: '0.1' },
  ];

  function toast(message) {
    if (typeof global.showToast === 'function') global.showToast(message);
  }

  function todayISO() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function formatWithUnit(value, field) {
    const text = formatNumber(value);
    if (!text) return '';
    return field.unit ? text + ' ' + field.unit : text;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const parts = String(iso).slice(0, 10).split('-');
    if (parts.length !== 3) return String(iso);
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function parseField(raw, field) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { value: null };
    const number = field.integer ? Number.parseInt(text, 10) : Number(text);
    if (!Number.isFinite(number) || number < 0) return { invalid: true };
    return { value: number };
  }

  function setStatus(message, isError) {
    const el = document.getElementById('progress-status');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('text-[#BE0F34]', !!isError);
    el.classList.toggle('text-[#414042]/70', !isError);
  }

  function showSignedIn(isSignedIn) {
    const gate = document.getElementById('progress-signed-out');
    const app = document.getElementById('progress-app');
    if (gate) gate.classList.toggle('hidden', isSignedIn);
    if (app) app.classList.toggle('hidden', !isSignedIn);
  }

  function renderSummary(rows) {
    const root = document.getElementById('progress-summary');
    if (!root) return;
    root.replaceChildren();

    const byDate = rows.slice().sort((a, b) => {
      const dateCmp = String(b.checked_in_on || '').localeCompare(String(a.checked_in_on || ''));
      if (dateCmp !== 0) return dateCmp;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    FIELDS.forEach((field) => {
      let display = '—';
      if (field.summary === 'latest') {
        const found = byDate.find((row) => row[field.key] != null && row[field.key] !== '');
        if (found) display = formatWithUnit(found[field.key], field);
      } else {
        let total = 0;
        let any = false;
        rows.forEach((row) => {
          const number = Number(row[field.key]);
          if (Number.isFinite(number)) {
            total += number;
            any = true;
          }
        });
        if (any) display = formatWithUnit(total, field);
      }

      const card = document.createElement('div');
      card.className = 'bg-white border border-[#E6E7E8] rounded-2xl px-4 py-3';
      const label = document.createElement('div');
      label.className = 'text-[10px] font-semibold tracking-wider text-[#414042]/60';
      label.textContent = (field.summary === 'latest' ? 'LATEST ' : 'TOTAL ') + field.label.toUpperCase();
      const value = document.createElement('div');
      value.className = 'mt-1 text-xl font-black text-[#BE0F34]';
      value.textContent = display;
      card.append(label, value);
      root.appendChild(card);
    });
  }

  function renderList(rows) {
    const list = document.getElementById('progress-list');
    const empty = document.getElementById('progress-empty');
    if (!list || !empty) return;
    list.replaceChildren();

    if (!rows.length) {
      empty.classList.remove('hidden');
      empty.textContent = 'No check-ins yet. Save your first one above.';
      return;
    }

    empty.classList.add('hidden');
    rows.slice(0, LIST_LIMIT).forEach((row) => {
      const item = document.createElement('li');
      item.className = 'border border-[#E6E7E8] rounded-2xl px-4 py-3 bg-[#E6E7E8]/30';

      const date = document.createElement('div');
      date.className = 'text-sm font-bold text-[#414042]';
      date.textContent = formatDate(row.checked_in_on);

      const bits = document.createElement('div');
      bits.className = 'mt-1 text-sm text-[#414042]/80';
      const parts = [];
      FIELDS.forEach((field) => {
        if (row[field.key] == null || row[field.key] === '') return;
        parts.push(field.label + ' ' + formatWithUnit(row[field.key], field));
      });
      bits.textContent = parts.length ? parts.join(' · ') : 'No numbers recorded';

      item.append(date, bits);
      list.appendChild(item);
    });
  }

  async function loadCheckins() {
    const client = global.ffSupabase;
    const user = global.FFAuth && global.FFAuth.getCurrentUser ? global.FFAuth.getCurrentUser() : null;
    if (!client || !user) {
      renderSummary([]);
      renderList([]);
      return;
    }

    const { data, error } = await client
      .from(TABLE)
      .select('id, checked_in_on, created_at, weight, pushups, squats, yoga_minutes, miles, calories, carbohydrates, sugars')
      .eq('user_id', user.id)
      .order('checked_in_on', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[progress] could not load check-ins', error);
      setStatus('Could not load check-ins. If this is a new setup, run sql/progress-checkins.sql in Supabase.', true);
      renderSummary([]);
      const empty = document.getElementById('progress-empty');
      const list = document.getElementById('progress-list');
      if (list) list.replaceChildren();
      if (empty) {
        empty.classList.remove('hidden');
        empty.textContent = 'Check-ins are unavailable until the progress table exists.';
      }
      return;
    }

    const rows = data || [];
    renderSummary(rows);
    renderList(rows);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const client = global.ffSupabase;
    const user = global.FFAuth && global.FFAuth.getCurrentUser ? global.FFAuth.getCurrentUser() : null;
    if (!client || !user) {
      setStatus('Sign in to save a check-in.', true);
      return;
    }

    const dateInput = document.getElementById('progress-date');
    const checkedInOn = dateInput && dateInput.value ? dateInput.value : todayISO();
    const row = { user_id: user.id, checked_in_on: checkedInOn };
    let any = false;

    for (let i = 0; i < FIELDS.length; i += 1) {
      const field = FIELDS[i];
      const input = document.getElementById('progress-' + field.key);
      const parsed = parseField(input ? input.value : '', field);
      if (parsed.invalid) {
        setStatus(field.label + ' needs a number that is zero or greater.', true);
        if (input) input.focus();
        return;
      }
      row[field.key] = parsed.value;
      if (parsed.value != null) any = true;
    }

    if (!any) {
      setStatus('Enter at least one number. Blank fields are skipped.', true);
      return;
    }

    const button = document.getElementById('progress-save-btn');
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }
    setStatus('');

    const { error } = await client.from(TABLE).insert(row);
    if (button) {
      button.disabled = false;
      button.textContent = 'Save check-in';
    }

    if (error) {
      console.warn('[progress] save failed', error);
      setStatus(error.message || 'Could not save this check-in.', true);
      return;
    }

    FIELDS.forEach((field) => {
      const input = document.getElementById('progress-' + field.key);
      if (input) input.value = '';
    });
    if (dateInput) dateInput.value = todayISO();
    setStatus('Check-in saved.');
    toast('Progress check-in saved.');
    await loadCheckins();
  }

  function bindForm() {
    const form = document.getElementById('progress-form');
    const dateInput = document.getElementById('progress-date');
    const signIn = document.getElementById('progress-open-signin');
    if (dateInput && !dateInput.value) dateInput.value = todayISO();
    if (form && !form.dataset.bound) {
      form.dataset.bound = '1';
      form.addEventListener('submit', handleSubmit);
    }
    if (signIn && !signIn.dataset.bound) {
      signIn.dataset.bound = '1';
      signIn.addEventListener('click', () => {
        if (global.FFAuth) global.FFAuth.openAuthModal('signin');
      });
    }
  }

  async function initProgressPage() {
    bindForm();
    const user = global.FFAuth && global.FFAuth.getCurrentUser ? global.FFAuth.getCurrentUser() : null;
    showSignedIn(!!user);
    if (user) await loadCheckins();
    else {
      renderSummary([]);
      renderList([]);
    }
  }

  global.FFProgress = {
    initProgressPage,
    loadCheckins,
  };
})(window);
