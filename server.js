const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const SITES_DIR = path.join(__dirname, 'sites');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(SITES_DIR)) fs.mkdirSync(SITES_DIR, { recursive: true });

const upload = multer({ dest: 'uploads/' });

// --- RADAR DE USUARIOS REAL ---
let activeSessions = new Set();

app.use((req, res, next) => {
    // Identificador único por IP
    const visitorId = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    activeSessions.add(visitorId);
    
    // Si no hay señal en 20 segundos, se elimina del conteo
    setTimeout(() => { activeSessions.delete(visitorId); }, 20000);
    next();
});

app.use('/sites', express.static(SITES_DIR));
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

app.get('/api/projects', (req, res) => {
    try {
        const projects = fs.readdirSync(SITES_DIR).filter(file => 
            fs.statSync(path.join(SITES_DIR, file)).isDirectory()
        );
        // Enviamos el número real. Si no hay nadie, marca 1 (tú).
        res.json({ 
            projects: projects, 
            online: activeSessions.size > 0 ? activeSessions.size : 1 
        });
    } catch (e) {
        res.json({ projects: [], online: 1 });
    }
});

app.delete('/api/projects/:name', (req, res) => {
    const projectPath = path.join(SITES_DIR, req.params.name);
    if (fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        return res.json({ success: true });
    }
    res.status(404).json({ error: "No encontrado" });
});

app.post('/deploy', upload.single('zipfile'), async (req, res) => {
    const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!req.file || !projectName) return res.status(400).json({error: "Faltan datos"});

    const projectDir = path.join(SITES_DIR, projectName);
    try {
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, {recursive: true});
        await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: projectDir })).promise();
        fs.unlinkSync(req.file.path);
        res.json({ success: true, url: `/sites/${projectName}/index.html` });
    } catch (e) { res.status(500).json({error: e.message}); }
});

app.listen(PORT, () => console.log(`Radar real encendido en puerto ${PORT}`));
