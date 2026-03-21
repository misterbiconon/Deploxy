const express  = require('express');
const multer   = require('multer');
const unzipper = require('unzipper');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const SITES_DIR  = path.join(__dirname, 'sites');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Crear directorios si no existen
[SITES_DIR, UPLOAD_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Multer — acepta cualquier archivo
const upload = multer({
    dest: UPLOAD_DIR,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

app.use('/sites', express.static(SITES_DIR));
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

/* ── GET /api/projects ─────────────────────────── */
app.get('/api/projects', (req, res) => {
    try {
        const projects = fs.readdirSync(SITES_DIR)
            .filter(f => fs.statSync(path.join(SITES_DIR, f)).isDirectory())
            .map(name => {
                const metaPath = path.join(SITES_DIR, name, '_meta.json');
                const meta = fs.existsSync(metaPath)
                    ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
                    : { name, createdAt: new Date().toISOString(), type: 'unknown' };
                return meta;
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ projects });
    } catch (e) {
        res.json({ projects: [] });
    }
});

/* ── DELETE /api/projects/:name ────────────────── */
app.delete('/api/projects/:name', (req, res) => {
    const name = req.params.name.replace(/[^a-z0-9-]/gi, '');
    const projectPath = path.join(SITES_DIR, name);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
    }
    fs.rmSync(projectPath, { recursive: true, force: true });
    res.json({ success: true });
});

/* ── POST /deploy ──────────────────────────────── */
app.post('/deploy', upload.single('zipfile'), async (req, res) => {
    // Limpiar nombre
    let projectName = (req.body.name || '')
        .replace(/[^a-z0-9-]/gi, '-')
        .toLowerCase()
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!req.file)       return res.status(400).json({ error: 'No se recibió ningún archivo' });
    if (!projectName)    return res.status(400).json({ error: 'Nombre de proyecto requerido' });

    // Si ya existe, agregar sufijo numérico
    let finalName = projectName, counter = 1;
    while (fs.existsSync(path.join(SITES_DIR, finalName))) {
        finalName = `${projectName}-${counter++}`;
    }

    const projectDir = path.join(SITES_DIR, finalName);
    fs.mkdirSync(projectDir, { recursive: true });

    const ext = path.extname(req.file.originalname).toLowerCase();

    try {
        if (ext === '.zip') {
            // ── Descomprimir ZIP ──────────────────────────
            await new Promise((resolve, reject) => {
                fs.createReadStream(req.file.path)
                    .pipe(unzipper.Extract({ path: projectDir }))
                    .on('close', resolve)
                    .on('error', reject);
            });

            // Si el ZIP tenía una carpeta raíz, mover contenido afuera
            const entries = fs.readdirSync(projectDir);
            if (entries.length === 1) {
                const single = path.join(projectDir, entries[0]);
                if (fs.statSync(single).isDirectory()) {
                    const inner = fs.readdirSync(single);
                    inner.forEach(f => {
                        fs.renameSync(path.join(single, f), path.join(projectDir, f));
                    });
                    fs.rmdirSync(single);
                }
            }

            // Asegurarse que haya index.html
            if (!fs.existsSync(path.join(projectDir, 'index.html'))) {
                // Buscar cualquier HTML y renombrarlo
                const htmlFile = findFile(projectDir, '.html');
                if (htmlFile) {
                    fs.copyFileSync(htmlFile, path.join(projectDir, 'index.html'));
                } else {
                    // Crear página de error amigable
                    fs.writeFileSync(path.join(projectDir, 'index.html'),
                        `<html><body style="font-family:sans-serif;background:#050610;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">
                        <div><h2>⚠️ Sin index.html</h2><p>El ZIP no contiene un archivo index.html.</p></div></body></html>`
                    );
                }
            }

        } else if (ext === '.html' || ext === '.htm') {
            // ── Archivo HTML suelto ───────────────────────
            fs.renameSync(req.file.path, path.join(projectDir, 'index.html'));

        } else if (['.css', '.js', '.json', '.png', '.jpg', '.svg', '.ico'].includes(ext)) {
            // ── Archivo estático suelto ───────────────────
            fs.renameSync(req.file.path, path.join(projectDir, req.file.originalname));

        } else {
            fs.rmSync(projectDir, { recursive: true, force: true });
            return res.status(400).json({ error: `Formato no soportado: ${ext}` });
        }

        // Guardar metadata
        const meta = {
            name: finalName,
            originalName: projectName,
            type: ext === '.zip' ? 'zip' : 'html',
            createdAt: new Date().toISOString(),
            files: countFiles(projectDir),
        };
        fs.writeFileSync(path.join(projectDir, '_meta.json'), JSON.stringify(meta, null, 2));

        // Limpiar archivo temporal
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            name: finalName,
            url: `/sites/${finalName}/index.html`,
            type: meta.type,
        });

    } catch (err) {
        // Limpiar en caso de error
        if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        console.error('Deploy error:', err);
        res.status(500).json({ error: err.message });
    }
});

/* ── Helpers ───────────────────────────────────── */
function findFile(dir, ext) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
            const found = findFile(full, ext);
            if (found) return found;
        } else if (path.extname(f).toLowerCase() === ext) {
            return full;
        }
    }
    return null;
}

function countFiles(dir) {
    let count = 0;
    fs.readdirSync(dir).forEach(f => {
        if (f === '_meta.json') return;
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) count += countFiles(full);
        else count++;
    });
    return count;
}

/* ── 404 catch-all ─────────────────────────────── */
app.use((req, res) => {
    res.status(404).send(`
        <html><body style="font-family:sans-serif;background:#050610;color:#eee;
        display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;margin:0">
        <div>
            <div style="font-size:48px">404</div>
            <p style="color:#666">Página no encontrada</p>
            <a href="/" style="color:#00e5ff">← Volver al panel</a>
        </div></body></html>
    `);
});

app.listen(PORT, () => console.log(`🚀 DeployX corriendo en puerto ${PORT}`));
