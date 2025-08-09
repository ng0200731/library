async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const uploadForm = document.getElementById('uploadForm');
const uploadStatus = document.getElementById('uploadStatus');
const results = document.getElementById('results');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('image');
const uploadBtn = document.getElementById('uploadBtn');
const dzPreview = document.getElementById('dzPreview');
const tagList = document.getElementById('tagList');
const tagEditor = document.getElementById('tagEditor');
const tagsHidden = document.getElementById('tags');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const clearUploadTagsBtn = document.getElementById('clearUploadTagsBtn');
const aiDescribeBtn = document.getElementById('aiDescribeBtn');
const aiDescription = document.getElementById('aiDescription');
const aiDescriptionText = document.getElementById('aiDescriptionText');
let tags = [];

// Search tag inputs and mode
const searchTagList = document.getElementById('searchTagList');
const searchTagEditor = document.getElementById('searchTagEditor');
const modeAndBtn = document.getElementById('modeAnd');
const modeOrBtn = document.getElementById('modeOr');
const clearSearchTagsBtn = document.getElementById('clearSearchTagsBtn');
let searchTags = [];
let searchMode = 'and';

function resetUploadUI(opts = {}) {
  const { keepPreview = false } = opts;
  // Reset tags and editor
  tags = [];
  renderTags();
  if (tagEditor) tagEditor.value = '';
  if (tagsHidden) tagsHidden.value = '';
  // Reset status and AI description
  if (uploadStatus) uploadStatus.textContent = '';
  if (aiDescription) aiDescription.classList.remove('show');
  if (aiDescriptionText) aiDescriptionText.textContent = '';
  // Reset AI button state
  if (aiDescribeBtn) {
    aiDescribeBtn.disabled = false;
    aiDescribeBtn.classList.remove('loading');
    aiDescribeBtn.innerHTML = '🤖 AI Describe';
  }
  // Reset preview and input unless we want to keep the just-dropped preview
  if (!keepPreview) {
    if (dzPreview) { dzPreview.classList.add('hidden'); dzPreview.src = ''; }
    if (dropzone) dropzone.classList.remove('has-preview');
    if (fileInput) fileInput.value = '';
  }
}

// Tabs
const tabs = document.querySelectorAll('.tab');
const tabUpload = document.getElementById('tab-upload');
const tabSearch = document.getElementById('tab-search');
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  const name = t.getAttribute('data-tab');
  if (name === 'upload') {
    tabUpload.classList.remove('hidden');
    tabSearch.classList.add('hidden');
  } else {
    tabSearch.classList.remove('hidden');
    tabUpload.classList.add('hidden');
  }
}));

uploadForm.addEventListener('submit', (e) => {
  e.preventDefault();
  uploadStatus.textContent = '';
  const selected = fileInput.files && fileInput.files[0];
  if (selected) {
    showUploadConfirmation(selected);
  } else {
    // No file yet: prompt user to pick one; change handler will auto-upload
    fileInput.click();
  }
});

// Global prevent default to avoid opening files in browser
['dragenter','dragover','dragleave','drop'].forEach((evt) => {
  window.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
});

// Drag & drop
['dragenter', 'dragover'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('is-dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('is-dragover');
  });
});
dropzone.addEventListener('drop', async (e) => {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  // Reset all fields for a fresh upload flow but keep the forthcoming preview
  resetUploadUI({ keepPreview: true });
  // Try to set the input if supported, but don't rely on it
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
  } catch {}
  onFileSelected(file);
});
dropzone.addEventListener('click', () => { fileInput.click(); });

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (file) {
    // Reset all fields for a fresh upload flow but keep the forthcoming preview
    resetUploadUI({ keepPreview: true });
    onFileSelected(file);
  }
});

function onFileSelected(file) {
  // Only show preview in the dropzone; no filename line
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = () => {
      dzPreview.src = reader.result;
      dzPreview.classList.remove('hidden');
      dropzone.classList.add('has-preview');
    };
    reader.readAsDataURL(file);
  } else {
    dzPreview.classList.add('hidden');
    dzPreview.src = '';
    dropzone.classList.remove('has-preview');
  }
  // Note: upload will be triggered by caller with explicit file parameter
}

async function uploadSelectedFile(file) {
  const fileFromInput = fileInput.files && fileInput.files[0];
  const effectiveFile = file || fileFromInput;
  const isImage = effectiveFile && effectiveFile.type && effectiveFile.type.startsWith('image/');
  if (!isImage) {
    uploadStatus.textContent = 'Please choose an image file';
    return;
  }
  const fileToSend = effectiveFile;
  if (!effectiveFile) return;
  const tagsInput = document.getElementById('tags');
  uploadStatus.textContent = 'Uploading...';
  const form = new FormData();
  form.append('image', fileToSend);
  if (tags.length) form.append('tags', tags.join(','));
  try {
    await fetchJSON('/api/images', { method: 'POST', body: form });
    uploadStatus.textContent = 'Uploaded!';
    // Reset all fields after successful upload (including preview)
    resetUploadUI({ keepPreview: false });
    await search();
  } catch (e) {
    uploadStatus.textContent = 'Upload failed';
  }
}

// Tag editor: type then press Tab to add
tagEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const value = tagEditor.value.trim();
    if (value && !tags.includes(value)) {
      tags.push(value);
      tagEditor.value = '';
      renderTags();
    }
  }
});
tagEditor.addEventListener('blur', () => {
  const value = tagEditor.value.trim();
  if (value && !tags.includes(value)) {
    tags.push(value);
    tagEditor.value = '';
    renderTags();
  }
});

function renderTags() {
  tagsHidden.value = tags.join(',');
  tagList.innerHTML = '';
  for (const t of tags) {
    const el = document.createElement('span');
    el.className = 'tag pill';
    el.textContent = t;
    el.title = 'Click to remove';
    el.addEventListener('click', () => {
      tags = tags.filter((x) => x !== t);
      renderTags();
    });
    tagList.appendChild(el);
  }
}

function renderSearchTags() {
  searchTagList.innerHTML = '';
  for (const t of searchTags) {
    const el = document.createElement('span');
    el.className = 'tag pill';
    el.textContent = t;
    el.title = 'Click to remove';
    el.addEventListener('click', () => {
      searchTags = searchTags.filter((x) => x !== t);
      renderSearchTags();
      search();
    });
    searchTagList.appendChild(el);
  }
}

async function search() {
  const params = new URLSearchParams();
  if (searchTags.length) {
    params.set('tags', searchTags.join(','));
    params.set('mode', searchMode);
  }
  const url = `/api/images${params.toString() ? `?${params.toString()}` : ''}`;
  const data = await fetchJSON(url);
  renderResults(data.images);
}

function renderResults(images) {
  results.innerHTML = '';
  for (const img of images) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <a href="${img.url}" target="_blank"><img src="${img.url}" alt="${img.originalName}" /></a>
      <div class="meta">
        <div class="name">${img.originalName}</div>
        <div class="tags">${img.tags.map((t) => `<span class=tag>${t}</span>`).join(' ')}</div>
      </div>
      <div class="card-actions">
        <button class="icon-btn delete" title="Delete" data-id="${img.id}">🗑️</button>
      </div>
    `;
    results.appendChild(card);
  }
}

// Delete handler for results grid (event delegation)
results.addEventListener('click', async (e) => {
  const btn = e.target.closest('.delete');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  if (!id) return;
  const ok = confirm('Delete this image?');
  if (!ok) return;
  try {
    await fetch(`/api/images/${id}`, { method: 'DELETE' });
    await search();
  } catch (err) {
    alert('Delete failed');
  }
});

// Remove the search button and keyword input event listeners since we removed them

// Search tag editor: press Tab/blur to add
searchTagEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const value = searchTagEditor.value.trim();
    if (value && !searchTags.includes(value)) {
      searchTags.push(value);
      searchTagEditor.value = '';
      renderSearchTags();
      search();
    }
  }
});
searchTagEditor.addEventListener('blur', () => {
  const value = searchTagEditor.value.trim();
  if (value && !searchTags.includes(value)) {
    searchTags.push(value);
    searchTagEditor.value = '';
    renderSearchTags();
    search();
  }
});

// AND/OR mode toggle
function setMode(m) {
  searchMode = m === 'or' ? 'or' : 'and';
  modeAndBtn.classList.toggle('active', searchMode === 'and');
  modeOrBtn.classList.toggle('active', searchMode === 'or');
  search();
}
modeAndBtn.addEventListener('click', () => setMode('and'));
modeOrBtn.addEventListener('click', () => setMode('or'));

// Clear buttons functionality
clearUploadTagsBtn.addEventListener('click', () => {
  if (tags.length === 0) return;

  const message = `Clear all ${tags.length} tag(s)?`;

  showConfirmDialog(
    'Clear Upload Tags',
    message,
    'Clear All',
    () => {
      tags = [];
      renderTags();
    },
    'Cancel'
  );
});

clearSearchTagsBtn.addEventListener('click', () => {
  if (searchTags.length === 0) return;

  const message = `Clear all ${searchTags.length} search tag(s)?`;

  showConfirmDialog(
    'Clear Search Tags',
    message,
    'Clear All',
    () => {
      searchTags = [];
      renderSearchTags();
      search();
    },
    'Cancel'
  );
});

// Upload confirmation dialog
function showUploadConfirmation(file) {
  const tagText = tags.length > 0 ? `\nTags: ${tags.join(', ')}` : '\nNo tags';
  const message = `Upload "${file.name}"?${tagText}\n\n💡 To delete tags: Click on any tag to remove it`;

  showConfirmDialog(
    'Confirm Upload',
    message,
    'Upload',
    () => uploadSelectedFile(file),
    'Cancel'
  );
}

// Delete all confirmation
deleteAllBtn.addEventListener('click', async () => {
  const data = await fetchJSON('/api/images');
  const count = data.images.length;

  if (count === 0) {
    alert('No images to delete');
    return;
  }

  const message = `Delete all ${count} image(s)?\n\nThis action cannot be undone.`;

  showConfirmDialog(
    'Delete All Images',
    message,
    'Delete All',
    async () => {
      try {
        // Delete all images one by one
        for (const img of data.images) {
          await fetch(`/api/images/${img.id}`, { method: 'DELETE' });
        }
        await search();
      } catch (err) {
        alert('Failed to delete some images');
      }
    },
    'Cancel'
  );
});

// Generic confirmation dialog
function showConfirmDialog(title, message, confirmText, onConfirm, cancelText = 'Cancel') {
  // Create dialog elements
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';

  dialog.innerHTML = `
    <div class="confirm-content">
      <div class="confirm-title">${title}</div>
      <div class="confirm-message">${message.replace(/\n/g, '<br>')}</div>
      <div class="confirm-actions">
        <button class="confirm-btn secondary cancel-btn">${cancelText}</button>
        <button class="confirm-btn primary confirm-btn-action">${confirmText}</button>
      </div>
    </div>
  `;

  // Add event listeners
  const cancelBtn = dialog.querySelector('.cancel-btn');
  const confirmBtn = dialog.querySelector('.confirm-btn-action');

  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(dialog);
  });

  confirmBtn.addEventListener('click', () => {
    document.body.removeChild(dialog);
    onConfirm();
  });

  // Close on background click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      document.body.removeChild(dialog);
    }
  });

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(dialog);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Show dialog
  document.body.appendChild(dialog);
  confirmBtn.focus();
}

// Global variables for AI models
let classificationModel = null;
let detectionModel = null;

// Load AI models on page load
async function loadAIModel() {
  try {
    console.log('Loading AI vision models...');
    classificationModel = await mobilenet.load();
    detectionModel = await cocoSsd.load();
    console.log('AI models loaded successfully');
  } catch (error) {
    console.error('Failed to load AI models:', error);
  }
}

// AI Describe functionality with detailed visual analysis
aiDescribeBtn.addEventListener('click', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    alert('Please select an image first');
    return;
  }

  if (!file.type.startsWith('image/')) {
    alert('Please select a valid image file');
    return;
  }

  // Update button state
  aiDescribeBtn.disabled = true;
  aiDescribeBtn.classList.add('loading');
  aiDescribeBtn.innerHTML = '🤖 Analyzing...';

  // Hide previous description
  aiDescription.classList.remove('show');

  try {
    // Load models if not already loaded
    if (!classificationModel || !detectionModel) {
      aiDescribeBtn.innerHTML = '🤖 Loading AI Models...';
      await loadAIModel();
    }

    if (!classificationModel || !detectionModel) {
      throw new Error('AI models failed to load');
    }

    // Create image element for analysis
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const imageLoadPromise = new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // Load image from file
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);

    await imageLoadPromise;

    // Perform comprehensive image analysis
    aiDescribeBtn.innerHTML = '🤖 Detecting Objects...';
    const detections = await detectionModel.detect(img);

    aiDescribeBtn.innerHTML = '🤖 Analyzing Colors...';
    const colorAnalysis = await analyzeImageColors(img);

    aiDescribeBtn.innerHTML = '🤖 Classifying Scene...';
    const classifications = await classificationModel.classify(img);

    // Generate comprehensive description
    const description = generateDetailedDescription(detections, colorAnalysis, classifications);

    // Display the AI description
    aiDescriptionText.textContent = description;
    aiDescription.classList.add('show');

    // Auto-add relevant tags
    addRelevantTags(detections, colorAnalysis);

  } catch (error) {
    console.error('AI Description error:', error);
    aiDescriptionText.textContent = 'AI analysis failed. Please try again or check your internet connection.';
    aiDescription.classList.add('show');
  } finally {
    // Reset button state
    aiDescribeBtn.disabled = false;
    aiDescribeBtn.classList.remove('loading');
    aiDescribeBtn.innerHTML = '🤖 AI Describe';
  }
});

// Analyze image colors using canvas
async function analyzeImageColors(img) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Resize for faster processing
  const maxSize = 200;
  const scale = Math.min(maxSize / img.width, maxSize / img.height);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Sample colors from different regions
  const colors = {
    dominant: [],
    background: [],
    foreground: []
  };

  // Analyze dominant colors
  const colorCounts = {};
  for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const colorKey = `${Math.floor(r/32)*32},${Math.floor(g/32)*32},${Math.floor(b/32)*32}`;
    colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
  }

  // Get top colors
  const sortedColors = Object.entries(colorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([color]) => color.split(',').map(Number));

  // Analyze background (edges) vs foreground (center)
  const edgeColors = [];
  const centerColors = [];

  // Sample edge pixels for background
  for (let x = 0; x < canvas.width; x += 10) {
    for (let y of [0, canvas.height - 1]) {
      const i = (y * canvas.width + x) * 4;
      if (i < data.length) {
        edgeColors.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }

  // Sample center pixels for foreground
  const centerX = Math.floor(canvas.width / 2);
  const centerY = Math.floor(canvas.height / 2);
  const radius = Math.min(canvas.width, canvas.height) / 4;

  for (let x = centerX - radius; x < centerX + radius; x += 10) {
    for (let y = centerY - radius; y < centerY + radius; y += 10) {
      if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
        const i = (y * canvas.width + x) * 4;
        centerColors.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }

  return {
    dominant: sortedColors.map(rgb => rgbToColorName(rgb)),
    background: getAverageColor(edgeColors),
    foreground: getAverageColor(centerColors),
    palette: sortedColors
  };
}

// Convert RGB to color name
function rgbToColorName([r, g, b]) {
  const colors = [
    { name: 'red', rgb: [255, 0, 0] },
    { name: 'green', rgb: [0, 255, 0] },
    { name: 'blue', rgb: [0, 0, 255] },
    { name: 'yellow', rgb: [255, 255, 0] },
    { name: 'orange', rgb: [255, 165, 0] },
    { name: 'purple', rgb: [128, 0, 128] },
    { name: 'pink', rgb: [255, 192, 203] },
    { name: 'brown', rgb: [165, 42, 42] },
    { name: 'black', rgb: [0, 0, 0] },
    { name: 'white', rgb: [255, 255, 255] },
    { name: 'gray', rgb: [128, 128, 128] },
    { name: 'cyan', rgb: [0, 255, 255] },
    { name: 'magenta', rgb: [255, 0, 255] },
    { name: 'lime', rgb: [0, 255, 0] },
    { name: 'navy', rgb: [0, 0, 128] },
    { name: 'teal', rgb: [0, 128, 128] },
    { name: 'silver', rgb: [192, 192, 192] },
    { name: 'maroon', rgb: [128, 0, 0] }
  ];

  let minDistance = Infinity;
  let closestColor = 'unknown';

  for (const color of colors) {
    const distance = Math.sqrt(
      Math.pow(r - color.rgb[0], 2) +
      Math.pow(g - color.rgb[1], 2) +
      Math.pow(b - color.rgb[2], 2)
    );

    if (distance < minDistance) {
      minDistance = distance;
      closestColor = color.name;
    }
  }

  return closestColor;
}

// Get average color from array of RGB values
function getAverageColor(colors) {
  if (colors.length === 0) return 'unknown';

  const avg = colors.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
    [0, 0, 0]
  ).map(sum => Math.round(sum / colors.length));

  return rgbToColorName(avg);
}

// Generate detailed description combining all analysis
function generateDetailedDescription(detections, colorAnalysis, classifications) {
  let description = '';

  // Start with main objects
  if (detections && detections.length > 0) {
    const mainObject = detections[0];
    const objectName = mainObject.class.toLowerCase();
    description += objectName;

    // Add color information
    if (colorAnalysis.dominant && colorAnalysis.dominant.length > 0) {
      const primaryColor = colorAnalysis.dominant[0];
      if (primaryColor !== 'unknown') {
        description += `, ${primaryColor}`;
      }
    }

    // Add additional colors
    if (colorAnalysis.dominant && colorAnalysis.dominant.length > 1) {
      const secondaryColors = colorAnalysis.dominant.slice(1, 3).filter(c => c !== 'unknown');
      if (secondaryColors.length > 0) {
        description += `, ${secondaryColors.join(', ')}`;
      }
    }

    // Add background information
    if (colorAnalysis.background && colorAnalysis.background !== 'unknown') {
      description += `, ${colorAnalysis.background} background`;
    }

    // Add scene context from classification
    if (classifications && classifications.length > 0) {
      const sceneContext = classifications[0].className.toLowerCase();
      if (sceneContext.includes('outdoor') || sceneContext.includes('sky') || sceneContext.includes('landscape')) {
        if (!description.includes('sky') && colorAnalysis.background === 'blue') {
          description += ', blue sky';
        }
      }
    }

    // Add additional detected objects
    if (detections.length > 1) {
      const additionalObjects = detections.slice(1, 3).map(d => d.class.toLowerCase());
      description += `, with ${additionalObjects.join(' and ')}`;
    }
  } else {
    // Fallback to classification if no objects detected
    if (classifications && classifications.length > 0) {
      description = classifications[0].className.toLowerCase();

      // Add color information
      if (colorAnalysis.dominant && colorAnalysis.dominant.length > 0) {
        const colors = colorAnalysis.dominant.slice(0, 2).filter(c => c !== 'unknown');
        if (colors.length > 0) {
          description += `, ${colors.join(' and ')} colors`;
        }
      }
    } else {
      description = 'image with various colors';
      if (colorAnalysis.dominant && colorAnalysis.dominant.length > 0) {
        const colors = colorAnalysis.dominant.slice(0, 3).filter(c => c !== 'unknown');
        if (colors.length > 0) {
          description += `: ${colors.join(', ')}`;
        }
      }
    }
  }

  return description;
}

// Add relevant tags based on analysis
function addRelevantTags(detections, colorAnalysis) {
  const newTags = [];

  // Add object tags
  if (detections && detections.length > 0) {
    detections.slice(0, 2).forEach(detection => {
      const objectTag = detection.class.toLowerCase();
      if (!tags.includes(objectTag)) {
        newTags.push(objectTag);
      }
    });
  }

  // Add color tags
  if (colorAnalysis.dominant && colorAnalysis.dominant.length > 0) {
    colorAnalysis.dominant.slice(0, 2).forEach(color => {
      if (color !== 'unknown' && !tags.includes(color)) {
        newTags.push(color);
      }
    });
  }

  // Add background color tag
  if (colorAnalysis.background && colorAnalysis.background !== 'unknown') {
    const bgTag = `${colorAnalysis.background} background`;
    if (!tags.includes(bgTag)) {
      newTags.push(bgTag);
    }
  }

  // Add new tags and re-render
  tags.push(...newTags);
  renderTags();
}

// Initial load
search();

// Load AI model in background
loadAIModel();


