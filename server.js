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

// --- LÓGICA DE CONEXIONES EN VIVO ---
let onlineUsers = 0;
app.use((req, res, next) => {
    onlineUsers++;
    res.on('finish', () => { onlineUsers = Math.max(0, onlineUsers - 1); });
    next();
});

app.use('/sites', express.static(SITES_DIR));
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// 1. OBTENER LISTA DE PROYECTOS
app.get('/api/projects', (req, res) => {
    const projects = fs.readdirSync(SITES_DIR).filter(file => 
        fs.statSync(path.join(SITES_DIR, file)).isDirectory()
    );
    res.json({ projects, online: onlineUsers });
});

// 2. BORRAR PROYECTO
app.delete('/api/projects/:name', (req, res) => {
    const projectPath = path.join(SITES_DIR, req.params.name);
    if (fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        return res.json({ success: true });
    }
    res.status(404).json({ error: "No encontrado" });
});

// 3. SUBIR PROYECTO (Mejorado)
app.post('/deploy', upload.single('zipfile'), async (req, res) => {
    const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!req.file || !projectName) return res.status(400).send("Faltan datos");

    const projectDir = path.join(SITES_DIR, projectName);
    try {
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir);
        await fs.createReadStream(req.file.path).pipe(unzipper.Extract({ path: projectDir })).promise();
        fs.unlinkSync(req.file.path);
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

app.listen(PORT, () => console.log(`Panel activo en puerto ${PORT}`));
