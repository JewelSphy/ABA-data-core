(function () {
  const totalSteps = 5;
  let step = 0;
  const pills = () => document.querySelectorAll("#onbPills .onb-step-pill");
  const steps = () => document.querySelectorAll("#onbSteps .onb-step");

  function spawnBursts() {
    const host = document.getElementById("onbBursts");
    if (!host) return;
    for (let i = 0; i < 6; i += 1) {
      const b = document.createElement("div");
      b.className = "onb-burst";
      b.style.left = 8 + Math.random() * 86 + "vw";
      b.style.top = 18 + Math.random() * 64 + "vh";
      b.style.animationDelay = i * 0.04 + "s";
      host.appendChild(b);
      setTimeout(() => b.remove(), 900);
    }
  }

  function updatePills() {
    pills().forEach((p, i) => {
      p.classList.remove("is-active", "is-done");
      if (i < step) p.classList.add("is-done");
      if (i === step) p.classList.add("is-active");
    });
  }

  function showStep(n) {
    step = n;
    steps().forEach((s) => {
      const idx = parseInt(s.getAttribute("data-step") || "-1", 10);
      const isVis = idx === n;
      s.classList.toggle("is-visible", isVis);
      s.setAttribute("aria-hidden", isVis ? "false" : "true");
    });
    updatePills();
    const back = document.getElementById("onbBack");
    const next = document.getElementById("onbNext");
    if (back) back.disabled = step === 0;
    if (next) {
      next.disabled = false;
      if (step === totalSteps - 1) {
        next.textContent = "Submit & open dashboard";
      } else {
        next.textContent = "Continue";
      }
    }
    if (step === 4) updateRecap();
    spawnBursts();
    const card = document.querySelector(".onb-card");
    if (card && card.scrollIntoView) {
      requestAnimationFrame(function () {
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
    const firstInput = document.querySelector(".onb-step.is-visible input, .onb-step.is-visible select, .onb-step.is-visible textarea");
    if (firstInput && typeof firstInput.focus === "function") {
      requestAnimationFrame(function () {
        try {
          firstInput.focus({ preventScroll: true });
        } catch (_) {
          firstInput.focus();
        }
      });
    }
  }

  function updateRecap() {
    const legal = document.getElementById("coLegal")?.value?.trim();
    const display = document.getElementById("coDisplay")?.value?.trim();
    const el = document.getElementById("onbRecapName");
    if (el) el.textContent = display || legal || "your company";
  }

  function validateStep() {
    const status = document.getElementById("onbStatus");
    if (status) {
      status.textContent = "";
      status.removeAttribute("style");
    }
    if (step === 1) {
      const a = document.getElementById("coLegal")?.value?.trim();
      const b = document.getElementById("coDisplay")?.value?.trim();
      if (!a || !b) {
        if (status) {
          status.textContent = "Please enter both the legal and display company names.";
          status.style.color = "#b91c1c";
        }
        document.getElementById("coLegal")?.focus();
        return false;
      }
    }
    if (step === 2) {
      const a = document.getElementById("ctFirstName")?.value?.trim();
      const b = document.getElementById("ctLastName")?.value?.trim();
      const c = document.getElementById("ctEmail")?.value?.trim();
      if (!a || !b || !c) {
        if (status) {
          status.textContent = "Please enter first name, last name, and work email.";
          status.style.color = "#b91c1c";
        }
        document.getElementById("ctFirstName")?.focus();
        return false;
      }
    }
    if (step === 4) {
      const ok = document.getElementById("ack")?.checked;
      if (!ok) {
        if (status) {
          status.textContent = "Please check the box above to confirm and continue.";
          status.style.color = "#b91c1c";
        }
        return false;
      }
    }
    return true;
  }

  function contactFullName() {
    const f = document.getElementById("ctFirstName")?.value?.trim() || "";
    const l = document.getElementById("ctLastName")?.value?.trim() || "";
    return [f, l].filter(Boolean).join(" ");
  }

  function makeJoinCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 8; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  async function createCompanyOrganization(supabase, userId, row) {
    const joinCode = makeJoinCode();
    const { data, error: e1 } = await supabase
      .from("organizations")
      .insert({
        company_legal_name: row.company_legal_name || null,
        company_display_name: row.company_display_name,
        created_by: userId,
        join_code: joinCode,
      })
      .select("id, join_code")
      .single();
    if (e1) return { organization_id: null, error: e1 };
    const orgId = data.id;
    const { error: e2 } = await supabase.from("organization_members").insert({
      organization_id: orgId,
      user_id: userId,
      role: "owner",
    });
    if (e2) return { organization_id: null, error: e2 };
    return { organization_id: orgId, error: null };
  }

  function collectPayload() {
    return {
      company_legal_name: document.getElementById("coLegal")?.value?.trim() || "",
      company_display_name: document.getElementById("coDisplay")?.value?.trim() || "",
      contact_first_name: document.getElementById("ctFirstName")?.value?.trim() || "",
      contact_last_name: document.getElementById("ctLastName")?.value?.trim() || "",
      contact_name: contactFullName(),
      contact_email: document.getElementById("ctEmail")?.value?.trim() || "",
      contact_phone: document.getElementById("ctPhone")?.value?.trim() || "",
      company_address: document.getElementById("coAddress")?.value?.trim() || "",
      team_size: document.getElementById("teamSize")?.value || "",
      notes: document.getElementById("notes")?.value?.trim() || "",
      compliance_ack: !!document.getElementById("ack")?.checked,
    };
  }

  async function submit() {
    const status = document.getElementById("onbStatus");
    const next = document.getElementById("onbNext");
    const flow = window.gilbertoAuthFlow;
    const supabase = window.supabaseClient;
    if (!flow || !supabase) {
      if (status) status.textContent = "Configuration error. Refresh and try again.";
      return;
    }
    const { data, error: se } = await supabase.auth.getSession();
    if (se || !data?.session?.user) {
      window.location.href = "index.html";
      return;
    }
    const userId = data.session.user.id;
    const row = collectPayload();
    if (status) status.textContent = "";
    if (next) {
      next.disabled = true;
      next.textContent = "Saving…";
    }

    let organizationId = null;
    const orgRes = await createCompanyOrganization(supabase, userId, row);
    if (orgRes.error) {
      if (status) {
        status.style.color = "#9a5c00";
        status.textContent =
          "Company record not created in cloud (" +
          (orgRes.error.message || "error") +
          "). Run `supabase-organizations.sql` or continue with local profile only.";
      }
    } else {
      organizationId = orgRes.organization_id;
      try {
        localStorage.setItem(
          "gilberto_active_org:" + userId,
          JSON.stringify({
            id: organizationId,
            name: row.company_display_name,
            company_legal_name: row.company_legal_name,
          })
        );
      } catch (_) {
        /* empty */
      }
    }

    const rowWithOrg = { ...row, organization_id: organizationId };
    const profile = { ...rowWithOrg, approval_status: "pending" };
    flow.markCompleteLocal(userId, profile);
    const remote = await flow.saveOnboardingRemote(supabase, userId, rowWithOrg);
    if (!remote.ok && status) {
      status.style.color = "#4a6358";
      status.textContent =
        "Saved on this device. (Cloud: run supabase-onboarding.sql in Supabase, then your data can sync to the server.)";
      if (next) {
        next.disabled = false;
        next.textContent = "Submit & open dashboard";
      }
      setTimeout(function () {
        window.location.replace("dashboard.html?setup=1");
      }, 1200);
      return;
    }

    window.location.replace("dashboard.html?setup=1");
  }

  async function boot() {
    const flow = window.gilbertoAuthFlow;
    const supa = window.supabaseClient;
    if (flow && supa) {
      const { data: s } = await supa.auth.getSession();
      const uid = s?.session?.user?.id;
      if (uid) {
        if (await flow.isOnboardingComplete(supa, uid)) {
          window.location.replace("dashboard.html");
          return;
        }
        let want = false;
        try {
          want = sessionStorage.getItem("gilberto_wants_create") === "1";
        } catch (_) {
          /* empty */
        }
        const draft = await flow.hasIncompleteOnboardingDraft(supa, uid);
        if (!want && !draft) {
          window.location.replace("workspace-setup.html");
          return;
        }
        try {
          sessionStorage.removeItem("gilberto_wants_create");
        } catch (_) {
          /* empty */
        }
      }
    }
    startOnboardingUI();
  }

  function startOnboardingUI() {
  document.getElementById("onbNext")?.addEventListener("click", async function () {
    if (!validateStep()) return;
    if (step < totalSteps - 1) {
      const nextStep = step + 1;
      const flow = window.gilbertoAuthFlow;
      const supabase = window.supabaseClient;
      let draftResult = null;
      if (flow && supabase && (step === 1 || step === 2)) {
        const { data: sess, error: se } = await supabase.auth.getSession();
        if (!se && sess?.session?.user?.id) {
          draftResult = await flow.saveOnboardingDraft(supabase, sess.session.user.id, collectPayload());
        }
      }
      showStep(nextStep);
      const st = document.getElementById("onbStatus");
      if (draftResult) {
        if (draftResult.ok) {
          if (st) {
            st.style.color = "#2d4a3e";
            st.textContent =
              nextStep === 2
                ? "Saved to Supabase: company names."
                : "Saved to Supabase: primary contact, email, and phone.";
          }
        } else if (st) {
          st.style.color = "#9a5c00";
          st.textContent =
            "Not saved to cloud: " +
            (draftResult.reason || "error") +
            " — run `supabase-onboarding.sql` in the SQL Editor if the table is missing.";
        }
      }
    } else {
      await submit();
    }
  });

  document.getElementById("onbBack")?.addEventListener("click", function () {
    if (step > 0) showStep(step - 1);
  });

  document.getElementById("onbSignOut")?.addEventListener("click", function () {
    if (typeof logout === "function") logout();
    else window.location.href = "index.html";
  });

  showStep(0);

  void (async function prefill() {
    try {
      const s = await window.supabaseClient?.auth.getSession();
      const user = s?.data?.session?.user;
      const meta = user?.user_metadata || {};
      const email = user?.email;
      const elE = document.getElementById("ctEmail");
      if (email && elE && !elE.value) elE.value = email;
      const f = document.getElementById("ctFirstName");
      const l = document.getElementById("ctLastName");
      if (meta.first_name && f && !f.value) f.value = String(meta.first_name);
      if (meta.last_name && l && !l.value) l.value = String(meta.last_name);
    } catch (_) {
      /* empty */
    }
  })();
  }

  void boot();
})();
