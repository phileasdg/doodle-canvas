// --- CONFIGURATION: Default Pen and Tool Sizes ---
// You can modify these values to change the drawing widths of each tool
const TOOL_SIZES = {
  pen: { fine: 2, med: 3.5, thick: 7 },
  highlighter: { fine: 14, med: 28, thick: 46 },
  eraser: { fine: 24, med: 50, thick: 95 } // Larger erasers for better clearing UX
};

// --- STATE MANAGEMENT ---
const state = {
  tool: 'pen',
  toolSizes: {
    pen: 'fine',          // Default starting size for Pen
    highlighter: 'med',   // Default starting size for Highlighter
    eraser: 'med'         // Default starting size for Eraser (starts bigger)
  },
  color: '#003d5b', // Default SFI Ming Navy ink
  smoothing: true,
  baseSampling: 3, // Base distance threshold for jitter decimation
  isDrawing: false,
  currentStroke: [],
  strokes: [], // Stores completed drawing strokes: { tool, size, color, points }
  redoStrokes: [] // Stores undone strokes for redo
};

// Tool Configurations
const tools = {
  pen: { 
    color: '#003d5b', opacity: 1, blend: 'source-over', 
    sizes: TOOL_SIZES.pen 
  },
  highlighter: { 
    color: '#f5a623', opacity: 0.55, blend: 'multiply', 
    sizes: TOOL_SIZES.highlighter 
  },
  eraser: { 
    color: '#ecebe6', opacity: 1, blend: 'destination-out', 
    sizes: TOOL_SIZES.eraser 
  }
};

// --- DOM ELEMENTS & SETUP ---
const mainCanvas = document.getElementById('main-canvas');
const mainCtx = mainCanvas.getContext('2d');
const draftCanvas = document.getElementById('draft-canvas');
const draftCtx = draftCanvas.getContext('2d');

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;

  [mainCanvas, draftCanvas].forEach(cvs => {
    cvs.width = width * dpr;
    cvs.height = height * dpr;
  });

  mainCtx.scale(dpr, dpr);
  draftCtx.scale(dpr, dpr);

  redrawCanvas();
  applyToolSettings();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- UI CONTROL SETTERS ---
function setTool(toolName) {
  state.tool = toolName;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${toolName}`).classList.add('active');

  // Load the saved size label for this specific tool and update active class
  const savedSize = state.toolSizes[toolName];
  document.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${savedSize}`).classList.add('active');

  applyToolSettings();
}

function setSize(sizeLabel) {
  state.toolSizes[state.tool] = sizeLabel;
  document.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`btn-${sizeLabel}`).classList.add('active');
  applyToolSettings();
}

function setColor(colorHex) {
  state.color = colorHex;
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === colorHex);
  });
  applyToolSettings();
}

function clickCustomColor() {
  const btn = document.getElementById('btn-custom-color');
  if (state.color === btn.dataset.color && btn.dataset.color !== '') {
    document.getElementById('custom-color-picker').click();
  } else if (btn.dataset.color !== '') {
    setColor(btn.dataset.color);
  } else {
    document.getElementById('custom-color-picker').click();
  }
}

function setCustomColor(colorHex) {
  const btn = document.getElementById('btn-custom-color');
  btn.style.backgroundColor = colorHex;
  btn.dataset.color = colorHex;
  btn.setAttribute('data-tooltip', `Custom Color (${colorHex})`);
  setColor(colorHex);
}

function toggleSidebar() {
  const toolbar = document.querySelector('.toolbar');
  toolbar.classList.toggle('collapsed');
}

function applyToolSettings() {
  const t = tools[state.tool];
  const sizeLabel = state.toolSizes[state.tool];
  const size = t.sizes[sizeLabel];
  const activeColor = state.tool === 'eraser' ? t.color : state.color;

  // Draft Context (Always draws solid colors, opacity is handled by CSS)
  draftCtx.strokeStyle = activeColor;
  draftCtx.fillStyle = activeColor;
  draftCtx.lineWidth = size;
  draftCtx.lineCap = 'round';
  draftCtx.lineJoin = 'round';

  // Live CSS for accurate visual representation while drawing
  draftCanvas.style.opacity = t.opacity;
  draftCanvas.style.mixBlendMode = t.blend === 'multiply' ? 'multiply' : 'normal';

  // Main Context (Used for final commits and direct Eraser interaction)
  mainCtx.strokeStyle = activeColor;
  mainCtx.fillStyle = activeColor;
  mainCtx.lineWidth = size;
  mainCtx.lineCap = 'round';
  mainCtx.lineJoin = 'round';
  mainCtx.globalCompositeOperation = t.blend;
}

// --- DYNAMIC DRAWING ENGINE ---
function startDrawing(e) {
  // Prevent drawing if clicking on the sidebar or if sidebar is collapsed but click is on toggle button
  if (e.target !== mainCanvas) return;
  state.isDrawing = true;
  const pos = getPos(e);
  pos.time = e.timeStamp;
  state.currentStroke = [pos];

  if (state.tool === 'eraser') {
    mainCtx.beginPath();
    mainCtx.arc(pos.x, pos.y, mainCtx.lineWidth / 2, 0, Math.PI * 2);
    mainCtx.fill();
  } else {
    renderDraftPath();
  }
}

function draw(e) {
  if (!state.isDrawing) return;
  const pos = getPos(e);
  pos.time = e.timeStamp;

  const stroke = state.currentStroke;
  const lastPos = stroke[stroke.length - 1];

  const dt = Math.max(1, pos.time - lastPos.time);
  const dist = Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y);
  const velocity = dist / dt;

  let dynamicThreshold = state.baseSampling - (velocity * 2.5);
  dynamicThreshold = Math.max(1, Math.min(state.baseSampling, dynamicThreshold));

  if (dist < dynamicThreshold && stroke.length > 1) return;

  stroke.push(pos);

  if (state.tool === 'eraser') {
    mainCtx.beginPath();
    mainCtx.moveTo(lastPos.x, lastPos.y);
    mainCtx.lineTo(pos.x, pos.y);
    mainCtx.stroke();
  } else {
    renderDraftPath();
  }
}

function renderDraftPath() {
  draftCtx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
  const stroke = state.currentStroke;
  if (stroke.length === 0) return;

  draftCtx.beginPath();
  draftCtx.moveTo(stroke[0].x, stroke[0].y);

  if (stroke.length === 1) {
    draftCtx.arc(stroke[0].x, stroke[0].y, draftCtx.lineWidth / 2, 0, Math.PI * 2);
    draftCtx.fill();
    return;
  }

  if (!state.smoothing) {
    for (let i = 1; i < stroke.length; i++) {
      draftCtx.lineTo(stroke[i].x, stroke[i].y);
    }
  } else {
    for (let i = 1; i < stroke.length - 1; i++) {
      const midX = (stroke[i].x + stroke[i + 1].x) / 2;
      const midY = (stroke[i].y + stroke[i + 1].y) / 2;
      draftCtx.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY);
    }
    const last = stroke[stroke.length - 1];
    draftCtx.lineTo(last.x, last.y);
  }
  draftCtx.stroke();
}

function stopDrawing() {
  if (!state.isDrawing) return;
  state.isDrawing = false;

  if (state.currentStroke.length > 0) {
    const currentTool = state.tool;
    const currentSize = tools[currentTool].sizes[state.toolSizes[currentTool]];
    state.strokes.push({
      tool: currentTool,
      size: currentSize,
      color: currentTool === 'eraser' ? '#ecebe6' : state.color,
      points: [...state.currentStroke]
    });
    state.redoStrokes = [];
  }

  draftCtx.save();
  draftCtx.setTransform(1, 0, 0, 1, 0, 0);
  draftCtx.clearRect(0, 0, draftCanvas.width, draftCanvas.height);
  draftCtx.restore();

  state.currentStroke = [];
  redrawCanvas();
}

function getPos(e) {
  const rect = mainCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

mainCanvas.addEventListener('pointerdown', startDrawing);
window.addEventListener('pointermove', draw);
window.addEventListener('pointerup', stopDrawing);
window.addEventListener('pointercancel', stopDrawing);

// --- REDRAW AND STATE CHANGES ---
function redrawCanvas() {
  mainCtx.save();
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
  mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
  mainCtx.restore();

  state.strokes.forEach(stroke => {
    mainCtx.save();
    const t = tools[stroke.tool];
    const drawColor = stroke.tool === 'eraser' ? t.color : stroke.color;
    
    mainCtx.strokeStyle = drawColor;
    mainCtx.fillStyle = drawColor;
    mainCtx.lineWidth = stroke.size;
    mainCtx.lineCap = 'round';
    mainCtx.lineJoin = 'round';
    mainCtx.globalAlpha = t.opacity;
    mainCtx.globalCompositeOperation = t.blend;

    mainCtx.beginPath();
    const pts = stroke.points;
    if (pts.length === 0) {
      mainCtx.restore();
      return;
    }
    mainCtx.moveTo(pts[0].x, pts[0].y);

    if (pts.length === 1) {
      mainCtx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
      mainCtx.fill();
    } else {
      if (!state.smoothing) {
        for (let i = 1; i < pts.length; i++) {
          mainCtx.lineTo(pts[i].x, pts[i].y);
        }
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          mainCtx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        const last = pts[pts.length - 1];
        mainCtx.lineTo(last.x, last.y);
      }
      mainCtx.stroke();
    }
    mainCtx.restore();
  });
  updateHistoryButtons();
}

// --- UNDO / REDO / CLEAR ---
function undo() {
  if (state.strokes.length > 0) {
    const stroke = state.strokes.pop();
    state.redoStrokes.push(stroke);
    redrawCanvas();
  }
}

function redo() {
  if (state.redoStrokes.length > 0) {
    const stroke = state.redoStrokes.pop();
    state.strokes.push(stroke);
    redrawCanvas();
  }
}

function clearCanvas() {
  state.strokes = [];
  state.redoStrokes = [];
  redrawCanvas();
}

function updateHistoryButtons() {
  document.getElementById('btn-undo').disabled = state.strokes.length === 0;
  document.getElementById('btn-redo').disabled = state.redoStrokes.length === 0;
}

// --- EXPORT FUNCTIONS ---
function exportPNG() {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = mainCanvas.width;
  tempCanvas.height = mainCanvas.height;
  const tempCtx = tempCanvas.getContext('2d');
  
  tempCtx.fillStyle = '#ecebe6'; // SFI Warm Gray background
  tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
  tempCtx.drawImage(mainCanvas, 0, 0);
  
  const url = tempCanvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'doodle.png';
  a.click();
}

function exportSVG() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background-color: #ecebe6;">`;
  
  state.strokes.forEach(stroke => {
    const t = tools[stroke.tool];
    const pts = stroke.points;
    if (pts.length === 0) return;
    
    const color = stroke.tool === 'eraser' ? '#ecebe6' : stroke.color;
    const opacity = stroke.tool === 'eraser' ? 1 : t.opacity;
    const blend = t.blend === 'multiply' ? ' style="mix-blend-mode: multiply;"' : '';
    
    let pathData = `M ${pts[0].x} ${pts[0].y}`;
    
    if (pts.length === 1) {
      svgContent += `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="${stroke.size / 2}" fill="${color}" opacity="${opacity}"${blend} />`;
    } else {
      if (!state.smoothing) {
        for (let i = 1; i < pts.length; i++) {
          pathData += ` L ${pts[i].x} ${pts[i].y}`;
        }
      } else {
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          pathData += ` Q ${pts[i].x} ${pts[i].y}, ${midX} ${midY}`;
        }
        const last = pts[pts.length - 1];
        pathData += ` L ${last.x} ${last.y}`;
      }
      svgContent += `<path d="${pathData}" stroke="${color}" stroke-width="${stroke.size}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"${blend} />`;
    }
  });
  
  svgContent += '</svg>';
  
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'doodle.svg';
  a.click();
  URL.revokeObjectURL(url);
}

// --- INITIALIZE CUSTOM TOOLTIPS ---
const tooltipEl = document.getElementById('custom-tooltip');
document.querySelectorAll('[data-tooltip]').forEach(el => {
  el.addEventListener('mouseenter', () => {
    tooltipEl.innerText = el.getAttribute('data-tooltip');
    tooltipEl.classList.remove('hidden');
    
    const rect = el.getBoundingClientRect();
    // Position tooltip nicely to the right of the sidebar
    tooltipEl.style.left = `${rect.right + 8}px`;
    tooltipEl.style.top = `${rect.top + (rect.height / 2) - (tooltipEl.offsetHeight / 2)}px`;
  });
  el.addEventListener('mouseleave', () => {
    tooltipEl.classList.add('hidden');
  });
});

// Initialize Lucide SVG icons
lucide.createIcons();
