const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de rutas ABSOLUTAS
const SITES_DIR = path.join(__dirname, 'sites');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Crear la carpeta maestra de sitios si no existe
if (!fs.existsSync(SITES_DIR)) {
    fs.mkdirSync(SITES_DIR, { recursive: true });
}

const upload = multer({ dest: 'uploads/' });

// Servir archivos estáticos
app.use('/sites', express.static(SITES_DIR));
app.use(express.static(PUBLIC_DIR));

app.post('/deploy', upload.single('zipfile'), async (req, res) => {
    // Limpiamos el nombre del proyecto (sin espacios ni raros)
    const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'proyecto-' + Date.now();
    
    if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo ZIP' });
    }

    const projectDir = path.join(SITES_DIR, projectName);

    try {
        // 1. Crear carpeta del proyecto
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }

        // 2. Descomprimir el archivo
        await fs.createReadStream(req.file.path)
            .pipe(unzipper.Extract({ path: projectDir }))
            .promise();

        // 3. Borrar el archivo temporal del servidor
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        // 4. LOG DE SEGURIDAD: Ver que hay adentro (útil para depurar)
        const contenido = fs.readdirSync(projectDir);
        console.log(`Proyecto [${projectName}] contenido:`, contenido);

        // 5. Responder con la URL corregida
        // Enviamos la ruta al index.html
        res.json({ 
            success: true, 
            url: `/sites/${projectName}/index.html`,
            detectedFiles: contenido
        });

    } catch (err) {
        console.error("❌ Error de despliegue:", err);
        res.status(500).json({ error: 'Error al procesar el ZIP: ' + err.message });
    }
});

// Ruta de salud del servidor
app.get('/status', (req, res) => res.send('Servidor DeployX en línea 🚀'));

app.listen(PORT, () => {
    console.log(`>>> Servidor listo en puerto ${PORT}`);
    console.log(`>>> Carpeta pública: ${PUBLIC_DIR}`);
    console.log(`>>> Carpeta de sitios: ${SITES_DIR}`);
});
