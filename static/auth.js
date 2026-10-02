let mode = "login";

const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const username = document.getElementById("username");
const submitBtn = document.getElementById("submit-btn");
const subtitle = document.getElementById("subtitle");
const errorEl = document.getElementById("error");

function setMode(newMode) {
  mode = newMode;
  const isLogin = mode === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabRegister.classList.toggle("active", !isLogin);
  username.classList.toggle("hidden", isLogin);
  username.required = !isLogin;
  submitBtn.textContent = isLogin ? "Login" : "Create account";
  subtitle.textContent = isLogin ? "Log in to manage your tasks" : "Create an account to get started";
  errorEl.textContent = "";
}

tabLogin.addEventListener("click", () => setMode("login"));
tabRegister.addEventListener("click", () => setMode("register"));

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";

  const body = {
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
  };
  if (mode === "register") body.username = username.value;

  const res = await fetch(`/api/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (res.ok) {
    window.location.href = "/dashboard";
  } else {
    errorEl.textContent = data.error || "Something went wrong";
  }
});