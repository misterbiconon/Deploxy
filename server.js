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

app.use('/sites', express.static(SITES_DIR));
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

app.get('/api/projects', (req, res) => {
    const projects = fs.readdirSync(SITES_DIR).filter(file => 
        fs.statSync(path.join(SITES_DIR, file)).isDirectory()
    );
    res.json({ projects });
});

app.delete('/api/projects/:name', (req, res) => {
    const projectPath = path.join(SITES_DIR, req.params.name);
    if (fs.existsSync(projectPath)) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        return res.json({ success: true });
    }
    res.status(404).json({ error: "No encontrado" });
});

// NUEVA LÓGICA: Soporta ZIP y HTML suelto
app.post('/deploy', upload.single('zipfile'), async (req, res) => {
    const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    if (!req.file || !projectName) return res.status(400).json({error: "Faltan datos"});

    const projectDir = path.join(SITES_DIR, projectName);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, {recursive: true});

    try {
        if (req.file.originalname.endsWith('.zip')) {
            // Si es ZIP, lo descomprimimos
            await fs.createReadStream(req.file.path)
                .pipe(unzipper.Extract({ path: projectDir }))
                .promise();
        } else if (req.file.originalname.endsWith('.html')) {
            // Si es HTML suelto, lo movemos y lo renombramos a index.html
            const newPath = path.join(projectDir, 'index.html');
            fs.renameSync(req.file.path, newPath);
        } else {
            return res.status(400).json({error: "Formato no compatible (solo .zip o .html)"});
        }

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.json({ success: true, url: `/sites/${projectName}/index.html` });
    } catch (e) { 
        res.status(500).json({error: e.message}); 
    }
});

app.listen(PORT, () => console.log(`DeployX v2.1 (Multi-format) en puerto ${PORT}`));
