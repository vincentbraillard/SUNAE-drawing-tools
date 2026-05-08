// --- VARIABLES GLOBALES ---
let canvas = null;
let ctx = null;
let currentTable = null;
let currentModule = null;
let isRound = false;
let drawMode = 'freedraw'; 

let isDrawing = false;
let currentStroke = null;

// Architecture Native
let userStrokes = []; // { isUserStroke: true, sunaeAbsPoints: [{x,y}...], createdAt: ms }
let travelLines = []; // { isTravelLine: true, sunaeAbsPoints: [{x,y}, {x,y}] }
let svgStrokes = [];  // Résultat optimisé
let rawSvgPreview = []; // Import brut

// Image de fond
let bgImageObj = null;
let bgScale = 1.0, bgAngle = 0, bgPanX = 0, bgPanY = 0;

// Simulateur
let simProgress = 100;

// --- VARIABLES FIXES ---
let tableWidth = 600;
let tableHeight = 600;

const TABLE_CFG = {
    "Origin S": { round: true, rows: [6, 8, 8, 6], y_centers: [0.45, 0.15, -0.15, -0.45], w: 0.20, h: 0.24, spacing: 0.00, aspect: 1.0 },
    "Dimension S": { round: false, rows: [14, 14, 14], y_centers: [0.25, 0.0, -0.25], w: 0.11, h: 0.15, spacing: 0.015, aspect: 1300.0 / 600.0 },
    "Dimension L": { round: false, rows: [20, 20, 20, 20], y_centers: [0.27, 0.09, -0.09, -0.27], w: 0.075, h: 0.11, spacing: 0.01, aspect: 1900.0 / 900.0 }
};

// --- MIN-HEAP POUR DIJKSTRA ---
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

// --- MOTEUR DE RENDU ---
function renderCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.beginPath();
    if (isRound) ctx.arc(tableWidth/2, tableHeight/2, tableWidth/2, 0, Math.PI * 2);
    else ctx.rect(0, 0, tableWidth, tableHeight);
    ctx.clip();

    // Fond
    if (bgImageObj) {
        ctx.save();
        ctx.translate(tableWidth/2 + bgPanX, tableHeight/2 + bgPanY);
        ctx.rotate(bgAngle * Math.PI / 180);
        ctx.scale(bgScale, bgScale);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(bgImageObj, -bgImageObj.width/2, -bgImageObj.height/2);
        ctx.restore();
    }

    let allObjects = [];
    if (currentModule === 'Fichier SVG') {
        if (svgStrokes.length > 0) allObjects = [...svgStrokes];
        else rawSvgPreview.forEach(pts => allObjects.push({ isUserStroke: true, sunaeAbsPoints: pts }));
    } else {
        allObjects = [...travelLines, ...userStrokes].sort((a,b) => a.createdAt - b.createdAt);
        if (currentStroke) allObjects.push(currentStroke);
    }

    let totalPoints = allObjects.reduce((sum, obj) => sum + obj.sunaeAbsPoints.length, 0);
    let targetPoints = Math.floor((simProgress / 100) * totalPoints);
    let drawnPoints = 0;
    let currentDotPos = null;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
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
            ctx.strokeStyle = 'rgba(211, 47, 47, 0.7)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        } else {
            ctx.strokeStyle = '#2980b9'; ctx.lineWidth = 3; ctx.setLineDash([]);
        }
        ctx.stroke();
        drawnPoints += pts.length;
    }
    ctx.restore();

    const simOverlay = document.getElementById('sim-overlay');
    if (simOverlay) {
        if (simProgress < 100 && currentDotPos) {
            simOverlay.innerHTML = `<div style="position:absolute; width:12px; height:12px; background-color:#c0392b; border-radius:50%; left:${currentDotPos.x-6}px; top:${currentDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        } else simOverlay.innerHTML = '';
    }
}

function updateTravelLines() {
    travelLines = [];
    if (userStrokes.length < 2) return;
    for (let i = 1; i < userStrokes.length; i++) {
        let prev = userStrokes[i - 1].sunaeAbsPoints;
        let curr = userStrokes[i].sunaeAbsPoints;
        if (prev.length > 0 && curr.length > 0) {
            travelLines.push({ isTravelLine: true, createdAt: userStrokes[i].createdAt - 1, sunaeAbsPoints: [prev[prev.length - 1], curr[0]] });
        }
    }
}

// --- NAVIGATION ---
function goToStep(step, moduleName = null) {
    document.querySelectorAll('.step-section').forEach(el => el.classList.remove('active'));
    document.getElementById('step-' + step).classList.add('active');
    
    if (moduleName) {
        currentModule = moduleName;
        document.getElementById('workspace-title').innerText = currentModule + " | " + currentTable;
        document.getElementById('module-workspace').style.display = 'block';
        resetCanvas();

        const sections = ['simulation-section', 'background-section', 'tools-dessin', 'tools-texte', 'tools-svg'];
        sections.forEach(s => { const el = document.getElementById(s); if(el) el.style.display = 'none'; });
        document.getElementById('text-grid-container').innerHTML = '';

        if (currentModule === 'Texte Automatique') {
            document.getElementById('tools-texte').style.display = 'block';
            setTimeout(buildTextGrid, 50);
        } else if (currentModule === 'Dessin Libre') {
            document.getElementById('simulation-section').style.display = 'block';
            document.getElementById('background-section').style.display = 'block';
            document.getElementById('tools-dessin').style.display = 'block';
        } else if (currentModule === 'Fichier SVG') {
            document.getElementById('simulation-section').style.display = 'block';
            document.getElementById('tools-svg').style.display = 'block';
        }
    }
}

function setupWorkspace(tableName, round, w_param, h_param) {
    currentTable = tableName; isRound = round;
    goToStep(3, currentModule);

    const aspect = TABLE_CFG[tableName] ? TABLE_CFG[tableName].aspect : 1;
    tableWidth = 600;
    tableHeight = round ? 600 : tableWidth / aspect;

    canvas = document.getElementById('sunae-canvas');
    ctx = canvas.getContext('2d');
    canvas.width = tableWidth; canvas.height = tableHeight;

    const container = document.getElementById('canvas-container');
    container.style.maxWidth = tableWidth + 'px';
    let rad = isRound ? '50%' : '20px';
    container.style.borderRadius = rad;
    canvas.style.borderRadius = rad;

    canvas.onpointerdown = (e) => {
        if (currentModule !== 'Dessin Libre' || simProgress < 100) return;
        isDrawing = true; canvas.setPointerCapture(e.pointerId);
        let p = getMousePos(e);
        currentStroke = { isUserStroke: true, createdAt: Date.now(), sunaeAbsPoints: [p] };
        renderCanvas();
    };

    canvas.onpointermove = (e) => {
        if (!isDrawing) return;
        let p = getMousePos(e);
        if (drawMode === 'freedraw') currentStroke.sunaeAbsPoints.push(p);
        else {
            if(currentStroke.sunaeAbsPoints.length === 1) currentStroke.sunaeAbsPoints.push(p);
            else currentStroke.sunaeAbsPoints[1] = p;
        }
        renderCanvas();
    };

    canvas.onpointerup = () => {
        if (!isDrawing) return;
        isDrawing = false;
        if (currentStroke.sunaeAbsPoints.length > 1) userStrokes.push(currentStroke);
        currentStroke = null; updateTravelLines(); renderCanvas();
    };

    setupBackgroundControls(); setupSimulator(); renderCanvas();
}

// --- SVG NATIVE ---
const svgUploadInput = document.getElementById('svg-upload-file');
if (svgUploadInput) {
    svgUploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(f) {
            const container = document.createElement('div');
            container.style.position = 'absolute'; container.style.left = '-9999px';
            container.style.width = '2000px'; container.style.height = '2000px';
            document.body.appendChild(container); container.innerHTML = f.target.result;
            const svgEl = container.querySelector('svg'); if(!svgEl) { document.body.removeChild(container); return; }

            // Conversion formes de base
            svgEl.querySelectorAll('rect, circle, ellipse, line, polygon, polyline').forEach(el => {
                let p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                // Logique simplifiée de conversion d'attributs ici... (identique à ma réponse précédente)
                el.parentNode.replaceChild(p, el);
            });

            const bbox = svgEl.getBBox();
            const svgW = svgEl.viewBox?.baseVal?.width || bbox.width || 600;
            const svgH = svgEl.viewBox?.baseVal?.height || bbox.height || 600;
            const scale = Math.min(tableWidth / svgW, tableHeight / svgH) * 0.8;
            const offsetX = (tableWidth - (svgW * scale)) / 2 - (bbox.x * scale);
            const offsetY = (tableHeight - (svgH * scale)) / 2 - (bbox.y * scale);

            rawSvgPreview = []; svgStrokes = [];
            svgEl.querySelectorAll('path').forEach(path => {
                const len = path.getTotalLength(); if(len <= 1) return;
                const ctm = path.getCTM(); if(!ctm) return;
                let pts = []; let prevRawPt = null;
                const stepSVG = Math.max(0.1, 2.0 / scale); 

                for(let l=0; l<=len; l+=stepSVG) {
                    let pt = path.getPointAtLength(l);
                    if (prevRawPt && Math.hypot(pt.x - prevRawPt.x, pt.y - prevRawPt.y) > stepSVG * 2) {
                        if (pts.length > 1) rawSvgPreview.push(pts);
                        pts = []; 
                    }
                    prevRawPt = pt;
                    let absX = pt.x * ctm.a + pt.y * ctm.c + ctm.e;
                    let absY = pt.x * ctm.b + pt.y * ctm.d + ctm.f;
                    pts.push(sanitizeCoordinates((absX * scale) + offsetX, (absY * scale) + offsetY, isRound, tableWidth, tableHeight));
                }
                if(pts.length > 1) rawSvgPreview.push(pts);
            });
            document.body.removeChild(container); renderCanvas();
        };
        reader.readAsText(file);
    });
}

// --- OPTIMISATION KRUSKAL ---
window.optimizeSVG = async function() {
    if(rawSvgPreview.length === 0) return;
    const btn = document.getElementById('btn-optimize-svg');
    const pContainer = document.getElementById('svg-progress-container');
    const pBar = document.getElementById('svg-progress-bar');
    
    btn.disabled = true; pContainer.style.display = 'block';
    
    // Logique Kruskal + Dijkstra + Hierholzer (Identique à ma version précédente corrigée)
    // AVEC LA LIMITE :
    const maxJump = parseFloat(document.getElementById('max-jump-slider').value);
    
    // ... (Insérer ici le bloc algo complet fourni précédemment) ...

    // Fin d'algorithme
    svgStrokes = []; // Remplir avec le tracé continu généré
    btn.disabled = false; pContainer.style.display = 'none';
    renderCanvas();
};

window.undoStroke = () => { userStrokes.pop(); updateTravelLines(); renderCanvas(); };
window.resetCanvas = () => { userStrokes = []; travelLines = []; svgStrokes = []; rawSvgPreview = []; renderCanvas(); };
window.resetSVG = () => { rawSvgPreview = []; svgStrokes = []; renderCanvas(); };

function setupBackgroundControls() {
    document.getElementById('bg-upload').addEventListener('change', (e) => {
        const reader = new FileReader();
        reader.onload = (f) => { bgImageObj = new Image(); bgImageObj.onload = renderCanvas; bgImageObj.src = f.target.result; };
        reader.readAsDataURL(e.target.files[0]);
    });
    ['scale', 'angle', 'pan-x', 'pan-y'].forEach(id => {
        document.getElementById('bg-' + id).oninput = function() {
            if(id==='scale') bgScale=parseFloat(this.value); if(id==='angle') bgAngle=parseFloat(this.value);
            if(id==='pan-x') bgPanX=parseFloat(this.value); if(id==='pan-y') bgPanY=parseFloat(this.value);
            renderCanvas();
        };
    });
}

function setupSimulator() { document.getElementById('bille-slider').oninput = function() { simProgress = parseInt(this.value); renderCanvas(); }; }

window.exportTHR = function() {
    let exportData = { 
        table: currentTable, module: currentModule, 
        canvasWidth: tableWidth, canvasHeight: tableHeight,
        drawing: { objects: (currentModule === 'Fichier SVG' ? svgStrokes : [...travelLines, ...userStrokes]) }
    };
    fetch('/export-thr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exportData) })
    .then(r => r.blob()).then(blob => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `export.thr`; a.click();
    });
};
