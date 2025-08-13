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

// Load package.json for version info
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Hugging Face token for Inference API (optional, but recommended)
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || '';
function hfHeaders(contentType = 'application/octet-stream') {
  const headers = { 'Content-Type': contentType };
  if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;
  return headers;
}

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

// Serve static files with no-cache headers for development
app.use('/', express.static(publicDir, {
  setHeaders: (res, path) => {
    // Force no cache for HTML, CSS, and JS files
    if (path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Get version information
app.get('/api/version', (req, res) => {
  res.json({
    version: packageJson.version,
    name: packageJson.name,
    description: packageJson.description
  });
});

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

// Advanced AI Image Analysis using real vision LLM + basic AI context
app.post('/api/advanced-analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image file is required' });

    // Read the uploaded image file
    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString('base64');

    // Get basic AI tags from request body if available
    const basicTags = req.body.basicTags ? req.body.basicTags.split(',') : [];
    const ocrText = typeof req.body.ocrText === 'string' ? req.body.ocrText.trim() : '';
    console.log('Basic AI tags received:', basicTags);
    if (ocrText) console.log('OCR text received (first 80 chars):', ocrText.slice(0, 80));

    let analysis = null;

    // Try multiple vision LLM APIs in order of preference (free)

    // Option 0: Qwen2-VL (stronger VLM) via Hugging Face (token optional but recommended)
    try {
      console.log('Trying Hugging Face Qwen2-VL...');
      const qwenResp = await fetch('https://api-inference.huggingface.co/models/Qwen/Qwen2-VL-2B-Instruct', {
        method: 'POST',
        headers: hfHeaders('application/json'),
        body: JSON.stringify({
          inputs: [
            {
              role: 'user',
              content: [
                { type: 'image', image: `data:${req.file.mimetype};base64,${base64Image}` },
                { type: 'text', text: 'Describe the image succinctly.' }
              ]
            }
          ],
          parameters: { max_new_tokens: 200, temperature: 0.1 }
        }),
        signal: AbortSignal.timeout(18000)
      });
      if (qwenResp.ok) {
        const qwenJson = await qwenResp.json();
        const text = Array.isArray(qwenJson) ? (qwenJson[0]?.generated_text || '') : (qwenJson.generated_text || qwenJson[0]?.generated_text || '');
        if (text) {
          analysis = parseDescriptionToStructured(text, basicTags);
          console.log('Qwen2-VL analysis successful:', text);
        }
      } else {
        console.log('Qwen2-VL request failed with status', qwenResp.status);
      }
    } catch (e) {
      console.log('Qwen2-VL failed:', e.message);
    }

    // Option 1: BLIP-2 for image captioning
    try {
      console.log('Trying Hugging Face BLIP-2...');
      const blipResponse = await fetch('https://api-inference.huggingface.co/models/Salesforce/blip2-opt-2.7b', {
        method: 'POST',
        headers: hfHeaders('application/octet-stream'),
        body: imageBuffer,
        signal: AbortSignal.timeout(15000)
      });

      if (blipResponse.ok) {
        const blipResult = await blipResponse.json();
        if (blipResult && blipResult[0] && blipResult[0].generated_text) {
          const description = blipResult[0].generated_text;
          analysis = parseDescriptionToStructured(description, basicTags);
          console.log('BLIP-2 analysis successful:', description);
        }
      }
    } catch (blipError) {
      console.log('BLIP-2 failed:', blipError.message);
    }

    // Option 2: Try Hugging Face BLIP for image captioning
    if (!analysis) {
      try {
        console.log('Trying Hugging Face BLIP...');
        const blipResponse = await fetch('https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large', {
          method: 'POST',
          headers: hfHeaders('application/octet-stream'),
          body: imageBuffer,
          signal: AbortSignal.timeout(15000)
        });

        if (blipResponse.ok) {
          const blipResult = await blipResponse.json();
          if (blipResult && blipResult[0] && blipResult[0].generated_text) {
            const description = blipResult[0].generated_text;
            analysis = parseDescriptionToStructured(description, basicTags);
            console.log('BLIP analysis successful:', description);
          }
        }
      } catch (blipError) {
        console.log('BLIP failed:', blipError.message);
      }
    }

    // Fallback: Use basic AI tags + enhanced intelligent analysis
    if (!analysis) {
      console.log('Vision APIs failed, using basic AI + enhanced analysis...');
      analysis = generateEnhancedAnalysisWithBasicAI(req.file.originalname, imageBuffer, basicTags);
    }

    // Clean up the temporary file
    try { fs.unlinkSync(req.file.path); } catch {}

    res.json({
      analysis: analysis,
      source: analysis.source || 'vision_llm'
    });

  } catch (error) {
    console.error('Advanced AI Analysis error:', error);
    // Clean up the temporary file in case of error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }

    // Provide a meaningful fallback analysis using basic AI if available
    const basicTags = req.body.basicTags ? req.body.basicTags.split(',') : [];
    const fallbackAnalysis = generateEnhancedAnalysisWithBasicAI('unknown.jpg', null, basicTags);

    res.json({
      analysis: fallbackAnalysis,
      source: 'fallback_analysis'
    });
  }
});

// Parse AI-generated description into structured format
function parseDescriptionToStructured(description, basicTags = []) {
  console.log('Parsing description:', description);
  console.log('Using basic AI tags:', basicTags);

  // Extract key information from the AI description
  const lowerDesc = description.toLowerCase();

  // Identify main subject
  let whatItIs = description;
  if (lowerDesc.includes('a ')) {
    whatItIs = description.substring(description.toLowerCase().indexOf('a ') + 2);
  }

  // Extract colors mentioned (combine from description and basic AI)
  const colorWords = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray', 'grey', 'silver', 'gold', 'golden', 'dark', 'light', 'bright'];
  const foundColors = colorWords.filter(color => lowerDesc.includes(color));
  const basicColors = basicTags.filter(tag => colorWords.includes(tag.toLowerCase()));
  const allColors = [...new Set([...foundColors, ...basicColors])];
  const mainColors = allColors.length > 0 ? allColors.slice(0, 3).join(', ') : 'natural tones';

  // Determine background
  let background = 'indoor setting';
  if (lowerDesc.includes('outdoor') || lowerDesc.includes('outside') || lowerDesc.includes('street') || lowerDesc.includes('road') || lowerDesc.includes('park') || lowerDesc.includes('garden')) {
    background = 'outdoor environment';
  } else if (lowerDesc.includes('room') || lowerDesc.includes('kitchen') || lowerDesc.includes('bedroom') || lowerDesc.includes('office')) {
    background = 'indoor room setting';
  } else if (lowerDesc.includes('studio') || lowerDesc.includes('plain') || lowerDesc.includes('background')) {
    background = 'studio or neutral background';
  }

  // Determine atmosphere
  let atmosphere = 'neutral mood';
  if (lowerDesc.includes('bright') || lowerDesc.includes('sunny') || lowerDesc.includes('cheerful')) {
    atmosphere = 'bright and cheerful';
  } else if (lowerDesc.includes('dark') || lowerDesc.includes('moody') || lowerDesc.includes('dramatic')) {
    atmosphere = 'dramatic and moody';
  } else if (lowerDesc.includes('calm') || lowerDesc.includes('peaceful') || lowerDesc.includes('serene')) {
    atmosphere = 'calm and peaceful';
  } else if (lowerDesc.includes('busy') || lowerDesc.includes('crowded') || lowerDesc.includes('active')) {
    atmosphere = 'busy and dynamic';
  }

  // Generate impression
  let impression = 'interesting visual composition';
  if (lowerDesc.includes('beautiful') || lowerDesc.includes('stunning') || lowerDesc.includes('gorgeous')) {
    impression = 'aesthetically pleasing and beautiful';
  } else if (lowerDesc.includes('cute') || lowerDesc.includes('adorable') || lowerDesc.includes('sweet')) {
    impression = 'charming and endearing';
  } else if (lowerDesc.includes('professional') || lowerDesc.includes('formal') || lowerDesc.includes('business')) {
    impression = 'professional and polished';
  } else if (lowerDesc.includes('artistic') || lowerDesc.includes('creative') || lowerDesc.includes('unique')) {
    impression = 'artistic and creative expression';
  }

  // Determine style
  let style = 'photography';
  if (lowerDesc.includes('portrait') || lowerDesc.includes('person') || lowerDesc.includes('face')) {
    style = 'portrait photography';
  } else if (lowerDesc.includes('landscape') || lowerDesc.includes('scenery') || lowerDesc.includes('nature')) {
    style = 'landscape photography';
  } else if (lowerDesc.includes('close') || lowerDesc.includes('macro') || lowerDesc.includes('detail')) {
    style = 'close-up or macro photography';
  } else if (lowerDesc.includes('street') || lowerDesc.includes('urban') || lowerDesc.includes('city')) {
    style = 'street or urban photography';
  } else if (lowerDesc.includes('food') || lowerDesc.includes('meal') || lowerDesc.includes('dish')) {
    style = 'food photography';
  }

  return {
    what_it_is: whatItIs,
    main_colors: mainColors,
    background: background,
    atmosphere: atmosphere,
    impression: impression,
    style: style,
    source: 'vision_llm_parsed'
  };
}

// Generate enhanced analysis with more intelligence
function generateEnhancedAnalysis(filename, imageBuffer = null) {
  const name = filename.toLowerCase();

  // Much more sophisticated analysis patterns
  const analysisPatterns = [
    {
      keywords: ['car', 'auto', 'vehicle', 'truck', 'motorcycle', 'bike', 'scooter', 'wheel'],
      analysis: {
        what_it_is: 'Motor vehicle or transportation device',
        main_colors: 'Metallic blues, reds, or silver with chrome accents',
        background: 'Urban street, parking area, or automotive showroom',
        atmosphere: 'Dynamic energy with mechanical precision',
        impression: 'Modern transportation and engineering excellence',
        style: 'Automotive or transportation photography'
      }
    },
    {
      keywords: ['cat', 'dog', 'pet', 'animal', 'puppy', 'kitten', 'bird', 'horse'],
      analysis: {
        what_it_is: 'Domestic animal or wildlife creature',
        main_colors: 'Natural fur tones - browns, blacks, whites, and golden hues',
        background: 'Comfortable home environment or natural outdoor habitat',
        atmosphere: 'Warm, affectionate, and full of life',
        impression: 'Emotional connection and natural beauty of animal companionship',
        style: 'Pet portrait or wildlife photography'
      }
    },
    {
      keywords: ['food', 'meal', 'dish', 'cook', 'eat', 'restaurant', 'kitchen', 'recipe'],
      analysis: {
        what_it_is: 'Culinary creation or food presentation',
        main_colors: 'Appetizing golds, rich reds, fresh greens, and warm browns',
        background: 'Professional kitchen, elegant dining setting, or rustic table',
        atmosphere: 'Inviting warmth with mouth-watering appeal',
        impression: 'Gastronomic artistry that celebrates culinary craftsmanship',
        style: 'Professional food photography or culinary documentation'
      }
    },
    {
      keywords: ['landscape', 'nature', 'mountain', 'forest', 'beach', 'sunset', 'tree', 'flower'],
      analysis: {
        what_it_is: 'Natural landscape or botanical subject',
        main_colors: 'Earth tones with vibrant greens, sky blues, and sunset oranges',
        background: 'Pristine natural environment with organic elements',
        atmosphere: 'Serene tranquility with breathtaking natural beauty',
        impression: 'Deep connection to nature and environmental appreciation',
        style: 'Landscape or nature photography'
      }
    },
    {
      keywords: ['portrait', 'person', 'face', 'people', 'human', 'man', 'woman', 'child'],
      analysis: {
        what_it_is: 'Human subject or portrait study',
        main_colors: 'Natural skin tones complemented by clothing and environmental colors',
        background: 'Professional studio setup or carefully chosen environmental context',
        atmosphere: 'Intimate and expressive with emotional depth',
        impression: 'Captures human character, emotion, and individual personality',
        style: 'Portrait photography or human documentary'
      }
    },
    {
      keywords: ['building', 'architecture', 'house', 'city', 'urban', 'street', 'bridge'],
      analysis: {
        what_it_is: 'Architectural structure or urban environment',
        main_colors: 'Concrete grays, brick reds, glass blues, and steel metallics',
        background: 'Urban cityscape or architectural setting',
        atmosphere: 'Modern sophistication with geometric precision',
        impression: 'Human achievement in design and urban development',
        style: 'Architectural or urban photography'
      }
    },
    {
      keywords: ['art', 'painting', 'drawing', 'sculpture', 'gallery', 'museum', 'creative'],
      analysis: {
        what_it_is: 'Artistic creation or cultural artifact',
        main_colors: 'Rich artistic palette with expressive color combinations',
        background: 'Gallery space, studio environment, or cultural institution',
        atmosphere: 'Creative inspiration with artistic sophistication',
        impression: 'Cultural expression and human creativity',
        style: 'Art documentation or cultural photography'
      }
    }
  ];

  // Find matching pattern
  for (const pattern of analysisPatterns) {
    if (pattern.keywords.some(keyword => name.includes(keyword))) {
      const analysis = { ...pattern.analysis };

      // Add file size context if available
      if (imageBuffer) {
        const sizeKB = imageBuffer.length / 1024;
        if (sizeKB > 1000) {
          analysis.style += ' with high-resolution detail';
          analysis.impression += ' captured with professional quality';
        } else if (sizeKB < 100) {
          analysis.style += ' optimized for web presentation';
        }
      }

      analysis.source = 'enhanced_intelligent_analysis';
      return analysis;
    }
  }

  // Default sophisticated analysis for unknown content
  return {
    what_it_is: 'Visual subject with distinctive characteristics',
    main_colors: 'Harmonious color palette with balanced tonal relationships',
    background: 'Thoughtfully composed environmental context',
    atmosphere: 'Engaging visual mood with purposeful lighting',
    impression: 'Compelling visual narrative with artistic merit',
    style: 'Contemporary digital photography with professional composition',
    source: 'enhanced_default_analysis'
  };
}

// Enhanced analysis that combines basic AI results with intelligent analysis
function generateEnhancedAnalysisWithBasicAI(filename, imageBuffer, basicTags = []) {
  console.log('=== ENHANCED ANALYSIS DEBUG ===');
  console.log('Filename:', filename);
  console.log('Basic AI tags received:', basicTags);
  console.log('Tags type:', typeof basicTags);
  console.log('Tags length:', basicTags.length);

  const name = filename.toLowerCase();
  const tags = basicTags.map(tag => tag.toLowerCase());

  console.log('Processed tags:', tags);

  // Determine what it is based on basic AI tags with much more specificity
  let whatItIs = 'FALLBACK: Unidentified visual content';
  let category = 'general';

  console.log('Starting category analysis...');

  // Much more detailed object detection with specific descriptions
  console.log('Checking for person tags...');
  if (tags.includes('person') || tags.includes('man') || tags.includes('woman') || tags.includes('child') || tags.includes('people')) {
    console.log('FOUND PERSON CATEGORY!');
    if (tags.includes('child') || tags.includes('baby')) {
      whatItIs = 'Child or young person in portrait setting';
    } else if (tags.includes('man')) {
      whatItIs = 'Male subject in professional or casual portrait';
    } else if (tags.includes('woman')) {
      whatItIs = 'Female subject captured in portrait composition';
    } else {
      whatItIs = 'Human subject in thoughtful portrait arrangement';
    }
    category = 'portrait';
  } else if (tags.includes('car') || tags.includes('vehicle') || tags.includes('truck') || tags.includes('motorcycle') || tags.includes('scooter')) {
    console.log('FOUND AUTOMOTIVE CATEGORY!');
    if (tags.includes('car')) {
      whatItIs = 'Automobile showcasing automotive design and engineering';
    } else if (tags.includes('motorcycle') || tags.includes('scooter')) {
      whatItIs = 'Two-wheeled motor vehicle with dynamic presence';
    } else if (tags.includes('truck')) {
      whatItIs = 'Commercial or utility vehicle with robust construction';
    } else {
      whatItIs = 'Transportation vehicle demonstrating mechanical craftsmanship';
    }
    category = 'automotive';
  } else if (tags.includes('cat') || tags.includes('dog') || tags.includes('animal') || tags.includes('bird') || tags.includes('pet')) {
    if (tags.includes('cat')) {
      whatItIs = 'Feline companion displaying natural grace and character';
    } else if (tags.includes('dog')) {
      whatItIs = 'Canine friend showing loyalty and spirited personality';
    } else if (tags.includes('bird')) {
      whatItIs = 'Avian creature captured in natural or domestic setting';
    } else {
      whatItIs = 'Animal subject expressing natural behavior and beauty';
    }
    category = 'animal';
  } else if (tags.includes('food') || tags.includes('meal') || tags.includes('dish') || tags.includes('cooking')) {
    if (tags.includes('meal')) {
      whatItIs = 'Carefully prepared meal showcasing culinary artistry';
    } else if (tags.includes('dish')) {
      whatItIs = 'Gourmet dish presented with professional plating technique';
    } else {
      whatItIs = 'Culinary creation highlighting gastronomic excellence';
    }
    category = 'food';
  } else if (tags.includes('building') || tags.includes('house') || tags.includes('architecture') || tags.includes('structure')) {
    if (tags.includes('house')) {
      whatItIs = 'Residential architecture displaying design and livability';
    } else if (tags.includes('building')) {
      whatItIs = 'Architectural structure demonstrating construction and form';
    } else {
      whatItIs = 'Built environment showcasing human design achievement';
    }
    category = 'architecture';
  } else if (tags.includes('flower') || tags.includes('tree') || tags.includes('plant') || tags.includes('nature') || tags.includes('landscape')) {
    if (tags.includes('flower')) {
      whatItIs = 'Botanical bloom displaying natural beauty and delicate form';
    } else if (tags.includes('tree')) {
      whatItIs = 'Majestic tree representing growth and natural strength';
    } else if (tags.includes('landscape')) {
      whatItIs = 'Natural landscape showcasing environmental beauty';
    } else {
      whatItIs = 'Natural element celebrating organic beauty and life';
    }
    category = 'nature';
  } else if (tags.includes('book') || tags.includes('text') || tags.includes('document')) {
    whatItIs = 'Literary or informational content with textual elements';
    category = 'document';
  } else if (tags.includes('art') || tags.includes('painting') || tags.includes('drawing')) {
    whatItIs = 'Artistic creation expressing creative vision and technique';
    category = 'art';
  } else if (tags.includes('tool') || tags.includes('equipment') || tags.includes('machine')) {
    whatItIs = 'Functional tool or equipment designed for specific purpose';
    category = 'tool';
  } else {
    console.log('NO SPECIFIC CATEGORY FOUND - trying filename and tag analysis...');
    console.log('Available tags for analysis:', tags);

    // Try to infer from filename if no clear tags
    const nameLower = name.toLowerCase();
    if (nameLower.includes('portrait') || nameLower.includes('selfie') || nameLower.includes('photo')) {
      whatItIs = 'Photographic composition with human or personal elements';
      category = 'portrait';
    } else if (nameLower.includes('landscape') || nameLower.includes('scenic')) {
      whatItIs = 'Scenic composition capturing environmental beauty';
      category = 'nature';
    } else if (nameLower.includes('product') || nameLower.includes('item')) {
      whatItIs = 'Product or object presented for documentation or display';
      category = 'product';
    } else if (tags.length > 0) {
      // Use the first meaningful tag as the subject
      const meaningfulTags = tags.filter(tag =>
        !tag.includes('background') &&
        !['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray', 'grey', 'silver', 'gold'].includes(tag)
      );

      if (meaningfulTags.length > 0) {
        const mainSubject = meaningfulTags[0];
        whatItIs = `${mainSubject.charAt(0).toUpperCase() + mainSubject.slice(1)} captured with professional attention to detail and composition`;
        console.log('Using main subject from tags:', mainSubject);
      } else {
        whatItIs = `Visual composition featuring ${tags.slice(0, 2).join(' and ')} elements`;
        console.log('Using color/background tags as fallback');
      }
      category = 'general';
    } else {
      whatItIs = 'Distinctive visual subject with unique characteristics and composition';
      category = 'general';
      console.log('FINAL FALLBACK - no tags or filename clues');
    }
  }

  console.log('FINAL RESULT - What it is:', whatItIs);
  console.log('FINAL RESULT - Category:', category);

  // Extract colors from basic AI tags
  const colorWords = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray', 'grey', 'silver', 'gold'];
  const detectedColors = tags.filter(tag => colorWords.includes(tag));
  const backgroundColors = tags.filter(tag => tag.includes('background'));

  // Generate sophisticated descriptions based on category and detected elements
  const categoryDescriptions = {
    portrait: {
      main_colors: detectedColors.length > 0 ?
        `Natural skin tones with ${detectedColors.join(', ')} accents` :
        'Natural skin tones with complementary color palette',
      background: backgroundColors.length > 0 ?
        `Professional ${backgroundColors[0].replace(' background', '')} backdrop` :
        'Carefully composed portrait setting',
      atmosphere: 'Intimate and expressive with emotional depth',
      impression: 'Captures human character and individual personality',
      style: 'Professional portrait photography'
    },
    automotive: {
      main_colors: detectedColors.length > 0 ?
        `Automotive ${detectedColors.join(' and ')} with metallic finishes` :
        'Metallic automotive colors with chrome accents',
      background: backgroundColors.length > 0 ?
        `${backgroundColors[0].replace(' background', '').charAt(0).toUpperCase() + backgroundColors[0].replace(' background', '').slice(1)} automotive environment` :
        'Urban or automotive setting',
      atmosphere: 'Dynamic energy with mechanical precision',
      impression: 'Modern transportation and engineering excellence',
      style: 'Automotive photography'
    },
    animal: {
      main_colors: detectedColors.length > 0 ?
        `Natural ${detectedColors.join(' and ')} fur or feather tones` :
        'Natural animal coloring with organic tones',
      background: backgroundColors.length > 0 ?
        `${backgroundColors[0].replace(' background', '').charAt(0).toUpperCase() + backgroundColors[0].replace(' background', '').slice(1)} natural environment` :
        'Natural habitat or comfortable setting',
      atmosphere: 'Warm, lively, and full of natural energy',
      impression: 'Natural beauty and animal character',
      style: 'Wildlife or pet photography'
    },
    food: {
      main_colors: detectedColors.length > 0 ?
        `Appetizing ${detectedColors.join(', ')} with rich culinary tones` :
        'Rich culinary colors with appetizing presentation',
      background: backgroundColors.length > 0 ?
        `${backgroundColors[0].replace(' background', '').charAt(0).toUpperCase() + backgroundColors[0].replace(' background', '').slice(1)} culinary setting` :
        'Professional kitchen or dining presentation',
      atmosphere: 'Inviting warmth with mouth-watering appeal',
      impression: 'Gastronomic artistry and culinary craftsmanship',
      style: 'Professional food photography'
    },
    architecture: {
      main_colors: detectedColors.length > 0 ?
        `Architectural ${detectedColors.join(' and ')} with structural elements` :
        'Architectural materials with structural color palette',
      background: backgroundColors.length > 0 ?
        `${backgroundColors[0].replace(' background', '').charAt(0).toUpperCase() + backgroundColors[0].replace(' background', '').slice(1)} urban context` :
        'Urban or architectural environment',
      atmosphere: 'Modern sophistication with geometric precision',
      impression: 'Human achievement in design and construction',
      style: 'Architectural photography'
    },
    nature: {
      main_colors: detectedColors.length > 0 ?
        `Natural ${detectedColors.join(' and ')} with organic earth tones` :
        'Natural earth tones with organic color harmony',
      background: backgroundColors.length > 0 ?
        `${backgroundColors[0].replace(' background', '').charAt(0).toUpperCase() + backgroundColors[0].replace(' background', '').slice(1)} natural setting` :
        'Natural outdoor environment',
      atmosphere: 'Serene tranquility with natural beauty',
      impression: 'Connection to nature and environmental harmony',
      style: 'Nature or landscape photography'
    },
    document: {
      main_colors: detectedColors.length > 0 ?
        `Text-focused ${detectedColors.join(' and ')} with readable contrast` :
        'High contrast colors optimized for readability',
      background: backgroundColors.length > 0 ?
        `Clean ${backgroundColors[0].replace(' background', '')} document layout` :
        'Professional document presentation background',
      atmosphere: 'Informative and organized with clear communication intent',
      impression: 'Educational or informational content with structured presentation',
      style: 'Document or informational photography'
    },
    art: {
      main_colors: detectedColors.length > 0 ?
        `Artistic ${detectedColors.join(', ')} expressing creative vision` :
        'Rich artistic palette with expressive color relationships',
      background: backgroundColors.length > 0 ?
        `Gallery-quality ${backgroundColors[0].replace(' background', '')} presentation` :
        'Museum or studio setting for artistic display',
      atmosphere: 'Creative inspiration with artistic sophistication and depth',
      impression: 'Cultural expression demonstrating human creativity and skill',
      style: 'Fine art or creative documentation photography'
    },
    tool: {
      main_colors: detectedColors.length > 0 ?
        `Functional ${detectedColors.join(' and ')} emphasizing utility` :
        'Practical colors highlighting functional design',
      background: backgroundColors.length > 0 ?
        `Workshop or ${backgroundColors[0].replace(' background', '')} working environment` :
        'Professional workspace or technical setting',
      atmosphere: 'Purposeful and efficient with focus on functionality',
      impression: 'Human ingenuity in tool design and practical application',
      style: 'Technical or product documentation photography'
    },
    product: {
      main_colors: detectedColors.length > 0 ?
        `Commercial ${detectedColors.join(', ')} designed for market appeal` :
        'Market-focused colors with commercial appeal',
      background: backgroundColors.length > 0 ?
        `Professional ${backgroundColors[0].replace(' background', '')} product showcase` :
        'Studio lighting optimized for product presentation',
      atmosphere: 'Polished and appealing with commercial sophistication',
      impression: 'Consumer appeal with emphasis on quality and desirability',
      style: 'Commercial product photography'
    },
    general: {
      main_colors: detectedColors.length > 0 ?
        `Distinctive ${detectedColors.join(', ')} creating visual impact` :
        'Carefully selected color palette with intentional composition',
      background: backgroundColors.length > 0 ?
        `Purposeful ${backgroundColors[0].replace(' background', '')} environmental context` :
        'Thoughtfully arranged compositional environment',
      atmosphere: 'Engaging visual presence with deliberate artistic choices',
      impression: 'Unique visual narrative demonstrating photographic skill',
      style: 'Contemporary photography with professional composition'
    }
  };

  const desc = categoryDescriptions[category];

  return {
    what_it_is: whatItIs,
    main_colors: desc.main_colors,
    background: desc.background,
    atmosphere: desc.atmosphere,
    impression: desc.impression,
    style: desc.style,
    source: 'enhanced_ai_combined_analysis'
  };
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


