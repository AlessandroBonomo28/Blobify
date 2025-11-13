document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("password");
  const saveButton = document.getElementById("save");
  const status = document.getElementById("status");

  // Recupera password salvata
  chrome.storage.local.get("decryptPassword", (data) => {
    if (data.decryptPassword) {
      passwordInput.value = data.decryptPassword;
    }
  });

  // Salva password
  saveButton.addEventListener("click", () => {
    const password = passwordInput.value.trim();

    if (!password) {
      status.textContent = " Invalid password!";
      status.style.color = "red";
      return;
    }

    chrome.storage.local.set({ decryptPassword: password }, () => {
      status.textContent = " Password set!";
      status.style.color = "green";
      setTimeout(() => (status.textContent = ""), 2000);
    });
  });
});