/*
  Browser client setup for this static HTML app.
  SECURITY: Do not hardcode keys here. Inject at runtime:
    window.SUPABASE_URL
    window.SUPABASE_ANON_KEY
*/
(function initSupabaseClient() {
  const supabaseUrl = window.SUPABASE_URL;
  const supabaseAnonKey = window.SUPABASE_ANON_KEY;

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("Supabase SDK missing. Load CDN script before supabaseClient.js");
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey || !String(supabaseUrl).includes(".supabase.co")) {
    console.error("Supabase config missing/invalid. Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY");
    return;
  }

  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  console.log("Supabase client initialized (secure runtime config)");
})();
