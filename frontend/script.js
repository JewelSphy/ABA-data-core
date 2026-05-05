function showLogin() {
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("signupForm").classList.add("hidden");

    document.getElementById("loginTab").classList.add("active");
    document.getElementById("signupTab").classList.remove("active");

    const email = document.getElementById("loginEmail")?.value?.trim() || "";
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      loginShowPasswordStep();
    } else {
      loginShowEmailStep();
    }
  }

  function loginShowEmailStep() {
    const wrap = document.getElementById("loginPasswordStep");
    const step = document.getElementById("loginEmailStep");
    const rw = document.getElementById("loginRememberWrap");
    const cont = document.getElementById("loginEmailContinue");
    if (wrap) wrap.classList.add("hidden");
    if (step) step.classList.remove("hidden");
    if (rw) rw.style.display = "flex";
    if (cont) cont.style.display = "";
    const pw = document.getElementById("loginPassword");
    if (pw) pw.value = "";
  }

  function loginShowPasswordStep() {
    const email = document.getElementById("loginEmail")?.value?.trim() || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthMessage("Enter a valid email address, then Continue.", true);
      return;
    }
    const recap = document.getElementById("loginEmailRecap");
    if (recap) recap.textContent = email;
    const wrap = document.getElementById("loginPasswordStep");
    const step = document.getElementById("loginEmailStep");
    const rw = document.getElementById("loginRememberWrap");
    const cont = document.getElementById("loginEmailContinue");
    if (step) step.classList.add("hidden");
    if (cont) cont.style.display = "none";
    if (rw) rw.style.display = "flex";
    if (wrap) {
      wrap.classList.remove("hidden");
      document.getElementById("loginPassword")?.focus();
    }
    setAuthMessage("");
  }

  function loadRememberedEmail() {
    const savedEmail = localStorage.getItem("remembered_login_email") || "";
    const loginEmailInput = document.getElementById("loginEmail");
    const rememberBox = document.getElementById("rememberEmail");
    if (loginEmailInput && savedEmail) loginEmailInput.value = savedEmail;
    if (rememberBox) rememberBox.checked = !!savedEmail;
    if (savedEmail && loginEmailInput) {
      loginShowPasswordStep();
    }
  }
  
  function showSignup() {
    document.getElementById("signupForm").classList.remove("hidden");
    document.getElementById("loginForm").classList.add("hidden");

    document.getElementById("signupTab").classList.add("active");
    document.getElementById("loginTab").classList.remove("active");
  }
  
  function setAuthMessage(message, isError = false) {
    const el = document.getElementById("authMessage");
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? "#b91c1c" : "#2d4a3e";
  }
  
  function setButtonLoading(btnId, loading, label) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? "Please wait..." : label;
  }

  function queueJoinCompanyFromLogin(sourceCode) {
    var code = String(sourceCode || "").trim().toUpperCase();
    if (code && code.length < 4) {
      setAuthMessage("Join code looks too short. Usually it is 8 characters.", true);
      return false;
    }
    try {
      sessionStorage.setItem("gilberto_after_auth_join", "1");
      if (code) sessionStorage.setItem("gilberto_join_code_prefill", code);
      else sessionStorage.removeItem("gilberto_join_code_prefill");
    } catch (_) {
      /* empty */
    }
    return true;
  }

  function getSignupRedirectUrl() {
    const configured = String(window.AUTH_REDIRECT_URL || "").trim();
    if (configured) return configured;
    if (window.location.protocol !== "http:" && window.location.protocol !== "https:") {
      return "";
    }
    try {
      // Always land on `index.html` in this app folder. Using `origin + pathname` alone can 404
      // (e.g. server root `/` with no default file, or path mismatch with Supabase allow list).
      return new URL("index.html", window.location.href).href;
    } catch (_) {
      return "";
    }
  }

  function humanizeAuthError(message) {
    const normalized = String(message || "").toLowerCase();
    if (normalized.includes("email not confirmed")) {
      return "Please confirm your email from the Gilberto CRM verification message, then log in.";
    }
    if (
      normalized.includes("already registered") ||
      normalized.includes("user already") ||
      normalized.includes("already been registered")
    ) {
      return "This email already has a Gilberto CRM account — use Log In instead. After you sign in, use the top bar \"Workspace\" button (or Profile menu → Switch or join company), then Join another company with your admin’s invite code — same login, no duplicate signup.";
    }
    return message || "Authentication failed.";
  }

  async function login() {
    const pwStep = document.getElementById("loginPasswordStep");
    if (pwStep && pwStep.classList.contains("hidden")) {
      loginShowPasswordStep();
      return;
    }
    const email = document.getElementById("loginEmail")?.value?.trim();
    const password = document.getElementById("loginPassword")?.value || "";
    if (!email || !password) {
      setAuthMessage("Please enter email and password.", true);
      return;
    }
    if (!window.supabaseClient) {
      setAuthMessage("Supabase is not initialized.", true);
      return;
    }

    setButtonLoading("loginBtn", true, "Sign in");
    setAuthMessage("Signing in...");
    try {
      const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthMessage(humanizeAuthError(error.message), true);
        return;
      }
      const rememberBox = document.getElementById("rememberEmail");
      if (rememberBox?.checked) {
        localStorage.setItem("remembered_login_email", email);
      } else {
        localStorage.removeItem("remembered_login_email");
      }
      setAuthMessage("Login successful. Redirecting...");
      if (window.gilbertoAuthFlow) {
        await window.gilbertoAuthFlow.goToAppAfterAuth();
      } else {
        window.location.href = "dashboard.html";
      }
    } catch (err) {
      setAuthMessage(humanizeAuthError(err?.message), true);
    } finally {
      setButtonLoading("loginBtn", false, "Sign in");
    }
  }

  async function signup() {
    const firstName = document.getElementById("signupFirstName")?.value?.trim();
    const lastName = document.getElementById("signupLastName")?.value?.trim();
    const fullName = `${firstName || ""} ${lastName || ""}`.trim();
    const email = document.getElementById("signupEmail")?.value?.trim();
    const password = document.getElementById("signupPassword")?.value || "";
    if (!firstName || !lastName || !email || !password) {
      setAuthMessage("Please complete first name, last name, email, and password.", true);
      return;
    }
    if (!window.supabaseClient) {
      setAuthMessage("Supabase is not initialized.", true);
      return;
    }

    setButtonLoading("signupBtn", true, "Create Account");
    setAuthMessage("Creating account...");
    try {
      const emailRedirectTo = getSignupRedirectUrl();
      const signupOptions = {
        data: { full_name: fullName, first_name: firstName, last_name: lastName },
      };
      if (emailRedirectTo) signupOptions.emailRedirectTo = emailRedirectTo;
      const { data, error } = await window.supabaseClient.auth.signUp({
        email,
        password,
        options: signupOptions,
      });
      if (error) {
        setAuthMessage(humanizeAuthError(error.message), true);
        return;
      }

      // Profile row should be created server-side via auth trigger for tighter security.

      if (data?.session) {
        const loginEmailInput = document.getElementById("loginEmail");
        if (loginEmailInput) loginEmailInput.value = email;
        setAuthMessage("Account created. Redirecting...");
        if (window.gilbertoAuthFlow) {
          await window.gilbertoAuthFlow.goToAppAfterAuth();
        } else {
          window.location.href = "dashboard.html";
        }
        return;
      }

      const loginEmailInput = document.getElementById("loginEmail");
      if (loginEmailInput) loginEmailInput.value = email;
      setAuthMessage("Account created for Gilberto CRM. Check your email for the verification link, then log in.");
      showLogin();
    } catch (err) {
      setAuthMessage(humanizeAuthError(err?.message), true);
    } finally {
      setButtonLoading("signupBtn", false, "Create Account");
    }
  }

async function goToDashboard() {
  if (window.gilbertoAuthFlow) {
    await window.gilbertoAuthFlow.goToAppAfterAuth();
  } else {
    window.location.href = "dashboard.html";
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  document.getElementById("loginEmailContinue")?.addEventListener("click", loginShowPasswordStep);
  document.getElementById("loginChangeEmailBtn")?.addEventListener("click", loginShowEmailStep);
  document.getElementById("loginEmail")?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      loginShowPasswordStep();
    }
  });
  document.getElementById("loginPassword")?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      login();
    }
  });
  loadRememberedEmail();

  const params = new URLSearchParams(window.location.search);
  if (params.get("join") === "1" || params.get("invite") === "1") {
    queueJoinCompanyFromLogin("");
    const joinBanner = document.getElementById("authJoinBanner");
    if (joinBanner) joinBanner.hidden = false;
    try {
      const clean = new URL(window.location.href);
      clean.searchParams.delete("join");
      clean.searchParams.delete("invite");
      if (clean.search !== window.location.search) {
        window.history.replaceState({}, document.title, clean.pathname + clean.search + clean.hash);
      }
    } catch (_) {
      /* empty */
    }
  }

  const stayOnLogin =
    params.get("stay") === "1" ||
    params.get("login") === "1" ||
    params.get("signin") === "1";
  const qErr = params.get("error");
  const qDesc = params.get("error_description");
  if (qErr) {
    const msg = (qDesc || qErr).replace(/\+/g, " ");
    try {
      setAuthMessage(decodeURIComponent(msg), true);
    } catch (_) {
      setAuthMessage(msg, true);
    }
    const clean = new URL(window.location.href);
    clean.search = "";
    window.history.replaceState({}, document.title, clean.toString());
  }

  // Skip auto-redirect if user just logged out (lo=1 flag set by logout())
  const justLoggedOut = new URLSearchParams(window.location.search).get("lo") === "1";
  if (justLoggedOut) {
    try {
      sessionStorage.removeItem("gilberto_after_auth_join");
    } catch (_) {
      /* empty */
    }
    const clean = new URL(window.location.href);
    clean.search = "";
    window.history.replaceState({}, document.title, clean.toString());
    return;
  }

  if (!window.supabaseClient) return;
  if (stayOnLogin) {
    return;
  }
  try {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (!error && data?.session) {
      await new Promise(function (r) {
        setTimeout(r, 400);
      });
      const { data: again } = await window.supabaseClient.auth.getSession();
      if (again?.session) {
        await goToDashboard();
      }
    }
  } catch (_) {
    // no-op
  }
});