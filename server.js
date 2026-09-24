import express from "express";
import pkg from "pg";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ---------- Database ----------
// Raadi xiriirka database-ka magacyo kala duwan (Railway wuxuu isticmaali karaa mid kasta)
function resolveDbUrl() {
  const e = process.env;
  const direct = e.DATABASE_URL || e.DATABASE_PRIVATE_URL || e.POSTGRES_URL || e.DATABASE_PUBLIC_URL;
  if (direct && !direct.includes("${{")) return direct.trim();
  if (e.PGHOST && e.PGUSER && e.PGPASSWORD && e.PGDATABASE) {
    return `postgresql://${encodeURIComponent(e.PGUSER)}:${encodeURIComponent(e.PGPASSWORD)}@${e.PGHOST}:${e.PGPORT || 5432}/${e.PGDATABASE}`;
  }
  return "";
}
const DB_URL = resolveDbUrl();
let dbReady = false;
let dbError = "";

if (!DB_URL) {
  console.warn("⚠️  DATABASE_URL lama helin. Fur boggaaga si aad u aragto tilmaamaha saxda ah.");
}

const pool = new Pool({
  connectionString: DB_URL || undefined,
  ssl: DB_URL && /railway|rlwy\.net/.test(DB_URL) ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT DEFAULT '',
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS evaluations (
    id TEXT PRIMARY KEY,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    score NUMERIC NOT NULL DEFAULT 0,
    meta JSONB NOT NULL DEFAULT '{}',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
  // Migration safety: if an older deploy created the table with the old columns,
  // make sure the new columns exist too.
  await pool.query(`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS score NUMERIC NOT NULL DEFAULT 0`);
  // Drop obsolete columns from the old 3-field schema (prep/classroom/assessment)
  // so inserts using the new "items" JSONB column don't fail on NOT NULL.
  await pool.query(`ALTER TABLE evaluations DROP COLUMN IF EXISTS prep`);
  await pool.query(`ALTER TABLE evaluations DROP COLUMN IF EXISTS classroom`);
  await pool.query(`ALTER TABLE evaluations DROP COLUMN IF EXISTS assessment`);
  dbReady = true;
  dbError = "";
  console.log("✅ Database ready");
}
async function initDbWithRetry() {
  if (!DB_URL) return;
  try {
    await initDb();
  } catch (e) {
    dbError = String(e && e.message ? e.message : e);
    console.error("DB init error:", dbError, "— dib ayaan isku dayayaa 5 ilbiriqsi kadib");
    setTimeout(initDbWithRetry, 5000);
  }
}
initDbWithRetry();

// ---------- Bog tilmaam ah haddii wax maqan yihiin ----------
function setupProblem() {
  if (!DB_URL) {
    return {
      title: "DATABASE_URL ma jiro",
      steps: [
        "Railway → project-kaaga → guji sanduuqa <b>Postgres</b> → <b>Variables</b> → koobiyee qiimaha <b>DATABASE_URL</b>.",
        "Guji sanduuqa <b>Darulhuda-School</b> → <b>Variables</b> → <b>Raw Editor</b>.",
        "Ku dar xariiq cusub: <code>DATABASE_URL=</code> oo ku dhejii URL-ka aad koobiyeysay, kadibna <b>Update Variables</b> → <b>Deploy</b>.",
        "Haddii Postgres uusan jirin: <b>+ Create → Database → PostgreSQL</b>."
      ],
    };
  }
  if (!process.env.ADMIN_PASSWORD) {
    return {
      title: "ADMIN_PASSWORD ma jiro",
      steps: [
        "Railway → sanduuqa <b>Darulhuda-School</b> → <b>Variables</b> → <b>New Variable</b>.",
        "Magac: <code>ADMIN_PASSWORD</code>, qiime: erayga sirta ah ee aad rabto. Kadibna <b>Deploy</b>."
      ],
    };
  }
  if (!dbReady) {
    return {
      title: "Database-ka wali lama xidhin",
      steps: [
        "Server-ku wuu isku dayayaa inuu ku xidhmo database-ka. Sug 10 ilbiriqsi oo dib u cusbooneysii bogga.",
        "Haddii uu sii socdo, hubi in URL-ka database-ka uu sax yahay (ha ka koobiyeynin meel aan dhammaystirneyn).",
        "Khaladka: <code>" + String(dbError || "aan la aqoon").replace(/[<>&]/g, "") + "</code>"
      ],
    };
  }
  return null;
}

app.get("/health", (req, res) => {
  res.json({
    ok: !setupProblem(),
    dbUrlFound: !!DB_URL,
    adminPasswordSet: !!process.env.ADMIN_PASSWORD,
    dbReady,
    dbError,
  });
});

app.use((req, res, next) => {
  const p = setupProblem();
  if (!p || req.path === "/health" || req.path === "/logo.jpg") return next();
  if (req.path.startsWith("/api/")) return res.status(503).json({ error: p.title });
  res.status(503).send(`<!doctype html><html lang="so"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Habayn baa loo baahan yahay</title>
<style>body{font-family:system-ui,sans-serif;background:#f3f4f8;margin:0;padding:20px;color:#1a1f36}.c{max-width:560px;margin:30px auto;background:#fff;border-radius:14px;padding:22px;box-shadow:0 2px 12px #0002}h1{font-size:1.15rem;color:#b3261e;margin-top:0}li{margin:10px 0;line-height:1.5}code{background:#eef0f7;padding:2px 6px;border-radius:5px;word-break:break-all}</style></head>
<body><div class="c"><h1>⚠️ ${p.title}</h1><ol>${p.steps.map((x) => "<li>" + x + "</li>").join("")}</ol><p style="color:#666;font-size:.85rem">Marka aad dhammayso, dib u cusbooneysii bogga. Hubin: <code>/health</code></p></div></body></html>`);
});

// ---------- Admin auth ----------
// Fudud: password ayaa lagu xaqiijiyaa header-ka x-admin-password mar walba.
function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD lama dejin server-ka." });
  }
  const pw = req.header("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.post("/api/login", (req, res) => {
  const { password } = req.body || {};
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ ok: false, error: "ADMIN_PASSWORD lama dejin server-ka." });
  }
  if (password === process.env.ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

// ---------- Teachers (admin) ----------
app.get("/api/teachers", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM teachers ORDER BY name ASC");
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/teachers", requireAdmin, async (req, res) => {
  try {
    const { name, subject } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "name required" });
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(12).toString("hex");
    await pool.query(
      "INSERT INTO teachers (id, name, subject, token) VALUES ($1,$2,$3,$4)",
      [id, name.trim(), (subject || "").trim(), token]
    );
    res.json({ id, name: name.trim(), subject: (subject || "").trim(), token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/teachers/bulk", requireAdmin, async (req, res) => {
  try {
    const { names } = req.body || {};
    if (!Array.isArray(names) || !names.length) return res.status(400).json({ error: "names required" });
    const created = [];
    for (const raw of names) {
      const name = String(raw || "").trim();
      if (!name) continue;
      const id = crypto.randomUUID();
      const token = crypto.randomBytes(12).toString("hex");
      await pool.query(
        "INSERT INTO teachers (id, name, subject, token) VALUES ($1,$2,$3,$4)",
        [id, name, "", token]
      );
      created.push({ id, name, token });
    }
    res.json({ ok: true, created: created.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.delete("/api/teachers/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM teachers WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Evaluations (admin) ----------
app.get("/api/evaluations", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM evaluations ORDER BY date ASC");
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/evaluations", requireAdmin, async (req, res) => {
  try {
    const { teacherId, date, items, meta } = req.body || {};
    if (!teacherId || !date) return res.status(400).json({ error: "missing fields" });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "items required" });
    // Validate + compute score server-side (rating: 1-5 scale)
    let sum = 0;
    const cleanItems = items.map((it) => {
      const rating = Number(it.rating);
      if (![1, 2, 3, 4, 5].includes(rating)) throw new Error("invalid rating");
      sum += rating;
      return {
        key: String(it.key || ""),
        title: String(it.title || ""),
        text: String(it.text || ""),
        rating,
        comment: String(it.comment || "").trim(),
      };
    });
    const score = Math.round((sum / (cleanItems.length * 5)) * 1000) / 10; // percentage, 1 decimal
    const cleanMeta = {
      school: String((meta && meta.school) || "").trim(),
      class: String((meta && meta.class) || "").trim(),
      supervisorName: String((meta && meta.supervisorName) || "").trim(),
      strengths: String((meta && meta.strengths) || "").trim(),
      improvements: String((meta && meta.improvements) || "").trim(),
      recommendations: String((meta && meta.recommendations) || "").trim(),
      followupArea: String((meta && meta.followupArea) || "").trim(),
      followupAction: String((meta && meta.followupAction) || "").trim(),
      followupDate: String((meta && meta.followupDate) || "").trim(),
      teacherSignature: String((meta && meta.teacherSignature) || "").trim(),
      supervisorSignature: String((meta && meta.supervisorSignature) || "").trim(),
    };
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO evaluations (id, teacher_id, date, items, score, meta)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, teacherId, date, JSON.stringify(cleanItems), score, JSON.stringify(cleanMeta)]
    );
    res.json({ ok: true, id, score });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || "server error" });
  }
});

app.delete("/api/evaluations/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM evaluations WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Public teacher link (no password needed - token is the secret) ----------
app.get("/api/public/:token", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM teachers WHERE token=$1", [req.params.token]);
    if (!rows.length) return res.status(404).json({ error: "not found" });
    const teacher = rows[0];
    const evalsRes = await pool.query(
      "SELECT * FROM evaluations WHERE teacher_id=$1 ORDER BY date ASC",
      [teacher.id]
    );
    res.json({
      teacher: { name: teacher.name, subject: teacher.subject },
      evaluations: evalsRes.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

// ---------- Static pages ----------
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  },
}));

app.get("/t/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "teacher.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server wuxuu ku shaqeynayaa port ${PORT}`));
