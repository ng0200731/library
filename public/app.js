// Global variables for AI models - must be at top level
var classificationModel = null;
var detectionModel = null;

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
const uploadAllBtn = document.getElementById('uploadAllBtn');
const aiAnalyzeAllBtn = document.getElementById('aiAnalyzeAllBtn');
const advancedAiBtn = document.getElementById('advancedAiBtn');
const clearAllImagesBtn = document.getElementById('clearAllImagesBtn');
const imagesTable = document.getElementById('imagesTable');
const imagesTableBody = document.getElementById('imagesTableBody');
const dzPreview = document.getElementById('dzPreview');
const deleteAllBtn = document.getElementById('deleteAllBtn');

// Global state for multiple images
let selectedImages = [];
let imageCounter = 0;

// Search tag inputs and mode
const searchTagList = document.getElementById('searchTagList');
const searchTagEditor = document.getElementById('searchTagEditor');
const modeAndBtn = document.getElementById('modeAnd');
const modeOrBtn = document.getElementById('modeOr');
const clearSearchTagsBtn = document.getElementById('clearSearchTagsBtn');
let searchTags = [];
let searchMode = 'and';

function resetUploadUI() {
  selectedImages = [];
  imageCounter = 0;
  if (uploadStatus) uploadStatus.textContent = '';
  if (dzPreview) { dzPreview.classList.add('hidden'); dzPreview.src = ''; }
  if (dropzone) dropzone.classList.remove('has-preview');
  if (fileInput) fileInput.value = '';
  if (imagesTable) imagesTable.classList.add('hidden');
  if (imagesTableBody) imagesTableBody.innerHTML = '';
  updateUploadButton();
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
  if (selectedImages.length === 0) {
    fileInput.click();
    return;
  }
  showBatchUploadConfirmation();
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

  // Handle multiple files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith('image/')) {
      addImageToTable(file);
    }
  }

  updateDropzonePreview();
});

dropzone.addEventListener('click', () => { fileInput.click(); });

fileInput.addEventListener('change', () => {
  const files = fileInput.files;
  if (files && files.length > 0) {
    // Handle multiple files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        addImageToTable(file);
      }
    }
    updateDropzonePreview();
  }
});

// Add image to the table
function addImageToTable(file) {
  const imageId = `img_${++imageCounter}`;
  const imageData = {
    id: imageId,
    file: file,
    filename: file.name,
    size: file.size,
    aiTags: [],
    manualTags: [],
    analyzed: false,
    advancedAnalysis: null,
    preview: null
  };

  selectedImages.push(imageData);

  // Create preview
  const reader = new FileReader();
  reader.onload = (e) => {
    imageData.preview = e.target.result;
    renderImagesTable();
  };
  reader.readAsDataURL(file);
}

// Update dropzone preview to show multiple files
function updateDropzonePreview() {
  if (selectedImages.length === 0) {
    dzPreview.classList.add('hidden');
    dropzone.classList.remove('has-preview');
    imagesTable.classList.add('hidden');
  } else if (selectedImages.length === 1 && selectedImages[0].preview) {
    dzPreview.src = selectedImages[0].preview;
    dzPreview.classList.remove('hidden');
    dropzone.classList.add('has-preview');
    imagesTable.classList.remove('hidden');
  } else {
    dzPreview.classList.add('hidden');
    dropzone.classList.remove('has-preview');
    imagesTable.classList.remove('hidden');
  }
  updateUploadButton();
}

// Update upload button state
function updateUploadButton() {
  if (uploadAllBtn) {
    uploadAllBtn.disabled = selectedImages.length === 0;
    uploadAllBtn.textContent = selectedImages.length > 0
      ? `📤 Upload ${selectedImages.length} Image${selectedImages.length > 1 ? 's' : ''} to Library`
      : '📤 Upload All to Library';
  }

  if (aiAnalyzeAllBtn) {
    const unanalyzed = selectedImages.filter(img => !img.analyzed).length;
    aiAnalyzeAllBtn.disabled = selectedImages.length === 0;
    aiAnalyzeAllBtn.textContent = unanalyzed > 0
      ? `🤖 Basic Analysis (${unanalyzed})`
      : '🤖 Basic Complete';
  }

  if (advancedAiBtn) {
    const unanalyzedAdvanced = selectedImages.filter(img => !img.advancedAnalysis).length;
    advancedAiBtn.disabled = selectedImages.length === 0;
    advancedAiBtn.textContent = unanalyzedAdvanced > 0
      ? `🧠 Advanced LLM (${unanalyzedAdvanced})`
      : '🧠 Advanced Complete';
  }
}

// Render the images table
function renderImagesTable() {
  if (!imagesTableBody) return;

  imagesTableBody.innerHTML = '';

  selectedImages.forEach((imageData, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <img src="${imageData.preview || ''}" alt="${imageData.filename}" class="image-preview" />
      </td>
      <td class="filename-cell">
        <div title="${imageData.filename}">${imageData.filename}</div>
        <div style="font-size: 10px; color: #9ca3af;">${formatFileSize(imageData.size)}</div>
      </td>
      <td class="tags-cell">
        <div class="ai-tags" id="aiTags_${imageData.id}">
          ${imageData.analyzed ?
            imageData.aiTags.map(tag => `<span class="ai-tag">${tag}</span>`).join('') :
            '<span class="processing-indicator">Basic AI tags</span>'
          }
        </div>
        ${imageData.advancedAnalysis ?
          `<div class="advanced-analysis" id="advancedAnalysis_${imageData.id}">
            <div class="analysis-section">
              <div class="analysis-label">What it is:</div>
              <div class="analysis-content">${imageData.advancedAnalysis.what_it_is}</div>
            </div>
            <div class="analysis-section">
              <div class="analysis-label">Main colors:</div>
              <div class="analysis-content">${imageData.advancedAnalysis.main_colors}</div>
            </div>
            <div class="analysis-section">
              <div class="analysis-label">Background:</div>
              <div class="analysis-content">${imageData.advancedAnalysis.background}</div>
            </div>
            <div class="analysis-section">
              <div class="analysis-label">Atmosphere:</div>
              <div class="analysis-content">${imageData.advancedAnalysis.atmosphere}</div>
            </div>
            <div class="analysis-section">
              <div class="analysis-label">Impression:</div>
              <div class="analysis-content">${imageData.advancedAnalysis.impression}</div>
            </div>
            <div class="analysis-section">
              <div class="analysis-label">Style:</div>
              <div class="analysis-content">${imageData.advancedAnalysis.style}</div>
            </div>
          </div>` :
          `<div id="advancedAnalysisPlaceholder_${imageData.id}"></div>`
        }
      </td>
      <td class="tags-cell">
        <input type="text" class="manual-tags-input"
               placeholder="Add manual tags (comma separated)"
               value="${imageData.manualTags.join(', ')}"
               onchange="updateManualTags('${imageData.id}', this.value)" />
      </td>
      <td class="table-actions-cell">
        <button class="table-btn analyze-btn"
                onclick="analyzeImage('${imageData.id}')"
                ${imageData.analyzed ? 'disabled' : ''}>
          ${imageData.analyzed ? '✓ Basic' : '🤖 Basic'}
        </button>
        <button class="table-btn advanced-analyze-btn"
                onclick="advancedAnalyzeImage('${imageData.id}')"
                ${imageData.advancedAnalysis ? 'disabled' : ''}>
          ${imageData.advancedAnalysis ? '✓ Advanced' : '🧠 Advanced'}
        </button>
        <button class="table-btn remove-btn" onclick="removeImage('${imageData.id}')">
          🗑️ Remove
        </button>
      </td>
    `;

    imagesTableBody.appendChild(row);
  });

  updateUploadButton();
}

// Format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// These functions are now defined as window.functionName above for global access

// Make functions global so they can be called from HTML onclick
window.analyzeImage = async function(imageId) {
  const imageData = selectedImages.find(img => img.id === imageId);
  if (!imageData || imageData.analyzed) return;

  const analyzeBtn = document.querySelector(`button[onclick="analyzeImage('${imageId}')"]`);
  const aiTagsContainer = document.getElementById(`aiTags_${imageId}`);

  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '🤖 Analyzing...';
    analyzeBtn.classList.add('analyzing');
  }

  if (aiTagsContainer) {
    aiTagsContainer.innerHTML = '<span class="processing-indicator">Analyzing image...</span>';
  }

  try {
    // Load models if not already loaded
    if (!classificationModel || !detectionModel) {
      if (aiTagsContainer) {
        aiTagsContainer.innerHTML = '<span class="processing-indicator">Loading AI models...</span>';
      }

      try {
        await loadAIModel();
      } catch (loadError) {
        throw new Error(`Model loading failed: ${loadError.message}`);
      }
    }

    // Double-check models are loaded
    if (!classificationModel) {
      throw new Error('Classification model failed to initialize');
    }

    if (!detectionModel) {
      throw new Error('Detection model failed to initialize');
    }

    // Create image element for analysis
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageData.preview;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      setTimeout(() => reject(new Error('Image load timeout')), 10000);
    });

    if (aiTagsContainer) {
      aiTagsContainer.innerHTML = '<span class="processing-indicator">Detecting objects...</span>';
    }

    // Perform AI analysis
    const detections = await detectionModel.detect(img);

    if (aiTagsContainer) {
      aiTagsContainer.innerHTML = '<span class="processing-indicator">Analyzing colors...</span>';
    }

    const colorAnalysis = await analyzeImageColors(img);

    if (aiTagsContainer) {
      aiTagsContainer.innerHTML = '<span class="processing-indicator">Classifying scene...</span>';
    }

    const classifications = await classificationModel.classify(img);

    // Generate tags from analysis
    const aiTags = generateTagsFromAnalysis(detections, colorAnalysis, classifications);

    // Update image data
    imageData.aiTags = aiTags;
    imageData.analyzed = true;

    // Update UI
    if (aiTagsContainer) {
      aiTagsContainer.innerHTML = aiTags.map(tag => `<span class="ai-tag">${tag}</span>`).join('');
    }

    if (analyzeBtn) {
      analyzeBtn.textContent = '✓ Done';
      analyzeBtn.classList.remove('analyzing');
    }

  } catch (error) {
    console.error('AI Analysis error:', error);
    if (aiTagsContainer) {
      aiTagsContainer.innerHTML = `<span style="color: #ef4444;">Analysis failed: ${error.message}</span>`;
    }
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '🤖 Retry';
      analyzeBtn.classList.remove('analyzing');
    }
  }

  updateUploadButton();
};

window.removeImage = function(imageId) {
  selectedImages = selectedImages.filter(img => img.id !== imageId);
  renderImagesTable();
  updateDropzonePreview();
};

window.updateManualTags = function(imageId, tagsString) {
  const imageData = selectedImages.find(img => img.id === imageId);
  if (imageData) {
    imageData.manualTags = tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }
};

// Advanced AI analysis using LLM
window.advancedAnalyzeImage = async function(imageId) {
  const imageData = selectedImages.find(img => img.id === imageId);
  if (!imageData || imageData.advancedAnalysis) return;

  const analyzeBtn = document.querySelector(`button[onclick="advancedAnalyzeImage('${imageId}')"]`);
  const placeholder = document.getElementById(`advancedAnalysisPlaceholder_${imageId}`);

  if (analyzeBtn) {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = '🧠 Analyzing...';
    analyzeBtn.classList.add('analyzing');
  }

  if (placeholder) {
    placeholder.innerHTML = '<div class="processing-indicator">🧠 Advanced AI analyzing image...</div>';
  }

  try {
    const formData = new FormData();
    formData.append('image', imageData.file);

    const response = await fetch('/api/advanced-analyze', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    // Update image data
    imageData.advancedAnalysis = result.analysis;

    // Re-render the table to show the analysis
    renderImagesTable();

  } catch (error) {
    console.error('Advanced AI Analysis error:', error);
    if (placeholder) {
      placeholder.innerHTML = `<div style="color: #ef4444; font-size: 11px;">Advanced analysis failed: ${error.message}</div>`;
    }
    if (analyzeBtn) {
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = '🧠 Retry';
      analyzeBtn.classList.remove('analyzing');
    }
  }
};

// Generate tags from AI analysis
function generateTagsFromAnalysis(detections, colorAnalysis, classifications) {
  const tags = [];

  // Add main objects
  if (detections && detections.length > 0) {
    detections.slice(0, 2).forEach(detection => {
      tags.push(detection.class.toLowerCase());
    });
  }

  // Add dominant colors
  if (colorAnalysis.dominant && colorAnalysis.dominant.length > 0) {
    colorAnalysis.dominant.slice(0, 2).forEach(color => {
      if (color !== 'unknown') {
        tags.push(color);
      }
    });
  }

  // Add background color
  if (colorAnalysis.background && colorAnalysis.background !== 'unknown') {
    tags.push(`${colorAnalysis.background} background`);
  }

  return [...new Set(tags)]; // Remove duplicates
}

// Analyze all images
async function analyzeAllImages() {
  const unanalyzedImages = selectedImages.filter(img => !img.analyzed);

  for (const imageData of unanalyzedImages) {
    await window.analyzeImage(imageData.id);
  }
}

// Advanced analyze all images
async function advancedAnalyzeAllImages() {
  const unanalyzedImages = selectedImages.filter(img => !img.advancedAnalysis);

  for (const imageData of unanalyzedImages) {
    await window.advancedAnalyzeImage(imageData.id);
  }
}

// Event listeners for new buttons
aiAnalyzeAllBtn.addEventListener('click', analyzeAllImages);
advancedAiBtn.addEventListener('click', advancedAnalyzeAllImages);

clearAllImagesBtn.addEventListener('click', () => {
  if (selectedImages.length === 0) return;

  showConfirmDialog(
    'Clear All Images',
    `Remove all ${selectedImages.length} selected image(s)?`,
    'Clear All',
    () => {
      resetUploadUI();
    },
    'Cancel'
  );
});

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

// Batch upload confirmation dialog
function showBatchUploadConfirmation() {
  const totalImages = selectedImages.length;
  const analyzedImages = selectedImages.filter(img => img.analyzed).length;
  const unanalyzedImages = totalImages - analyzedImages;

  let message = `Upload ${totalImages} image(s) to library?\n\n`;
  message += `📊 Analysis Status:\n`;
  message += `✅ Analyzed: ${analyzedImages}\n`;
  if (unanalyzedImages > 0) {
    message += `⏳ Not analyzed: ${unanalyzedImages}\n\n`;
    message += `💡 Tip: Analyze images first to get AI-generated tags`;
  }

  showConfirmDialog(
    'Batch Upload Confirmation',
    message,
    'Upload All',
    () => uploadAllImages(),
    'Cancel'
  );
}

// Upload all images
async function uploadAllImages() {
  uploadStatus.textContent = 'Uploading images...';
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < selectedImages.length; i++) {
    const imageData = selectedImages[i];
    uploadStatus.textContent = `Uploading ${i + 1}/${selectedImages.length}: ${imageData.filename}`;

    try {
      const formData = new FormData();
      formData.append('image', imageData.file);

      // Combine AI tags and manual tags
      const allTags = [...imageData.aiTags, ...imageData.manualTags];
      if (allTags.length > 0) {
        formData.append('tags', allTags.join(','));
      }

      await fetchJSON('/api/images', { method: 'POST', body: formData });
      successCount++;
    } catch (error) {
      console.error(`Failed to upload ${imageData.filename}:`, error);
      failCount++;
    }
  }

  // Show results
  if (failCount === 0) {
    uploadStatus.textContent = `✅ Successfully uploaded ${successCount} image(s)!`;
  } else {
    uploadStatus.textContent = `⚠️ Uploaded ${successCount}, failed ${failCount} image(s)`;
  }

  // Reset and refresh
  setTimeout(() => {
    resetUploadUI();
    search();
  }, 2000);
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

// AI models are declared at the top of the file

// Load AI models on page load
async function loadAIModel() {
  try {
    console.log('Loading AI vision models...');

    // Check if TensorFlow.js is loaded
    if (typeof tf === 'undefined') {
      throw new Error('TensorFlow.js not loaded - check if script is included');
    }

    // Check if model libraries are loaded
    if (typeof mobilenet === 'undefined') {
      throw new Error('MobileNet library not loaded - check if script is included');
    }

    if (typeof cocoSsd === 'undefined') {
      throw new Error('COCO-SSD library not loaded - check if script is included');
    }

    // Initialize models if not already loaded
    if (!classificationModel) {
      console.log('Loading MobileNet classification model...');
      classificationModel = await mobilenet.load();
      console.log('MobileNet loaded successfully');
    }

    if (!detectionModel) {
      console.log('Loading COCO-SSD detection model...');
      detectionModel = await cocoSsd.load();
      console.log('COCO-SSD loaded successfully');
    }

    console.log('All AI models ready');
    return true;
  } catch (error) {
    console.error('Failed to load AI models:', error);
    classificationModel = null;
    detectionModel = null;
    throw error;
  }
}

// Note: AI analysis is now handled per-image in the table interface

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

// Calculate AI processing costs (simulated for client-side processing)
function calculateAICosts(detections, colorAnalysis, classifications, processingTime) {
  // Simulate token-based pricing similar to cloud AI services
  // Note: Our client-side AI is actually FREE, but this shows equivalent cloud costs

  let totalTokens = 0;
  let breakdown = [];

  // Object detection tokens (simulated)
  const objectTokens = (detections?.length || 0) * 50; // 50 tokens per detected object
  totalTokens += objectTokens;
  if (objectTokens > 0) breakdown.push(`${objectTokens} object tokens`);

  // Classification tokens (simulated)
  const classificationTokens = (classifications?.length || 0) * 30; // 30 tokens per classification
  totalTokens += classificationTokens;
  if (classificationTokens > 0) breakdown.push(`${classificationTokens} classification tokens`);

  // Color analysis tokens (simulated)
  const colorTokens = (colorAnalysis?.dominant?.length || 0) * 10; // 10 tokens per color analyzed
  totalTokens += colorTokens;
  if (colorTokens > 0) breakdown.push(`${colorTokens} color tokens`);

  // Base image processing tokens
  const baseTokens = 100; // Base cost for image processing
  totalTokens += baseTokens;
  breakdown.push(`${baseTokens} base tokens`);

  // Calculate cost at typical cloud AI pricing ($0.002 per 1K tokens)
  const costPer1KTokens = 0.002;
  const totalCost = (totalTokens / 1000) * costPer1KTokens;

  return {
    total: totalCost.toFixed(6),
    tokens: totalTokens,
    breakdown: breakdown.join(', '),
    note: 'FREE (client-side processing)'
  };
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


