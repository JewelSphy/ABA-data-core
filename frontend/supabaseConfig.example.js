/*
  Copy this file to supabaseConfig.js and fill in values from:
  Supabase Dashboard → Project Settings → API

  Project URL  → SUPABASE_URL
  anon public  → SUPABASE_ANON_KEY
*/
window.SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
window.SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";

window.AUTH_REDIRECT_URL = (function () {
  if (typeof location === "undefined" || !location.origin || location.origin === "null") {
    return "http://127.0.0.1:5500/index.html";
  }
  var dir = location.pathname.replace(/[^/]*$/, "");
  return location.origin + dir + "index.html";
})();

/* Supabase-only (no Render / no local Java): */
window.JAVA_SUPABASE_BRIDGE = "";
window.JAVA_API_KEY = "";
