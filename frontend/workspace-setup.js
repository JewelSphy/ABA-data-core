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
    const rawCode = (document.getElementById("joinCodeInput")?.value || "").trim();
    const code = rawCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
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

    const finish = window.gilbertoCompleteOrganizationJoin;
    if (typeof finish !== "function") {
      setStatus("App bundle out of date. Refresh the page.", true);
      return;
    }
    const fin = await finish(supabase, userId, orgId);
    if (!fin || !fin.ok) {
      setStatus("Joined, but could not save workspace. Try refreshing.", true);
      return;
    }
    if (fin.profileUpsertError) {
      setStatus("Joined the company, but profile row failed: " + fin.profileUpsertError.message, true);
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
    const qs = new URLSearchParams(window.location.search || "");
    const joiningAnother =
      qs.get("join") === "1" ||
      qs.get("add_company") === "1" ||
      qs.get("join_company") === "1";
    const stayOnWorkspaceSetup =
      joiningAnother ||
      qs.get("settings") === "1" ||
      qs.get("stay") === "1";
    if (joiningAnother) {
      const tag = document.querySelector(".ws-card .card-header-tagline p");
      if (tag) {
        tag.textContent =
          "You're signed in with this email. Enter an invite code from another company's admin to add that workspace — no second account.";
      }
      try {
        const prefill = sessionStorage.getItem("gilberto_join_code_prefill") || "";
        if (prefill && document.getElementById("joinCodeInput")) {
          document.getElementById("joinCodeInput").value = prefill;
          setStatus("Invite code ready. Click Join with this code.", false);
        }
      } catch (_) {
        /* empty */
      }
    } else if (qs.get("settings") === "1") {
      const tag2 = document.querySelector(".ws-card .card-header-tagline p");
      if (tag2) {
        tag2.textContent =
          "Same login for every company: create another workspace below or join one with an invite code.";
      }
    }
    if (!stayOnWorkspaceSetup && (await flow.isOnboardingComplete(supa, uid))) {
      window.location.replace("dashboard.html");
    }
  })();
})();
