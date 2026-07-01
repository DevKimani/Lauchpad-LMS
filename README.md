# NGO Learning Platform — Starter

A runnable foundation for a Canvas-style LMS: **React + Vite + Tailwind + Supabase**.
What's already built: email/password auth, three user roles (learner / instructor /
admin), role-aware dashboard, protected routing, and the full database schema with
Row Level Security. You grow the features (courses, quizzes, certificates) from here.

---

## Prerequisites

- **Node.js 18+** — check with `node -v`. Install from https://nodejs.org if needed.
- **A free Supabase account** — https://supabase.com
- **VSCode** — and an AI assistant extension (GitHub Copilot, or the Claude/Continue
  extension) so you can paste the phase prompts and have it write code into your files.

---

## Setup (about 10 minutes)

### 1. Open the project
Unzip this folder and open it in VSCode (`File -> Open Folder`).

### 2. Install dependencies
In the VSCode terminal (`Terminal -> New Terminal`):
```
npm install
```

### 3. Create your Supabase project
1. Go to https://supabase.com and create a new project (pick a strong database password and save it).
2. Wait ~2 minutes for it to provision.

### 4. Set up the database
1. In Supabase, open **SQL Editor -> New query**.
2. Open `supabase/schema.sql` from this project, copy ALL of it, paste, and click **Run**.
3. You should see "Success." This creates every table and turns on Row Level Security.

### 5. Create a storage bucket (for images/attachments)
In Supabase: **Storage -> New bucket** -> name it `course-files` -> make it public.

### 6. Connect the app to Supabase
1. In Supabase: **Project Settings -> API**. Copy the **Project URL** and the **anon public** key.
2. In this project, copy `.env.example` to a new file named `.env`.
3. Paste your two values in:
   ```
   VITE_SUPABASE_URL=https://yourproject.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### 7. Run it
```
npm run dev
```
Open the URL it prints (usually http://localhost:5173). Create an account — you'll
land on the learner dashboard.

### 8. Make yourself an admin (to test all roles)
In Supabase: **Table Editor -> profiles**, find your row, change `role` to `admin`,
save, then refresh the app.

---

## Verify Row Level Security is on
In Supabase **Table Editor**, each table should show an "RLS enabled" badge. If any
table is missing it, re-run `schema.sql`. This is the single most important security
check — don't skip it.

---

## How to build the rest

Use the phase prompts from your build kit. With an AI extension in VSCode, open the
relevant files and prompt it, for example:

> "Add a course catalog page at /courses that lists all published courses from the
> Supabase `courses` table as cards, and wire up a route in App.jsx. Match the
> existing Tailwind style (teal/sand palette, the Card component pattern in
> Dashboard.jsx)."

Build one feature, test it, commit to Git, then move to the next.

---

## Project structure
```
src/
  lib/supabase.js          Supabase client
  contexts/AuthContext.jsx Session + role state, sign in/up/out
  components/
    ProtectedRoute.jsx     Gates pages by login and role
    Layout.jsx             Header + nav shell
  pages/
    Login.jsx  Signup.jsx  Dashboard.jsx
  App.jsx                  Routes (add new ones here)
supabase/schema.sql        Run this in Supabase once
```

## Tips
- Connect to GitHub early (`git init`) so you have version history before you start changing things.
- When the AI assistant produces an error, paste the exact error back to it.
- Keep the `.env` file private — it's gitignored and should never be committed.
