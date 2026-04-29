// =============================================================================
// jvmSupabaseBridge.js
// Browser → Java bridge (Calendar.java on :8788) → Supabase PostgREST
// ALL Supabase operations route through here when the bridge is running.
// Load AFTER supabaseClient.js.
// =============================================================================

// ── Bridge availability ───────────────────────────────────────────────────────

function jvmSupabaseRelayEnabled () {
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
  init0 = init0 || {};
  var base = window.JAVA_SUPABASE_BRIDGE.replace (/\/$/, "");
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
      var isAbort = !!(e && (e.name === "AbortError"));
      if (attempt === 0 && method === "GET" && isAbort) {
        await sleep (700);
        continue;
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
  return jvmFetch ("/api/session-notes?session_id=eq." + encodeURIComponent (sessionId), { method: "GET" });
}

function sessionNoteJvmUpsert (rowObj) {
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
