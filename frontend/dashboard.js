/**
 * Post-login routing: onboarding -> dashboard. Sync with authFlow if split later.
 */
(function initGilbertoAuthFlow() {
  const STORAGE_KEY = "gilberto_onboarding_v1";
  const TABLE = "user_onboarding";

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  function writeStore(obj) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (_) { /* empty */ }
  }

  function getUserRecord(userId) {
    if (!userId) return null;
    return readStore()[userId] || null;
  }

  function isDoneLocally(userId) {
    const r = getUserRecord(userId);
    return !!(r && r.onboarding_completed);
  }

  function markCompleteLocal(userId, profile) {
    if (!userId) return;
    const store = readStore();
    store[userId] = {
      onboarding_completed: true,
      completed_at: new Date().toISOString(),
      profile: profile || {},
    };
    writeStore(store);
  }

  async function hasOrganizationMembership(supabase, userId) {
    if (!supabase || !userId) return false;
    try {
      const { data, error } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1);
      return !error && Array.isArray(data) && data.length > 0;
    } catch (_) {
      return false;
    }
  }

  async function hasIncompleteOnboardingDraft(supabase, userId) {
    if (!supabase || !userId) return false;
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("onboarding_completed")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return false;
      return data.onboarding_completed === false;
    } catch (_) {
      return false;
    }
  }

  async function isOnboardingComplete(supabase, userId) {
    if (!userId) return false;
    if (isDoneLocally(userId)) return true;
    if (!supabase) return false;
    if (await hasOrganizationMembership(supabase, userId)) return true;
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select("onboarding_completed")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return false;
      if (data.onboarding_completed) {
        markCompleteLocal(userId, { source: "supabase" });
        return true;
      }
    } catch (_) {
      /* table missing or RLS */
    }
    return false;
  }

  async function saveOnboardingRemote(supabase, userId, row) {
    if (!supabase || !userId) return { ok: false, reason: "no_client" };
    try {
      const payload = {
        user_id: userId,
        company_legal_name: row.company_legal_name || null,
        company_display_name: row.company_display_name || null,
        contact_first_name: row.contact_first_name || null,
        contact_last_name: row.contact_last_name || null,
        contact_name: row.contact_name || null,
        contact_email: row.contact_email || null,
        contact_phone: row.contact_phone || null,
        company_address: row.company_address || null,
        team_size: row.team_size || null,
        compliance_ack: !!row.compliance_ack,
        notes: row.notes || null,
        organization_id: row.organization_id || null,
        onboarding_completed: true,
        approval_status: "pending",
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "user_id" });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e?.message || "save_failed" };
    }
  }

  /** Save partial progress (e.g. after company or primary contact) without finishing onboarding. */
  function pickOnboardingRow(src) {
    if (!src || typeof src !== "object") return {};
    return {
      company_legal_name: src.company_legal_name,
      company_display_name: src.company_display_name,
      contact_first_name: src.contact_first_name,
      contact_last_name: src.contact_last_name,
      contact_name: src.contact_name,
      contact_email: src.contact_email,
      contact_phone: src.contact_phone,
      company_address: src.company_address,
      team_size: src.team_size,
      compliance_ack: src.compliance_ack,
      notes: src.notes,
      approval_status: src.approval_status,
      organization_id: src.organization_id,
    };
  }

  async function saveOnboardingDraft(supabase, userId, row) {
    if (!supabase || !userId) return { ok: false, reason: "no_client" };
    try {
      const { data: existing, error: readErr } = await supabase
        .from(TABLE)
        .select(
          "user_id, organization_id, company_legal_name, company_display_name, contact_first_name, contact_last_name, contact_name, contact_email, contact_phone, company_address, team_size, compliance_ack, notes, approval_status"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (readErr) return { ok: false, reason: readErr.message };

      const base = pickOnboardingRow(existing);
      const coalesce = (a, b) => (a != null && String(a).trim() !== "" ? a : b != null ? b : null);
      const merged = {
        user_id: userId,
        company_legal_name: coalesce(row.company_legal_name, base.company_legal_name),
        company_display_name: coalesce(row.company_display_name, base.company_display_name),
        contact_first_name: coalesce(row.contact_first_name, base.contact_first_name),
        contact_last_name: coalesce(row.contact_last_name, base.contact_last_name),
        contact_name: coalesce(row.contact_name, base.contact_name),
        contact_email: coalesce(row.contact_email, base.contact_email),
        contact_phone: coalesce(row.contact_phone, base.contact_phone),
        company_address: coalesce(row.company_address, base.company_address),
        team_size: coalesce(row.team_size, base.team_size),
        compliance_ack: base.compliance_ack != null ? !!base.compliance_ack : false,
        notes: coalesce(row.notes, base.notes),
        organization_id: row.organization_id || base.organization_id || null,
        onboarding_completed: false,
        approval_status: base.approval_status || "pending",
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from(TABLE).upsert(merged, { onConflict: "user_id" });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e?.message || "draft_save_failed" };
    }
  }

  async function goToAppAfterAuth() {
    if (!window.supabaseClient) {
      window.location.href = "dashboard.html";
      return;
    }
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error || !data?.session?.user) {
      window.location.href = "index.html";
      return;
    }
    const userId = data.session.user.id;
    const supa = window.supabaseClient;
    if (await isOnboardingComplete(supa, userId)) {
      window.location.href = "dashboard.html";
      return;
    }
    if (await hasIncompleteOnboardingDraft(supa, userId)) {
      window.location.href = "onboarding.html";
      return;
    }
    window.location.href = "workspace-setup.html";
  }

  window.gilbertoAuthFlow = {
    STORAGE_KEY,
    TABLE,
    isOnboardingComplete,
    hasOrganizationMembership,
    hasIncompleteOnboardingDraft,
    markCompleteLocal,
    saveOnboardingRemote,
    saveOnboardingDraft,
    getUserRecord,
    getCompanyDisplayName(userId) {
      const r = getUserRecord(userId);
      return r?.profile?.company_display_name || r?.profile?.company_legal_name || "";
    },
    goToAppAfterAuth,
  };
})();

// handles page navigation, called from every sidebar button
function goToPage(page) {
  window.location.href = page;
}

async function logout() {
  try {
    if (window.supabaseClient) {
      await window.supabaseClient.auth.signOut();
    }
    // Clear cached org so next login starts fresh
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith("gilberto_active_org:") || k.startsWith("gilberto_onboarding"))
        .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  } catch (_) {
    // noop; still redirect
  } finally {
    // lo=1 tells index.html to skip the auto-session-redirect check
    window.location.href = "index.html?lo=1";
  }
}

async function resolveCurrentUserIdentity() {
  const fallback = { id: "", email: "", fullName: "Current User", initial: "C" };
  try {
    if (!window.supabaseClient) {
      window.gilbertoCurrentUserId = "";
      window.gilbertoCurrentUserEmail = "";
      window.gilbertoCurrentUserName = fallback.fullName;
      window.gilbertoCurrentUserInitial = fallback.initial;
      return fallback;
    }
    const { data } = await window.supabaseClient.auth.getSession();
    const user = data?.session?.user || null;
    const userId = user?.id || "";
    const email = user?.email || "";
    const metaName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
    const localName = localStorage.getItem("gilberto_profile_name") || "";
    const fullName = (localName || metaName || email || fallback.fullName).trim();
    const initial = (fullName.charAt(0) || fallback.initial).toUpperCase();
    window.gilbertoCurrentUserId = userId;
    window.gilbertoCurrentUserEmail = email;
    window.gilbertoCurrentUserName = fullName;
    window.gilbertoCurrentUserInitial = initial;
    return { id: userId, email, fullName, initial };
  } catch (_) {
    window.gilbertoCurrentUserName = fallback.fullName;
    window.gilbertoCurrentUserInitial = fallback.initial;
    return fallback;
  }
}
window.resolveCurrentUserIdentity = resolveCurrentUserIdentity;

function applyUserIdentityPills() {
  const name = String(window.gilbertoCurrentUserName || "Current User");
  const initial = String(window.gilbertoCurrentUserInitial || name.charAt(0) || "C").toUpperCase();
  document.querySelectorAll(".user-pill").forEach((el) => {
    el.textContent = initial;
    el.title = name;
    el.setAttribute("aria-label", "Signed in as " + name);
  });
  document.querySelectorAll(".profile-badge").forEach((el) => {
    el.textContent = initial;
    el.title = name;
  });
  document.querySelectorAll(".profile-chip-text small").forEach((el) => {
    el.textContent = name;
  });
  document.querySelectorAll(".top-menu-item strong").forEach((el) => {
    const t = (el.textContent || "").trim();
    if (t.includes("Account") || t.startsWith("👤")) {
      el.textContent = "👤 " + initial + " Account";
    }
  });
}

// Sidebar collapse — injected on every page so we don't have to touch each html file
document.addEventListener('DOMContentLoaded', function () {
  applyAutoTheme();
  enhanceInteractivity();
  void enforceAuthGuard();
  void resolveCurrentUserIdentity().then(applyUserIdentityPills);
  window.addEventListener("gilberto-profile-updated", function () {
    void resolveCurrentUserIdentity().then(applyUserIdentityPills);
  });

  const layout  = document.querySelector('.app-layout');
  const sidebar = document.querySelector('.sidebar');
  if (!layout || !sidebar) {
    void applyWorkspaceWithOrg();
    maybeSetupToast();
    return;
  }

  // button sits fixed on the right edge of the sidebar
  const btn = document.createElement('button');
  btn.className = 'sidebar-collapse-btn';
  btn.title = 'Toggle sidebar';
  document.body.appendChild(btn);

  function applyState(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    btn.innerHTML = collapsed ? '&#8250;' : '&#8249;';
    btn.title     = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }

  // restore whatever state the user left it in
  applyState(localStorage.getItem('gilberto_sidebar') === 'collapsed');

  btn.addEventListener('click', function () {
    const collapsed = !document.body.classList.contains('sidebar-collapsed');
    applyState(collapsed);
    localStorage.setItem('gilberto_sidebar', collapsed ? 'collapsed' : 'expanded');
  });

  void applyWorkspaceWithOrg();
  maybeSetupToast();
});

/**
 * Resolves the signed-in user’s current company (blank dashboard = no rows yet, but this scopes data by org).
 * Later: add organization_id to clients, sessions, etc., and always filter with .eq('organization_id', window.gilbertoCurrentOrg.id).
 */
async function loadGilbertoOrganization() {
  window.gilbertoCurrentOrg = null;
  if (!window.supabaseClient) return null;
  try {
    const { data: s } = await window.supabaseClient.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return null;
    const key = "gilberto_active_org:" + uid;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.id) {
          window.gilbertoCurrentOrg = o;
          return o;
        }
      }
    } catch (_) {
      /* empty */
    }
    // Step 1: get org_id from membership (least restrictive query).
    const { data: mRows, error: mErr } = await window.supabaseClient
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", uid)
      .limit(1);
    if (mErr || !mRows || !mRows.length) return null;
    const orgId = mRows[0].organization_id;
    const role = mRows[0].role;
    if (!orgId) return null;

    // Step 2: best-effort fetch org display fields. If blocked by RLS, still keep org id.
    let org = null;
    try {
      const { data: oRows } = await window.supabaseClient
        .from("organizations")
        .select("id, company_display_name, company_legal_name, join_code")
        .eq("id", orgId)
        .limit(1);
      if (oRows && oRows.length) org = oRows[0];
    } catch (_) {
      /* keep minimal org object */
    }
    window.gilbertoCurrentOrg = {
      id: orgId,
      name: org && org.company_display_name ? org.company_display_name : "My Organization",
      company_legal_name: org ? org.company_legal_name : null,
      joinCode: org && org.join_code ? org.join_code : null,
      role: role || "member",
    };
    try {
      localStorage.setItem(key, JSON.stringify(window.gilbertoCurrentOrg));
    } catch (_) {
      /* empty */
    }
    return window.gilbertoCurrentOrg;
  } catch (_) {
    return null;
  }
}

async function applyWorkspaceWithOrg() {
  await loadGilbertoOrganization();

  // Preserve scroll position: async org injection can shift layout above,
  // which feels like a "refresh" when you're far down on chart-heavy pages.
  const scroller =
    document.querySelector("main.main-area") ||
    document.querySelector(".main-area") ||
    document.scrollingElement;
  const beforeTop = scroller ? scroller.scrollTop : 0;

  applyTopbarCompanyName();
  applyWorkspaceBanner();
  applyInviteTeamPanel();

  if (scroller && beforeTop > 40) {
    requestAnimationFrame(function () {
      // Only restore if the browser shifted us upward.
      if (scroller.scrollTop < beforeTop) scroller.scrollTop = beforeTop;
    });
  }
  // Fire page-specific data loaders after org is resolved
  void loadDashboardStats();
  void loadSessionsTable();
  // Re-render calendar now that org is available (first render fires before org loads)
  if (document.body.classList.contains('page-calendar') && typeof render === 'function') {
    void render();
  }
  if (document.body.classList.contains('page-clients') && typeof loadClientsTable === 'function') {
    void loadClientsTable();
  }
  if (document.body.classList.contains('page-staff') && typeof loadStaffTable === 'function') {
    void loadStaffTable();
  }
}

window.loadGilbertoOrganization = loadGilbertoOrganization;

function makeJoinCode8() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Owner/admin: show join code with Copy, or a button to generate one (older orgs may have none).
 */
function applyInviteTeamPanel() {
  // Only show on the main dashboard page
  if (!document.body.classList.contains("page-dashboard")) return;
  const main = document.querySelector("main.main-area");
  if (!main) return;
  const old = document.getElementById("gilbertoInvitePanel");
  if (old) old.remove();
  const o = window.gilbertoCurrentOrg;
  if (!o || !o.id) return;
  const isMgr = o.role === "owner" || o.role === "admin";
  if (!isMgr) return;

  const box = document.createElement("div");
  box.id = "gilbertoInvitePanel";
  box.className = "invite-team-panel";
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", "Invite team");
  if (o.joinCode) {
    box.innerHTML =
      "<div class=\"invite-team-header\"><strong>Invite your team</strong><span class=\"invite-team-hint\">New users sign in, choose “Join an existing company,” and enter this code. Same Supabase app — their account is tied to your organization only.</span></div>" +
      "<div class=\"invite-code-row\">" +
      "<code class=\"invite-code\" id=\"gilbertoJoinCodeDisplay\">" +
      o.joinCode +
      "</code> " +
      "<button type=\"button\" class=\"small-btn\" id=\"gilbertoCopyJoinCode\">Copy code</button>" +
      "</div>";
  } else {
    box.innerHTML =
      "<div class=\"invite-team-header\"><strong>Invite your team</strong><span class=\"invite-team-hint\">Generate a one-time style code (8 characters) to share. Teammates use it on the “Join an existing company” screen after they sign in.</span></div>" +
      "<p class=\"invite-no-code\">No join code for this company yet.</p>" +
      "<button type=\"button\" class=\"small-btn\" id=\"gilbertoGenJoinCode\">Generate join code</button>";
  }
  if (document.getElementById("workspaceBanner")) {
    document.getElementById("workspaceBanner").insertAdjacentElement("afterend", box);
  } else if (main.querySelector("header.topbar")) {
    main.querySelector("header.topbar").insertAdjacentElement("afterend", box);
  } else {
    main.insertBefore(box, main.firstChild);
  }

  document.getElementById("gilbertoCopyJoinCode")?.addEventListener("click", async function () {
    const btn = this;
    const t = o.joinCode || document.getElementById("gilbertoJoinCodeDisplay")?.textContent || "";
    try {
      await navigator.clipboard.writeText(t.trim());
      btn.textContent = "Copied!";
      setTimeout(function () {
        btn.textContent = "Copy code";
      }, 1800);
    } catch (_) {
      window.prompt("Copy this code:", t);
    }
  });

  document.getElementById("gilbertoGenJoinCode")?.addEventListener("click", async function () {
    if (!window.supabaseClient) return;
    this.disabled = true;
    let code = makeJoinCode8();
    let { error } = await window.supabaseClient
      .from("organizations")
      .update({ join_code: code, updated_at: new Date().toISOString() })
      .eq("id", o.id);
    if (error) {
      code = makeJoinCode8();
      ({ error } = await window.supabaseClient
        .from("organizations")
        .update({ join_code: code, updated_at: new Date().toISOString() })
        .eq("id", o.id));
    }
    if (error) {
      alert(error.message || "Could not save code");
      this.disabled = false;
      return;
    }
    window.gilbertoCurrentOrg = { ...o, joinCode: code };
    try {
      const { data: s } = await window.supabaseClient.auth.getSession();
      const uid = s?.session?.user?.id;
      if (uid) localStorage.setItem("gilberto_active_org:" + uid, JSON.stringify(window.gilbertoCurrentOrg));
    } catch (_) {
      /* empty */
    }
    await loadGilbertoOrganization();
    applyInviteTeamPanel();
    applyWorkspaceBanner();
  });
}

/**
 * Shows the current company name above the page title. Source: organization_members + organizations
 * for the signed-in user (see loadGilbertoOrganization).
 */
function applyTopbarCompanyName() {
  if (!window.gilbertoCurrentOrg?.name) {
    const existing = document.getElementById("topbarCompany");
    if (existing) existing.remove();
    return;
  }
  const block = document.querySelector("main .topbar > div:first-child");
  if (!block) return;
  let el = document.getElementById("topbarCompany");
  if (!el) {
    el = document.createElement("p");
    el.id = "topbarCompany";
    el.className = "topbar-company";
    el.setAttribute("aria-label", "Current company");
    const h1 = block.querySelector("h1");
    if (h1) block.insertBefore(el, h1);
    else block.insertBefore(el, block.firstChild);
  }
  el.textContent = window.gilbertoCurrentOrg.name;
  el.title = "Organization ID: " + window.gilbertoCurrentOrg.id;
}

function applyWorkspaceBanner() {
  const el = document.getElementById("workspaceBanner");
  if (!el || !window.gilbertoAuthFlow || !window.supabaseClient) return;
  void (async () => {
    try {
      const { data } = await window.supabaseClient.auth.getSession();
      const uid = data?.session?.user?.id;
      if (!uid) return;
      const name = window.gilbertoCurrentOrg?.name || window.gilbertoAuthFlow.getCompanyDisplayName(uid);
      if (name) {
        el.innerHTML =
          '<span class="wb-icon" aria-hidden="true">🏢</span>' +
          '<span class="wb-body">' +
            '<span class="wb-name">' + name + '</span>' +
            '<span class="wb-desc">Your dashboard is scoped to this company only. Owners can invite staff below.</span>' +
          '</span>';
        el.style.display = "flex";
      }
    } catch (_) {
      /* empty */
    }
  })();
}

function maybeSetupToast() {
  if (!new URLSearchParams(window.location.search).get("setup")) return;
  const t = document.createElement("div");
  t.style.cssText =
    "position:fixed;bottom:24px;right:24px;background:#1e3a2f;color:#e8f4ef;padding:12px 20px;border-radius:10px;font-size:13px;z-index:9999;max-width:380px;line-height:1.35;box-shadow:0 8px 28px rgba(0,0,0,0.2);";
  t.textContent = "Welcome! Your company profile was saved.";
  document.body.appendChild(t);
  setTimeout(function () {
    t.remove();
  }, 4000);
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete("setup");
    window.history.replaceState({}, document.title, u.toString());
  } catch (_) {
    /* empty */
  }
}

/* ============================================================
   DASHBOARD STATS — routes through Java bridge when available,
   falls back to direct Supabase JS client
   ============================================================ */
function clampStat(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * Documents: expired → missing initial uploads → expiring soon. Other actions: revisions (low tier).
 */
function applyActionRequiredDashboard(stats) {
  const docEx = clampStat(stats.documents_required_expired);
  const docMissing = clampStat(stats.missing_client_documents);
  const docSoon = clampStat(stats.documents_required_expiring_soon);
  const revPending = clampStat(stats.pending_revisions);

  const setCount = (id, n) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(n);
  };
  const setEmpty = (id, n, htmlOk, htmlWarn) => {
    const em = document.getElementById(id);
    if (!em) return;
    em.innerHTML = n <= 0 ? htmlOk : htmlWarn;
  };

  setCount("urgencyCountExpired", docEx);
  setEmpty(
    "urgencyEmptyExpired",
    docEx,
    "<span style=\"color:#9eb3a8;\">No expired required paperwork</span>",
    "<span style=\"color:#431407;\"><strong>" +
      docEx +
      "</strong> expired file(s). </span><a href=\"documents.html\">Open Documents</a>"
  );

  setCount("urgencyCountHigh", docMissing);
  setEmpty(
    "urgencyEmptyHigh",
    docMissing,
    "<span style=\"color:#9eb3a8;\">All active clients have initial uploads recorded</span>",
    "<span style=\"color:#431407;\"><strong>" +
      docMissing +
      "</strong> required slot(s) missing content (active clients). </span><a href=\"documents.html\">Upload / edit</a>"
  );

  setCount("urgencyCountMedium", docSoon);
  setEmpty(
    "urgencyEmptyMedium",
    docSoon,
    "<span style=\"color:#9eb3a8;\">Nothing expiring within 45 days</span>",
    "<span style=\"color:#92400e;\"><strong>" +
      docSoon +
      "</strong> renew soon (45 days). </span><a href=\"documents.html\">Review</a>"
  );

  setCount("urgencyCountLow", revPending);
  setEmpty(
    "urgencyEmptyLow",
    revPending,
    "<span style=\"color:#9eb3a8;\">No notes awaiting review</span>",
    "<span style=\"color:#154733;\"><strong>" +
      revPending +
      '</strong> session(s) need review. </span><a href="revisions.html">Revisions</a>'
  );

  const banner = document.getElementById("docComplianceBanner");
  if (!banner) return;
  const docTotal = docEx + docMissing + docSoon;
  if (docTotal <= 0) {
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }
  banner.style.display = "block";
  banner.className = "notice notice-warn";
  banner.innerHTML =
    "<strong>Document compliance (active clients)</strong> — Expired: " +
    docEx +
    ". Missing upload: " +
    docMissing +
    ". Expiring ≤45 days: " +
    docSoon +
    ". <a href=\"documents.html\" style=\"color:inherit;font-weight:700;text-decoration:underline;\">Documents</a>";
}

/** @deprecated Use applyActionRequiredDashboard — kept for safety if older HTML omits urgency grid */
function applyDocumentComplianceBanner(stats) {
  applyActionRequiredDashboard(stats);
}

async function loadDashboardStats() {
  if (!document.body.classList.contains("page-dashboard")) return;
  const org = window.gilbertoCurrentOrg;
  if (!org?.id) return;

  const orgId     = org.id;
  const today     = new Date().toISOString().slice(0, 10);
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })();
  const weekEnd   = (() => { const d = new Date(); d.setDate(d.getDate() + (6 - d.getDay())); return d.toISOString().slice(0, 10); })();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? "—"; };

  // ── Route through Java bridge (single aggregated call) ──────────────────
  if (typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled()) {
    try {
      if (typeof documentJvmEnsureOrgRequirements === "function") {
        await documentJvmEnsureOrgRequirements(orgId).catch(function () {
          /* non-fatal */
        });
      }
      const stats = await jvmLoadDashboardStats(orgId, today, weekStart, weekEnd);
      const clamp = v => (typeof v === "number" && v >= 0) ? v : 0;
      set("statActiveClients",    clamp(stats.active_clients));
      set("statSessionsToday",    clamp(stats.sessions_today));
      set("statPendingRevisions", clamp(stats.pending_revisions));
      set("statSessionsWeek",     clamp(stats.sessions_week));
      applyActionRequiredDashboard(stats);
      return;
    } catch (e) {
      console.warn("loadDashboardStats bridge error, falling back:", e);
    }
  }

  // ── Fallback: direct Supabase JS client ──────────────────────────────────
  if (!window.supabaseClient) return;
  try {
    const [clients, sessionsToday, pendingNotes, sessionsWeek] = await Promise.all([
      window.supabaseClient.from("clients").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active"),
      window.supabaseClient.from("sessions").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("session_date", today),
      window.supabaseClient.from("session_notes").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending_review"),
      window.supabaseClient.from("sessions").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("session_date", weekStart).lte("session_date", weekEnd),
    ]);
    set("statActiveClients",    clients.count);
    set("statSessionsToday",    sessionsToday.count);
    set("statPendingRevisions", pendingNotes.count);
    set("statSessionsWeek",     sessionsWeek.count);
  } catch (e) {
    console.warn("loadDashboardStats fallback error:", e);
  }
}

window.loadDashboardStats = loadDashboardStats;

/* ============================================================
   CALENDAR EVENTS — routes through Java bridge when available,
   falls back to direct Supabase JS client
   ============================================================ */
async function loadCalendarSessions(year, month) {
  const org = window.gilbertoCurrentOrg;
  if (!org?.id) return [];

  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay  = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  function mapRow(s) {
    return {
      id:            s.id,
      date:          s.session_date,
      type:          s.service_type,
      title:         formatServiceLabel(s.service_type),
      client:        s.clients ? `${s.clients.first_name} ${s.clients.last_name}` : null,
      staff:         s.staff   ? `${s.staff.first_name} ${s.staff.last_name}`     : null,
      startTime:     s.start_time     ? s.start_time.slice(0, 5)     : null,
      endTime:       s.end_time       ? s.end_time.slice(0, 5)       : null,
      status:        s.status,
      pos:           s.pos,
      procedureCode: s.procedure_code,
      notes:         s.notes,
    };
  }

  // ── Route through Java bridge ────────────────────────────────────────────
  if (typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled()) {
    try {
      const res = await jvmFetchSessionsForMonth(org.id, firstDay, lastDay);
      if (res.ok) {
        const data = await res.json();
        return (data || []).map(mapRow);
      }
    } catch (e) {
      console.warn("loadCalendarSessions bridge error, falling back:", e);
    }
  }

  // ── Fallback: direct Supabase JS client ──────────────────────────────────
  if (!window.supabaseClient) return [];
  try {
    const { data, error } = await window.supabaseClient
      .from("sessions")
      .select("id,service_type,session_date,start_time,end_time,status,pos,procedure_code,notes,clients(first_name,last_name),staff(first_name,last_name)")
      .eq("org_id", org.id)
      .gte("session_date", firstDay)
      .lte("session_date", lastDay)
      .order("session_date", { ascending: true })
      .order("start_time",   { ascending: true });
    if (error) { console.warn("loadCalendarSessions fallback error:", error); return []; }
    return (data || []).map(mapRow);
  } catch (e) {
    console.warn("loadCalendarSessions exception:", e);
    return [];
  }
}

function formatServiceLabel(type) {
  const map = {
    behavior_treatment: "Behavior Treatment",
    assessment:         "Assessment",
    supervision:        "Individual Supervision",
    family_training:    "Family Training",
    admin:              "Admin",
    caregiver_training: "Caregiver Training",
  };
  return map[type] || type;
}

window.loadCalendarSessions = loadCalendarSessions;

/* ============================================================
   SESSIONS PAGE — routes through Java bridge when available,
   falls back to direct Supabase JS client
   ============================================================ */
async function loadSessionsTable() {
  if (!document.body.classList.contains("page-sessions")) return;
  const org = window.gilbertoCurrentOrg;
  if (!org?.id) return;

  function buildRows(data) {
    const tbody = document.getElementById("sessionsBody");
    if (!tbody || !data?.length) return;
    tbody.innerHTML = data.map(s => {
      const client       = s.clients ? `${s.clients.first_name} ${s.clients.last_name}` : "—";
      const provider     = s.staff   ? `${s.staff.first_name} ${s.staff.last_name}`     : "—";
      const dateStr      = s.session_date
        ? new Date(s.session_date + "T00:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })
        : "—";
      const timeStr      = s.start_time && s.end_time
        ? `${fmtTime(s.start_time)} - ${fmtTime(s.end_time)}`
        : s.start_time ? fmtTime(s.start_time) : "—";
      const serviceClass = serviceToClass(s.service_type);
      const serviceLabel = formatServiceLabel(s.service_type);
      const badgeClass   = s.status === "complete" ? "badge-complete" : "badge-pending";
      return `<tr>
        <td><span class="service-pill ${serviceClass}">${serviceLabel}</span></td>
        <td>${client}</td>
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        <td>${s.pos || "—"}</td>
        <td>${s.procedure_code || "—"}</td>
        <td><span class="badge ${badgeClass}">${s.status || "—"}</span></td>
        <td>${provider}</td>
        <td>
          <button class="tbl-btn" onclick="openViewSession('${client}','${dateStr}','${serviceLabel}','${provider}','','${s.pos||""}','${s.status||""}')">View</button>
          <button class="tbl-btn" onclick="goToPage('behavior-treatment-session.html?session_id=${encodeURIComponent(s.id)}')">Open Note</button>
        </td>
      </tr>`;
    }).join("");
  }

  // ── Route through Java bridge ────────────────────────────────────────────
  if (typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled()) {
    try {
      const res = await jvmFetchSessionsTable(org.id, 200);
      if (res.ok) { buildRows(await res.json()); return; }
    } catch (e) {
      console.warn("loadSessionsTable bridge error, falling back:", e);
    }
  }

  // ── Fallback: direct Supabase JS client ──────────────────────────────────
  if (!window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient
      .from("sessions")
      .select("id,service_type,session_date,start_time,end_time,status,pos,procedure_code,notes,clients(first_name,last_name),staff(first_name,last_name)")
      .eq("org_id", org.id)
      .order("session_date", { ascending: false })
      .limit(200);
    if (!error) buildRows(data);
  } catch (e) {
    console.warn("loadSessionsTable fallback error:", e);
  }
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${ampm}`;
}

function serviceToClass(type) {
  const map = { behavior_treatment:"behavior", assessment:"assessment", supervision:"supervision", family_training:"family", admin:"admin", caregiver_training:"family" };
  return map[type] || "behavior";
}

window.loadSessionsTable = loadSessionsTable;

async function enforceAuthGuard() {
  const currentPage = (window.location.pathname.split("/").pop() || "").toLowerCase();
  if (!currentPage || currentPage === "index.html") return;
  // Pure MySQL / Java bridge mode: skip Supabase auth redirect guard.
  if (typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled()) return;
  if (!window.supabaseClient) return;

  try {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error || !data?.session?.user) {
      window.location.href = "index.html";
      return;
    }
    const userId = data.session.user.id;
    const flow = window.gilbertoAuthFlow;
    if (!flow) return;

    const done = await flow.isOnboardingComplete(window.supabaseClient, userId);
    const draft = await flow.hasIncompleteOnboardingDraft(window.supabaseClient, userId);

    if (done) {
      if (currentPage === "workspace-setup.html" || currentPage === "onboarding.html") {
        window.location.replace("dashboard.html");
      }
      return;
    }

    if (currentPage === "workspace-setup.html" || currentPage === "onboarding.html") {
      return;
    }

    if (draft) {
      window.location.replace("onboarding.html");
      return;
    }
    window.location.replace("workspace-setup.html");
  } catch (_) {
    window.location.href = "index.html";
  }
}

function applyAutoTheme() {
  const page = window.location.pathname.split('/').pop() || 'dashboard.html';
  const seed = Array.from(page).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const hue = seed % 360;
  const accent = `hsl(${hue} 78% 52%)`;
  const accentSoft = `hsl(${hue} 82% 95%)`;
  const accentDeep = `hsl(${hue} 64% 35%)`;

  document.body.classList.add('auto-theme');
  document.body.style.setProperty('--accent', accent);
  document.body.style.setProperty('--accent-soft', accentSoft);
  document.body.style.setProperty('--accent-deep', accentDeep);
}

function toggleTopMenu(event, menuId) {
  event.stopPropagation();
  const target = document.getElementById(menuId);
  if (!target) return;
  document.querySelectorAll('.top-menu.open').forEach((menu) => {
    if (menu !== target) menu.classList.remove('open');
  });
  target.classList.toggle('open');
}

document.addEventListener('click', function () {
  document.querySelectorAll('.top-menu.open').forEach((menu) => menu.classList.remove('open'));
});

function enhanceInteractivity() {
  const rippleTargets = document.querySelectorAll(
    '.small-btn, .add-btn, .icon-btn, .tbl-btn, .nav-item, .profile-chip, .user-pill'
  );
  rippleTargets.forEach((el) => el.classList.add('has-ripple'));

  const hoverTargets = document.querySelectorAll(
    '.cards .card, .section-box, .table-wrapper, .selection-card, .graph-card, .lib-card'
  );
  hoverTargets.forEach((el) => el.classList.add('interactive-surface'));

  document.addEventListener('click', function (e) {
    const target = e.target.closest('.has-ripple');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top = (e.clientY - rect.top) + 'px';
    target.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  });
}
