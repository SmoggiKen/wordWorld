const defaultPlayers = [
  { name: "Ava", color: "#ef476f" },
  { name: "Leo", color: "#3d7ff0" },
  { name: "Maya", color: "#2fbf71" },
  { name: "Noah", color: "#ffd166" }
];

const state = {
  profileId: localStorage.getItem("wordWorldProfileId"),
  profile: null,
  inventory: [],
  criteria: [],
  lastRewards: [],
  roster: [],
  groupStates: new Map()
};

const els = {
  level: document.querySelector("#level"),
  xp: document.querySelector("#xp"),
  writerName: document.querySelector("#writerName"),
  nextLevel: document.querySelector("#nextLevel"),
  progressBar: document.querySelector("#progressBar"),
  scanWriterName: document.querySelector("#scanWriterName"),
  inventoryWriterName: document.querySelector("#inventoryWriterName"),
  changeWriterButton: document.querySelector("#changeWriterButton"),
  groupXp: document.querySelector("#groupXp"),
  islandMap: document.querySelector("#islandMap"),
  playerRoster: document.querySelector("#playerRoster"),
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

async function createProfile(displayName) {
  const payload = await api("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName })
  });
  return payload.profile;
}

async function ensureRoster() {
  const savedRoster = JSON.parse(localStorage.getItem("wordWorldRoster") || "[]");
  if (Array.isArray(savedRoster) && savedRoster.length > 0) {
    state.roster = savedRoster;
    state.profileId = localStorage.getItem("wordWorldSelectedProfileId") || savedRoster[0].id;
    localStorage.setItem("wordWorldProfileId", state.profileId);
    return;
  }

  const legacyProfileId = localStorage.getItem("wordWorldProfileId");
  const roster = [];

  if (legacyProfileId) {
    roster.push({ id: legacyProfileId, name: "Ava", color: defaultPlayers[0].color });
  }

  for (const player of defaultPlayers.slice(roster.length)) {
    const profile = await createProfile(player.name);
    roster.push({ id: profile.id, name: player.name, color: player.color });
  }

  state.roster = roster;
  state.profileId = roster[0].id;
  localStorage.setItem("wordWorldRoster", JSON.stringify(roster));
  localStorage.setItem("wordWorldSelectedProfileId", state.profileId);
  localStorage.setItem("wordWorldProfileId", state.profileId);
}

async function loadState() {
  await ensureRoster();
  const criteriaState = await api("/api/criteria");
  state.criteria = criteriaState.criteria;
  await loadGroupStates();
  setCurrentProfile(state.profileId);
  render();
}

async function loadGroupStates() {
  const states = await Promise.all(
    state.roster.map(async (player) => {
      const profileState = await api(`/api/profiles/${player.id}/state`);
      return [player.id, profileState];
    })
  );
  state.groupStates = new Map(states);
}

function setCurrentProfile(profileId) {
  const nextState = state.groupStates.get(profileId);
  if (!nextState) return;
  state.profileId = profileId;
  state.profile = nextState.profile;
  state.inventory = nextState.inventory;
  localStorage.setItem("wordWorldSelectedProfileId", profileId);
  localStorage.setItem("wordWorldProfileId", profileId);
}

function render() {
  renderProfile();
  renderCriteria();
  renderInventory();
  renderRewards();
  renderMap();
  renderRoster();
}

function renderProfile() {
  const xp = state.profile?.xp || 0;
  const level = state.profile?.level || 1;
  const levelXp = xp % 100;
  els.level.textContent = `Level ${level}`;
  els.xp.textContent = `${xp} XP`;
  els.writerName.textContent = state.profile?.display_name || "Explorer";
  els.scanWriterName.textContent = state.profile?.display_name || "Explorer";
  els.inventoryWriterName.textContent = state.profile?.display_name || "your writer";
  els.nextLevel.textContent = `${100 - levelXp} XP to Level ${level + 1}`;
  els.progressBar.style.width = `${levelXp}%`;
}

function renderCriteria() {
  els.criteriaList.innerHTML = state.criteria.map((criterion) => `
    <div class="criterion">
      <div class="criterion-icon">${toolImage({
        key: criterion.unlock_item_key || criterion.key,
        name: criterion.unlock_item_name || criterion.label,
        assetPath: criterion.unlock_asset_path
      })}</div>
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
      <div class="inventory-icon">${toolImage({
        key: item.key,
        name: item.name,
        assetPath: item.asset_path,
        locked: !item.unlocked
      })}</div>
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
      <strong>${toolImage({
        key: reward.unlockItemKey || reward.key,
        name: reward.label,
        assetPath: assetPathFor(reward.unlockItemKey || reward.key)
      })} ${escapeHtml(reward.label)}</strong>
      <span>+${reward.xpAwarded} XP</span>
    </div>
  `).join("");
}

function renderMap() {
  const totalXp = [...state.groupStates.values()].reduce((sum, profileState) => {
    return sum + (profileState.profile?.xp || 0);
  }, 0);
  els.groupXp.textContent = totalXp;

  els.islandMap.innerHTML = state.criteria.map((criterion, index) => {
    const islandPlayers = state.roster.filter((player) => {
      const profileState = state.groupStates.get(player.id);
      return progressIslandIndex(profileState) === index;
    });
    const isReached = progressIslandIndex(state.groupStates.get(state.profileId)) >= index;

    return `
      <button class="lesson-island ${isReached ? "reached" : ""}" type="button" data-island="${index}">
        <span class="island-water"></span>
        <span class="island-land">
          ${toolImage({
            key: criterion.unlock_item_key || criterion.key,
            name: criterion.unlock_item_name || criterion.label,
            assetPath: criterion.unlock_asset_path
          })}
        </span>
        <span class="island-label">${escapeHtml(criterion.label)}</span>
        <span class="island-players">
          ${islandPlayers.map((player) => playerToken(player)).join("")}
        </span>
      </button>
    `;
  }).join("");
}

function renderRoster() {
  els.playerRoster.innerHTML = state.roster.map((player) => {
    const profileState = state.groupStates.get(player.id);
    const profile = profileState?.profile;
    const active = player.id === state.profileId;
    const progress = progressIslandIndex(profileState) + 1;
    return `
      <button class="player-card ${active ? "active" : ""}" type="button" data-profile-id="${escapeHtml(player.id)}">
        ${playerToken(player)}
        <span>
          <strong>${escapeHtml(profile?.display_name || player.name)}</strong>
          <small>Island ${progress} - ${profile?.xp || 0} XP</small>
        </span>
      </button>
    `;
  }).join("");
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
    state.groupStates.set(state.profileId, payload.state);
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

els.changeWriterButton.addEventListener("click", () => activateTab("rewards"));

els.playerRoster.addEventListener("click", (event) => {
  const card = event.target.closest("[data-profile-id]");
  if (!card) return;
  setCurrentProfile(card.dataset.profileId);
  render();
  activateTab("scan");
});

function activateTab(view) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${view}View`);
  });
}

function progressIslandIndex(profileState) {
  if (!profileState) return 0;
  const unlockedKeys = new Set(
    profileState.inventory
      .filter((item) => item.unlocked)
      .map((item) => item.key)
  );
  const unlockedCriteria = state.criteria.filter((criterion) => {
    return criterion.unlock_item_key && unlockedKeys.has(criterion.unlock_item_key);
  });
  return Math.min(Math.max(unlockedCriteria.length, 0), Math.max(state.criteria.length - 1, 0));
}

function playerToken(player) {
  return `<span class="player-token" style="--player-color: ${escapeHtml(player.color)}">${escapeHtml(player.name.slice(0, 1))}</span>`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function toolImage({ key, name, assetPath, locked = false }) {
  const src = assetPath || assetPathFor(key);
  if (!src) return `<span class="tool-fallback">${locked ? "?" : "+"}</span>`;

  return `<img
    class="tool-image"
    src="${escapeHtml(src)}"
    alt="${locked ? "Locked tool" : escapeHtml(name || "Writing tool")}"
    loading="lazy"
  />`;
}

function assetPathFor(key) {
  const paths = {
    capital_spark: "/assets/tools/capital-spark.svg",
    full_stop_shield: "/assets/tools/full-stop-shield.svg",
    sentence_hammer: "/assets/tools/sentence-hammer.svg",
    space_boots: "/assets/tools/space-boots.svg",
    adjective_feather: "/assets/tools/adjective-feather.svg",
    connector_key: "/assets/tools/connector-key.svg"
  };
  return paths[key] || null;
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
