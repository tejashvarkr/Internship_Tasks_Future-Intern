window.onload = () => {
  if (localStorage.getItem("authenticated") === "true") {
    document.getElementById("login-section").style.display = "none";
    document.getElementById("app-section").style.display = "block";
    loadEmployees();
  }
};

function login() {
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value.trim();
  const error = document.getElementById("login-error");

  if (user === "admin" && pass === "admin123") {
    localStorage.setItem("authenticated", "true");
    error.textContent = "";
    document.getElementById("login-section").style.display = "none";
    document.getElementById("app-section").style.display = "block";
    loadEmployees();
  } 
  else if (!user || !pass) {
    error.textContent = "";
    alert("All fields are required.");
    return;
  }
  else {
    error.textContent = "Invalid credentials!";
  }
}

function logout() {
  localStorage.removeItem("authenticated");
  location.reload();
}

const form = document.getElementById("employee-form");
const list = document.getElementById("employee-list");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const role = form.role.value.trim();

  if (!name || !email || !role) {
    alert("All fields are required.");
    return;
  }

  fetch("/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, role })
  })
  .then(res => res.json())
  .then(() => {
    loadEmployees();
    form.reset();
  });
});

function loadEmployees() {
  fetch("/employees")
    .then(res => res.json())
    .then(data => {
      list.innerHTML = '';
      data.forEach(emp => {
        const li = document.createElement("li");
        li.innerHTML = `
          <div>
            <strong>${emp.name}</strong><br />
            ${emp.email} - ${emp.role}
          </div>
          <div class="actions">
            <button onclick="editEmployee(${emp.id}, '${emp.name}', '${emp.email}', '${emp.role}')">Edit</button>
            <button onclick="deleteEmployee(${emp.id})">Delete</button>
          </div>
        `;
        list.appendChild(li);
      });
    });
}

function editEmployee(id, name, email, role) {
  form.name.value = name;
  form.email.value = email;
  form.role.value = role;

  // Remove previous event listeners
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  newForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const newName = newForm.name.value.trim();
    const newEmail = newForm.email.value.trim();
    const newRole = newForm.role.value.trim();

    fetch(`/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, email: newEmail, role: newRole })
    })
    .then(res => res.json())
    .then(() => {
      loadEmployees();
      newForm.reset();
    });
  });
}

function deleteEmployee(id) {
  fetch(`/employees/${id}`, {
    method: "DELETE"
  }).then(() => loadEmployees());
}
function clearForm() {
  const form = document.getElementById("employee-form");
  form.reset();
  // Remove previous event listeners
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  
  newForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = newForm.name.value.trim();
    const email = newForm.email.value.trim();
    const role = newForm.role.value.trim();

    if (!name || !email || !role) {
      alert("All fields are required.");
      return;
    }

    fetch("/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role })
    })
    .then(res => res.json())
    .then(() => {
      loadEmployees();
      newForm.reset();
    });
  });
}