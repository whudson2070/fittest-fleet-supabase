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
3. Also run [`sql/profiles-and-avatars.sql`](sql/profiles-and-avatars.sql) (profiles table + Storage `avatars` bucket policies). If you already ran an older `schema.sql`, this migration alone is enough for profiles.
4. Confirm the `comments` and `profiles` tables exist under **Table Editor**, and that Storage has a public **avatars** bucket.
5. Run [`sql/get-member-count.sql`](sql/get-member-count.sql) so the hero can show the live count of registered accounts (`public.get_member_count()`, anon-safe). Until that function exists, the hero says “Members strong” with no number.

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
| Profile / avatar | Authenticated | Upsert own `profiles` row; upload only to `avatars/{uid}/…` |

## Profiles & avatars

Signed-in users can open **Profile** (header name / mobile menu) to:

1. Upload an image. A crop step lets you drag and zoom so the photo fits the circular avatar, then saves a 512×512 JPEG (not the original) to Supabase Storage bucket `avatars` at `{user_id}/avatar.jpg`
2. Or pick a preset SVG under [`assets/avatars/`](assets/avatars/) (presets skip cropping)

Choices persist in `public.profiles` (`avatar_url`, optional `display_name`). Avatars appear in the header and on community comments. The hero stack shows up to three random accounts whose `avatar_url` is a custom upload (anything that is not a preset under `assets/avatars/`). Fewer than three uploads leaves the remaining circles empty; a failed query leaves all three empty. No extra SQL is required — profiles are already anon-readable.

**SQL Will must run:** [`sql/profiles-and-avatars.sql`](sql/profiles-and-avatars.sql) in the Supabase SQL Editor (creates `profiles`, trigger, grants/RLS, and Storage bucket + policies). Fresh installs can use updated [`sql/schema.sql`](sql/schema.sql) plus the storage section in the profiles migration.

## Project layout

```
index.html                 — main page UI
profile.html               — profile / avatar editor (login required to edit)
assets/avatars/            — preset SVG avatars
css/brand.css              — T352 brand guide CSS
js/config.js               — Supabase URL + anon key (do not commit service_role)
js/supabase-client.js      — creates the Supabase client
js/auth.js                 — sign up / sign in / sign out + header UI
js/profile.js              — profile load/save, upload, presets
js/comments.js             — fetch, post, likes, filters, realtime (+ profile avatars)
js/hero-avatars.js         — random custom uploads in the hero avatar stack
sql/schema.sql             — comments + profiles schema, RLS, realtime
sql/profiles-and-avatars.sql — profiles + Storage avatars bucket/policies (run this)
sql/fix-*.sql             — prior grant / replica identity fixes
```

## Migrating from localStorage

The original page stored comments in `localStorage` under `t352FitnessComments`. That path is removed. Old local comments are not imported automatically; start fresh in Supabase (or insert seed rows manually in the Table Editor).

## Notes

- Use only the **anon** key in the browser. Never put the **service_role** key in frontend code.
- Categories: `Weight Loss` | `Exercise` | `Nutritional Discipline` | `General`.
