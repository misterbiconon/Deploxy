const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de carpetas
const SITES_DIR = path.join(__dirname, 'sites');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Crear carpetas necesarias al iniciar
[SITES_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const upload = multer({ dest: 'uploads/' });

app.use('/sites', express.static(SITES_DIR));
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// Obtener lista de proyectos
app.get('/api/projects', (req, res) => {
    try {
        const projects = fs.readdirSync(SITES_DIR).filter(file => 
            fs.statSync(path.join(SITES_DIR, file)).isDirectory()
        );
        res.json({ projects });
    } catch (e) { res.json({ projects: [] }); }
});

// Despliegue Inteligente (ZIP o HTML)
app.post('/deploy', upload.single('zipfile'), async (req, res) => {
    const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!req.file || !projectName) return res.status(400).json({error: "Faltan datos"});

    const projectDir = path.join(SITES_DIR, projectName);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, {recursive: true});

    try {
        if (req.file.originalname.endsWith('.zip')) {
            await fs.createReadStream(req.file.path)
                .pipe(unzipper.Extract({ path: projectDir }))
                .promise();
        } else if (req.file.originalname.endsWith('.html')) {
            fs.renameSync(req.file.path, path.join(projectDir, 'index.html'));
        }
        
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.json({ success: true, url: `/sites/${projectName}/index.html` });
    } catch (e) { res.status(500).json({error: e.message}); }
});

// Borrar proyecto
app.delete('/api/projects/:name', (req, res) => {
    const projectPath = path.join(SITES_DIR, req.params.name);
    if (fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        return res.json({ success: true });
    }
    res.status(404).json({ error: "No encontrado" });
});

app.listen(PORT, () => console.log(`DeployX v2.1 Online en puerto ${PORT}`));
