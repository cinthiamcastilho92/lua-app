# Supabase Setup

1. Create a new project at https://supabase.com
2. Go to **SQL Editor** and run `schema.sql`
3. Copy your **Project URL** and **anon public key** from Project Settings → API
4. Paste them into `js/config.js`:
   ```js
   const SUPABASE_URL  = 'https://xxxx.supabase.co';
   const SUPABASE_ANON = 'eyJ...';
   ```
5. Generate a VAPID key pair for push notifications:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Paste the **public key** into `js/config.js` → `VAPID_PUBLIC_KEY`.
   Store the **private key** in your Edge Function environment variables.

6. Enable **Email** auth provider in Supabase Auth settings.
7. Set your site URL in Supabase Auth → URL Configuration.
