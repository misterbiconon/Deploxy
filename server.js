const express  = require('express');
const multer   = require('multer');
const unzipper = require('unzipper');
const path     = require('path');
const fs       = require('fs');

const app       = express();
const PORT      = process.env.PORT || 3000;
const SITES_DIR = path.join(__dirname, 'sites');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(SITES_DIR))  fs.mkdirSync(SITES_DIR);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const upload = multer({ dest: UPLOAD_DIR });

// ── RADAR REAL DE USUARIOS ────────────────────────────────────────────
// Map de ip → timestamp de última petición
const activeUsers = new Map();
const USER_TTL    = 20000; // 20s sin actividad = desconectado

function pruneInactive() {
  const now = Date.now();
  for (const [ip, ts] of activeUsers) {
    if (now - ts > USER_TTL) activeUsers.delete(ip);
  }
}

// Registra la IP real en cada petición
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
           || req.socket.remoteAddress;
  activeUsers.set(ip, Date.now());
  next();
});

// ── STATICS ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/sites', express.static(SITES_DIR));

// ── API: PROYECTOS + USUARIOS EN VIVO ─────────────────────────────────
app.get('/api/projects', (req, res) => {
  pruneInactive();
  try {
    const projects = fs.existsSync(SITES_DIR)
      ? fs.readdirSync(SITES_DIR)
          .filter(f => fs.statSync(path.join(SITES_DIR, f)).isDirectory())
      : [];

    res.json({
      projects,
      online: activeUsers.size  // número exacto, sin Math.random ni +1
    });
  } catch (e) {
    res.json({ projects: [], online: 0 });
  }
});

// ── DEPLOY ────────────────────────────────────────────────────────────
app.post('/deploy', upload.single('zipfile'), async (req, res) => {
  const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  if (!projectName || !req.file)
    return res.status(400).json({ error: 'Nombre y archivo requeridos' });

  const projectDir = path.join(SITES_DIR, projectName);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  try {
    await fs.createReadStream(req.file.path)
      .pipe(unzipper.Extract({ path: projectDir }))
      .promise();
    fs.unlinkSync(req.file.path);
    res.json({ url: `/sites/${projectName}/` });
  } catch (err) {
    res.status(500).json({ error: 'Error al descomprimir: ' + err.message });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────
app.delete('/api/projects/:name', (req, res) => {
  const name = req.params.name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const dir  = path.join(SITES_DIR, name);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'No encontrado' });
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo borrar' });
  }
});

app.listen(PORT, () => console.log(`DeployX corriendo en puerto ${PORT}`));
