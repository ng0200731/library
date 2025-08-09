import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.resolve(__dirname, '../uploads');
const publicDir = path.resolve(__dirname, '../public');
const dataDir = path.resolve(__dirname, '../data');
const dbFile = path.join(dataDir, 'db.json');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ images: [], tags: [] }, null, 2));
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { images: [], tags: [] });
await db.read();
db.data ||= { images: [], tags: [] };

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  },
});

const upload = multer({ storage });

app.use('/uploads', express.static(uploadsDir));
app.use('/', express.static(publicDir));

// Upload image with optional tags
app.post('/api/images', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image field is required' });

    const { tags } = req.body; // tags can be CSV or array
    const tagList = Array.isArray(tags)
      ? tags
      : typeof tags === 'string' && tags.length > 0
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];

    const image = {
      id: nanoid(12),
      filename: req.file.filename,
      originalName: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      tags: tagList,
      createdAt: new Date().toISOString(),
    };

    db.data.images.push(image);
    // Track tags
    for (const t of tagList) {
      if (!db.data.tags.includes(t)) db.data.tags.push(t);
    }
    await db.write();

    res.status(201).json(image);
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Add or replace tags for an image
app.put('/api/images/:id/tags', async (req, res) => {
  const { id } = req.params;
  const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
  const image = db.data.images.find((i) => i.id === id);
  if (!image) return res.status(404).json({ error: 'Not found' });
  image.tags = tags;
  for (const t of tags) {
    if (!db.data.tags.includes(t)) db.data.tags.push(t);
  }
  await db.write();
  res.json(image);
});

// Search images by keyword and/or tags with AND/OR matching
app.get('/api/images', async (req, res) => {
  const { q, tags, mode } = req.query;
  const keyword = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const tagList = typeof tags === 'string' && tags.length > 0
    ? tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];
  const tagMode = mode === 'and' ? 'and' : 'or';

  const results = db.data.images.filter((img) => {
    // Tag filtering
    if (tagList.length > 0) {
      const imageTags = (img.tags || []).map((t) => t.toLowerCase());
      const hasAll = tagList.every((t) => imageTags.includes(t));
      const hasAny = tagList.some((t) => imageTags.includes(t));
      if (tagMode === 'and' ? !hasAll : !hasAny) return false;
    }

    // Keyword filtering
    if (keyword) {
      const inKeyword = (
        img.filename.toLowerCase().includes(keyword) ||
        img.originalName.toLowerCase().includes(keyword) ||
        (img.tags || []).some((t) => t.toLowerCase().includes(keyword))
      );
      if (!inKeyword) return false;
    }
    return true;
  });
  res.json({ count: results.length, images: results });
});

// Get single image metadata
app.get('/api/images/:id', (req, res) => {
  const image = db.data.images.find((i) => i.id === req.params.id);
  if (!image) return res.status(404).json({ error: 'Not found' });
  res.json(image);
});

// Delete image and its file
app.delete('/api/images/:id', async (req, res) => {
  const idx = db.data.images.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const [removed] = db.data.images.splice(idx, 1);
  try { fs.unlinkSync(path.join(uploadsDir, removed.filename)); } catch {}
  await db.write();
  res.json({ success: true });
});

// AI Image Description with multiple fallback options
app.post('/api/describe-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });

    const imageBuffer = fs.readFileSync(req.file.path);
    let description = '';

    // Try multiple AI services in order of preference
    try {
      // First try: Hugging Face BLIP model (may require auth now)
      const hfResponse = await fetch('https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer,
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (hfResponse.ok) {
        const hfResult = await hfResponse.json();
        description = hfResult[0]?.generated_text;
      }
    } catch (hfError) {
      console.log('Hugging Face API unavailable:', hfError.message);
    }

    // Fallback: Generate basic description based on file properties
    if (!description) {
      const fileStats = fs.statSync(req.file.path);
      const fileSizeKB = Math.round(fileStats.size / 1024);
      const fileType = req.file.mimetype.split('/')[1].toUpperCase();

      // Basic image analysis
      const descriptors = [
        'a digital image',
        'a photograph',
        'an image file',
        'a picture',
        'a visual content'
      ];

      const qualities = [
        fileSizeKB > 500 ? 'high quality' : 'standard quality',
        fileType === 'PNG' ? 'with transparency support' : 'in compressed format',
        fileSizeKB > 1000 ? 'detailed' : 'compact'
      ];

      const randomDescriptor = descriptors[Math.floor(Math.random() * descriptors.length)];
      const randomQuality = qualities[Math.floor(Math.random() * qualities.length)];

      description = `${randomDescriptor} (${fileType}, ${fileSizeKB}KB) - ${randomQuality}`;
    }

    // Clean up the temporary file
    try { fs.unlinkSync(req.file.path); } catch {}

    res.json({
      description: description || 'Image uploaded successfully',
      source: description.includes('KB') ? 'local_analysis' : 'ai_model'
    });

  } catch (error) {
    console.error('AI Description error:', error);
    // Clean up the temporary file in case of error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }

    // Provide a basic fallback description
    const basicDescription = `Image file (${req.file?.originalname || 'unknown'})`;
    res.json({
      description: basicDescription,
      source: 'fallback'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


