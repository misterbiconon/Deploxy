const express = require('express');
const multer = require('multer');
const unzipper = require('unzipper');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SITES_DIR = path.join(__dirname, 'sites');

if (!fs.existsSync(SITES_DIR)) fs.mkdirSync(SITES_DIR, { recursive: true });

const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use('/sites', express.static(SITES_DIR));

app.post('/deploy', upload.single('zipfile'), async (req, res) => {
  const projectName = req.body.name?.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  if (!projectName || !req.file) {
    return res.status(400).json({ error: 'Nombre y archivo requeridos' });
  }

  const projectDir = path.join(SITES_DIR, projectName);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  try {
    await fs.createReadStream(req.file.path)
      .pipe(unzipper.Extract({ path: projectDir }))
      .promise();

    fs.unlinkSync(req.file.path);
    res.json({ url: `/sites/${projectName}/index.html` });
  } catch (err) {
    res.status(500).json({ error: 'Error al descomprimir: ' + err.message });
  }
});

app.listen(PORT, () => console.log(`DeployX corriendo en puerto ${PORT}`));

