// --- VARIABLES GLOBALES ---
let canvas = null;
let currentTable = null;
let currentModule = null;
let isRound = false;
let drawMode = 'freedraw'; 

let isDrawingLine = false;
let tempLine = null;
let bgImageObj = null;

let globalNativeStrokes = null; // Stocke les tracés mathématiques purs

// --- VERROU MATHÉMATIQUE (WYSIWYG) ---
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

// --- NAVIGATION RÉPARÉE ET COMPLÈTE ---
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
        if (canvas) { canvas.isDrawingMode = false; canvas.clear(); }

        if (currentModule === 'Texte Automatique') {
            if (toolsTexte) toolsTexte.style.display = 'block';
            nameInput.value = ""; nameInput.placeholder = "Texte_Sunae";
            setTimeout(buildTextGrid, 50); 
        } else if (currentModule === 'Dessin Libre') {
            if (simSection) simSection.style.display = 'block';
            if (bgSection) bgSection.style.display = 'block';
            if (toolsDessin) toolsDessin.style.display = 'block';
            nameInput.value = ""; nameInput.placeholder = getYYMMDD() + "_Freedrawing";
            if (canvas) { canvas.isDrawingMode = (drawMode === 'freedraw'); updateTravelLines(); }
        } else if (currentModule === 'Fichier SVG') {
            if (simSection) simSection.style.display = 'block';
            if (toolsSvg) toolsSvg.style.display = 'block';
            nameInput.value = ""; nameInput.placeholder = getYYMMDD() + "_ConvertionSVG";
        }
    }
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

// --- EXTRACTION NATIVE DU SVG (SANS FABRICJS POUR LES CALCULS) ---
function extractSVGData(svgString) {
    let container = document.createElement('div');
    container.style.position = 'absolute'; container.style.visibility = 'hidden';
    container.innerHTML = svgString;
    document.body.appendChild(container);
    let svgEl = container.querySelector('svg');
    if(!svgEl) {
        document.body.removeChild(container);
        return null;
    }

    let elements = svgEl.querySelectorAll('path, line, polyline, polygon');
    let rawStrokes = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
        let ctm = el.getCTM();
        if(!ctm) return;
        
        let pathData = "";
        if(el.tagName.toLowerCase() === 'path') pathData = el.getAttribute('d');
        else if(el.tagName.toLowerCase() === 'line') pathData = `M ${el.x1.baseVal.value} ${el.y1.baseVal.value} L ${el.x2.baseVal.value} ${el.y2.baseVal.value}`;
        else if(el.tagName.toLowerCase() === 'polyline' || el.tagName.toLowerCase() === 'polygon') {
            let pts = Array.from(el.points).map(p => `${p.x} ${p.y}`).join(' L ');
            pathData = 'M ' + pts + (el.tagName.toLowerCase() === 'polygon' ? ' Z' : '');
        }

        if(!pathData) return;

        // DÉCOUPAGE STRICT : On casse le trait à chaque ordre MoveTo (M/m)
        let segments = pathData.split(/[Mm]/);
        segments.forEach(seg => {
            if(!seg.trim()) return;
            let tempP = document.createElementNS("http://www.w3.org/2000/svg", "path");
            tempP.setAttribute('d', 'M' + seg);
            let len = tempP.getTotalLength();
            if(len > 0.5) {
                let stroke = [];
                for(let l=0; l<=len; l+=2) {
                    let p = tempP.getPointAtLength(l).matrixTransform(ctm);
                    stroke.push({x: p.x, y: p.y});
                    if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
                    if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y;
                }
                rawStrokes.push(stroke);
            }
        });
    });
    document.body.removeChild(container);

    if(rawStrokes.length === 0) return null;

    // NORMALISATION ET CENTRAGE ABSOLU
    let inkW = maxX - minX, inkH = maxY - minY;
    if(inkW <= 0) inkW = 1; if(inkH <= 0) inkH = 1;
    let scale = Math.min((tableWidth * 0.85) / inkW, (tableHeight * 0.85) / inkH);
    
    return rawStrokes.map(s => s.map(p => ({
        x: (tableWidth/2) + (p.x - (minX + inkW/2)) * scale,
        y: (tableHeight/2) + (p.y - (minY + inkH/2)) * scale
    })));
}

// --- MODULE SVG UPLOAD ---
const svgUploadInput = document.getElementById('svg-upload-file');
if (svgUploadInput) {
    svgUploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(f) {
            let warningDiv = document.getElementById('sunae-jump-warning');
            if(warningDiv) warningDiv.style.display = 'none';

            globalNativeStrokes = extractSVGData(f.target.result);
            if(globalNativeStrokes && canvas) {
                canvas.getObjects().forEach(o => { if(!o.isBackgroundImage) canvas.remove(o); });
                
                // Dessin visuel de preview (violet clair)
                globalNativeStrokes.forEach(s => {
                    let d = "M " + s[0].x + " " + s[0].y;
                    for(let j=1; j<s.length; j++) d += " L " + s[j].x + " " + s[j].y;
                    canvas.add(new fabric.Path(d, {
                        fill: null, stroke: '#9b59b6', strokeWidth: 2, opacity: 0.4, selectable: false, isPreviewStroke: true
                    }));
                });
                canvas.renderAll();
            } else {
                alert("Impossible d'analyser l'image SVG.");
            }
        };
        reader.readAsText(file);
    });
}

// --- LE MOTEUR SANDIFY OPTIMISÉ ---
window.optimizeSVG = async function() {
    if(!globalNativeStrokes) return;

    const btn = document.getElementById('btn-optimize-svg');
    const pContainer = document.getElementById('svg-progress-container');
    const pBar = document.getElementById('svg-progress-bar');
    const pText = document.getElementById('svg-progress-text');
    
    // Alerte 3cm
    let warningDiv = document.getElementById('sunae-jump-warning');
    if(!warningDiv) {
        warningDiv = document.createElement('div');
        warningDiv.id = 'sunae-jump-warning';
        warningDiv.style.marginTop = '10px';
        warningDiv.style.marginBottom = '10px';
        warningDiv.style.padding = '10px';
        warningDiv.style.backgroundColor = '#fff3cd';
        warningDiv.style.color = '#856404';
        warningDiv.style.border = '1px solid #ffeeba';
        warningDiv.style.borderRadius = '5px';
        warningDiv.style.fontWeight = 'bold';
        warningDiv.style.textAlign = 'center';
        warningDiv.style.display = 'none';
        document.getElementById('canvas-container').parentNode.insertBefore(warningDiv, document.getElementById('canvas-container'));
    }
    warningDiv.style.display = 'none';

    btn.disabled = true; btn.style.opacity = '0.5'; pContainer.style.display = 'block';
    function updateProgress(pct, textMsg) { pBar.style.width = pct + '%'; pText.innerText = textMsg + ' (' + pct + '%)'; }

    updateProgress(10, 'Génération du Graphe...');
    await new Promise(r => setTimeout(r, 50)); 
    
    // --- 1. GÉNÉRATION DES NOEUDS ---
    let nodes = [], edges = [], spatialGrid = new Map();
    function getNodeId(p) {
        let k = `${Math.round(p.x*5)},${Math.round(p.y*5)}`; // Tolérance de soudure
        if(spatialGrid.has(k)) return spatialGrid.get(k);
        let id = nodes.length;
        nodes.push({ x: p.x, y: p.y, id, adj: [] });
        spatialGrid.set(k, id); 
        return id;
    }

    globalNativeStrokes.forEach(s => {
        let prev = getNodeId(s[0]);
        for(let i=1; i<s.length; i++) {
            let curr = getNodeId(s[i]);
            if(prev !== curr) {
                let d = Math.hypot(nodes[prev].x - nodes[curr].x, nodes[prev].y - nodes[curr].y);
                let e = { u: prev, v: curr, d, isBridge: false, used: false };
                nodes[prev].adj.push(e); nodes[curr].adj.push(e); edges.push(e);
            }
            prev = curr;
        }
    });

    // --- 2. KRUSKAL ET LIMITE DE SAUT ---
    updateProgress(30, 'Calcul des ponts obligatoires...');
    await new Promise(r => setTimeout(r, 20));

    let parent = nodes.map((_, i) => i);
    function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
    edges.forEach(e => { let r1 = find(e.u), r2 = find(e.v); if(r1 !== r2) parent[r1] = r2; });
    
    let comps = new Map();
    nodes.forEach(n => { let r = find(n.id); if(!comps.has(r)) comps.set(r, []); comps.get(r).push(n.id); });

    let hasLongBridge = false;
    const MAX_JUMP_PX = 40; 

    if(comps.size > 1) {
        let compArr = Array.from(comps.values()), bridges = [];
        for(let i=0; i<compArr.length; i++) {
            for(let j=i+1; j<compArr.length; j++) {
                let minD = Infinity, bU, bV;
                compArr[i].forEach(u => compArr[j].forEach(v => {
                    let d = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
                    if(d < minD) { minD = d; bU = u; bV = v; }
                }));
                bridges.push({u: bU, v: bV, d: minD, c1: i, c2: j});
            }
        }
        bridges.sort((a,b) => a.d - b.d);
        let cP = compArr.map((_, i) => i);
        function cf(i) { return cP[i] === i ? i : (cP[i] = cf(cP[i])); }
        bridges.forEach(b => {
            if(cf(b.c1) !== cf(b.c2)) {
                cP[cf(b.c1)] = cf(b.c2);
                if(b.d > MAX_JUMP_PX) hasLongBridge = true; 
                let e = { u: b.u, v: b.v, d: b.d, isBridge: true, used: false };
                nodes[b.u].adj.push(e); nodes[b.v].adj.push(e); edges.push(e);
            }
        });
    }

    // --- 3. EULERIZE (Dijkstra avec pénalité extrême) ---
    updateProgress(50, 'Routage par repassage...');
    await new Promise(r => setTimeout(r, 20));

    let odds = nodes.filter(n => n.adj.length % 2 !== 0).map(n => n.id);
    while(odds.length > 0) {
        let start = odds.pop(), dists = new Float32Array(nodes.length).fill(Infinity), prevs = new Int32Array(nodes.length).fill(-1);
        let pq = new MinHeap(); dists[start] = 0; pq.push(start, 0);
        while(!pq.isEmpty()) {
            let {id: u, dist} = pq.pop();
            if(dist > dists[u]) continue;
            nodes[u].adj.forEach(e => {
                let v = e.u === u ? e.v : e.u;
                // PÉNALITÉ DE REPASSAGE : Force la bille à rester sur le dessin existant
                let w = e.isBridge ? e.d * 1000000 : e.d; 
                if(dists[u] + w < dists[v]) { dists[v] = dists[u] + w; prevs[v] = u; pq.push(v, dists[v]); }
            });
        }
        let target = -1, minD = Infinity, tIdx = -1;
        odds.forEach((id, idx) => { if(dists[id] < minD) { minD = dists[id]; target = id; tIdx = idx; }});
        if(target !== -1) {
            odds.splice(tIdx, 1);
            let c = target;
            while(c !== start) {
                let p = prevs[c], orig = nodes[c].adj.find(e => (e.u===p && e.v===c) || (e.v===p && e.u===c));
                let ne = { u: p, v: c, d: orig.d, isBridge: orig.isBridge, isDuplicate: true, used: false };
                nodes[p].adj.push(ne); nodes[c].adj.push(ne); edges.push(ne); c = p;
            }
        }
    }

    // --- 4. HIERHOLZER (Tri pour ordre des zones) ---
    updateProgress(85, 'Génération du chemin...');
    function getScore(e) { if(e.isBridge) return 1; if(e.isDuplicate) return 2; return 3; }
    nodes.forEach(n => n.adj.sort((a,b) => getScore(b) - getScore(a)));

    let path = [], stack = [nodes[0].id];
    while(stack.length > 0) {
        let u = stack[stack.length - 1], next = nodes[u].adj.find(e => !e.used);
        if(next) { next.used = true; stack.push(next.u === u ? next.v : next.u); }
        else path.push(stack.pop());
    }

    // --- 5. DESSIN WYSIWYG ET ALERTES ---
    updateProgress(95, 'Affichage visuel...');
    canvas.getObjects().forEach(o => { if(!o.isBackgroundImage) canvas.remove(o); });
    
    let currentPts = [];
    let currentIsRed = false;
    let displayPaths = [];

    for(let i=0; i<path.length-1; i++) {
        let u = path[i], v = path[i+1];
        let e = edges.find(e => !e.rendered && ((e.u===u && e.v===v) || (e.v===u && e.u===v)));
        if(e) e.rendered = true;
        let stepIsRed = e ? e.isBridge : false;

        if(currentPts.length === 0) { currentPts.push(nodes[u]); currentIsRed = stepIsRed; }
        if(currentIsRed !== stepIsRed) {
            displayPaths.push({pts: currentPts, isRed: currentIsRed});
            currentPts = [nodes[u], nodes[v]];
            currentIsRed = stepIsRed;
        } else {
            currentPts.push(nodes[v]);
        }
    }
    if(currentPts.length > 1) displayPaths.push({pts: currentPts, isRed: currentIsRed});

    displayPaths.forEach((dp, i) => {
        let d = "M " + dp.pts[0].x + " " + dp.pts[0].y;
        for(let j=1; j<dp.pts.length; j++) d += " L " + dp.pts[j].x + " " + dp.pts[j].y;
        
        let pathObj = new fabric.Path(d, {
            fill: null, stroke: dp.isRed ? 'red' : '#2980b9', 
            strokeWidth: dp.isRed ? 2 : 3, strokeDashArray: dp.isRed ? [5, 5] : null, opacity: dp.isRed ? 0.7 : 1,
            strokeLineCap: 'round', strokeLineJoin: 'round',
            selectable: false, isUserStroke: !dp.isRed, isTravelLine: dp.isRed,
            createdAt: Date.now() + i, sunaeAbsPoints: dp.pts
        });
        canvas.add(pathObj);
        if(dp.isRed) pathObj.sendToBack();
    });

    if(hasLongBridge) {
        warningDiv.innerHTML = "⚠️ Attention : Votre image comporte des traits discontinus nécessitant un saut de la bille supérieur à 3 cm. Un trait rouge a été généré.";
        warningDiv.style.display = 'block';
    }

    canvas.renderAll();
    updateProgress(100, 'Terminé !');
    setTimeout(() => { pContainer.style.display = 'none'; btn.disabled = false; btn.style.opacity = '1'; }, 1000);
};

window.resetSVG = function() {
    globalNativeStrokes = null;
    let warningDiv = document.getElementById('sunae-jump-warning');
    if(warningDiv) warningDiv.style.display = 'none';
    resetCanvas();
}

// --- INITIALISATION DU CANEVAS (RÉTABLIE) ---
function setupWorkspace(tableName, round) {
    currentTable = tableName; 
    isRound = round;
    
    const cfg = TABLE_CFG[tableName];
    const aspect = cfg ? cfg.aspect : 1.0;
    tableHeight = round ? tableWidth : tableWidth / aspect;
    
    if (canvas) canvas.dispose();
    canvas = new fabric.Canvas('sunae-canvas', { 
        width: tableWidth, 
        height: tableHeight, 
        enableRetinaScaling: false, 
        isDrawingMode: (currentModule === 'Dessin Libre' && drawMode === 'freedraw'),
        selection: false 
    });
    
    const container = document.getElementById('canvas-container');
    if(container) {
        container.style.maxWidth = tableWidth + 'px';
        container.style.aspectRatio = `${tableWidth} / ${tableHeight}`;
        container.style.borderRadius = isRound ? '50%' : '20px';
    }

    if (isRound) canvas.clipPath = new fabric.Circle({ radius: tableWidth / 2, originX: 'center', originY: 'center', left: tableWidth / 2, top: tableHeight / 2 });
    else canvas.clipPath = new fabric.Rect({ width: tableWidth, height: tableHeight, rx: 20, ry: 20, originX: 'center', originY: 'center', left: tableWidth / 2, top: tableHeight / 2 });

    canvas.freeDrawingBrush.color = '#2980b9'; 
    canvas.freeDrawingBrush.width = 3;

    canvas.on('path:created', function(e) {
        if (currentModule !== 'Dessin Libre') return;
        let pathObj = e.path;
        let objMat = pathObj.calcTransformMatrix();
        let absPoints = []; 
        for (let i = 0; i < pathObj.path.length; i++) {
            let cmd = pathObj.path[i];
            if (cmd[0] === 'M' || cmd[0] === 'L') {
                let p = fabric.util.transformPoint({x: cmd[1] - pathObj.pathOffset.x, y: cmd[2] - pathObj.pathOffset.y}, objMat);
                absPoints.push(sanitizeCoordinates(p.x, p.y, isRound, tableWidth, tableHeight));
            } else if (cmd[0] === 'Q') {
                let p = fabric.util.transformPoint({x: cmd[3] - pathObj.pathOffset.x, y: cmd[4] - pathObj.pathOffset.y}, objMat);
                absPoints.push(sanitizeCoordinates(p.x, p.y, isRound, tableWidth, tableHeight)); 
            }
        }
        pathObj.set({ selectable: false, isUserStroke: true, createdAt: Date.now(), sunaeAbsPoints: absPoints });
        updateTravelLines();
    });

    canvas.on('mouse:down', function(o) {
        if (currentModule !== 'Dessin Libre' || drawMode !== 'line' || document.getElementById('bille-slider').value < 100) return;
        isDrawingLine = true; let p = sanitizeCoordinates(canvas.getPointer(o.e).x, canvas.getPointer(o.e).y, isRound, tableWidth, tableHeight);
        tempLine = new fabric.Line([p.x, p.y, p.x, p.y], { strokeWidth: 3, fill: '#2980b9', stroke: '#2980b9', originX: 'center', originY: 'center', selectable: false, evented: false, isUserStroke: true, createdAt: Date.now() });
        canvas.add(tempLine);
    });

    canvas.on('mouse:move', function(o) {
        if (!isDrawingLine) return;
        let p = sanitizeCoordinates(canvas.getPointer(o.e).x, canvas.getPointer(o.e).y, isRound, tableWidth, tableHeight);
        tempLine.set({ x2: p.x, y2: p.y }); canvas.renderAll();
    });

    canvas.on('mouse:up', function() {
        if (!isDrawingLine) return;
        isDrawingLine = false; 
        if (tempLine) {
            tempLine.sunaeAbsPoints = [{x: tempLine.x1, y: tempLine.y1}, {x: tempLine.x2, y: tempLine.y2}];
            updateTravelLines();
        }
    });

    document.querySelectorAll('input[name="drawMode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            drawMode = this.value;
            if(currentModule === 'Dessin Libre') canvas.isDrawingMode = (drawMode === 'freedraw' && document.getElementById('bille-slider').value == 100);
        });
    });

    setupBackgroundControls(); setupSimulator();
    goToStep(2);
}

window.undoStroke = function() {
    const strokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
    if (strokes.length > 0) { canvas.remove(strokes[strokes.length - 1]); updateTravelLines(); }
}

window.resetCanvas = function() {
    canvas.getObjects().forEach(o => { if (!o.isBackgroundImage && !o.isPreviewStroke) canvas.remove(o); });
    canvas.renderAll();
}

function setupBackgroundControls() {
    document.getElementById('bg-upload').addEventListener('change', function(e) {
        if (!e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = function(f) {
            fabric.Image.fromURL(f.target.result, function(img) {
                if (bgImageObj) canvas.remove(bgImageObj);
                bgImageObj = img;
                bgImageObj.set({ originX: 'center', originY: 'center', left: tableWidth / 2, top: tableHeight / 2, opacity: 0.5, selectable: false, evented: false, isBackgroundImage: true });
                canvas.add(bgImageObj); bgImageObj.sendToBack(); canvas.renderAll();
            });
        };
        reader.readAsDataURL(e.target.files[0]);
    });
}

function getStrokeStart(stroke) {
    if (stroke.type === 'path' && stroke.sunaeAbsPoints && stroke.sunaeAbsPoints.length > 0) return stroke.sunaeAbsPoints[0];
    return { x: stroke.origX1 !== undefined ? stroke.origX1 : stroke.x1, y: stroke.origY1 !== undefined ? stroke.origY1 : stroke.y1 };
}

function getStrokeEnd(stroke) {
    if (stroke.type === 'path' && stroke.sunaeAbsPoints && stroke.sunaeAbsPoints.length > 0) return stroke.sunaeAbsPoints[stroke.sunaeAbsPoints.length - 1];
    return { x: stroke.origX2 !== undefined ? stroke.origX2 : stroke.x2, y: stroke.origY2 !== undefined ? stroke.origY2 : stroke.y2 };
}

function updateTravelLines() {
    if(currentModule !== 'Dessin Libre') return; 
    canvas.getObjects().filter(o => o.isTravelLine).forEach(line => canvas.remove(line));
    const userStrokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
    
    for (let i = 1; i < userStrokes.length; i++) {
        const prevEnd = getStrokeEnd(userStrokes[i - 1]);
        const currStart = getStrokeStart(userStrokes[i]);

        if (prevEnd && currStart) {
            const redLine = new fabric.Line([prevEnd.x, prevEnd.y, currStart.x, currStart.y], {
                stroke: 'red', strokeWidth: 2, strokeDashArray: [5, 5], opacity: 0.7,
                selectable: false, evented: false, isTravelLine: true, travelIndex: i - 1,
                sunaeAbsPoints: [prevEnd, currStart] 
            });
            canvas.add(redLine); redLine.sendToBack();
        }
    }
    if (bgImageObj) bgImageObj.sendToBack();
    canvas.renderAll();
}

function setupSimulator() {
    const slider = document.getElementById('bille-slider');
    let simOverlay = document.getElementById('sim-overlay');
    if (!simOverlay) {
        simOverlay = document.createElement('div');
        simOverlay.id = 'sim-overlay'; simOverlay.style.position = 'absolute'; simOverlay.style.top = '0'; simOverlay.style.left = '0';
        simOverlay.style.width = '100%'; simOverlay.style.height = '100%'; simOverlay.style.pointerEvents = 'none';
        simOverlay.style.borderRadius = isRound ? '50%' : '20px'; simOverlay.style.overflow = 'hidden';
        document.getElementById('canvas-container').appendChild(simOverlay);
    }
    
    slider.addEventListener('input', function() {
        if (currentModule === 'Texte Automatique') return; 

        const percent = parseInt(this.value); simOverlay.innerHTML = '';
        
        let allSegments = canvas.getObjects().filter(o => o.isUserStroke || o.isTravelLine).sort((a, b) => a.createdAt - b.createdAt);

        if (percent === 100) {
            if (currentModule === 'Dessin Libre') canvas.isDrawingMode = (drawMode === 'freedraw');
            allSegments.forEach(o => {
                o.set({ opacity: (o.isTravelLine ? 0.7 : 1) });
                if (o.type === 'path' && o.origPath) o.set({ path: o.origPath, left: o.origLeft, top: o.origTop, pathOffset: new fabric.Point(o.origPathOffset.x, o.origPathOffset.y), width: o.origWidth, height: o.origHeight });
                if ((o.type === 'line' || o.isTravelLine) && o.origX2 !== undefined) o.set({ x2: o.origX2, y2: o.origY2 });
            });
            canvas.renderAll(); return;
        }

        canvas.isDrawingMode = false;
        let totalLength = 0;
        
        allSegments.forEach(seg => {
            if (seg.type === 'path' && !seg.origPath) {
                seg.origPath = seg.path; seg.origLeft = seg.left; seg.origTop = seg.top;
                seg.origPathOffset
