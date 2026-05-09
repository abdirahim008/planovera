# DrawFlow Studio

DrawFlow Studio is a Next.js 14 engineering drawing workspace for:

- authenticated users
- user SVG import and admin-managed library publishing
- multi-sheet drawing packages
- Fabric.js canvas editing
- PDF export
- Vercel hosting with Supabase auth, database, and storage
- middleware-protected routes with cookie-based sessions

## Stack

- Next.js 14 App Router
- React 18
- Fabric.js 6
- jsPDF
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Tailwind CSS

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy `.env.example` to `.env.local`

3. Add your Supabase values

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. In Supabase, run the SQL in [supabase/schema.sql](./supabase/schema.sql)

5. Start the app

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Routes

- `/login`
  - public auth page
- `/`
  - protected drawing workspace

Route protection is enforced by [middleware.ts](./middleware.ts) and backed by Supabase SSR cookies.

## What the schema creates

- `profiles`
  - shared profile/auth metadata for the construction app and drawing module
- `drawing_projects`
  - stores saved drawing packages with sheet/page JSON
- `drawing_library_items`
  - stores published SVG drawings for the shared library
- `drawing-assets` storage bucket
  - reserved for future uploaded assets and generated exports

The schema also includes a migration-safe rename path from the earlier `projects` and `library_items` table names into the drawing-specific table names above.

New signups are created as `engineer` by default. Promote admins manually:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@company.com';
```

## Current workflow

### Engineers

- sign in with email/password
- open the canvas workspace
- draw from scratch with line, text, dimension, trim, and shape tools
- paste raw SVG and render it into the canvas for editing
- search the drawing library and insert reusable blocks
- save drawing projects to Supabase
- export drawing sheets to PDF

### Admins

- everything engineers can do
- publish approved raw SVG or current canvas content into the shared library

## Shared-backend integration

For merging this into your construction project management platform, the recommended setup is:

- one Supabase project shared by both apps
- one shared `profiles` table and Supabase Auth tenant
- drawing-specific domain tables such as `drawing_projects` and `drawing_library_items`

That keeps login credentials and user roles shared, while avoiding collisions with broader platform tables like construction `projects`.

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project into Vercel
3. Add these environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

For production use, Vercel Pro is the right next step once you move beyond personal trial use.

## Build check

```bash
npm run build
```

## Notes

- The app uses Supabase directly from the client with RLS policies protecting data access.
- Middleware now protects the main workspace route and redirects unauthenticated users to `/login`.
- Seed library content is still available in the UI so the workspace is useful immediately, even before admins publish their own drawings.
- Project save/load and role enforcement are now backed by Supabase instead of browser-local persistence.
- Raw SVG import is available to all signed-in users, while publishing to the shared library remains admin-only.
