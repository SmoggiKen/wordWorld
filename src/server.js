import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeWritingImage } from "./ai.js";
import { getActiveCriteria, getProfileState, initializeDatabase, pool } from "./db.js";
import { calculateRewards, levelForXp } from "./rewards.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "..", "public");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/criteria", async (_req, res, next) => {
  try {
    res.json({ criteria: await getActiveCriteria() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/criteria", requireAdmin, async (req, res, next) => {
  try {
    const input = normalizeCriterionInput(req.body);
    const result = await pool.query(
      `INSERT INTO scan_criteria
        (key, label, prompt_text, result_type, xp_reward, unlock_item_key, active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.key,
        input.label,
        input.promptText,
        input.resultType,
        input.xpReward,
        input.unlockItemKey,
        input.active,
        input.sortOrder
      ]
    );
    res.status(201).json({ criterion: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/criteria/:id", requireAdmin, async (req, res, next) => {
  try {
    const fields = pickCriterionPatch(req.body);
    if (fields.length === 0) return res.status(400).json({ error: "No editable fields provided" });

    const assignments = fields.map((field, index) => `${field.column} = $${index + 2}`);
    const values = fields.map((field) => field.value);
    const result = await pool.query(
      `UPDATE scan_criteria
       SET ${assignments.join(", ")}, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, ...values]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Criterion not found" });
    res.json({ criterion: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.post("/api/profiles", async (req, res, next) => {
  try {
    const displayName = String(req.body?.displayName || "Explorer").slice(0, 40);
    const result = await pool.query(
      `INSERT INTO profiles (display_name) VALUES ($1) RETURNING *`,
      [displayName]
    );
    res.status(201).json({ profile: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

app.get("/api/profiles/:id/state", async (req, res, next) => {
  try {
    const state = await getProfileState(req.params.id);
    if (!state) return res.status(404).json({ error: "Profile not found" });
    res.json(state);
  } catch (error) {
    next(error);
  }
});

app.post("/api/scans", upload.single("image"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const profileId = req.body.profileId;
    if (!profileId) return res.status(400).json({ error: "profileId is required" });
    if (!req.file) return res.status(400).json({ error: "image is required" });

    const criteria = await getActiveCriteria();
    const aiResults = await analyzeWritingImage({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      criteria
    });
    const reward = calculateRewards(criteria, aiResults);

    await client.query("BEGIN");

    const scanResult = await client.query(
      `INSERT INTO scans (profile_id, xp_awarded, raw_ai_result)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [profileId, reward.xpAwarded, JSON.stringify(aiResults)]
    );
    const scan = scanResult.rows[0];

    for (const criterion of criteria) {
      const value = Boolean(aiResults[criterion.key]);
      await client.query(
        `INSERT INTO scan_results (scan_id, criterion_id, value_boolean, xp_awarded)
         VALUES ($1, $2, $3, $4)`,
        [scan.id, criterion.id, value, value ? criterion.xp_reward : 0]
      );
    }

    if (reward.xpAwarded > 0) {
      await client.query(
        `UPDATE profiles
         SET xp = xp + $2, level = $3, updated_at = now()
         WHERE id = $1`,
        [profileId, reward.xpAwarded, 1]
      );

      const profileXp = await client.query(`SELECT xp FROM profiles WHERE id = $1`, [profileId]);
      const nextLevel = levelForXp(profileXp.rows[0].xp);
      await client.query(`UPDATE profiles SET level = $2 WHERE id = $1`, [profileId, nextLevel]);
    }

    for (const matched of reward.matched) {
      if (!matched.unlockItemKey) continue;
      await client.query(`
        INSERT INTO profile_inventory_items (profile_id, inventory_item_id)
        SELECT $1, id FROM inventory_items WHERE key = $2
        ON CONFLICT DO NOTHING
      `, [profileId, matched.unlockItemKey]);
    }

    await client.query("COMMIT");

    const state = await getProfileState(profileId);
    res.status(201).json({
      scan,
      aiResults,
      rewards: reward,
      state
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || "Unexpected error" });
});

const port = process.env.PORT || 3000;

initializeWithRetry()
  .then(() => {
    app.listen(port, () => {
      console.log(`Word World listening on ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database", error);
    process.exit(1);
  });

async function initializeWithRetry() {
  const attempts = Number(process.env.DB_INIT_ATTEMPTS || 20);
  const delayMs = Number(process.env.DB_INIT_DELAY_MS || 1500);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await initializeDatabase();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Database initialization attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

function requireAdmin(req, res, next) {
  const configuredToken = process.env.ADMIN_TOKEN;
  if (!configuredToken) {
    return res.status(403).json({ error: "ADMIN_TOKEN is required for criteria changes" });
  }
  if (req.get("x-admin-token") !== configuredToken) {
    return res.status(401).json({ error: "Invalid admin token" });
  }
  next();
}

function normalizeCriterionInput(input = {}) {
  const key = String(input.key || "").trim();
  const label = String(input.label || "").trim();
  const promptText = String(input.promptText || input.prompt_text || "").trim();
  if (!/^[a-z0-9_]{2,50}$/.test(key)) throw new Error("key must be 2-50 lowercase letters, numbers, or underscores");
  if (!label) throw new Error("label is required");
  if (!promptText) throw new Error("promptText is required");

  return {
    key,
    label,
    promptText,
    resultType: String(input.resultType || input.result_type || "boolean"),
    xpReward: Number(input.xpReward ?? input.xp_reward ?? 0),
    unlockItemKey: input.unlockItemKey ?? input.unlock_item_key ?? null,
    active: input.active !== false,
    sortOrder: Number(input.sortOrder ?? input.sort_order ?? 100)
  };
}

function pickCriterionPatch(input = {}) {
  const map = [
    ["label", "label", String],
    ["promptText", "prompt_text", String],
    ["prompt_text", "prompt_text", String],
    ["resultType", "result_type", String],
    ["result_type", "result_type", String],
    ["xpReward", "xp_reward", Number],
    ["xp_reward", "xp_reward", Number],
    ["unlockItemKey", "unlock_item_key", nullableString],
    ["unlock_item_key", "unlock_item_key", nullableString],
    ["active", "active", Boolean],
    ["sortOrder", "sort_order", Number],
    ["sort_order", "sort_order", Number]
  ];

  return map
    .filter(([key]) => Object.hasOwn(input, key))
    .map(([key, column, cast]) => ({ column, value: cast(input[key]) }));
}

function nullableString(value) {
  if (value === null || value === "") return null;
  return String(value);
}
