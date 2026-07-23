const state = {
  profileId: localStorage.getItem("wordWorldProfileId"),
  profile: null,
  inventory: [],
  criteria: [],
  lastRewards: []
};

const els = {
  level: document.querySelector("#level"),
  xp: document.querySelector("#xp"),
  writerName: document.querySelector("#writerName"),
  nextLevel: document.querySelector("#nextLevel"),
  progressBar: document.querySelector("#progressBar"),
  criteriaList: document.querySelector("#criteriaList"),
  inventoryGrid: document.querySelector("#inventoryGrid"),
  rewardCards: document.querySelector("#rewardCards"),
  scanForm: document.querySelector("#scanForm"),
  imageInput: document.querySelector("#imageInput"),
  preview: document.querySelector("#preview"),
  toast: document.querySelector("#toast")
};

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function ensureProfile() {
  if (state.profileId) return;
  const payload = await api("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: "Explorer" })
  });
  state.profileId = payload.profile.id;
  localStorage.setItem("wordWorldProfileId", state.profileId);
}

async function loadState() {
  await ensureProfile();
  const [profileState, criteriaState] = await Promise.all([
    api(`/api/profiles/${state.profileId}/state`),
    api("/api/criteria")
  ]);

  state.profile = profileState.profile;
  state.inventory = profileState.inventory;
  state.criteria = criteriaState.criteria;
  render();
}

function render() {
  renderProfile();
  renderCriteria();
  renderInventory();
  renderRewards();
}

function renderProfile() {
  const xp = state.profile?.xp || 0;
  const level = state.profile?.level || 1;
  const levelXp = xp % 100;
  els.level.textContent = `Level ${level}`;
  els.xp.textContent = `${xp} XP`;
  els.writerName.textContent = state.profile?.display_name || "Explorer";
  els.nextLevel.textContent = `${100 - levelXp} XP to Level ${level + 1}`;
  els.progressBar.style.width = `${levelXp}%`;
}

function renderCriteria() {
  els.criteriaList.innerHTML = state.criteria.map((criterion) => `
    <div class="criterion">
      <div class="criterion-icon">${iconFor(criterion.key)}</div>
      <div>
        <strong>${escapeHtml(criterion.label)}</strong>
        <small>${escapeHtml(criterion.prompt_text)}</small>
      </div>
      <span>+${criterion.xp_reward}</span>
    </div>
  `).join("");
}

function renderInventory() {
  els.inventoryGrid.innerHTML = state.inventory.map((item) => `
    <div class="inventory-item ${item.unlocked ? "" : "locked"}">
      <div class="inventory-icon">${item.unlocked ? iconFor(item.key) : "?"}</div>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <p class="muted">${escapeHtml(item.description)}</p>
      </div>
    </div>
  `).join("");
}

function renderRewards() {
  if (!state.lastRewards.length) {
    els.rewardCards.innerHTML = `<p class="empty-state">Scan a sentence to see rewards here.</p>`;
    return;
  }

  els.rewardCards.innerHTML = state.lastRewards.map((reward) => `
    <div class="reward-card">
      <strong>${iconFor(reward.key)} ${escapeHtml(reward.label)}</strong>
      <span>+${reward.xpAwarded} XP</span>
    </div>
  `).join("");
}

els.imageInput.addEventListener("change", () => {
  const file = els.imageInput.files?.[0];
  if (!file) return;
  els.preview.src = URL.createObjectURL(file);
  els.preview.hidden = false;
});

els.scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = els.scanForm.querySelector("button");
  const file = els.imageInput.files?.[0];
  if (!file) return showToast("Choose a photo first.");

  const formData = new FormData();
  formData.append("profileId", state.profileId);
  formData.append("image", file);

  button.disabled = true;
  button.textContent = "Scanning...";

  try {
    const payload = await api("/api/scans", {
      method: "POST",
      body: formData
    });
    state.profile = payload.state.profile;
    state.inventory = payload.state.inventory;
    state.lastRewards = payload.rewards.matched;
    render();
    activateTab("rewards");
    showToast(`Adventure complete: +${payload.rewards.xpAwarded} XP`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Start Adventure";
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.view));
});

function activateTab(view) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${view}View`);
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function iconFor(key) {
  const icons = {
    capital_letter: "A",
    capital_spark: "A",
    full_stop: ".",
    full_stop_shield: ".",
    complete_sentence: "+",
    sentence_hammer: "+",
    visible_spaces: "_",
    space_boots: "_",
    adjective: "*",
    adjective_feather: "*",
    because: "&",
    connector_key: "&"
  };
  return icons[key] || "+";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadState().catch((error) => {
  showToast(error.message);
});
