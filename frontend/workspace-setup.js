(function () {
  function setStatus(msg, isError) {
    const el = document.getElementById("wsStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isError ? "#b91c1c" : "#2d4a3e";
  }

  document.getElementById("wsCreate")?.addEventListener("click", function () {
    try {
      sessionStorage.setItem("gilberto_wants_create", "1");
    } catch (_) {
      /* empty */
    }
    window.location.href = "onboarding.html";
  });

  document.getElementById("wsJoin")?.addEventListener("click", async function () {
    const supabase = window.supabaseClient;
    const flow = window.gilbertoAuthFlow;
    if (!supabase || !flow) {
      setStatus("Supabase is not ready. Refresh the page.", true);
      return;
    }
    const code = (document.getElementById("joinCodeInput")?.value || "").trim();
    if (code.length < 4) {
      setStatus("Enter the join code your company admin shared (usually 8 characters).", true);
      return;
    }
    setStatus("Joining…", false);
    const { data: s, error: se } = await supabase.auth.getSession();
    if (se || !s?.session?.user) {
      window.location.href = "index.html";
      return;
    }
    const userId = s.session.user.id;

    const { data: orgId, error: rpcErr } = await supabase.rpc("join_organization", { p_code: code });
    if (rpcErr) {
      setStatus(rpcErr.message || "Could not join. Is `join_organization` installed? Run `supabase-organizations.sql`.", true);
      return;
    }
    if (!orgId) {
      setStatus("Code not found. Check with your admin, or create a new company above.", true);
      return;
    }

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, company_display_name, company_legal_name")
      .eq("id", orgId)
      .maybeSingle();
    if (orgErr || !org) {
      setStatus("Joined, but could not load company. Try refreshing or contact support.", true);
      return;
    }

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
    if (upErr) {
      setStatus("Joined the company, but profile row failed: " + upErr.message, true);
    }

    const profile = {
      company_display_name: org.company_display_name,
      company_legal_name: org.company_legal_name,
      organization_id: orgId,
      approval_status: "pending",
    };
    flow.markCompleteLocal(userId, profile);
    try {
      localStorage.setItem(
        "gilberto_active_org:" + userId,
        JSON.stringify({ id: orgId, name: org.company_display_name, company_legal_name: org.company_legal_name })
      );
    } catch (_) {
      /* empty */
    }
    window.location.replace("dashboard.html?setup=1");
  });

  void (async function guard() {
    const supa = window.supabaseClient;
    const flow = window.gilbertoAuthFlow;
    if (!supa || !flow) return;
    const { data, error } = await supa.auth.getSession();
    if (error || !data?.session?.user) {
      window.location.replace("index.html");
      return;
    }
    const uid = data.session.user.id;
    if (await flow.isOnboardingComplete(supa, uid)) {
      window.location.replace("dashboard.html");
    }
  })();
})();
