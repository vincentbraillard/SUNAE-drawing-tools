// --- VARIABLES GLOBALES ---
let canvas = null;
let ctx = null;
let currentTable = null;
let currentModule = null;
let isRound = false;
let drawMode = 'freedraw'; 

let isDrawing = false;
let currentStroke = null;

// Architecture Native au lieu de Fabric
let userStrokes = []; // { isUserStroke: true, sunaeAbsPoints: [{x,y}...], createdAt: ms }
let travelLines = []; // { isTravelLine: true, sunaeAbsPoints: [{x,y}, {x,y}] }
let svgStrokes = [];  // Généré par le TSP
let rawSvgPreview = []; // Aperçu avant calcul

// Image de fond
let bgImageObj = null;
let bgScale = 1.0, bgAngle = 0, bgPanX = 0, bgPanY = 0;

// Simulateur
let simProgress = 100;

// --- VARIABLES FIXES POUR VERROUILLER LES MATHÉMATIQUES ---
let tableWidth = 600;
let tableHeight = 600;

const TABLE_CFG = {
    "Origin S": { round: true, rows: [6, 8, 8, 6], y_centers: [0.45, 0.15, -0.15, -0.45], w: 0.20, h: 0.24, spacing: 0.00, aspect: 1.0 },
    "Dimension S": { round: false, rows: [14, 14, 14], y_centers: [0.25, 0.0, -0.25], w: 0.11, h: 0.15, spacing: 0.015, aspect: 1300.0 / 600.0 },
    "Dimension L": { round: false, rows: [20, 20, 20, 20], y_centers: [0.27, 0.09, -0.09, -0.27], w: 0.075, h: 0.11, spacing: 0.01, aspect: 1900.0 / 900.0 }
};

// --- MIN-HEAP POUR LE ROUTAGE DIJKSTRA ---
class MinHeap {
    constructor() { this.data = []; }
    push(id, dist) { this.data.push({id, dist}); this.up(this.data.length - 1); }
    pop() {
        if(this.data.length === 0) return null;
        const top = this.data[0]; const bottom = this.data.pop();
        if(this.data.length > 0) { this.data[0] = bottom; this.down(0); }
        return top;
    }
    up(i) {
        while(i > 0) {
            let p = Math.floor((i-1)/2);
            if(this.data[p].dist <= this.data[i].dist) break;
            let tmp = this.data[i]; this.data[i] = this.data[p]; this.data[p] = tmp;
            i = p;
        }
    }
    down(i) {
        let len = this.data.length;
        while(true) {
            let left = 2*i + 1, right = 2*i + 2, min = i;
            if(left < len && this.data[left].dist < this.data[min].dist) min = left;
            if(right < len && this.data[right].dist < this.data[min].dist) min = right;
            if(min === i) break;
            let tmp = this.data[i]; this.data[i] = this.data[min]; this.data[min] = tmp;
            i = min;
        }
    }
    isEmpty() { return this.data.length === 0; }
}

// --- HELPERS ---
function getYYMMDD() {
    const d = new Date();
    return String(d.getFullYear()).slice(-2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

function getGridText() {
    if (!currentTable || !TABLE_CFG[currentTable]) return "";
    const cfg = TABLE_CFG[currentTable]; let text = "";
    for (let r = 0; r < cfg.rows.length; r++) {
        for (let c = 0; c < cfg.rows[r]; c++) {
            let input = document.querySelector(`.sunae-letter-box[data-row="${r}"][data-col="${c}"]`);
            if (input && input.value && input.value.trim() !== "") text += input.value.trim();
        }
    }
    return text;
}

function sanitizeCoordinates(x, y, round, w, h) {
    if (round) {
        const cx = w / 2; const cy = h / 2; const radius = (w / 2) - 2; 
        const dx = x - cx; const dy = y - cy; const dist = Math.hypot(dx, dy);
        if (dist > radius) return { x: cx + (radius * dx / dist), y: cy + (radius * dy / dist) };
        return { x, y };
    } else {
        const margin = 2;
        return { x: Math.max(margin, Math.min(w - margin, x)), y: Math.max(margin, Math.min(h - margin, y)) };
    }
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return sanitizeCoordinates(
        (evt.clientX - rect.left) * scaleX,
        (evt.clientY - rect.top) * scaleY,
        isRound, tableWidth, tableHeight
    );
}

// --- MOTEUR DE RENDU NATIF ---
function renderCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Clip de la table
    ctx.beginPath();
    if (isRound) {
        ctx.arc(tableWidth/2, tableHeight/2, tableWidth/2, 0, Math.PI * 2);
    } else {
        ctx.roundRect(0, 0, tableWidth, tableHeight, 20); // API Native
    }
    ctx.clip();

    // 1. Fond d'écran
    if (bgImageObj) {
        ctx.save();
        ctx.translate(tableWidth/2 + bgPanX, tableHeight/2 + bgPanY);
        ctx.rotate(bgAngle * Math.PI / 180);
        ctx.scale(bgScale, bgScale);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(bgImageObj, -bgImageObj.width/2, -bgImageObj.height/2);
        ctx.restore();
    }

    // Préparation pour le simulateur
    let allObjects = [];
    if (currentModule === 'Fichier SVG') {
        if (svgStrokes.length > 0) {
            allObjects = [...svgStrokes];
        } else {
            // Affichage Brut SVG
            rawSvgPreview.forEach(pts => {
                allObjects.push({ isUserStroke: true, sunaeAbsPoints: pts });
            });
        }
    } else {
        allObjects = [...travelLines, ...userStrokes].sort((a,b) => a.createdAt - b.createdAt);
        if (currentStroke) allObjects.push(currentStroke);
    }

    let totalPoints = allObjects.reduce((sum, obj) => sum + obj.sunaeAbsPoints.length, 0);
    let targetPoints = Math.floor((simProgress / 100) * totalPoints);
    let drawnPoints = 0;
    let currentDotPos = null;

    // 2. Dessin des chemins
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let obj of allObjects) {
        if (drawnPoints >= targetPoints && simProgress < 100) break;
        
        let pts = obj.sunaeAbsPoints;
        if (pts.length < 2) { drawnPoints += pts.length; continue; }

        let pointsToDraw = (simProgress === 100) ? pts.length : Math.min(pts.length, targetPoints - drawnPoints);
        
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pointsToDraw; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
            currentDotPos = pts[i];
        }

        if (obj.isTravelLine) {
            ctx.strokeStyle = 'rgba(211, 47, 47, 0.7)'; // Rouge
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
        } else {
            ctx.strokeStyle = '#2980b9'; // Bleu
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
        }
        ctx.stroke();
        drawnPoints += pts.length;
    }

    ctx.restore(); // Fin du clip

    // 3. Dessin du simulateur (point rouge)
    const simOverlay = document.getElementById('sim-overlay');
    if (simOverlay) {
        if (simProgress < 100 && currentDotPos) {
            simOverlay.innerHTML = `<div style="position:absolute; width:12px; height:12px; background-color:#c0392b; border-radius:50%; left:${currentDotPos.x-6}px; top:${currentDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        } else {
            simOverlay.innerHTML = '';
        }
    }
}

function updateTravelLines() {
    travelLines = [];
    if (userStrokes.length < 2) return;
    for (let i = 1; i < userStrokes.length; i++) {
        let prev = userStrokes[i - 1].sunaeAbsPoints;
        let curr = userStrokes[i].sunaeAbsPoints;
        if (prev.length > 0 && curr.length > 0) {
            travelLines.push({
                isTravelLine: true,
                createdAt: userStrokes[i].createdAt - 1,
                sunaeAbsPoints: [prev[prev.length - 1], curr[0]]
            });
        }
    }
}

// --- GESTION DE L'INTERFACE ---
function goToStep(step, moduleName = null) {
    document.querySelectorAll('.step-section').forEach(el => el.classList.remove('active'));
    document.getElementById('step-' + step).classList.add('active');
    
    if (moduleName) {
        currentModule = moduleName;
        document.getElementById('workspace-title').innerText = currentModule + " | " + currentTable;
        document.getElementById('module-workspace').style.display = 'block';

        const simSection = document.getElementById('simulation-section');
        const bgSection = document.getElementById('background-section');
        const toolsDessin = document.getElementById('tools-dessin');
        const toolsTexte = document.getElementById('tools-texte');
        const toolsSvg = document.getElementById('tools-svg');
        const gridContainer = document.getElementById('text-grid-container');
        const nameInput = document.getElementById('export-filename');

        if (simSection) simSection.style.display = 'none';
        if (bgSection) bgSection.style.display = 'none';
        if (toolsDessin) toolsDessin.style.display = 'none';
        if (toolsTexte) toolsTexte.style.display = 'none';
        if (toolsSvg) toolsSvg.style.display = 'none';
        if (gridContainer) gridContainer.innerHTML = ''; 
        
        resetCanvas();

        if (currentModule === 'Texte Automatique') {
            if (toolsTexte) toolsTexte.style.display = 'block';
            nameInput.value = ""; nameInput.placeholder = "Texte_Sunae";
            setTimeout(buildTextGrid, 50); 
        } else if (currentModule === 'Dessin Libre') {
            if (simSection) simSection.style.display = 'block';
            if (bgSection) bgSection.style.display = 'block';
            if (toolsDessin) toolsDessin.style.display = 'block';
            nameInput.value = ""; nameInput.placeholder = getYYMMDD() + "_Freedrawing";
        } else if (currentModule === 'Fichier SVG') {
            if (simSection) simSection.style.display = 'block';
            if (toolsSvg) toolsSvg.style.display = 'block';
            nameInput.value = ""; nameInput.placeholder = getYYMMDD() + "_ConvertionSVG";
        }
    }
}

function setupWorkspace(tableName, round, w_param, h_param) {
    currentTable = tableName; isRound = round;
    goToStep(3, currentModule || 'Dessin Libre');

    const aspect = TABLE_CFG[tableName] ? TABLE_CFG[tableName].aspect : 1;
    tableWidth = 600;
    tableHeight = round ? 600 : tableWidth / aspect;

    canvas = document.getElementById('sunae-canvas');
    ctx = canvas.getContext('2d');
    canvas.width = tableWidth; canvas.height = tableHeight;

    const container = document.getElementById('canvas-container');
    container.style.width = '100%';
    container.style.maxWidth = tableWidth + 'px';
    container.style.height = 'auto';
    container.style.aspectRatio = round ? '1 / 1' : `${tableWidth} / ${tableHeight}`;
    
    // Forcer l'arrondi sur TOUTES les couches visuelles
    let radiusStyle = isRound ? '50%' : '20px';
    container.style.borderRadius = radiusStyle;
    canvas.style.borderRadius = radiusStyle;
    const simOverlay = document.getElementById('sim-overlay');
    if(simOverlay) simOverlay.style.borderRadius = radiusStyle;

    // Événements Souris / Tactile natifs
    canvas.onpointerdown = function(e) {
        if (currentModule !== 'Dessin Libre' || simProgress < 100) return;
        isDrawing = true;
        canvas.setPointerCapture(e.pointerId);
        let p = getMousePos(e);
        currentStroke = { isUserStroke: true, createdAt: Date.now(), sunaeAbsPoints: [p] };
        renderCanvas();
    };

    canvas.onpointermove = function(e) {
        if (!isDrawing) return;
        let p = getMousePos(e);
        if (drawMode === 'freedraw') {
            currentStroke.sunaeAbsPoints.push(p);
        } else {
            if(currentStroke.sunaeAbsPoints.length === 1) currentStroke.sunaeAbsPoints.push(p);
            else currentStroke.sunaeAbsPoints[1] = p;
        }
        renderCanvas();
    };

    canvas.onpointerup = function(e) {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentStroke.sunaeAbsPoints.length > 1) {
            userStrokes.push(currentStroke);
        }
        currentStroke = null;
        updateTravelLines();
        renderCanvas();
    };

    document.querySelectorAll('input[name="drawMode"]').forEach(radio => {
        radio.addEventListener('change', function() { drawMode = this.value; });
    });

    setupBackgroundControls(); setupSimulator();
    renderCanvas();
}

    canvas.onpointermove = function(e) {
        if (!isDrawing) return;
        let p = getMousePos(e);
        if (drawMode === 'freedraw') {
            currentStroke.sunaeAbsPoints.push(p);
        } else {
            // Mode Ligne
            if(currentStroke.sunaeAbsPoints.length === 1) currentStroke.sunaeAbsPoints.push(p);
            else currentStroke.sunaeAbsPoints[1] = p;
        }
        renderCanvas();
    };

    canvas.onpointerup = function(e) {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentStroke.sunaeAbsPoints.length > 1) {
            userStrokes.push(currentStroke);
        }
        currentStroke = null;
        updateTravelLines();
        renderCanvas();
    };

    document.querySelectorAll('input[name="drawMode"]').forEach(radio => {
        radio.addEventListener('change', function() { drawMode = this.value; });
    });

    setupBackgroundControls(); setupSimulator();
    renderCanvas();
}

window.undoStroke = function() {
    if (userStrokes.length > 0) {
        userStrokes.pop();
        updateTravelLines();
        renderCanvas();
    }
}

window.resetCanvas = function() {
    userStrokes = [];
    travelLines = [];
    svgStrokes = [];
    rawSvgPreview = [];
    renderCanvas();
}

// --- MODULE TEXTE ---
function buildTextGrid() {
    const grid = document.getElementById('text-grid-container');
    const cfg = TABLE_CFG[currentTable];
    if (!cfg) return;

    const center_px = tableWidth / 2.0; const center_py = tableHeight / 2.0;
    let xmax = cfg.round ? 1.0 : cfg.aspect * (1.0 / Math.sqrt(cfg.aspect * cfg.aspect + 1));
    const scale_px = (tableWidth / 2.0) / xmax;

    for (let r = 0; r < cfg.rows.length; r++) {
        let start_x = -((cfg.rows[r] * (cfg.w + cfg.spacing)) - cfg.spacing) / 2.0;
        for (let c = 0; c < cfg.rows[r]; c++) {
            let px = center_px + (start_x + (c * (cfg.w + cfg.spacing)) + (cfg.w / 2.0)) * scale_px;
            let py = center_py - cfg.y_centers[r] * scale_px;
            let input = document.createElement('input');
            input.type = 'text'; input.maxLength = 1; input.className = 'sunae-letter-box';
            input.dataset.row = r; input.dataset.col = c;
            input.style.width = (cfg.w * scale_px) + 'px'; input.style.height = (cfg.h * scale_px) + 'px';
            input.style.left = (px - (cfg.w * scale_px) / 2) + 'px'; input.style.top = (py - (cfg.h * scale_px) / 2) + 'px';

            input.addEventListener('keyup', function(e) {
                let currentText = getGridText();
                document.getElementById('export-filename').placeholder = currentText ? currentText : "Texte_Sunae";
                if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                this.value = this.value.toUpperCase();
                if (this.value.length === 1) {
                    let next = document.querySelector(`.sunae-letter-box[data-row="${r}"][data-col="${c+1}"]`) || document.querySelector(`.sunae-letter-box[data-row="${r+1}"][data-col="0"]`);
                    if (next) next.focus();
                }
            });
            grid.appendChild(input);
        }
    }
}
window.resetTextGrid = function() {
    document.querySelectorAll('.sunae-letter-box').forEach(input => input.value = '');
    document.getElementById('export-filename').placeholder = "Texte_Sunae";
}

// --- BACKGROUND & SIMULATEUR ---
function setupBackgroundControls() {
    document.getElementById('bg-upload').addEventListener('change', function(e) {
        if (!e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = function(f) {
            bgImageObj = new Image();
            bgImageObj.onload = renderCanvas;
            bgImageObj.src = f.target.result;
        };
        reader.readAsDataURL(e.target.files[0]);
    });

    ['scale', 'angle', 'pan-x', 'pan-y'].forEach(id => {
        const el = document.getElementById('bg-' + id);
        if (el) el.addEventListener('input', function() {
            document.getElementById('val-' + id).innerText = this.value;
            if(id === 'scale') bgScale = parseFloat(this.value);
            if(id === 'angle') bgAngle = parseFloat(this.value);
            if(id === 'pan-x') bgPanX = parseFloat(this.value);
            if(id === 'pan-y') bgPanY = parseFloat(this.value);
            renderCanvas();
        });
    });
}

function setupSimulator() {
    const slider = document.getElementById('bille-slider');
    slider.addEventListener('input', function() {
        simProgress = parseInt(this.value);
        renderCanvas();
    });
}

// --- MODULE SVG NATIVE DOM (Sandify Architecture) ---
const svgUploadInput = document.getElementById('svg-upload-file');
if (svgUploadInput) {
    svgUploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(f) {
            
            // INJECTION DOM HORS ÉCRAN (Avec dimensions pour forcer le calcul du navigateur)
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '-9999px';
            container.style.width = '2000px'; 
            container.style.height = '2000px';
            container.style.visibility = 'hidden';
            document.body.appendChild(container);
            container.innerHTML = f.target.result;

            const svgEl = container.querySelector('svg');
            if(!svgEl) { document.body.removeChild(container); return; }

            // PRÉ-PROCESSEUR : Conversion de toutes les formes basiques en <path>
            svgEl.querySelectorAll('rect').forEach(el => {
                let x = parseFloat(el.getAttribute('x')) || 0, y = parseFloat(el.getAttribute('y')) || 0;
                let w = parseFloat(el.getAttribute('width')) || 0, h = parseFloat(el.getAttribute('height')) || 0;
                let p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                p.setAttribute('d', `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`);
                if(el.getAttribute('transform')) p.setAttribute('transform', el.getAttribute('transform'));
                el.parentNode.replaceChild(p, el);
            });
            svgEl.querySelectorAll('line').forEach(el => {
                let x1 = parseFloat(el.getAttribute('x1')) || 0, y1 = parseFloat(el.getAttribute('y1')) || 0;
                let x2 = parseFloat(el.getAttribute('x2')) || 0, y2 = parseFloat(el.getAttribute('y2')) || 0;
                let p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                p.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`);
                if(el.getAttribute('transform')) p.setAttribute('transform', el.getAttribute('transform'));
                el.parentNode.replaceChild(p, el);
            });
            svgEl.querySelectorAll('polygon, polyline').forEach(el => {
                let pts = (el.getAttribute('points') || "").trim().split(/[\s,]+/);
                if(pts.length < 2) return;
                let d = `M ${pts[0]} ${pts[1]}`;
                for(let i=2; i<pts.length; i+=2) d += ` L ${pts[i]} ${pts[i+1]}`;
                if(el.tagName.toLowerCase() === 'polygon') d += ' Z';
                let p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                p.setAttribute('d', d);
                if(el.getAttribute('transform')) p.setAttribute('transform', el.getAttribute('transform'));
                el.parentNode.replaceChild(p, el);
            });
            svgEl.querySelectorAll('circle, ellipse').forEach(el => {
                let cx = parseFloat(el.getAttribute('cx')) || 0, cy = parseFloat(el.getAttribute('cy')) || 0;
                let rx = parseFloat(el.getAttribute('r') || el.getAttribute('rx')) || 0;
                let ry = parseFloat(el.getAttribute('r') || el.getAttribute('ry')) || 0;
                let d = `M ${cx-rx} ${cy} a ${rx},${ry} 0 1,0 ${rx*2},0 a ${rx},${ry} 0 1,0 -${rx*2},0`;
                let p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                p.setAttribute('d', d);
                if(el.getAttribute('transform')) p.setAttribute('transform', el.getAttribute('transform'));
                el.parentNode.replaceChild(p, el);
            });

            // Forcer le rendu du DOM pour la matrice
            svgEl.getBoundingClientRect();

            // Calcul du ratio d'échelle strict
            const bbox = svgEl.getBBox();
            const svgW = svgEl.viewBox?.baseVal?.width || bbox.width || parseFloat(svgEl.getAttribute('width')) || tableWidth;
            const svgH = svgEl.viewBox?.baseVal?.height || bbox.height || parseFloat(svgEl.getAttribute('height')) || tableHeight;
            
            const scale = Math.min(tableWidth / svgW, tableHeight / svgH) * 0.8;
            const offsetX = (tableWidth - (svgW * scale)) / 2 - ((bbox.x || 0) * scale);
            const offsetY = (tableHeight - (svgH * scale)) / 2 - ((bbox.y || 0) * scale);

            rawSvgPreview = [];
            svgStrokes = [];

            // Extraction exclusive des chemins
            const paths = svgEl.querySelectorAll('path');
            paths.forEach(path => {
                const len = path.getTotalLength();
                if(len <= 1) return;
                
                const ctm = path.getCTM(); // La matrice parfaite du navigateur
                if(!ctm) return;
                
                let pts = [];
                for(let l=0; l<=len; l+=2) {
                    let pt = path.getPointAtLength(l);
                    // Application de la matrice
                    let absX = pt.x * ctm.a + pt.y * ctm.c + ctm.e;
                    let absY = pt.x * ctm.b + pt.y * ctm.d + ctm.f;
                    // Mise à l'échelle table
                    let finalX = (absX * scale) + offsetX;
                    let finalY = (absY * scale) + offsetY;
                    
                    pts.push(sanitizeCoordinates(finalX, finalY, isRound, tableWidth, tableHeight));
                }
                rawSvgPreview.push(pts);
            });

            document.body.removeChild(container);
            renderCanvas(); // Affiche le dessin brut bleu sans optimisation
        };
        reader.readAsText(file);
    });
}

// --- ALGORITHME DU POSTIER CHINOIS (Mise à jour Limit Jump) ---
window.optimizeSVG = async function() {
    if(rawSvgPreview.length === 0) return;

    const btn = document.getElementById('btn-optimize-svg');
    const pContainer = document.getElementById('svg-progress-container');
    const pBar = document.getElementById('svg-progress-bar');
    const pText = document.getElementById('svg-progress-text');

    btn.disabled = true; btn.style.opacity = '0.5'; pContainer.style.display = 'block';
    function updateProgress(pct, textMsg) { pBar.style.width = pct + '%'; pText.innerText = textMsg + ' (' + pct + '%)'; }

    updateProgress(10, 'Extraction des Nœuds...');
    await new Promise(r => setTimeout(r, 20)); 
    
    // --- 1. GÉNÉRATION DES NOEUDS ---
    let nodes = [];
    let spatialGrid = new Map();
    let cellSize = 3.0; 

    function addNode(p) {
        let gx = Math.floor(p.x / cellSize); let gy = Math.floor(p.y / cellSize);
        let keys = [`${gx},${gy}`, `${gx-1},${gy}`, `${gx+1},${gy}`, `${gx},${gy-1}`, `${gx},${gy+1}`, `${gx-1},${gy-1}`, `${gx+1},${gy+1}`, `${gx-1},${gy+1}`, `${gx+1},${gy-1}`];
        for(let key of keys) {
            if(spatialGrid.has(key)) {
                for(let n of spatialGrid.get(key)) {
                    if(Math.hypot(n.x - p.x, n.y - p.y) < 3.0) return n.id; 
                }
            }
        }
        let id = nodes.length; let node = {x: p.x, y: p.y, id: id, adj: []};
        nodes.push(node);
        let mainKey = `${gx},${gy}`;
        if(!spatialGrid.has(mainKey)) spatialGrid.set(mainKey, []);
        spatialGrid.get(mainKey).push(node);
        return id;
    }

    let edges = [];
    function addEdge(u, v, isBridge = false, isDuplicate = false) {
        if (u === v) return;
        let d = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
        let edge = { u: u, v: v, d: d, isBridge: isBridge, isDuplicate: isDuplicate, used: false, rendered: false };
        nodes[u].adj.push(edge); nodes[v].adj.push(edge); edges.push(edge);
    }

    rawSvgPreview.forEach(pts => {
        if(pts.length < 2) return;
        let prevId = addNode(pts[0]);
        for(let j=1; j<pts.length; j++) {
            let currId = addNode(pts[j]);
            let len = Math.hypot(nodes[prevId].x - nodes[currId].x, nodes[prevId].y - nodes[currId].y);
            if (len < 20) { addEdge(prevId, currId, false, false); }
            prevId = currId;
        }
    });

    if (edges.length === 0) { btn.disabled = false; btn.style.opacity = '1'; pContainer.style.display = 'none'; return; }

    // --- 2. KRUSKAL (Connexion avec LIMITE MAX JUMP) ---
    updateProgress(30, 'Calcul des ponts minimaux (Kruskal)...');
    await new Promise(r => setTimeout(r, 20));

    let parent = new Int32Array(nodes.length);
    for(let i=0; i<nodes.length; i++) parent[i] = i;
    function findSet(i) { return parent[i] === i ? i : (parent[i] = findSet(parent[i])); }
    function unionSet(i, j) { parent[findSet(i)] = findSet(j); }
    edges.forEach(e => unionSet(e.u, e.v));
    
    let comps = []; let compMap = {};
    for(let i=0; i<nodes.length; i++) {
        let r = findSet(i);
        if(compMap[r] === undefined) { compMap[r] = comps.length; comps.push([]); }
        comps[compMap[r]].push(i);
    }
    
    if(comps.length > 1) {
        let potentialBridges = [];
        
        // RECUPERATION DU SLIDER UI
        const maxJumpInput = document.getElementById('max-jump-slider');
        const MAX_JUMP_PX = maxJumpInput ? parseFloat(maxJumpInput.value) : 40.0;

        for(let i=0; i<comps.length; i++) {
            for(let j=i+1; j<comps.length; j++) {
                let minDist = Infinity, minU = -1, minV = -1;
                let step1 = Math.max(1, Math.ceil(comps[i].length / 100));
                let step2 = Math.max(1, Math.ceil(comps[j].length / 100));
                for(let ui=0; ui<comps[i].length; ui+=step1) {
                    let nu = nodes[comps[i][ui]];
                    for(let vj=0; vj<comps[j].length; vj+=step2) {
                        let nv = nodes[comps[j][vj]];
                        let dSq = (nu.x-nv.x)*(nu.x-nv.x) + (nu.y-nv.y)*(nu.y-nv.y);
                        if(dSq < minDist) { minDist = dSq; minU = nu.id; minV = nv.id; }
                    }
                }
                potentialBridges.push({u: minU, v: minV, d: Math.sqrt(minDist), c1: i, c2: j});
            }
        }
        potentialBridges.sort((a,b) => a.d - b.d);
        
        let compParent = new Int32Array(comps.length);
        for(let i=0; i<comps.length; i++) compParent[i] = i;
        function cFind(i) { return compParent[i] === i ? i : (compParent[i] = cFind(compParent[i])); }
        
        let remainingComponents = comps.length;

        for(let b of potentialBridges) {
            let r1 = cFind(b.c1), r2 = cFind(b.c2);
            if(r1 !== r2) {
                // VERIFICATION DU SAUT MAXIMAL
                if (b.d > MAX_JUMP_PX) {
                    continue; // On refuse de créer ce pont
                }
                compParent[r1] = r2;
                remainingComponents--;
                addEdge(b.u, b.v, true, false); 
            }
        }

        // VERIFICATION DE L'ETAT DU GRAPHE
        if (remainingComponents > 1) {
            alert(`❌ Échec du routage.\n\nDes zones du dessin sont séparées par plus de ${MAX_JUMP_PX} pixels.\nLe programme n'a trouvé aucun trait du dessin à emprunter pour s'en rapprocher.\n\nVeuillez augmenter la tolérance du saut ou ajouter des traits de liaison manuellement.`);
            pContainer.style.display = 'none'; btn.disabled = false; btn.style.opacity = '1';
            return;
        }
    }

    // --- 3. EULERIZE (PÉNALITÉ SUR LES SAUTS) ---
    updateProgress(50, 'Routage agressif sur traits...');
    await new Promise(r => setTimeout(r, 20));

    let odds = [];
    for(let i=0; i<nodes.length; i++) {
        if(nodes[i].adj.length % 2 !== 0) odds.push(i);
    }

    let passes = 0; let totalOdds = odds.length;
    
    while(odds.length > 0) {
        let start = odds.pop();
        let dist = new Float32Array(nodes.length).fill(Infinity);
        let prev = new Int32Array(nodes.length).fill(-1);
        dist[start] = 0;
        
        let pq = new MinHeap(); pq.push(start, 0);
        
        while(!pq.isEmpty()) {
            let curr = pq.pop(); let u = curr.id;
            if(curr.dist > dist[u]) continue;
            for(let edge of nodes[u].adj) {
                let v = (edge.u === u) ? edge.v : edge.u;
                // PÉNALITÉ : 10000x le coût si c'est un saut rouge
                let cost = edge.isBridge ? (edge.d * 10000) : edge.d;
                let nd = curr.dist + cost;
                if(nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.push(v, nd); }
            }
        }
        
        let bestOddIdx = -1; let minDist = Infinity;
        for(let i=0; i<odds.length; i++) {
            if(dist[odds[i]] < minDist) { minDist = dist[odds[i]]; bestOddIdx = i; }
        }
        
        if(bestOddIdx !== -1) {
            let target = odds[bestOddIdx]; odds.splice(bestOddIdx, 1);
            let curr = target;
            while(curr !== start) {
                let p = prev[curr];
                let origEdge = nodes[curr].adj.find(e => (e.u===curr && e.v===p) || (e.v===curr && e.u===p));
                addEdge(curr, p, origEdge ? origEdge.isBridge : false, true); 
                curr = p;
            }
        }
        passes++;
        if (passes % 10 === 0) {
            updateProgress(50 + Math.floor((1 - (odds.length / totalOdds)) * 30), 'Routage sur les lignes...');
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // --- 4. HIERHOLZER ---
    updateProgress(85, 'Génération du chemin continu...');
    await new Promise(r => setTimeout(r, 20));

    let adjTr = Array.from({length: nodes.length}, () => []);
    edges.forEach((e, idx) => {
        e.used = false;
        adjTr[e.u].push({to: e.v, edgeIdx: idx, dir: 1});
        adjTr[e.v].push({to: e.u, edgeIdx: idx, dir: -1});
    });

    function getEdgeScore(e) {
        if (e.isBridge) return 1;       
        if (e.isDuplicate) return 2;    
        return 3;                       
    }

    for(let i=0; i<nodes.length; i++) {
        adjTr[i].sort((a, b) => getEdgeScore(edges[a.edgeIdx]) - getEdgeScore(edges[b.edgeIdx])); 
    }

    let startNode = 0;
    for(let i=0; i<nodes.length; i++) { if(nodes[i].adj.length > 0) { startNode = i; break; } }

    let stack = [startNode];
    let nodePath = [];

    while(stack.length > 0) {
        let u = stack[stack.length - 1]; let nextEdge = null;
        for(let i=adjTr[u].length - 1; i >= 0; i--) {
            if(!edges[adjTr[u][i].edgeIdx].used) { nextEdge = adjTr[u][i]; break; }
        }
        if(nextEdge) { edges[nextEdge.edgeIdx].used = true; stack.push(nextEdge.to); } 
        else { nodePath.push(stack.pop()); }
    }
    nodePath.reverse();

    // --- 5. CONSTRUCTION DES CHEMINS FINAUX ---
    svgStrokes = [];
    rawSvgPreview = []; // On nettoie l'aperçu

    let currentPts = [];
    let currentIsRed = false;

    for(let i=0; i<nodePath.length-1; i++) {
        let u = nodePath[i]; let v = nodePath[i+1];
        let edge = nodes[u].adj.find(e => ((e.u === u && e.v === v) || (e.v === u && e.u === v)) && !e.rendered);
        if(edge) edge.rendered = true;
        
        let stepIsRed = edge ? edge.isBridge : false;
        
        if(currentPts.length === 0) {
            currentPts.push(nodes[u]); currentIsRed = stepIsRed;
        }
        
        if(currentIsRed !== stepIsRed) {
            svgStrokes.push({ isUserStroke: !currentIsRed, isTravelLine: currentIsRed, sunaeAbsPoints: currentPts, createdAt: Date.now() + i });
            currentPts = [nodes[u], nodes[v]];
            currentIsRed = stepIsRed;
        } else {
            currentPts.push(nodes[v]);
        }
    }
    if(currentPts.length > 1) svgStrokes.push({ isUserStroke: !currentIsRed, isTravelLine: currentIsRed, sunaeAbsPoints: currentPts, createdAt: Date.now() + nodePath.length });

    updateProgress(100, 'Terminé !');
    setTimeout(() => { pContainer.style.display = 'none'; btn.disabled = false; btn.style.opacity = '1'; }, 1000);
    renderCanvas();
};

window.resetSVG = function() {
    document.getElementById('svg-upload-file').value = '';
    rawSvgPreview = [];
    svgStrokes = [];
    renderCanvas();
}

// --- EXPORT THR ---
window.exportTHR = function() {
    let customName = document.getElementById('export-filename').value.trim();
    let finalFileName = customName !== "" ? customName : (currentModule === 'Texte Automatique' ? (getGridText() || "Texte_Sunae") : getYYMMDD() + (currentModule === 'Fichier SVG' ? "_ConvertionSVG" : "_Freedrawing"));
    
    let exportData = { table: currentTable, module: currentModule, canvasWidth: tableWidth, canvasHeight: tableHeight };

    if (currentModule === 'Texte Automatique') {
        const cfg = TABLE_CFG[currentTable]; let text_lines = [];
        for (let r = 0; r < cfg.rows.length; r++) {
            let rowText = "";
            for (let c = 0; c < cfg.rows[r]; c++) {
                let input = document.querySelector(`.sunae-letter-box[data-row="${r}"][data-col="${c}"]`);
                rowText += input && input.value ? input.value : " ";
            }
            text_lines.push(rowText);
        }
        exportData.text_lines = text_lines;
    } else {
        // Envoi exact du même format JSON que Fabric générait pour app.py
        let allExportObjects = [];
        let srcArray = (currentModule === 'Fichier SVG') ? svgStrokes : [...travelLines, ...userStrokes].sort((a,b) => a.createdAt - b.createdAt);
        
        srcArray.forEach(s => {
            allExportObjects.push({
                isUserStroke: s.isUserStroke || false,
                isTravelLine: s.isTravelLine || false,
                sunaeAbsPoints: s.sunaeAbsPoints
            });
        });
        exportData.drawing = { objects: allExportObjects };
    }

    fetch('/export-thr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exportData) })
    .then(r => r.blob()).then(blob => {
        const a = document.createElement('a'); a.href = window.URL.createObjectURL(blob); a.download = `${finalFileName.replace(/\s+/g, '_')}.thr`;
        document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(a.href);
    }).catch(e => alert("Erreur lors de la génération."));
}
