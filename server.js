const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));


const SITES_DIR = path.join(__dirname, 'sites');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(SITES_DIR)) fs.mkdirSync(SITES_DIR, { recursive: true });

const upload = multer({ dest: 'uploads/' });

app.use('/sites', express.static(SITES_DIR));
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

app.get('/api/projects', (req, res) => {
    try {
        const projects = fs.readdirSync(SITES_DIR).filter(file => 
            fs.statSync(path.join(SITES_DIR, file)).isDirectory()
        );
        res.json({ projects });
    } catch (e) { res.json({ projects: [] }); }
});

app.post('/deploy', upload.single('zipfile'), async (req, res) => {
    const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!req.file || !projectName) return res.status(400).json({error: "Faltan datos"});

    const projectDir = path.join(SITES_DIR, projectName);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, {recursive: true});

    try {
        if (req.file.originalname.endsWith('.zip')) {
            await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: projectDir })).promise();
        } else if (req.file.originalname.endsWith('.html')) {
            fs.renameSync(req.file.path, path.join(projectDir, 'index.html'));
        }
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.json({ success: true, url: `/sites/${projectName}/index.html` });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.delete('/api/projects/:name', (req, res) => {
    const projectPath = path.join(SITES_DIR, req.params.name);
    if (fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        return res.json({ success: true });
    }
    res.status(404).json({ error: "No encontrado" });
});

app.listen(PORT, () => console.log(`DeployX v2.1 activo en puerto ${PORT}`));
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
