# Fittest Fleet

Static fitness community page with **Supabase Auth** (email/password) and **Realtime shared comments**.

Browse posts signed out. Sign in to post and encourage (like) others.

## Quick setup

### 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and create a project.
2. Wait until the project is ready.

### 2. Run the database schema

1. Open **SQL Editor** → **New query**.
2. Paste and run the contents of [`sql/schema.sql`](sql/schema.sql).
3. Confirm the `comments` table exists under **Table Editor**.

### 3. Enable Email auth

1. Open **Authentication** → **Providers** → **Email**.
2. Ensure Email is enabled.
3. For local demos you can turn **off** “Confirm email” so sign-up signs you in immediately. For production, leave confirmation on.

### 4. Add your API keys

1. Open **Project Settings** → **API**.
2. Copy **Project URL** and the **anon public** key.
3. Edit [`js/config.js`](js/config.js) (or copy `js/config.example.js` → `js/config.js`):

```js
window.SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
window.SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

`js/config.js` is gitignored so real keys are not committed. Placeholders ship in the repo copy for local editing.

### 5. Open the site

- Double-open `index.html` in a browser, **or**
- Serve statically from this folder, e.g.:

```bash
npx serve .
# or: python3 -m http.server 8080
```

Sign up with email/password, then post in the Community Hub. Open another browser/incognito window to see live updates.

## Optional: GitHub Pages

1. Push this repo to GitHub.
2. Enable **Pages** from the `main` branch (root).
3. Keep secrets out of git: set keys via a private fork workflow, or instruct contributors to fill `js/config.js` locally (Pages cannot safely hold private secrets; the anon key is public by design with RLS).

## Auth + comments flow

| Action | Who | What happens |
|--------|-----|--------------|
| View comments | Anyone | `SELECT` on `comments` (public RLS) |
| Sign up / Sign in | Visitor | Supabase Auth email/password; display name stored in `user_metadata` |
| Post | Authenticated | `INSERT` with `user_id = auth.uid()` |
| Encourage (like) | Authenticated | `UPDATE` increments `likes` |
| Live updates | Anyone | Realtime subscription on `INSERT` / `UPDATE` / `DELETE` |

## Project layout

```
index.html            — page UI (Tailwind CDN + Font Awesome)
css/brand.css         — T352 brand guide CSS
js/config.example.js  — placeholder keys (committed)
js/config.js          — your keys (gitignored; placeholders for local demo)
js/supabase-client.js — creates the Supabase client
js/auth.js            — sign up / sign in / sign out + header UI
js/comments.js        — fetch, post, likes, filters, realtime
sql/schema.sql        — table + RLS + realtime publication
```

## Migrating from localStorage

The original page stored comments in `localStorage` under `ruanFitnessComments`. That path is removed. Old local comments are not imported automatically; start fresh in Supabase (or insert seed rows manually in the Table Editor).

## Notes

- Use only the **anon** key in the browser. Never put the **service_role** key in frontend code.
- Categories: `Weight Loss` | `Exercise` | `Nutritional Discipline` | `General`.
