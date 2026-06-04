/**
 * After `join_organization` succeeds: sync onboarding row, active org, and clear join intent.
 * Used by workspace-setup and post-login auto-join so invite codes always land on that company’s dashboard.
 */
async function gilbertoCompleteOrganizationJoin(supabase, userId, orgId) {
  if (!supabase || !userId || !orgId) return { ok: false, reason: "bad_args" };
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, company_display_name, company_legal_name")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr || !org) return { ok: false, reason: "org_load" };

  const { error: upErr } = await supabase.from("user_onboarding").upsert(
    {
      user_id: userId,
      organization_id: orgId,
      company_display_name: org.company_display_name,
      company_legal_name: org.company_legal_name,
      onboarding_completed: true,
      approval_status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  try {
    await supabase.auth.refreshSession();
  } catch (_) {
    /* non-fatal */
  }

  const profile = {
    company_display_name: org.company_display_name,
    company_legal_name: org.company_legal_name,
    organization_id: orgId,
    approval_status: "pending",
  };
  if (window.gilbertoAuthFlow) {
    window.gilbertoAuthFlow.markCompleteLocal(userId, profile);
  }

  try {
    sessionStorage.removeItem("gilberto_after_auth_join");
    sessionStorage.removeItem("gilberto_join_code_prefill");
    sessionStorage.removeItem("gilberto_auto_join_code");
    sessionStorage.removeItem("gilberto_join_from_link");
    sessionStorage.removeItem("gilberto_wants_create");
    localStorage.setItem(
      "gilberto_active_org:" + userId,
      JSON.stringify({
        id: orgId,
        name: org.company_display_name,
        company_legal_name: org.company_legal_name,
      })
    );
  } catch (_) {
    /* empty */
  }

  return { ok: true, profileUpsertError: upErr || null };
}

window.gilbertoCompleteOrganizationJoin = gilbertoCompleteOrganizationJoin;

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
    let wantsJoinCompany = false;
    try {
      wantsJoinCompany = sessionStorage.getItem("gilberto_after_auth_join") === "1";
    } catch (_) {
      /* empty */
    }

    let autoJoinCode = null;
    try {
      autoJoinCode = sessionStorage.getItem("gilberto_auto_join_code");
    } catch (_) {
      /* empty */
    }
    if (autoJoinCode) {
      const norm = String(autoJoinCode).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      if (norm.length >= 4) {
        const { data: joinedOrgId, error: joinRpcErr } = await supa.rpc("join_organization", {
          p_code: norm,
        });
        if (!joinRpcErr && joinedOrgId) {
          const fin = await gilbertoCompleteOrganizationJoin(supa, userId, joinedOrgId);
          if (fin && fin.ok) {
            window.location.replace("dashboard.html?setup=1");
            return;
          }
        }
        try {
          sessionStorage.removeItem("gilberto_auto_join_code");
        } catch (_) {
          /* empty */
        }
      }
    }

    /* Invite / join flow must run for everyone (including Java bridge mode). Previously gated on
     * !bridgeMode, so users never reached the join screen. Also run before onboarding draft so
     * join-with-code wins over partial onboarding rows. */
    if (wantsJoinCompany) {
      try {
        sessionStorage.removeItem("gilberto_after_auth_join");
      } catch (_) {
        /* empty */
      }
      window.location.href = "workspace-setup.html?join=1";
      return;
    }

    if (await isOnboardingComplete(supa, userId)) {
      if (typeof window.gilbertoShouldOpenCompanyPickerAfterAuth === "function") {
        const needPicker = await window.gilbertoShouldOpenCompanyPickerAfterAuth(supa, userId);
        if (needPicker) {
          window.location.href = "company-picker.html";
          return;
        }
      }
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

function gilbertoCurrentPageFile() {
  return (window.location.pathname.split("/").pop() || "").toLowerCase();
}

function gilbertoIsOrgPickerPage() {
  return gilbertoCurrentPageFile() === "company-picker.html";
}

/**
 * Every organization_members row for this user (supports multiple companies per login).
 */
async function gilbertoFetchOrgMembershipsForUser(client, uid) {
  if (!client || !uid) return [];
  try {
    const { data, error } = await client
      .from("organization_members")
      .select(
        "organization_id, role, organizations ( id, company_display_name, company_legal_name, join_code )"
      )
      .eq("user_id", uid);
    if (!error && Array.isArray(data) && data.length) return data;
  } catch (_) {
    /* fall back */
  }
  try {
    const { data: m2, error: e2 } = await client
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", uid);
    if (e2 || !Array.isArray(m2) || !m2.length) return [];
    const ids = [...new Set(m2.map((x) => x.organization_id).filter(Boolean))];
    const { data: orgRows } = await client
      .from("organizations")
      .select("id, company_display_name, company_legal_name, join_code")
      .in("id", ids);
    const omap = {};
    (orgRows || []).forEach(function (o) {
      if (o && o.id) omap[o.id] = o;
    });
    return m2.map(function (m) {
      return {
        organization_id: m.organization_id,
        role: m.role,
        organizations: omap[m.organization_id] || null,
      };
    });
  } catch (_) {
    return [];
  }
}

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
    let cloudName = "";
    if (userId && typeof window.gilbertoLoadAuthProfile === "function") {
      try {
        const prof = await window.gilbertoLoadAuthProfile(window.supabaseClient, userId);
        cloudName = (prof && prof.full_name) ? String(prof.full_name).trim() : "";
      } catch (_) {
        /* empty */
      }
    }
    const fullName = (cloudName || localName || metaName || email || fallback.fullName).trim();
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
  document.querySelectorAll(".profile-chip-text strong").forEach((el) => {
    el.textContent = "Account";
  });
  document.querySelectorAll(".profile-menu-name").forEach((el) => {
    el.textContent = name;
  });
}

// Sidebar collapse — injected on every page so we don't have to touch each html file
document.addEventListener('DOMContentLoaded', function () {
  window.addEventListener("gilberto-profile-updated", function () {
    void resolveCurrentUserIdentity().then(applyUserIdentityPills);
  });

  void (async function gilbertoBootShell() {
    applyAutoTheme();
    enhanceInteractivity();

    const bootPage = gilbertoCurrentPageFile();
    const supabaseOnlyPage =
      document.body.classList.contains("page-clients") ||
      document.body.classList.contains("page-staff") ||
      document.body.classList.contains("page-authorizations");
    if (supabaseOnlyPage) {
      window.JAVA_SUPABASE_BRIDGE = "";
      window.GILBERTO_FORCE_SUPABASE_ONLY = true;
    } else if (typeof gilbertoEnsureSupabaseDataMode === "function") {
      await gilbertoEnsureSupabaseDataMode();
    } else if (typeof gilbertoNormalizeJavaBridge === "function") {
      await gilbertoNormalizeJavaBridge();
    }

    if (bootPage === "company-picker.html") {
      await enforceAuthGuard();
      await resolveCurrentUserIdentity();
      applyUserIdentityPills();
      maybeSetupToast();
      return;
    }

    await enforceAuthGuard();

    await resolveCurrentUserIdentity();
    applyUserIdentityPills();

    const layout = document.querySelector(".app-layout");
    const sidebar = document.querySelector(".sidebar");
    if (!layout || !sidebar) {
      await applyWorkspaceWithOrg();
      gilbertoInjectSwitchCompanyMenuItem();
      gilbertoInjectTopBarWorkspaceNavIfNeeded();
      maybeSetupToast();
      return;
    }

    const btn = document.createElement("button");
    btn.className = "sidebar-collapse-btn";
    btn.title = "Toggle sidebar";
    document.body.appendChild(btn);

    function applyState(collapsed) {
      document.body.classList.toggle("sidebar-collapsed", collapsed);
      btn.innerHTML = collapsed ? "&#8250;" : "&#8249;";
      btn.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
    }

    applyState(localStorage.getItem("gilberto_sidebar") === "collapsed");

    btn.addEventListener("click", function () {
      const collapsed = !document.body.classList.contains("sidebar-collapsed");
      applyState(collapsed);
      localStorage.setItem("gilberto_sidebar", collapsed ? "collapsed" : "expanded");
    });

    await applyWorkspaceWithOrg();
    gilbertoInjectSwitchCompanyMenuItem();
    gilbertoInjectTopBarWorkspaceNavIfNeeded();
    maybeSetupToast();
  })();
});

/**
 * Resolves the signed-in user’s current company (blank dashboard = no rows yet, but this scopes data by org).
 * Later: add organization_id to clients, sessions, etc., and always filter with .eq('organization_id', window.gilbertoCurrentOrg.id).
 */
async function loadGilbertoOrganization() {
  const prevSnap =
    window.gilbertoCurrentOrg &&
    typeof window.gilbertoCurrentOrg.id === "string" &&
    window.gilbertoCurrentOrg.id.length > 30
      ? { ...window.gilbertoCurrentOrg }
      : null;

  function normalizeOrgShape(o, roleFallback) {
    if (!o || !o.id) return null;
    const rf = roleFallback || o.role || "member";
    return {
      id: o.id,
      name: (o.name && String(o.name).trim()) ? o.name : "My Organization",
      company_legal_name: o.company_legal_name != null ? o.company_legal_name : null,
      joinCode: o.joinCode != null ? o.joinCode : null,
      role: rf || "member",
    };
  }

  function readCachedOrgLs(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const o = JSON.parse(raw);
      return normalizeOrgShape(o, "member");
    } catch (_) {
      return null;
    }
  }

  async function resolveSignedInUserId(client) {
    const { data: s } = await client.auth.getSession();
    let uid = s?.session?.user?.id;
    if (uid) return uid;
    try {
      const { data: gu } = await client.auth.getUser();
      uid = gu?.user?.id || null;
      if (uid) return uid;
    } catch (_) {
      /* empty */
    }
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 120));
      const { data: s2 } = await client.auth.getSession();
      uid = s2?.session?.user?.id || null;
      if (uid) return uid;
    }
    return null;
  }

  /** When membership/onboarding lookups hiccup, any row visible under org RLS exposes org_id. */
  async function inferOrgIdFromTenantTables(client) {
    try {
      const { data: cRows, error: cErr } = await client
        .from("clients")
        .select("org_id")
        .not("org_id", "is", null)
        .limit(1);
      if (!cErr && Array.isArray(cRows) && cRows[0]?.org_id) return cRows[0].org_id;
    } catch (_) {
      /* empty */
    }
    try {
      const { data: sRows, error: sErr } = await client
        .from("staff")
        .select("org_id")
        .not("org_id", "is", null)
        .limit(1);
      if (!sErr && Array.isArray(sRows) && sRows[0]?.org_id) return sRows[0].org_id;
    } catch (_) {
      /* empty */
    }
    return null;
  }

  if (!window.supabaseClient) {
    if (prevSnap) window.gilbertoCurrentOrg = prevSnap;
    return prevSnap;
  }

  try {
    const uid = await resolveSignedInUserId(window.supabaseClient);
    const key = uid ? "gilberto_active_org:" + uid : null;

    let provisional = key ? readCachedOrgLs(key) : null;
    if (!provisional && prevSnap) provisional = normalizeOrgShape(prevSnap, prevSnap.role);
    if (provisional?.id) {
      window.gilbertoCurrentOrg = provisional;
    }

    if (!uid || !key) {
      return window.gilbertoCurrentOrg || null;
    }

    let orgId = null;
    let role = provisional?.role || "member";
    let chosenMember = null;
    let memberships = [];

    try {
      memberships = await gilbertoFetchOrgMembershipsForUser(window.supabaseClient, uid);
    } catch (_) {
      memberships = [];
    }

    if (memberships.length > 0) {
      const prefId = provisional?.id || null;
      const byId = {};
      memberships.forEach(function (m) {
        if (m && m.organization_id) byId[m.organization_id] = m;
      });

      if (prefId && byId[prefId]) {
        chosenMember = byId[prefId];
      } else if (memberships.length === 1) {
        chosenMember = memberships[0];
      } else if (memberships.length > 1) {
        if (!gilbertoIsOrgPickerPage()) {
          window.location.replace("company-picker.html");
          return null;
        }
        return null;
      }

      if (chosenMember) {
        orgId = chosenMember.organization_id || null;
        role = chosenMember.role || role || "member";
      }
    }

    if (!orgId) {
      try {
        const { data: onb } = await window.supabaseClient
          .from("user_onboarding")
          .select("organization_id, company_display_name, company_legal_name")
          .eq("user_id", uid)
          .limit(1)
          .maybeSingle();
        if (onb?.organization_id) {
          orgId = onb.organization_id;
          const merged = normalizeOrgShape(
            {
              id: orgId,
              name: onb.company_display_name || provisional?.name,
              company_legal_name: onb.company_legal_name ?? provisional?.company_legal_name ?? null,
              joinCode: provisional?.joinCode ?? null,
            },
            role
          );
          window.gilbertoCurrentOrg = merged;
          try {
            localStorage.setItem(key, JSON.stringify(window.gilbertoCurrentOrg));
          } catch (_) {}
        }
      } catch (_) {
        /* empty */
      }
    }

    if (!orgId && memberships.length === 0) {
      orgId = await inferOrgIdFromTenantTables(window.supabaseClient);
    }

    if (!orgId) {
      if (window.gilbertoCurrentOrg?.id) {
        return window.gilbertoCurrentOrg;
      }
      return null;
    }

    role = provisional?.role && provisional.id === orgId ? provisional.role : role;

    let org =
      chosenMember && chosenMember.organizations ? chosenMember.organizations : null;
    if (!org && orgId) {
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
    }

    window.gilbertoCurrentOrg = normalizeOrgShape(
      {
        id: orgId,
        name: org && org.company_display_name ? org.company_display_name : provisional?.name,
        company_legal_name: org ? org.company_legal_name : provisional?.company_legal_name ?? null,
        joinCode:
          org && org.join_code
            ? org.join_code
            : provisional?.joinCode != null
              ? provisional.joinCode
              : null,
      },
      role || "member"
    );

    try {
      localStorage.setItem(key, JSON.stringify(window.gilbertoCurrentOrg));
    } catch (_) {}

    return window.gilbertoCurrentOrg;
  } catch (_) {
    if (window.gilbertoCurrentOrg?.id) {
      return window.gilbertoCurrentOrg;
    }
    if (prevSnap?.id) {
      window.gilbertoCurrentOrg = prevSnap;
      return prevSnap;
    }
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
  await applyInviteTeamPanel();

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
  if (document.body.classList.contains('page-authorizations') && typeof loadAuthorizationsTable === 'function') {
    void loadAuthorizationsTable();
  }
}

window.loadGilbertoOrganization = loadGilbertoOrganization;

/**
 * Behavior-plan tables store rows in localStorage per org (`prefix:<orgId>`).
 * Rows saved before org resolution used `prefix:no-org`; after login the id becomes a UUID,
 * so the old bucket looked empty. Migrate legacy keys into the current scope once.
 */
function gilbertoScopedStorageKey(prefix) {
  const id =
    window.gilbertoCurrentOrg && window.gilbertoCurrentOrg.id
      ? window.gilbertoCurrentOrg.id
      : "no-org";
  return prefix + ":" + id;
}

function gilbertoLoadScopedRows(prefix) {
  const key = gilbertoScopedStorageKey(prefix);
  let rows = [];
  try {
    rows = JSON.parse(localStorage.getItem(key) || "[]");
  } catch (_) {
    rows = [];
  }
  if (!Array.isArray(rows)) rows = [];
  if (rows.length > 0) return rows;

  const legacyKeys = [prefix + ":no-org", prefix];
  for (let i = 0; i < legacyKeys.length; i += 1) {
    const lk = legacyKeys[i];
    if (lk === key) continue;
    try {
      const raw = localStorage.getItem(lk);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
      localStorage.setItem(key, JSON.stringify(parsed));
      localStorage.removeItem(lk);
      return parsed;
    } catch (_) {
      /* empty */
    }
  }
  return [];
}

function gilbertoSaveScopedRows(prefix, rows) {
  localStorage.setItem(gilbertoScopedStorageKey(prefix), JSON.stringify(rows));
}

window.gilbertoScopedStorageKey = gilbertoScopedStorageKey;
window.gilbertoLoadScopedRows = gilbertoLoadScopedRows;
window.gilbertoSaveScopedRows = gilbertoSaveScopedRows;

async function gilbertoShouldOpenCompanyPickerAfterAuth(client, uid) {
  if (typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled()) {
    return false;
  }
  if (!client || !uid) return false;
  const rows = await gilbertoFetchOrgMembershipsForUser(client, uid);
  if (!Array.isArray(rows) || rows.length < 2) return false;
  const key = "gilberto_active_org:" + uid;
  let prefId = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const o = JSON.parse(raw);
      prefId = o && o.id ? o.id : null;
    }
  } catch (_) {}
  if (!prefId) return true;
  return !rows.some((r) => r.organization_id === prefId);
}

window.gilbertoFetchOrgMembershipsForUser = gilbertoFetchOrgMembershipsForUser;
window.gilbertoShouldOpenCompanyPickerAfterAuth = gilbertoShouldOpenCompanyPickerAfterAuth;

function gilbertoInjectSwitchCompanyMenuItem() {
  if (typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled()) return;
  if (!window.supabaseClient) return;
  document.querySelectorAll(".top-actions .menu-wrap").forEach(function (wrap) {
    const chip = wrap.querySelector(".profile-chip");
    const menu = wrap.querySelector(".top-menu");
    if (!chip || !menu || menu.dataset.gilbertoSwitchInjected === "1") return;
    const looksProfile =
      chip.classList.contains("menu-caret") || chip.classList.contains("profile-action");
    if (!looksProfile) return;
    menu.dataset.gilbertoSwitchInjected = "1";
    const item = document.createElement("button");
    item.type = "button";
    item.className = "top-menu-item profile-menu-action";
    item.setAttribute("role", "menuitem");
    item.textContent = "Switch workspace";
    item.title =
      "Pick another workspace or add this login to a company with an invite code";
    item.addEventListener("click", function () {
      window.location.href = "company-picker.html";
    });
    const items = Array.from(menu.querySelectorAll(".top-menu-item"));
    const signOutEl = items.find(function (el) {
      const t = String(el.textContent || "").toLowerCase();
      return t.includes("sign out");
    });
    if (signOutEl && signOutEl.parentNode) {
      signOutEl.parentNode.insertBefore(item, signOutEl);
    } else {
      menu.appendChild(item);
    }
  });
}
window.gilbertoInjectSwitchCompanyMenuItem = gilbertoInjectSwitchCompanyMenuItem;

/**
 * Pages without profile dropdown (only user pill) never received "Switch company".
 * Adds a compact Workspace control next to the pill — opens company-picker (cloud only).
 */
function gilbertoInjectTopBarWorkspaceNavIfNeeded() {
  if (typeof jvmSupabaseRelayEnabled === "function" && jvmSupabaseRelayEnabled()) return;
  if (!window.supabaseClient) return;
  document.querySelectorAll(".top-actions").forEach(function (actions) {
    if (actions.querySelector("[data-gilberto-workspace-nav]")) return;
    const hasProfileMenu =
      actions.querySelector(".menu-wrap .profile-chip.menu-caret") ||
      actions.querySelector(".menu-wrap .profile-chip.profile-action");
    if (hasProfileMenu) return;
    const nav = document.createElement("button");
    nav.type = "button";
    nav.dataset.gilbertoWorkspaceNav = "1";
    nav.className = "small-btn";
    nav.textContent = "Workspace";
    nav.title =
      "Switch company or join another with this email (invite code from admin)";
    nav.addEventListener("click", function () {
      window.location.href = "company-picker.html";
    });
    const pill = actions.querySelector(".user-pill, #topbarUserPill");
    if (pill && pill.parentNode === actions) {
      pill.insertAdjacentElement("beforebegin", nav);
    } else {
      actions.appendChild(nav);
    }
  });
}
window.gilbertoInjectTopBarWorkspaceNavIfNeeded = gilbertoInjectTopBarWorkspaceNavIfNeeded;

function gilbertoInviteCodeLooksDailyUtc(code) {
  return typeof code === "string" && /^[0-9a-f]{8}$/i.test(code.trim());
}

/**
 * Owner/admin: show today's invite code (daily UTC when migration is applied) or legacy static code.
 */
async function applyInviteTeamPanel() {
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

  let displayCode = (o.joinCode || "").trim();
  if (window.supabaseClient) {
    try {
      const { data, error } = await window.supabaseClient.rpc("organization_todays_invite_code", {
        p_org_id: o.id,
      });
      if (!error && data != null && String(data).trim() !== "") {
        displayCode = String(data).trim();
      }
    } catch (_) {
      /* RPC missing until supabase-organizations-daily-invite.sql is applied */
    }
  }

  const dailyUtcHint = gilbertoInviteCodeLooksDailyUtc(displayCode)
    ? "<p class=\"invite-daily-hint\" style=\"margin:10px 0 0;font-size:12px;color:#5f7669;line-height:1.45;\">This code <strong>changes at midnight UTC</strong> each day. Share today’s code with people joining now; yesterday’s code still works for joins until the UTC day rolls over (covers clock skew).</p>"
    : "<p class=\"invite-daily-hint\" style=\"margin:10px 0 0;font-size:12px;color:#5f7669;line-height:1.45;\">For automatic daily rotation, run <code style=\"font-size:11px;\">security/supabase-organizations-daily-invite.sql</code> in Supabase. Until then, this is a fixed invite code.</p>";

  const box = document.createElement("div");
  box.id = "gilbertoInvitePanel";
  box.className = "invite-team-panel";
  box.setAttribute("role", "region");
  box.setAttribute("aria-label", "Invite team");
  if (displayCode) {
    box.innerHTML =
      "<div class=\"invite-team-header\"><strong>Invite your team</strong><span class=\"invite-team-hint\">New users sign in, choose “Join an existing company,” and enter this code. Their login stays the same — they’re only added to your organization.</span></div>" +
      "<div class=\"invite-code-row\">" +
      "<button type=\"button\" class=\"invite-code invite-code--clickable\" id=\"gilbertoJoinCodeDisplay\" title=\"Copy invite code\" aria-label=\"Invite code. Click to copy.\">" +
      String(displayCode).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\"/g, "&quot;") +
      "</button> " +
      "<button type=\"button\" class=\"small-btn\" id=\"gilbertoCopyJoinCode\">Copy code</button>" +
      "</div>" +
      dailyUtcHint +
      "<p style=\"margin:12px 0 0;font-size:12px;color:#597568;\"><button type=\"button\" class=\"small-btn\" id=\"gilbertoGenJoinCode\">Rotate invite secret</button> <span style=\"margin-left:6px;\">Invalidates old codes and starts a new daily sequence.</span></p>";
  } else {
    box.innerHTML =
      "<div class=\"invite-team-header\"><strong>Invite your team</strong><span class=\"invite-team-hint\">Create an invite secret so teammates can join after they sign in.</span></div>" +
      "<p class=\"invite-no-code\">No invite secret for this company yet.</p>" +
      "<button type=\"button\" class=\"small-btn\" id=\"gilbertoGenJoinCode\">Set up invite secret</button>";
  }
  if (document.getElementById("workspaceBanner")) {
    document.getElementById("workspaceBanner").insertAdjacentElement("afterend", box);
  } else if (main.querySelector("header.topbar")) {
    main.querySelector("header.topbar").insertAdjacentElement("afterend", box);
  } else {
    main.insertBefore(box, main.firstChild);
  }

  async function copyGilbertoJoinInviteToClipboard() {
    const trimmed = String(displayCode || "").trim();
    if (!trimmed) return;
    const copyBtn = document.getElementById("gilbertoCopyJoinCode");
    const chip = document.getElementById("gilbertoJoinCodeDisplay");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(trimmed);
      } else {
        throw new Error("no_clipboard");
      }
      if (copyBtn) {
        const prev = copyBtn.textContent;
        copyBtn.textContent = "Copied!";
        setTimeout(function () {
          copyBtn.textContent = prev || "Copy code";
        }, 1600);
      }
      if (chip) {
        chip.classList.add("invite-code--copied");
        setTimeout(function () {
          chip.classList.remove("invite-code--copied");
        }, 700);
      }
    } catch (_) {
      try {
        window.prompt("Copy this invite code (Ctrl+C / Cmd+C):", trimmed);
      } catch (e2) {
        alert("Invite code: " + trimmed);
      }
    }
  }

  document.getElementById("gilbertoJoinCodeDisplay")?.addEventListener("click", function () {
    void copyGilbertoJoinInviteToClipboard();
  });
  document.getElementById("gilbertoCopyJoinCode")?.addEventListener("click", function () {
    void copyGilbertoJoinInviteToClipboard();
  });

  document.getElementById("gilbertoGenJoinCode")?.addEventListener("click", async function () {
    if (!window.supabaseClient) return;
    this.disabled = true;
    let error = null;
    try {
      const r = await window.supabaseClient.rpc("organization_rotate_invite_salt", { p_org_id: o.id });
      error = r.error || null;
    } catch (e) {
      error = e;
    }
    if (error) {
      alert(
        (error && error.message) ||
          "Could not rotate invite secret. Run security/supabase-organizations-daily-invite.sql in Supabase."
      );
      this.disabled = false;
      return;
    }
    window.gilbertoCurrentOrg = { ...o, joinCode: null };
    try {
      const { data: s } = await window.supabaseClient.auth.getSession();
      const uid = s?.session?.user?.id;
      if (uid) localStorage.setItem("gilberto_active_org:" + uid, JSON.stringify(window.gilbertoCurrentOrg));
    } catch (_) {
      /* empty */
    }
    await loadGilbertoOrganization();
    await applyInviteTeamPanel();
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
      if (currentPage === "onboarding.html") {
        window.location.replace("dashboard.html");
        return;
      }
      if (currentPage === "workspace-setup.html") {
        const qs = new URLSearchParams(window.location.search || "");
        const allowWorkspacePage =
          qs.get("join") === "1" ||
          qs.get("add_company") === "1" ||
          qs.get("join_company") === "1" ||
          qs.get("settings") === "1" ||
          qs.get("stay") === "1";
        if (!allowWorkspacePage) {
          window.location.replace("dashboard.html");
        }
        return;
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
