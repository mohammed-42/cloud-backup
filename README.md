# Vaultline: Cloud Backup and Recovery System

A Cloud Computing mini project. Users sign up, back files up to private cloud storage,
keep every version of a file, and restore any older version.

- **Frontend:** React + Vite (JavaScript, plain CSS)
- **Cloud (Supabase):** Auth, Storage (object storage), PostgreSQL with Row Level Security
- **No separate backend:** the browser talks to Supabase with the official SDK. Writes that must be
  atomic (version numbers, restore, delete) run as Postgres functions.

## 1. Supabase setup (about 5 minutes)

1. Create a project at https://supabase.com/dashboard.
2. **Authentication -> Sign In / Providers -> Email:** switch **Confirm email** OFF (for the demo), save.
3. **SQL Editor -> New query:** paste the whole contents of `sql/schema.sql` and click **Run**.
   This creates the tables, security policies, functions and the private `backups` bucket.
4. (Optional) Paste `sql/verify_rls.sql` and run it to check the security setup.
5. **Project Settings -> API Keys** (or the **Connect** button): copy the **Project URL** and the
   **anon / publishable key**. Never use the `service_role` / secret key in this app.

## 2. Run locally

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env      # on Windows: copy .env.example .env
# open .env and paste your Supabase URL and publishable key
npm run dev
```

Open http://localhost:5173. Other commands:

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build locally
npm test          # unit tests for file validation (no Supabase needed)
```

## 3. Environment variables

| Variable | Meaning |
|----------|---------|
| `VITE_SUPABASE_URL` | Project URL, e.g. `https://abcd1234.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The anon / publishable key (safe for browsers) |

## 4. How it works

```
Browser (React)
   |  1. rpc start_upload   -> reserves version N, returns path  {user_id}/{backup_id}/vN
   |  2. storage.upload     -> file goes to the PRIVATE bucket "backups"
   |  3. rpc finalize_upload-> checks the file exists, marks it ready, makes it current
   v
Supabase: Auth (JWT)  +  Postgres (RLS)  +  Storage (private bucket + policies)
```

- **Versioning:** every upload gets a new unique path; nothing is ever overwritten (no storage UPDATE policy).
- **Restore:** moves the backup's `current_version` pointer to an older version. All versions stay.
- **Delete:** files are removed from Storage first, then the database rows.
- **Downloads:** short-lived (60 s) signed URLs. There are no public URLs.
- **Failed upload:** the reserved version is rolled back (`abort_upload`) so no half-saved records remain.

## 5. Security summary (for your viva)

- Row Level Security on both tables: users can only `select` their own rows.
- The user id always comes from `auth.uid()` inside the database, never from the browser.
- Storage policies require the first folder of each object path to equal the user's id, and uploads are
  only allowed to a path that was reserved for that user.
- The bucket is private, limited to 10 MB and to an allow-list of file types (checked by Supabase too,
  not only by React).
- Only the project URL and the publishable key are in the frontend.

## 6. Optional: deploy the frontend

Push the project to GitHub, then import it in Vercel or Netlify. Build command `npm run build`,
output directory `dist`, and add the two `VITE_` variables in the host's settings.
In Supabase -> Authentication -> URL Configuration, add your deployed site URL.

## 7. Limitations

- Maximum file size is 10 MB (free tier friendly). The upload bar is indeterminate because the
  standard Supabase upload call does not report real progress.
- Email confirmation is assumed OFF for the demo.
- If a browser crashes mid-upload, a "pending" row can remain. It is never shown in the app.
- Not tested here against a live Supabase project: run the checklist in `MANUAL_TESTS.md`.

## 8. Folder structure

```
cloud-backup/
  sql/schema.sql         tables, RLS, functions, bucket, storage policies
  sql/verify_rls.sql     checks for the security setup
  src/lib/               supabase client, backup operations, validation, formatting
  src/components/        Auth, Dashboard, VersionsPanel, ConfirmDialog
  tests/                 unit tests for validation
  MANUAL_TESTS.md        the acceptance test checklist
```
