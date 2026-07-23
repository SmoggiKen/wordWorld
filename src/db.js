import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

const defaultInventoryItems = [
  ["sentence_hammer", "Sentence Hammer", "A sturdy tool for building complete sentences."],
  ["capital_spark", "Capital Spark", "A bright spark for starting sentences strongly."],
  ["full_stop_shield", "Full Stop Shield", "A shield that protects the end of a sentence."],
  ["space_boots", "Finger Space Boots", "Boots that help words stand apart."],
  ["adjective_feather", "Adjective Feather", "A feather for adding detail and description."],
  ["connector_key", "Connector Key", "A key for joining ideas with because."]
];

const defaultCriteria = [
  ["capital_letter", "Capital Letter", "Does the writing contain a capital letter?", "boolean", 10, "capital_spark", 10],
  ["full_stop", "Full Stop", "Does the writing contain a full stop?", "boolean", 10, "full_stop_shield", 20],
  ["complete_sentence", "Complete Sentence", "Is there at least one complete sentence?", "boolean", 20, "sentence_hammer", 30],
  ["visible_spaces", "Finger Spaces", "Are spaces visible between words?", "boolean", 10, "space_boots", 40],
  ["adjective", "Vocabulary Gem", "Does the writing contain an adjective?", "boolean", 15, "adjective_feather", 50],
  ["because", "Connector Key", "Does the writing contain the word because?", "boolean", 15, "connector_key", 60]
];

export async function initializeDatabase() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name text NOT NULL DEFAULT 'Explorer',
      xp integer NOT NULL DEFAULT 0,
      level integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text UNIQUE NOT NULL,
      name text NOT NULL,
      description text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS scan_criteria (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      key text UNIQUE NOT NULL,
      label text NOT NULL,
      prompt_text text NOT NULL,
      result_type text NOT NULL DEFAULT 'boolean',
      xp_reward integer NOT NULL DEFAULT 0,
      unlock_item_key text REFERENCES inventory_items(key),
      active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS scans (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      xp_awarded integer NOT NULL DEFAULT 0,
      raw_ai_result jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS scan_results (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      scan_id uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      criterion_id uuid NOT NULL REFERENCES scan_criteria(id),
      value_boolean boolean,
      value_number numeric,
      value_text text,
      xp_awarded integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (scan_id, criterion_id)
    );

    CREATE TABLE IF NOT EXISTS profile_inventory_items (
      profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      unlocked_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (profile_id, inventory_item_id)
    );
  `);

  for (const item of defaultInventoryItems) {
    await pool.query(
      `INSERT INTO inventory_items (key, name, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      item
    );
  }

  for (const criterion of defaultCriteria) {
    await pool.query(
      `INSERT INTO scan_criteria (key, label, prompt_text, result_type, xp_reward, unlock_item_key, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (key) DO NOTHING`,
      criterion
    );
  }
}

export async function getActiveCriteria() {
  const result = await pool.query(
    `SELECT * FROM scan_criteria WHERE active = true ORDER BY sort_order ASC, label ASC`
  );
  return result.rows;
}

export async function getProfileState(profileId) {
  const profileResult = await pool.query(`SELECT * FROM profiles WHERE id = $1`, [profileId]);
  if (profileResult.rowCount === 0) return null;

  const inventoryResult = await pool.query(`
    SELECT
      ii.key,
      ii.name,
      ii.description,
      pii.unlocked_at IS NOT NULL AS unlocked,
      pii.unlocked_at
    FROM inventory_items ii
    LEFT JOIN profile_inventory_items pii
      ON pii.inventory_item_id = ii.id AND pii.profile_id = $1
    ORDER BY ii.name ASC
  `, [profileId]);

  const scansResult = await pool.query(`
    SELECT id, xp_awarded, raw_ai_result, created_at
    FROM scans
    WHERE profile_id = $1
    ORDER BY created_at DESC
    LIMIT 5
  `, [profileId]);

  return {
    profile: profileResult.rows[0],
    inventory: inventoryResult.rows,
    recentScans: scansResult.rows
  };
}
