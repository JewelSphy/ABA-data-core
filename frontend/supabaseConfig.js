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
window.AUTH_REDIRECT_URL = "http://127.0.0.1:5503/index.html";

/*
  Java backend bridge — Calendar.java runs on this port.
  Set to empty string "" to disable and fall back to direct Supabase JS client.
*/
window.JAVA_SUPABASE_BRIDGE = "http://127.0.0.1:8788";
