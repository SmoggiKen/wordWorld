const defaultPlayers = [
  { name: "Ava", color: "#ef476f", x: 23, y: 66 },
  { name: "Leo", color: "#3d7ff0", x: 27, y: 70 },
  { name: "Maya", color: "#2fbf71", x: 31, y: 66 },
  { name: "Noah", color: "#ffd166", x: 29, y: 75 }
];

const islandPositions = [
  { x: 25, y: 64 },
  { x: 27, y: 38 },
  { x: 49, y: 66 },
  { x: 58, y: 36 },
  { x: 73, y: 58 },
  { x: 45, y: 18 }
];

const state = {
  profileId: localStorage.getItem("wordWorldProfileId"),
  profile: null,
  inventory: [],
  criteria: [],
  lastRewards: [],
  roster: [],
  groupStates: new Map(),
  tokenPositions: readJson("wordWorldTokenPositions", {}),
  inventoryOpen: false,
  dragging: null
};

const els = {
  currentYearTitle: document.querySelector("#currentYearTitle"),
  level: document.querySelector("#level"),
  selectedPlayerName: document.querySelector("#selectedPlayerName"),
  groupXp: document.querySelector("#groupXp"),
  islandMap: document.querySelector("#islandMap"),
  playerLayer: document.querySelector("#playerLayer"),
  playerRoster: document.querySelector("#playerRoster"),
  detailPanel: document.querySelector("#detailPanel"),
  playerActionDock: document.querySelector(".player-action-dock"),
  rewardCards: document.querySelector("#rewardCards"),
  modalRewardCards: document.querySelector("#modalRewardCards"),
  scanForm: document.querySelector("#scanForm"),
  imageInput: document.querySelector("#imageInput"),
  uploadLabel: document.querySelector("#uploadLabel"),
  preview: document.querySelector("#preview"),
  questMap: document.querySelector("#questMap"),
  inventoryModal: document.querySelector("#inventoryModal"),
  inventoryModalContent: document.querySelector("#inventoryModalContent"),
  closeInventoryModal: document.querySelector("#closeInventoryModal"),
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
  const savedRoster = readJson("wordWorldRoster", []);
  if (Array.isArray(savedRoster) && savedRoster.length > 0) {
    state.roster = savedRoster.map((player, index) => ({
      ...defaultPlayers[index % defaultPlayers.length],
      ...player
    }));
    state.profileId = localStorage.getItem("wordWorldSelectedProfileId") || state.roster[0].id;
    localStorage.setItem("wordWorldProfileId", state.profileId);
    return;
  }

  const legacyProfileId = localStorage.getItem("wordWorldProfileId");
  const roster = [];

  if (legacyProfileId) {
    roster.push({ ...defaultPlayers[0], id: legacyProfileId, name: "Ava" });
  }

  for (const player of defaultPlayers.slice(roster.length)) {
    const profile = await createProfile(player.name);
    roster.push({ ...player, id: profile.id });
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
  seedTokenPositions();
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

function seedTokenPositions() {
  for (const player of state.roster) {
    if (!state.tokenPositions[player.id]) {
      state.tokenPositions[player.id] = { x: player.x, y: player.y };
    }
  }
  saveTokenPositions();
}

function render() {
  renderHud();
  renderMap();
  renderPlayers();
  renderRoster();
  renderRewards();
  renderDetailForCurrentPlayer();
  renderInventoryModal();
}

function renderHud() {
  const xp = state.profile?.xp || 0;
  const level = state.profile?.level || 1;
  const yearLabel = yearLabelForLevel(level);
  const totalXp = [...state.groupStates.values()].reduce((sum, profileState) => {
    return sum + (profileState.profile?.xp || 0);
  }, 0);
  els.currentYearTitle.textContent = yearLabel;
  els.level.textContent = `${yearLabel} - ${xp} XP`;
  els.selectedPlayerName.textContent = state.profile?.display_name || "Explorer";
  els.groupXp.textContent = totalXp;
}

function renderMap() {
  els.islandMap.innerHTML = state.criteria.map((criterion, index) => {
    const pos = islandPositions[index] || { x: 50, y: 50 };
    return `
      <button
        class="lesson-island"
        type="button"
        data-island-index="${index}"
        style="--x: ${pos.x}; --y: ${pos.y};"
      >
        <span class="island-glow"></span>
        <span class="island-land">
          ${toolImage({
            key: criterion.unlock_item_key || criterion.key,
            name: criterion.unlock_item_name || criterion.label,
            assetPath: criterion.unlock_asset_path
          })}
        </span>
        <span class="island-label">${escapeHtml(criterion.label)}</span>
      </button>
    `;
  }).join("");
}

function renderPlayers() {
  els.playerLayer.innerHTML = state.roster.map((player) => {
    const pos = state.tokenPositions[player.id] || { x: player.x, y: player.y };
    const profileState = state.groupStates.get(player.id);
    const profile = profileState?.profile;
    const active = player.id === state.profileId;
    return `
      <button
        class="map-player ${active ? "active" : ""}"
        type="button"
        data-profile-id="${escapeHtml(player.id)}"
        style="--x: ${pos.x}; --y: ${pos.y}; --player-color: ${escapeHtml(player.color)}"
        aria-label="${escapeHtml(profile?.display_name || player.name)}"
      >
        <span class="player-head">${escapeHtml((profile?.display_name || player.name).slice(0, 1))}</span>
        <span class="player-body"></span>
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
        ${playerToken(player, profile?.display_name)}
        <span>
          <strong>${escapeHtml(profile?.display_name || player.name)}</strong>
          <small>${yearLabelForLevel(profile?.level || 1)} - Island ${progress} - ${profile?.xp || 0} XP</small>
        </span>
      </button>
    `;
  }).join("");
}

function renderRewards() {
  const html = state.lastRewards.length ? state.lastRewards.map((reward) => `
    <div class="reward-card">
      <strong>${toolImage({
        key: reward.unlockItemKey || reward.key,
        name: reward.label,
        assetPath: assetPathFor(reward.unlockItemKey || reward.key)
      })} ${escapeHtml(reward.label)}</strong>
      <span>+${reward.xpAwarded} XP</span>
    </div>
  `).join("") : `<p class="empty-state">No rewards yet.</p>`;

  els.rewardCards.innerHTML = html;
  els.modalRewardCards.innerHTML = html;
}

function renderDetailForCurrentPlayer() {
  els.detailPanel.hidden = true;
}

function renderIslandDetail(index) {
  const criterion = state.criteria[index];
  if (!criterion) return;
  els.detailPanel.hidden = false;
  els.detailPanel.innerHTML = `
    <p class="eyebrow">Lesson Island</p>
    <div class="detail-title">
      ${toolImage({
        key: criterion.unlock_item_key || criterion.key,
        name: criterion.unlock_item_name || criterion.label,
        assetPath: criterion.unlock_asset_path
      })}
      <div>
        <h2>${escapeHtml(criterion.label)}</h2>
        <p class="muted">+${criterion.xp_reward} XP</p>
      </div>
    </div>
    <p>${escapeHtml(criterion.prompt_text)}</p>
    <div class="detail-list">
      <strong>Unlocks</strong>
      <span>${escapeHtml(criterion.unlock_item_name || "Writing tool")}</span>
    </div>
  `;
}

function playerDetailHtml(player, profileState) {
  const profile = profileState?.profile;
  const unlocked = profileState?.inventory.filter((item) => item.unlocked) || [];
  const locked = profileState?.inventory.filter((item) => !item.unlocked) || [];
  return `
    <p class="eyebrow">Selected Player</p>
    <div class="detail-title">
      ${playerToken(player, profile?.display_name)}
      <div>
        <h2 id="inventoryModalTitle">${escapeHtml(profile?.display_name || player.name)}</h2>
        <p class="muted">${yearLabelForLevel(profile?.level || 1)} - Island ${progressIslandIndex(profileState) + 1} - ${profile?.xp || 0} XP</p>
      </div>
    </div>
    <div class="inventory-heading">
      <strong>Inventory</strong>
      <span>${unlocked.length}/${unlocked.length + locked.length} tools unlocked</span>
    </div>
    <div class="inventory-popover-grid">
      ${[...unlocked, ...locked].map((item) => `
        <div class="mini-tool ${item.unlocked ? "" : "locked"}">
          ${toolImage({
            key: item.key,
            name: item.name,
            assetPath: item.asset_path,
            locked: !item.unlocked
          })}
          <span>${escapeHtml(item.name)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function openInventoryModal() {
  state.inventoryOpen = true;
  renderInventoryModal();
  els.inventoryModal.hidden = false;
  document.body.classList.add("modal-open");
  els.closeInventoryModal.focus();
}

function closeInventoryModal() {
  state.inventoryOpen = false;
  els.inventoryModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderInventoryModal() {
  if (!state.inventoryOpen) return;
  const player = state.roster.find((item) => item.id === state.profileId);
  if (!player) return closeInventoryModal();
  const profileState = state.groupStates.get(player.id);
  els.inventoryModalContent.innerHTML = playerDetailHtml(player, profileState);
}

els.imageInput.addEventListener("change", () => {
  const file = els.imageInput.files?.[0];
  if (!file) return;
  els.preview.src = URL.createObjectURL(file);
  els.preview.hidden = false;
  els.uploadLabel.textContent = file.name.length > 22 ? `${file.name.slice(0, 19)}...` : file.name;
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
  button.textContent = "Assessing...";

  try {
    const payload = await api("/api/scans", {
      method: "POST",
      body: formData
    });
    state.profile = payload.state.profile;
    state.inventory = payload.state.inventory;
    state.groupStates.set(state.profileId, payload.state);
    state.lastRewards = payload.rewards.matched;
    moveCurrentPlayerToProgress();
    render();
    showToast(`${state.profile.display_name} earned +${payload.rewards.xpAwarded} XP`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Assess Work";
  }
});

els.islandMap.addEventListener("pointerenter", (event) => {
  const island = event.target.closest("[data-island-index]");
  if (!island) return;
  renderIslandDetail(Number(island.dataset.islandIndex));
}, true);

els.islandMap.addEventListener("focusin", (event) => {
  const island = event.target.closest("[data-island-index]");
  if (!island) return;
  renderIslandDetail(Number(island.dataset.islandIndex));
});

els.islandMap.addEventListener("click", (event) => {
  const island = event.target.closest("[data-island-index]");
  if (!island) return;
  renderIslandDetail(Number(island.dataset.islandIndex));
});

els.detailPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='open-inventory']");
  if (!button) return;
  openInventoryModal();
});

els.playerActionDock.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='open-inventory']");
  if (!button) return;
  openInventoryModal();
});

els.playerRoster.addEventListener("click", (event) => {
  const card = event.target.closest("[data-profile-id]");
  if (!card) return;
  setCurrentProfile(card.dataset.profileId);
  render();
});

els.questMap.addEventListener("click", (event) => {
  if (event.target.closest(".lesson-island") || event.target.closest(".map-player")) return;
  const rect = els.questMap.getBoundingClientRect();
  updateSelectedTokenPosition(event.clientX, event.clientY, rect);
  saveTokenPositions();
  renderPlayers();
});

els.playerLayer.addEventListener("pointerdown", (event) => {
  const token = event.target.closest("[data-profile-id]");
  if (!token) return;
  const profileId = token.dataset.profileId;
  setCurrentProfile(profileId);
  renderDetailForCurrentPlayer();
  renderInventoryModal();
  token.setPointerCapture(event.pointerId);
  state.dragging = { profileId, pointerId: event.pointerId, rect: els.questMap.getBoundingClientRect(), mode: "pointer" };
  token.classList.add("dragging");
  event.preventDefault();
});

els.playerLayer.addEventListener("pointermove", (event) => {
  if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
  const { profileId, rect } = state.dragging;
  const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 4, 96);
  const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 6, 94);
  state.tokenPositions[profileId] = { x, y };
  const token = els.playerLayer.querySelector(`[data-profile-id="${cssEscape(profileId)}"]`);
  if (token) {
    token.style.setProperty("--x", x);
    token.style.setProperty("--y", y);
  }
});

els.playerLayer.addEventListener("pointerup", finishDrag);
els.playerLayer.addEventListener("pointercancel", finishDrag);

els.playerLayer.addEventListener("mousedown", (event) => {
  if (state.dragging) return;
  const token = event.target.closest("[data-profile-id]");
  if (!token || event.button !== 0) return;
  const profileId = token.dataset.profileId;
  setCurrentProfile(profileId);
  renderDetailForCurrentPlayer();
  renderInventoryModal();
  state.dragging = { profileId, rect: els.questMap.getBoundingClientRect(), mode: "mouse" };
  token.classList.add("dragging");
  event.preventDefault();
});

document.addEventListener("mousemove", (event) => {
  if (!state.dragging || state.dragging.mode !== "mouse") return;
  updateDraggedToken(event.clientX, event.clientY);
});

document.addEventListener("mouseup", () => {
  if (!state.dragging || state.dragging.mode !== "mouse") return;
  completeDrag();
});

els.closeInventoryModal.addEventListener("click", closeInventoryModal);

els.inventoryModal.addEventListener("click", (event) => {
  if (event.target === els.inventoryModal) closeInventoryModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.inventoryOpen) closeInventoryModal();
});

function finishDrag(event) {
  if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
  completeDrag();
}

function updateDraggedToken(clientX, clientY) {
  if (!state.dragging) return;
  updateSelectedTokenPosition(clientX, clientY, state.dragging.rect, state.dragging.profileId);
}

function updateSelectedTokenPosition(clientX, clientY, rect, profileId = state.profileId) {
  const x = clamp(((clientX - rect.left) / rect.width) * 100, 4, 96);
  const y = clamp(((clientY - rect.top) / rect.height) * 100, 6, 94);
  state.tokenPositions[profileId] = { x, y };
  const token = els.playerLayer.querySelector(`[data-profile-id="${cssEscape(profileId)}"]`);
  if (token) {
    token.style.setProperty("--x", x);
    token.style.setProperty("--y", y);
  }
}

function completeDrag() {
  const token = els.playerLayer.querySelector(`[data-profile-id="${cssEscape(state.dragging.profileId)}"]`);
  token?.classList.remove("dragging");
  saveTokenPositions();
  renderPlayers();
  renderRoster();
  state.dragging = null;
}

function moveCurrentPlayerToProgress() {
  const index = progressIslandIndex(state.groupStates.get(state.profileId));
  const pos = islandPositions[index] || islandPositions[0];
  state.tokenPositions[state.profileId] = {
    x: clamp(pos.x + 2, 4, 96),
    y: clamp(pos.y + 8, 6, 94)
  };
  saveTokenPositions();
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

function playerToken(player, name = player.name) {
  return `<span class="player-token" style="--player-color: ${escapeHtml(player.color)}">${escapeHtml(name.slice(0, 1))}</span>`;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function saveTokenPositions() {
  localStorage.setItem("wordWorldTokenPositions", JSON.stringify(state.tokenPositions));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function yearLabelForLevel(level) {
  return Number(level) <= 1 ? "Y1" : "Y2";
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
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
