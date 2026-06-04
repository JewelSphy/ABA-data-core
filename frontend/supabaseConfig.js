/*
  Runtime Supabase config (public values only).
  Keep this file local/private for your environment.
*/
window.SUPABASE_URL = "https://yeggyhhktgmruodnpnpk.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllZ2d5aGhrdGdtcnVvZG5wbnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDE1NjMsImV4cCI6MjA5MjcxNzU2M30.ZLv4FGd86SYV2YCVd4SH07M-9cSPMp02kuoaLm640Ew";

/*
  Where users should land after clicking verify-email.
  Leave blank: app uses the same folder as this page + /index.html (per machine).
  In Supabase -> Authentication -> URL Configuration, add that URL pattern, e.g.:
  http://127.0.0.1:5500/index.html  and  http://localhost:5500/index.html
  (or add a wildcard for local ports if your dashboard allows it)
*/
// Match the port you use to open the app (Live Server, etc.)
window.AUTH_REDIRECT_URL = (function () {
  if (typeof location === "undefined" || !location.origin || location.origin === "null") {
    return "http://127.0.0.1:5503/index.html";
  }
  var dir = location.pathname.replace(/[^/]*$/, "");
  return location.origin + dir + "index.html";
})();

/*
  Java/MySQL API bridge. Leave "" to use Supabase directly (no Render, no local Java).
  When you run ./backend/run-backend.sh, set: window.JAVA_SUPABASE_BRIDGE = "http://127.0.0.1:8788";
*/
window.JAVA_SUPABASE_BRIDGE = "";
window.JAVA_API_KEY = "";
window.GILBERTO_FORCE_SUPABASE_ONLY = true;
