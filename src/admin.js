import { ADMIN_GOOGLE_ID } from "./config/admin.js";
import { FIREBASE_CONFIG } from "./config/firebase.js";
import { profileFromGoogleCredential } from "./systems/AuthSession.js";
import { FirestoreSync } from "./systems/FirestoreSync.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithCredential, GoogleAuthProvider, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const adminLogin = document.getElementById("adminLogin");
const adminPanel = document.getElementById("adminPanel");
const accessDenied = document.getElementById("accessDenied");
const adminGoogleButton = document.getElementById("adminGoogleButton");
const adminLoginError = document.getElementById("adminLoginError");
const userTableBody = document.getElementById("userTableBody");
const adminUserCount = document.getElementById("adminUserCount");
const adminRefresh = document.getElementById("adminRefresh");
const adminSignOut = document.getElementById("adminSignOut");
const adminSignOut2 = document.getElementById("adminSignOut2");

let fbAuth = null;
let firestoreSync = null;
let sortColumn = "lastLogin";
let sortAsc = false;
let cachedUsers = [];

if (!FIREBASE_CONFIG.projectId) {
  adminLoginError.textContent = "Firebase is not configured — fill in src/config/firebase.js.";
} else if (!ADMIN_GOOGLE_ID) {
  adminLoginError.textContent = "Admin ID is not configured — fill in src/config/admin.js.";
} else {
  const fbApp = initializeApp(FIREBASE_CONFIG);
  fbAuth = getAuth(fbApp);
  firestoreSync = new FirestoreSync(getFirestore(fbApp));

  onAuthStateChanged(fbAuth, (firebaseUser) => {
    if (firebaseUser && firebaseUser.uid === ADMIN_GOOGLE_ID) {
      showAdminPanel();
      loadUsers();
    } else if (firebaseUser) {
      showAccessDenied();
    } else {
      showLogin();
    }
  });

  renderGoogleButton();
}

adminSignOut?.addEventListener("click", () => fbAuth && signOut(fbAuth));
adminSignOut2?.addEventListener("click", () => fbAuth && signOut(fbAuth));
adminRefresh?.addEventListener("click", loadUsers);

document.querySelectorAll("th[data-col]").forEach(th => {
  th.addEventListener("click", () => {
    const col = th.dataset.col;
    if (sortColumn === col) {
      sortAsc = !sortAsc;
    } else {
      sortColumn = col;
      sortAsc = col !== "lastLogin";
    }
    renderTable(cachedUsers);
  });
});

function showLogin() {
  adminLogin.hidden = false;
  adminPanel.hidden = true;
  accessDenied.hidden = true;
}

function showAdminPanel() {
  adminLogin.hidden = true;
  adminPanel.hidden = false;
  accessDenied.hidden = true;
}

function showAccessDenied() {
  adminLogin.hidden = true;
  adminPanel.hidden = true;
  accessDenied.hidden = false;
}

function renderGoogleButton() {
  const clientId = document.querySelector('meta[name="google-signin-client_id"]')?.content?.trim();
  if (!clientId) return;

  const waitForGoogle = () => {
    if (!globalThis.google?.accounts?.id) {
      window.setTimeout(waitForGoogle, 100);
      return;
    }
    globalThis.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        try {
          const profile = profileFromGoogleCredential(response.credential);
          if (profile.id !== ADMIN_GOOGLE_ID) {
            showAccessDenied();
            return;
          }
          const credential = GoogleAuthProvider.credential(response.credential);
          await signInWithCredential(fbAuth, credential);
        } catch (e) {
          adminLoginError.textContent = e.message || "Sign-in failed. Please try again.";
        }
      }
    });
    globalThis.google.accounts.id.renderButton(adminGoogleButton, {
      theme: "filled_black",
      size: "large",
      type: "standard",
      text: "signin_with",
      shape: "rectangular"
    });
  };
  waitForGoogle();
}

async function loadUsers() {
  if (!firestoreSync) return;
  try {
    adminUserCount.textContent = "Loading…";
    cachedUsers = await firestoreSync.getAllUsers();
    renderTable(cachedUsers);
  } catch (e) {
    adminUserCount.textContent = `Error: ${e.message}`;
  }
}

function renderTable(users) {
  const sorted = [...users].sort((a, b) => {
    let av = a[sortColumn];
    let bv = b[sortColumn];
    if (sortColumn === "lastLogin") {
      av = av?.toMillis?.() ?? 0;
      bv = bv?.toMillis?.() ?? 0;
    } else if (typeof av === "string") {
      av = av.toLowerCase();
      bv = (bv ?? "").toLowerCase();
    } else {
      av = av ?? 0;
      bv = bv ?? 0;
    }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  adminUserCount.textContent = `${users.length} user${users.length !== 1 ? "s" : ""}`;

  document.querySelectorAll("th[data-col]").forEach(th => {
    th.classList.toggle("sort-active", th.dataset.col === sortColumn);
    if (th.dataset.col === sortColumn) {
      th.textContent = th.textContent.replace(/ [↑↓]$/, "") + (sortAsc ? " ↑" : " ↓");
    } else {
      th.textContent = th.textContent.replace(/ [↑↓]$/, "");
    }
  });

  userTableBody.replaceChildren(...sorted.map(user => {
    const tr = document.createElement("tr");
    const level = (user.currentLevel ?? 0) + 1;
    const lastLoginCell = user.lastLogin?.toDate?.()
      ? formatRelativeTime(user.lastLogin.toDate())
      : `<span class="cell-muted">never</span>`;
    tr.innerHTML = `
      <td>${escHtml(user.name ?? "")}</td>
      <td>${escHtml(user.email ?? "")}</td>
      <td class="cell-level">${level}</td>
      <td>${user.completedObjectivesCount ?? 0}</td>
      <td>${user.wrongDeliveries ?? 0}</td>
      <td>${user.upgradePoints ?? 0}</td>
      <td>${lastLoginCell}</td>
    `;
    return tr;
  }));
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function formatRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
