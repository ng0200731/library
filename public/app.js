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

// AI Describe functionality
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
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch('/api/describe-image', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    // Display the AI description
    aiDescriptionText.textContent = result.description;
    aiDescription.classList.add('show');

    // Auto-add description as a tag if it's not too long
    const description = result.description.toLowerCase();
    if (description.length < 50 && !tags.includes(description)) {
      tags.push(description);
      renderTags();
    }

  } catch (error) {
    console.error('AI Description error:', error);
    aiDescriptionText.textContent = 'Failed to generate description. Please try again.';
    aiDescription.classList.add('show');
  } finally {
    // Reset button state
    aiDescribeBtn.disabled = false;
    aiDescribeBtn.classList.remove('loading');
    aiDescribeBtn.innerHTML = '🤖 AI Describe';
  }
});

// Initial load
search();


