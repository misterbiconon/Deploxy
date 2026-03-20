const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de rutas ABSOLUTAS (Vital para Render)
const SITES_DIR = path.join(__dirname, 'sites');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Crear la carpeta de sitios si no existe con permisos de escritura
if (!fs.existsSync(SITES_DIR)) {
    fs.mkdirSync(SITES_DIR, { recursive: true });
    console.log("✅ Carpeta /sites creada correctamente");
}

const upload = multer({ dest: 'uploads/' });

// IMPORTANTE: El orden de estas líneas importa
app.use('/sites', express.static(SITES_DIR));
app.use(express.static(PUBLIC_DIR));

app.post('/deploy', upload.single('zipfile'), async (req, res) => {
    const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    
    if (!projectName || !req.file) {
        return res.status(400).json({ error: 'Nombre y archivo requeridos' });
    }

    const projectDir = path.join(SITES_DIR, projectName);

    try {
        // Creamos la carpeta del proyecto específico
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }

        // Descomprimimos el ZIP
        await fs.createReadStream(req.file.path)
            .pipe(unzipper.Extract({ path: projectDir }))
            .promise();

        // Borramos el archivo temporal
        fs.unlinkSync(req.file.path);
        
        // Enviamos la URL relativa para que el navegador la encuentre
        const finalUrl = `/sites/${projectName}/index.html`;
        console.log(`🚀 Proyecto desplegado en: ${finalUrl}`);
        res.json({ url: finalUrl });

    } catch (err) {
        console.error("❌ Error en el despliegue:", err);
        res.status(500).json({ error: 'Error al procesar: ' + err.message });
    }
});

// Ruta de respaldo para ver si el servidor responde
app.get('/status', (req, res) => res.send('Servidor DeployX Activo 🚀'));

app.listen(PORT, () => {
    console.log(`Log: Servidor corriendo en puerto ${PORT}`);
    console.log(`Log: Ruta de sitios: ${SITES_DIR}`);
});
