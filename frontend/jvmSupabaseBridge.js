// =============================================================================
// jvmSupabaseBridge.js
// Browser → Java bridge (optional) → Supabase / MySQL
// Load AFTER supabaseClient.js.
// =============================================================================

// Strip deactivated Render URLs (cached supabaseConfig.js may still point here).
(function gilbertoSanitizeBridgeConfig () {
  var b = String (window.JAVA_SUPABASE_BRIDGE || "").trim ();
  if (/onrender\.com/i.test (b)) {
    console.warn ("[gilberto] Render bridge removed — using Supabase.");
    window.JAVA_SUPABASE_BRIDGE = "";
  }
}) ();

/** If JAVA_SUPABASE_BRIDGE is set but /health fails, fall back to Supabase for this page load. */
async function gilbertoNormalizeJavaBridge () {
  window.JAVA_SUPABASE_BRIDGE = "";
  if (window.GILBERTO_FORCE_SUPABASE_ONLY) return;
  var b = String (window.JAVA_SUPABASE_BRIDGE || "").trim ();
  if (!b) return;
  try {
    var base = b.replace (/\/$/, "");
    var ctrl = typeof AbortController !== "undefined" ? new AbortController () : null;
    var timer = ctrl ? setTimeout (function () { ctrl.abort (); }, 2500) : null;
    var req = { method: "GET", mode: "cors", credentials: "omit" };
    if (ctrl) req.signal = ctrl.signal;
    var res = await fetch (base + "/health", req);
    if (timer) clearTimeout (timer);
    if (!res.ok) throw new Error ("health " + res.status);
  } catch (e) {
    console.warn ("[gilberto] Java bridge unreachable, using Supabase:", b, e);
    window.JAVA_SUPABASE_BRIDGE = "";
  }
}
window.gilbertoNormalizeJavaBridge = gilbertoNormalizeJavaBridge;

// ── Bridge availability ───────────────────────────────────────────────────────

function jvmSupabaseRelayEnabled () {
  if (window.GILBERTO_FORCE_SUPABASE_ONLY) return false;
  return (
    typeof window.JAVA_SUPABASE_BRIDGE === "string" &&
    window.JAVA_SUPABASE_BRIDGE.trim ().length > 0
  );
}

// ── Request headers (pure Java/MySQL path) ───────────────────────────────────

async function jvmHeaders () {
  var h = { Accept: "application/json" };
  if (window.JAVA_API_KEY && String(window.JAVA_API_KEY).trim()) {
    h["x-api-key"] = String(window.JAVA_API_KEY).trim();
  }
  if (window.gilbertoCurrentUserId && String(window.gilbertoCurrentUserId).trim()) {
    h["x-user-id"] = String(window.gilbertoCurrentUserId).trim();
  }
  if (window.gilbertoCurrentUserName && String(window.gilbertoCurrentUserName).trim()) {
    h["x-user-name"] = String(window.gilbertoCurrentUserName).trim();
  }
  return h;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function jvmFetch (relPath, init0) {
  if (window.GILBERTO_FORCE_SUPABASE_ONLY) {
    throw new Error ("Java API is off — data saves use Supabase only. Hard-refresh (Cmd+Shift+R).");
  }
  init0 = init0 || {};
  var base = String (window.JAVA_SUPABASE_BRIDGE || "").replace (/\/$/, "");
  if (!base) {
    throw new Error ("Java API URL not configured. Use Supabase (see supabaseConfig.js).");
  }
  var method = (init0.method || "GET").toUpperCase();
  var timeoutMs = Number(window.JAVA_API_TIMEOUT_MS || 15000);

  async function once () {
    var hdr = await jvmHeaders ();
    Object.assign (hdr, init0.headers || {});
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { controller.abort (); }, timeoutMs);
    }
    var req = { method: init0.method || "GET", headers: hdr, mode: "cors", credentials: "omit" };
    if (init0.body !== undefined) req.body = init0.body;
    if (controller) req.signal = controller.signal;
    try {
      return await fetch (base + relPath, req);
    } finally {
      if (timer) clearTimeout (timer);
    }
  }

  function canRetryStatus (status) {
    return status === 502 || status === 503 || status === 504;
  }

  function sleep (ms) {
    return new Promise (function (resolve) { setTimeout (resolve, ms); });
  }

  // Render free tier can cold-start and briefly return 502/503.
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var res = await once ();
      if (attempt === 0 && method === "GET" && canRetryStatus (res.status)) {
        await sleep (700);
        continue;
      }
      return res;
    } catch (e) {
      var msg = e && e.message ? String (e.message) : "";
      var isAbort = !!(e && (e.name === "AbortError" || /abort/i.test (msg)));
      if (attempt === 0 && method === "GET" && isAbort) {
        await sleep (700);
        continue;
      }
      if (isAbort) {
        throw new Error (
          "Backend request timed out after " + timeoutMs + "ms. Start the Java API (./backend/run-backend.sh) at " + base
          + ", or set window.JAVA_SUPABASE_BRIDGE = \"\" in supabaseConfig.js to use Supabase only."
        );
      }
      throw e;
    }
  }
  return once ();
}

// ── Generic table helpers ─────────────────────────────────────────────────────

// Build a PostgREST query string from a plain object of filters
// e.g. { org_id: "eq.xxx", status: "eq.active" } → "org_id=eq.xxx&status=eq.active"
function jvmBuildQuery (filters, extra) {
  var parts = [];
  if (filters) {
    Object.keys (filters).forEach (function (k) {
      parts.push (encodeURIComponent (k) + "=" + encodeURIComponent (filters[k]));
    });
  }
  if (extra) parts.push (extra);
  return parts.length ? "?" + parts.join ("&") : "";
}

// SELECT rows from any table
async function jvmSelect (table, selectCols, filters, extra) {
  var qs = jvmBuildQuery (filters, extra);
  var path = "/api/" + table + (qs || "");
  if (selectCols) {
    var sep = qs ? "&" : "?";
    path = "/api/" + table + (qs || "") + (qs ? "&" : "?") + "select=" + encodeURIComponent (selectCols);
    // rebuild properly
    var base2 = "/api/" + table + "?select=" + encodeURIComponent (selectCols);
    if (filters) {
      Object.keys (filters).forEach (function (k) {
        base2 += "&" + encodeURIComponent (k) + "=" + encodeURIComponent (filters[k]);
      });
    }
    if (extra) base2 += "&" + extra;
    path = base2;
  }
  return jvmFetch (path, { method: "GET" });
}

// ── Dashboard stats (single aggregated call to Java) ─────────────────────────

async function jvmLoadDashboardStats (orgId, today, weekStart, weekEnd) {
  var path = "/api/dashboard-stats"
    + "?org_id="     + encodeURIComponent (orgId)
    + "&today="      + encodeURIComponent (today)
    + "&week_start=" + encodeURIComponent (weekStart)
    + "&week_end="   + encodeURIComponent (weekEnd);
  var res = await jvmFetch (path, { method: "GET" });
  if (!res.ok) throw new Error ("dashboard-stats failed: " + res.status);
  return res.json (); // includes missing_client_documents when backend supports it
}

function documentJvmEnsureOrgRequirements (orgId) {
  if (!orgId) return Promise.resolve (null);
  return jvmFetch ("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify ({
      action: "ensure_organization_requirements",
      org_id: orgId
    })
  });
}

/** Save new document OR update existing row (pass id). */
function documentJvmUpsert (rowObj) {
  return jvmFetch ("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify (rowObj || {})
  });
}

// ── Session-specific helpers ──────────────────────────────────────────────────

// Fetch sessions for a date range with client + staff names embedded
async function jvmFetchSessionsForMonth (orgId, firstDay, lastDay) {
  var select = "id,service_type,session_date,start_time,end_time,status,pos,procedure_code,notes,clients(first_name,last_name),staff(first_name,last_name)";
  var path   = "/api/sessions"
    + "?select="        + encodeURIComponent (select)
    + "&session_date=gte." + encodeURIComponent (firstDay)
    + "&session_date=lte." + encodeURIComponent (lastDay)
    + "&order=session_date.asc,start_time.asc";
  if (orgId) path += "&org_id=eq." + encodeURIComponent (orgId);
  return jvmFetch (path, { method: "GET" });
}

// Fetch recent sessions for the sessions table
async function jvmFetchSessionsTable (orgId, limit) {
  limit = limit || 200;
  var select = "id,service_type,session_date,start_time,end_time,status,pos,procedure_code,notes,clients(first_name,last_name),staff(first_name,last_name)";
  var path   = "/api/sessions"
    + "?select="    + encodeURIComponent (select)
    + "&order=session_date.desc"
    + "&limit="     + limit;
  if (orgId) path += "&org_id=eq." + encodeURIComponent (orgId);
  return jvmFetch (path, { method: "GET" });
}

// Session row builder — matches actual DB schema columns
function buildSessionInsertRow (payload, orgId) {
  var r = {
    service_type:   payload.service_type   || null,
    session_date:   payload.session_date   || null,
    start_time:     payload.start_time     || null,
    end_time:       payload.end_time       || null,
    pos:            payload.pos            || null,
    procedure_code: payload.procedure_code || null,
    notes:          payload.notes          || null,
    status:         payload.status         || "pending",
  };
  if (orgId)             r.org_id    = orgId;
  if (payload.client_id) r.client_id = payload.client_id;
  if (payload.staff_id)  r.staff_id  = payload.staff_id;
  return r;
}

// POST — create a new session
async function sessionJvmCreate (rowObj) {
  return jvmFetch ("/api/sessions", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body:    JSON.stringify (rowObj),
  });
}

// GET — one session by UUID
function sessionJvmFetchById (sessionId) {
  return jvmFetch ("/api/sessions?id=eq." + encodeURIComponent (sessionId), { method: "GET" });
}

// PATCH — partial update
function sessionJvmPatch (sessionId, patchObj, extraHeaders) {
  var h = Object.assign (
    { "Content-Type": "application/json", Prefer: "return=minimal" },
    extraHeaders || {}
  );
  return jvmFetch (
    "/api/sessions?id=eq." + encodeURIComponent (sessionId),
    { method: "PATCH", headers: h, body: JSON.stringify (patchObj || {}) }
  );
}

// DELETE — remove by UUID
function sessionJvmDelete (sessionId) {
  return jvmFetch ("/api/sessions?id=eq." + encodeURIComponent (sessionId), { method: "DELETE" });
}

// ── Session note helpers ──────────────────────────────────────────────────────
function sessionNoteJvmFetchBySessionId (sessionId) {
  if (!(typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled())) {
    return window.gilbertoSupabaseFetchSessionNotes ({ sessionId: sessionId });
  }
  return jvmFetch ("/api/session-notes?session_id=eq." + encodeURIComponent (sessionId), { method: "GET" });
}

function sessionNoteJvmUpsert (rowObj) {
  if (!(typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled())) {
    return window.gilbertoSupabaseUpsertSessionNote (rowObj);
  }
  return jvmFetch ("/api/session-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify (rowObj || {})
  });
}

// ── Profile helpers ───────────────────────────────────────────────────────────
function profileJvmFetch (orgId, userKey) {
  return jvmFetch (
    "/api/profile?org_id=eq." + encodeURIComponent (orgId) + "&user_key=eq." + encodeURIComponent (userKey),
    { method: "GET" }
  );
}

function profileJvmUpsert (rowObj) {
  return jvmFetch ("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify (rowObj || {})
  });
}

// ── Client helpers ────────────────────────────────────────────────────────────

// Standard select — embeds assigned RBT + BCBA names in one query
var CLIENT_SELECT = [
  "id", "first_name", "last_name", "date_of_birth", "diagnosis",
  "assigned_rbt_id", "assigned_bcba_id", "insurance_provider",
  "email", "phone", "auth_status", "notes", "status",
  "rbt:staff!assigned_rbt_id(id,first_name,last_name)",
  "bcba:staff!assigned_bcba_id(id,first_name,last_name)"
].join (",");

// GET — all clients for an org, ordered by last name
async function jvmFetchClients (orgId, statusFilter) {
  var path = "/api/clients"
    + "?select="    + encodeURIComponent (CLIENT_SELECT)
    + "&order=last_name.asc,first_name.asc";
  if (orgId) path += "&org_id=eq." + encodeURIComponent (orgId);
  if (statusFilter) path += "&status=eq." + encodeURIComponent (statusFilter);
  return jvmFetch (path, { method: "GET" });
}

// GET — one client by UUID
function jvmFetchClientById (clientId) {
  return jvmFetch (
    "/api/clients?id=eq." + encodeURIComponent (clientId) +
    "&select=" + encodeURIComponent (CLIENT_SELECT),
    { method: "GET" }
  );
}

// GET — aggregated active / inactive / discharged counts for one org
async function jvmLoadClientStats (orgId) {
  var res = await jvmFetch (
    "/api/client-stats?org_id=" + encodeURIComponent (orgId),
    { method: "GET" }
  );
  if (!res.ok) throw new Error ("client-stats failed: " + res.status);
  return res.json ();
}

// Build insert / patch row matching actual DB columns
function buildClientInsertRow (payload, orgId) {
  var r = {
    first_name:         payload.first_name         || null,
    last_name:          payload.last_name          || null,
    date_of_birth:      payload.date_of_birth      || null,
    diagnosis:          payload.diagnosis          || null,
    insurance_provider: payload.insurance_provider || null,
    email:              payload.email              || null,
    phone:              payload.phone              || null,
    auth_status:        payload.auth_status        || "active",
    notes:              payload.notes              || null,
    status:             payload.status             || "active",
  };
  if (orgId)                    r.org_id           = orgId;
  if (payload.assigned_rbt_id)  r.assigned_rbt_id  = payload.assigned_rbt_id;
  if (payload.assigned_bcba_id) r.assigned_bcba_id = payload.assigned_bcba_id;
  return r;
}

// POST — create a new client
async function clientJvmCreate (rowObj) {
  return jvmFetch ("/api/clients", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body:    JSON.stringify (rowObj),
  });
}

// PATCH — partial update by UUID
function clientJvmPatch (clientId, patchObj) {
  return jvmFetch ("/api/clients?id=eq." + encodeURIComponent (clientId), {
    method:  "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body:    JSON.stringify (patchObj || {}),
  });
}

// DELETE — remove by UUID
function clientJvmDelete (clientId) {
  return jvmFetch ("/api/clients?id=eq." + encodeURIComponent (clientId), { method: "DELETE" });
}

// ── Staff helpers ─────────────────────────────────────────────────────────────

var STAFF_SELECT = "id,first_name,last_name,role,email,phone,status";

// GET — all staff for an org
async function jvmFetchStaff (orgId, statusFilter) {
  var path = "/api/staff"
    + "?select="    + encodeURIComponent (STAFF_SELECT)
    + "&order=last_name.asc,first_name.asc";
  if (orgId) path += "&org_id=eq." + encodeURIComponent (orgId);
  if (statusFilter) path += "&status=eq." + encodeURIComponent (statusFilter);
  return jvmFetch (path, { method: "GET" });
}

// ── Caregiver helpers ─────────────────────────────────────────────────────────
var CAREGIVER_SELECT = "id,client_id,first_name,last_name,relationship,email,phone,notes,status,client:clients(first_name,last_name)";

async function jvmFetchCaregivers (orgId, statusFilter) {
  var path = "/api/caregivers"
    + "?select=" + encodeURIComponent ( CAREGIVER_SELECT )
    + "&order=last_name.asc,first_name.asc";
  if (orgId) path += "&org_id=eq." + encodeURIComponent (orgId);
  if (statusFilter) path += "&status=eq." + encodeURIComponent (statusFilter);
  return jvmFetch (path, { method: "GET" });
}

// Build insert row for staff
function buildStaffInsertRow (payload, orgId) {
  var r = {
    first_name: payload.first_name || null,
    last_name:  payload.last_name  || null,
    role:       payload.role       || null,
    email:      payload.email      || null,
    phone:      payload.phone      || null,
    status:     payload.status     || "active",
  };
  if (orgId) r.org_id = orgId;
  return r;
}

// POST — create a new staff member
async function staffJvmCreate (rowObj) {
  return jvmFetch ("/api/staff", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body:    JSON.stringify (rowObj),
  });
}

// PATCH — partial update
function staffJvmPatch (staffId, patchObj) {
  return jvmFetch ("/api/staff?id=eq." + encodeURIComponent (staffId), {
    method:  "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body:    JSON.stringify (patchObj || {}),
  });
}

// DELETE — remove by UUID
function staffJvmDelete (staffId) {
  return jvmFetch ("/api/staff?id=eq." + encodeURIComponent (staffId), { method: "DELETE" });
}

function caregiverJvmDelete (caregiverId) {
  return jvmFetch ("/api/caregivers?id=eq." + encodeURIComponent (caregiverId), { method: "DELETE" });
}

// ── Provider helpers ──────────────────────────────────────────────────────────
function providerJvmFetch (orgId) {
  var path = "/api/providers";
  if (orgId) path += "?org_id=eq." + encodeURIComponent (orgId);
  return jvmFetch (path, { method: "GET" });
}

function providerJvmCreate (rowObj) {
  return jvmFetch ("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify (rowObj || {})
  });
}

function providerJvmDelete (providerId) {
  return jvmFetch ("/api/providers?id=eq." + encodeURIComponent (providerId), { method: "DELETE" });
}

// ── Document helpers ──────────────────────────────────────────────────────────
function documentJvmFetch (orgId, providerId) {
  var path = "/api/documents";
  var qs = [];
  if (orgId) qs.push ("org_id=eq." + encodeURIComponent (orgId));
  if (providerId) qs.push ("provider_id=eq." + encodeURIComponent (providerId));
  if (qs.length) path += "?" + qs.join ("&");
  return jvmFetch (path, { method: "GET" });
}

/** Full row including attachment_base64 (use id + org_id for scoped lookup). */
function documentJvmFetchById (orgId, docId) {
  var path = "/api/documents?id=eq." + encodeURIComponent (docId || "");
  if (orgId) path += "&org_id=eq." + encodeURIComponent (orgId);
  return jvmFetch (path, { method: "GET" });
}

function documentJvmCreate (rowObj) {
  return documentJvmUpsert (rowObj);
}

function documentJvmDelete (docId) {
  return jvmFetch ("/api/documents?id=eq." + encodeURIComponent (docId), { method: "DELETE" });
}

// ── Error parser ──────────────────────────────────────────────────────────────

async function readJvmErrorResponse (pr) {
  try {
    var t = await pr.text ();
    if (!t) return pr.status + " " + pr.statusText;
    try {
      var j = JSON.parse (t);
      if (j.message) return j.message;
      if (j.error && typeof j.error === "string") return j.error;
      if (j.hint)  return j.hint;
    } catch (_) {}
    return t.length > 220 ? t.slice (0, 220) + "…" : t;
  } catch (_) {
    return pr.status + " " + pr.statusText;
  }
}

// ── Supabase-only data helpers (saves never wait on Render/Java) ──────────────
(function gilbertoSupabaseDataHelpers () {
  if (window.GILBERTO_FORCE_SUPABASE_ONLY == null) {
    window.GILBERTO_FORCE_SUPABASE_ONLY = true;
  }

  function emptyFk (v) {
    return v === "" || v === undefined ? null : v;
  }

  window.gilbertoEnsureSupabaseDataMode = async function () {
    window.JAVA_SUPABASE_BRIDGE = "";
    window.GILBERTO_FORCE_SUPABASE_ONLY = true;
    /* Never probe Java /health — that caused "signal is aborted" errors. */
  };

  window.gilbertoUseJavaBridge = function () {
    if (window.GILBERTO_FORCE_SUPABASE_ONLY) return false;
    return jvmSupabaseRelayEnabled ();
  };

  function responseLike (ok, payload, message) {
    return {
      ok: ok,
      status: ok ? 200 : 500,
      statusText: ok ? "OK" : "Supabase error",
      json: async function () { return payload; },
      text: async function () { return message || JSON.stringify (payload || {}); },
    };
  }

  function normalizeSessionNoteStatus (status) {
    var s = String (status || "draft").trim ().toLowerCase ().replace (/-/g, "_");
    if (s === "submitted" || s === "pending" || s === "caregiver_signed") return "pending_review";
    if (s === "approved" || s === "rejected" || s === "draft" || s === "pending_review") return s;
    return "pending_review";
  }

  function mapSupabaseSessionNote (row) {
    row = row || {};
    var session = row.sessions || row.session || null;
    var client = row.clients || row.client || (session && (session.clients || session.client)) || null;
    return Object.assign ({}, row, {
      progress_note: row.progress_note || row.note_text || "",
      note_text: row.note_text || row.progress_note || "",
      submitted_by: row.submitted_by || row.rbt_signed_by || row.created_by || "",
      submitted_at: row.submitted_at || row.created_at || row.updated_at || "",
      session_date: row.session_date || (session && session.session_date) || "",
      service_type: row.service_type || (session && session.service_type) || "",
      client: client || null,
    });
  }

  async function selectSessionNotesWithFallback (supabase, orgId, sessionId) {
    var query = supabase
      .from ("session_notes")
      .select ("*, clients(first_name,last_name), sessions(session_date,service_type,clients(first_name,last_name),staff(first_name,last_name))");
    if (orgId) query = query.eq ("org_id", orgId);
    if (sessionId) query = query.eq ("session_id", sessionId);
    query = query.order ("updated_at", { ascending: false });
    var res = await query;
    if (!res.error) return res;

    query = supabase.from ("session_notes").select ("*");
    if (orgId) query = query.eq ("org_id", orgId);
    if (sessionId) query = query.eq ("session_id", sessionId);
    return query.order ("updated_at", { ascending: false });
  }

  window.gilbertoSupabaseFetchSessionNotes = async function (opts) {
    opts = opts || {};
    if (!window.supabaseClient) return responseLike (false, [], "Supabase is not initialized.");
    try {
      var org = opts.orgId ? { id: opts.orgId } : await window.ensureGilbertoOrgReady ();
      var orgId = org && org.id ? org.id : "";
      var res = await selectSessionNotesWithFallback (window.supabaseClient, orgId, opts.sessionId || "");
      if (res.error) return responseLike (false, [], window.gilbertoFormatDbError (res.error));
      return responseLike (true, (res.data || []).map (mapSupabaseSessionNote));
    } catch (e) {
      return responseLike (false, [], e && e.message ? e.message : String (e));
    }
  };

  window.gilbertoSupabaseUpsertSessionNote = async function (payload) {
    if (!window.supabaseClient) return responseLike (false, null, "Supabase is not initialized.");
    payload = payload || {};
    try {
      var org = payload.org_id ? { id: payload.org_id } : await window.ensureGilbertoOrgReady ();
      var orgId = org && org.id ? org.id : null;
      var sessionId = payload.session_id || null;
      if (!orgId) return responseLike (false, null, "Choose or join a workspace before saving notes.");

      var existing = null;
      if (sessionId) {
        var found = await window.supabaseClient
          .from ("session_notes")
          .select ("id")
          .eq ("org_id", orgId)
          .eq ("session_id", sessionId)
          .maybeSingle ();
        if (!found.error && found.data) existing = found.data;
      }

      var noteText = payload.progress_note || payload.note_text || null;
      var compact = {
        org_id: orgId,
        session_id: sessionId,
        status: normalizeSessionNoteStatus (payload.status),
        note_text: noteText,
        updated_at: new Date ().toISOString (),
      };

      var modern = Object.assign ({}, compact, {
        progress_note: noteText,
        similarity_percent: payload.similarity_percent == null ? null : payload.similarity_percent,
        supervision_required: !!payload.supervision_required,
        rbt_signed_by: payload.rbt_signed_by || null,
        rbt_signed_at: payload.rbt_signed_at || null,
        supervisor_signed_by: payload.supervisor_signed_by || null,
        supervisor_signed_at: payload.supervisor_signed_at || null,
        submitted_by: payload.submitted_by || null,
        submitted_at: payload.submitted_at || new Date ().toISOString (),
      });

      var attempts = [modern, compact];
      var lastErr = null;
      for (var i = 0; i < attempts.length; i++) {
        var q = existing
          ? window.supabaseClient.from ("session_notes").update (attempts[i]).eq ("id", existing.id)
          : window.supabaseClient.from ("session_notes").insert (attempts[i]);
        var res = await q.select ("id").maybeSingle ();
        if (!res.error) return responseLike (true, res.data || {});
        lastErr = res.error;
        if (!isSchemaColumnErr (res.error)) break;
      }
      return responseLike (false, null, window.gilbertoFormatDbError (lastErr));
    } catch (e) {
      return responseLike (false, null, e && e.message ? e.message : String (e));
    }
  };

  window.clientPayloadForSupabase = function (payload) {
    var row = {};
    var keys = [
      "org_id", "first_name", "last_name", "date_of_birth", "diagnosis",
      "assigned_rbt_id", "assigned_bcba_id", "insurance_provider",
      "email", "phone", "auth_status", "notes", "status"
    ];
    keys.forEach (function (k) {
      if (payload[k] !== undefined) row[k] = payload[k];
    });
    row.assigned_rbt_id = emptyFk (row.assigned_rbt_id);
    row.assigned_bcba_id = emptyFk (row.assigned_bcba_id);
    if (row.date_of_birth) row.dob = row.date_of_birth;
    return row;
  };

  function isSchemaColumnErr (err) {
    var m = String ((err && err.message) || "");
    return /column|schema|date_of_birth|Could not find/i.test (m);
  }

  window.gilbertoSupabaseInsertClient = async function (supabase, row) {
    var base = clientPayloadForSupabase (row);
    var tries = [base];
    var slim = Object.assign ({}, base);
    delete slim.date_of_birth;
    if (slim.dob) tries.push (slim);
    tries.push ({
      org_id: base.org_id,
      first_name: base.first_name,
      last_name: base.last_name,
      status: base.status || "active",
    });

    var lastErr = null;
    for (var i = 0; i < tries.length; i++) {
      var res = await supabase.from ("clients").insert (tries[i]).select ("id").single ();
      if (!res.error) return res;
      lastErr = res.error;
      if (!isSchemaColumnErr (res.error)) break;
    }
    throw lastErr || new Error ("Could not save client");
  };

  window.gilbertoSupabaseUpdateClient = async function (supabase, clientId, patch) {
    var base = clientPayloadForSupabase (patch);
    var tries = [base];
    var slim = Object.assign ({}, base);
    delete slim.date_of_birth;
    if (slim.dob) tries.push (slim);

    var lastErr = null;
    for (var i = 0; i < tries.length; i++) {
      var res = await supabase.from ("clients").update (tries[i]).eq ("id", clientId);
      if (!res.error) return res;
      lastErr = res.error;
      if (!isSchemaColumnErr (res.error)) break;
    }
    throw lastErr || new Error ("Could not update client");
  };

  window.gilbertoFormatDbError = function (err) {
    if (!err) return "Unknown error";
    var parts = [err.message || String (err)];
    if (err.code) parts.push ("(" + err.code + ")");
    if (err.details) parts.push (err.details);
    if (err.hint) parts.push (err.hint);
    if (/row-level security|permission denied|42501/i.test (parts.join (" "))) {
      parts.push ("Run security/supabase-clients-staff-fix.sql in Supabase and confirm you joined a workspace.");
    }
    return parts.join (" ");
  };

  window.gilbertoLoadAuthProfile = async function (supabase, userId) {
    if (!supabase || !userId) return null;
    try {
      var res = await supabase.from ("profiles").select ("id,email,full_name").eq ("id", userId).maybeSingle ();
      if (!res.error && res.data) return res.data;
    } catch (_) {}
    return null;
  };

  window.repairOrgMembershipIfNeeded = async function (orgId) {
    if (!window.supabaseClient || !orgId) return;
    try {
      var sess = await window.supabaseClient.auth.getSession ();
      var uid = sess.data && sess.data.session && sess.data.session.user ? sess.data.session.user.id : "";
      if (!uid) return;
      var mem = await window.supabaseClient.from ("organization_members")
        .select ("organization_id")
        .eq ("organization_id", orgId)
        .eq ("user_id", uid)
        .maybeSingle ();
      if (!mem.error && mem.data) return;
      var orgRow = await window.supabaseClient.from ("organizations")
        .select ("id,created_by")
        .eq ("id", orgId)
        .maybeSingle ();
      if (!orgRow.error && orgRow.data && orgRow.data.created_by === uid) {
        await window.supabaseClient.from ("organization_members").insert ({
          organization_id: orgId,
          user_id: uid,
          role: "owner",
        });
      }
    } catch (_) {}
  };

  window.ensureGilbertoOrgReady = async function () {
    if (!window.supabaseClient) return null;
    if (typeof loadGilbertoOrganization === "function") {
      try { await loadGilbertoOrganization (); } catch (_) {}
    }
    var org = window.gilbertoCurrentOrg;
    if (org && org.id) {
      await window.repairOrgMembershipIfNeeded (org.id);
      return org;
    }
    try {
      var sess = await window.supabaseClient.auth.getSession ();
      var uid = sess.data && sess.data.session && sess.data.session.user ? sess.data.session.user.id : "";
      if (!uid) return null;
      var ob = await window.supabaseClient.from ("user_onboarding")
        .select ("organization_id, company_display_name")
        .eq ("user_id", uid)
        .maybeSingle ();
      if (!ob.error && ob.data && ob.data.organization_id) {
        org = {
          id: ob.data.organization_id,
          name: ob.data.company_display_name || "My Organization",
          joinCode: null,
          role: "owner",
        };
        window.gilbertoCurrentOrg = org;
        try { localStorage.setItem ("gilberto_active_org:" + uid, JSON.stringify (org)); } catch (_) {}
        await window.repairOrgMembershipIfNeeded (org.id);
        return org;
      }
      if (typeof window.gilbertoFetchOrgMembershipsForUser === "function") {
        var mems = await window.gilbertoFetchOrgMembershipsForUser (window.supabaseClient, uid);
        if (Array.isArray (mems) && mems.length > 1) {
          window.location.href = "company-picker.html";
          return null;
        }
        if (mems.length === 1 && mems[0].organization_id) {
          var o = mems[0].organizations || {};
          org = {
            id: mems[0].organization_id,
            name: o.company_display_name || "My Organization",
            joinCode: null,
            role: mems[0].role || "member",
          };
          window.gilbertoCurrentOrg = org;
          try { localStorage.setItem ("gilberto_active_org:" + uid, JSON.stringify (org)); } catch (_) {}
          return org;
        }
      }
    } catch (_) {}
    return null;
  };

  window.gilbertoSaveAuthProfile = async function (supabase, userId, fields) {
    if (!supabase || !userId) throw new Error ("Not signed in");
    var fullName = (fields.full_name || "").trim ();
    var email = (fields.email || "").trim ();
    var row = {
      id: userId,
      full_name: fullName || null,
      email: email || null,
      updated_at: new Date ().toISOString (),
    };
    var up = await supabase.from ("profiles").upsert (row, { onConflict: "id" });
    if (up.error) throw up.error;
    var authUp = await supabase.auth.updateUser ({
      data: {
        full_name: fullName,
        role_title: fields.role_title || "",
        phone: fields.phone || "",
        bio: fields.bio || "",
      },
    });
    if (authUp.error) throw authUp.error;
    return { fullName: fullName, email: email };
  };
}) ();
