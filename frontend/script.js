function showLogin() {
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("signupForm").classList.add("hidden");
  
    document.getElementById("loginTab").classList.add("active");
    document.getElementById("signupTab").classList.remove("active");
  }

  function loadRememberedEmail() {
    const savedEmail = localStorage.getItem("remembered_login_email") || "";
    const loginEmailInput = document.getElementById("loginEmail");
    const rememberBox = document.getElementById("rememberEmail");
    if (loginEmailInput && savedEmail) loginEmailInput.value = savedEmail;
    if (rememberBox) rememberBox.checked = !!savedEmail;
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
    return message || "Authentication failed.";
  }

  async function login() {
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

    setButtonLoading("loginBtn", true, "Log In");
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
      setButtonLoading("loginBtn", false, "Log In");
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
  loadRememberedEmail();

  const params = new URLSearchParams(window.location.search);
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
    const clean = new URL(window.location.href);
    clean.search = "";
    window.history.replaceState({}, document.title, clean.toString());
    return;
  }

  if (!window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (!error && data?.session) {
      await goToDashboard();
    }
  } catch (_) {
    // no-op
  }
});