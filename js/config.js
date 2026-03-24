/* =====================================================
   Lua — Supabase Config
   Replace with your actual project URL and anon key.
   These values are safe to expose in the frontend.
   ===================================================== */
const SUPABASE_URL  = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_KEY';

// Loaded from CDN in each HTML page via:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
// Initialise once and expose globally.

// Guard: script is loaded before the CDN bundle in some pages — defer init
function getSupabase() {
  if (!window._supabaseClient) {
    if (typeof supabase === 'undefined') {
      console.error('Supabase JS not loaded yet.');
      return null;
    }
    window._supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
  return window._supabaseClient;
}

// VAPID public key for web push (generate your own with web-push CLI)
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY';
