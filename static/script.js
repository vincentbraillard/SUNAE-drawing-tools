// --- VARIABLES GLOBALES ---
let canvas = null;
let currentTable = null;
let currentModule = null;
let isRound = false;
let drawMode = 'freedraw'; 

let isDrawingLine = false;
let tempLine = null;
let bgImageObj = null;
let currentSvgGroup = null;

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

// --- MODULE SVG ---
const svgUploadInput = document.getElementById('svg-upload-file');
if (svgUploadInput) {
    svgUploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(f) {
            fabric.loadSVGFromString(f.target.result, function(objects, options) {
                if (currentSvgGroup) canvas.remove(currentSvgGroup);
                currentSvgGroup = fabric.util.groupSVGElements(objects, options);
                
                // Utilisation de la taille absolue et fixe (tableWidth / tableHeight)
                currentSvgGroup.set({
                    left: tableWidth / 2, top: tableHeight / 2,
                    originX: 'center', originY: 'center',
                    borderColor: '#9b59b6', cornerColor: '#9b59b6', transparentCorners: false
                });
                
                let scale = Math.min(tableWidth / currentSvgGroup.width, tableHeight / currentSvgGroup.height) * 0.8;
                currentSvgGroup.scale(scale);
                canvas.add(currentSvgGroup); canvas.setActiveObject(currentSvgGroup); canvas.renderAll();
            });
        };
        reader.readAsText(file);
    });
}

// --- ALGORITHME DU POSTIER CHINOIS (SANDIFY) ---
window.optimizeSVG = async function() {
    if(!currentSvgGroup) return;

    const btn = document.getElementById('btn-optimize-svg');
    const pContainer = document.getElementById('svg-progress-container');
    const pBar = document.getElementById('svg-progress-bar');
    const pText = document.getElementById('svg-progress-text');

    btn.disabled = true; btn.style.opacity = '0.5'; pContainer.style.display = 'block';
    function updateProgress(pct, textMsg) { pBar.style.width = pct + '%'; pText.innerText = textMsg + ' (' + pct + '%)'; }

    updateProgress(0, 'Extraction WYSIWYG...');
    await new Promise(r => setTimeout(r, 50)); 
    
    let objectsToProcess = currentSvgGroup.type === 'group' ? currentSvgGroup.getObjects() : [currentSvgGroup];
    let groupMatrix = currentSvgGroup.calcTransformMatrix(); 
    
    // --- 1. GÉNÉRATION DES NOEUDS (Graphes) ---
    let nodes = [];
    let spatialGrid = new Map();
    let cellSize = 2.0;

    function addNode(p) {
        let gx = Math.floor(p.x / cellSize); let gy = Math.floor(p.y / cellSize);
        let keys = [`${gx},${gy}`, `${gx-1},${gy}`, `${gx+1},${gy}`, `${gx},${gy-1}`, `${gx},${gy+1}`, `${gx-1},${gy-1}`, `${gx+1},${gy+1}`, `${gx-1},${gy+1}`, `${gx+1},${gy-1}`];
        for(let key of keys) {
            if(spatialGrid.has(key)) {
                for(let n of spatialGrid.get(key)) {
                    if(Math.hypot(n.x - p.x, n.y - p.y) < 1.0) return n.id; 
                }
            }
        }
        let id = nodes.length;
        let node = {x: p.x, y: p.y, id: id, adj: []};
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

    for(let i=0; i<objectsToProcess.length; i++) {
        let obj = objectsToProcess[i];
        
        let objMat = obj.calcTransformMatrix(); 
        if (currentSvgGroup.type === 'group') {
            objMat = fabric.util.multiplyTransformMatrices(groupMatrix, objMat);
        }
        
        function processPathSegment(pts) {
            if(pts.length < 2) return;
            let prevId = addNode(pts[0]);
            for(let j=1; j<pts.length; j++) {
                let currId = addNode(pts[j]);
                let len = Math.hypot(nodes[prevId].x - nodes[currId].x, nodes[prevId].y - nodes[currId].y);
                if (len < 20) { addEdge(prevId, currId, false, false); }
                prevId = currId;
            }
        }

        if (obj.type === 'path') {
            let svgNS = "http://www.w3.org/2000/svg";
            let pathEl = document.createElementNS(svgNS, "path");
            pathEl.setAttribute('d', obj.path.map(cmd => cmd.join(' ')).join(' '));
            let len = pathEl.getTotalLength();
            if(len > 1) {
                let pts = [];
                for(let l=0; l<=len; l+=2) { 
                    let pt = pathEl.getPointAtLength(l);
                    let ptX = pt.x - (obj.pathOffset ? obj.pathOffset.x : 0);
                    let ptY = pt.y - (obj.pathOffset ? obj.pathOffset.y : 0);
                    let transformed = fabric.util.transformPoint({x: ptX, y: ptY}, objMat);
                    pts.push(sanitizeCoordinates(transformed.x, transformed.y, isRound, tableWidth, tableHeight));
                }
                processPathSegment(pts);
            }
        }
        else if (obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'line') {
            let pts = [];
            if (obj.type === 'line') {
                pts = [{x: obj.x1, y: obj.y1}, {x: obj.x2, y: obj.y2}];
            } else {
                pts = [...obj.points];
                if (obj.type === 'polygon' && pts.length > 0) pts.push(pts[0]);
            }
            
            let sampledPts = [];
            for(let j=0; j<pts.length-1; j++) {
                let p1 = pts[j]; let p2 = pts[j+1];
                let d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                let count = Math.max(1, Math.floor(d / 2));
                for(let k=0; k<=count; k++) {
                    let ptX = p1.x + (p2.x - p1.x)*(k/count) - (obj.pathOffset ? obj.pathOffset.x : 0);
                    let ptY = p1.y + (p2.y - p1.y)*(k/count) - (obj.pathOffset ? obj.pathOffset.y : 0);
                    let transformed = fabric.util.transformPoint({x: ptX, y: ptY}, objMat);
                    sampledPts.push(sanitizeCoordinates(transformed.x, transformed.y, isRound, tableWidth, tableHeight));
                }
            }
            processPathSegment(sampledPts);
        }
    }

    if (edges.length === 0) { btn.disabled = false; btn.style.opacity = '1'; pContainer.style.display = 'none'; return; }

    // --- 2. KRUSKAL (Connexion absolue entre zones séparées) ---
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
        
        for(let b of potentialBridges) {
            let r1 = cFind(b.c1), r2 = cFind(b.c2);
            if(r1 !== r2) {
                compParent[r1] = r2;
                addEdge(b.u, b.v, true, false); 
            }
        }
    }

    // --- 3. EULERIZE (Dijkstra pour repasser sur les traits) ---
    updateProgress(50, 'Routage sur traits (Postier Chinois)...');
    await new Promise(r => setTimeout(r, 20));

    let odds = [];
    for(let i=0; i<nodes.length; i++) {
        if(nodes[i].adj.length % 2 !== 0) odds.push(i);
    }

    let passes = 0;
    let totalOdds = odds.length;
    
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
                let nd = curr.dist + edge.d;
                if(nd < dist[v]) { dist[v] = nd; prev[v] = u; pq.push(v, nd); }
            }
        }
        
        let bestOddIdx = -1; let minDist = Infinity;
        for(let i=0; i<odds.length; i++) {
            if(dist[odds[i]] < minDist) { minDist = dist[odds[i]]; bestOddIdx = i; }
        }
        
        if(bestOddIdx !== -1) {
            let target = odds[bestOddIdx];
            odds.splice(bestOddIdx, 1);
            
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
            updateProgress(50 + Math.floor((1 - (odds.length / totalOdds)) * 30), 'Routage (Eulerize)...');
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // --- 4. HIERHOLZER (Chemin continu AVEC TRI HEURISTIQUE) ---
    updateProgress(85, 'Génération du chemin continu...');
    await new Promise(r => setTimeout(r, 20));

    let adjTr = Array.from({length: nodes.length}, () => []);
    edges.forEach((e, idx) => {
        e.used = false;
        adjTr[e.u].push({to: e.v, edgeIdx: idx, dir: 1});
        adjTr[e.v].push({to: e.u, edgeIdx: idx, dir: -1});
    });

    // LA FONCTION DE TRI : Priorité absolue au dessin original !
    function getEdgeScore(e) {
        if (e.isBridge) return 1;       // Sauts rouges (Pire choix)
        if (e.isDuplicate) return 2;    // Repassage invisible (Choix moyen)
        return 3;                       // Vrais traits bleus du dessin (Meilleur choix)
    }

    for(let i=0; i<nodes.length; i++) {
        // Tri croissant pour que la fin du tableau contienne le meilleur score
        adjTr[i].sort((a, b) => getEdgeScore(edges[a.edgeIdx]) - getEdgeScore(edges[b.edgeIdx])); 
    }

    let startNode = 0;
    for(let i=0; i<nodes.length; i++) { if(nodes[i].adj.length > 0) { startNode = i; break; } }

    let stack = [startNode];
    let nodePath = [];

    while(stack.length > 0) {
        let u = stack[stack.length - 1];
        let nextEdge = null;
        
        // Parcourt les routes disponibles, de la fin du tableau (meilleur score) au début
        for(let i=adjTr[u].length - 1; i >= 0; i--) {
            if(!edges[adjTr[u][i].edgeIdx].used) {
                nextEdge = adjTr[u][i]; 
                break;
            }
        }
        
        if(nextEdge) {
            edges[nextEdge.edgeIdx].used = true;
            stack.push(nextEdge.to);
        } else {
            nodePath.push(stack.pop());
        }
    }
    nodePath.reverse();

    // --- 5. DESSIN WYSIWYG ---
    updateProgress(95, 'Affichage visuel...');
    await new Promise(r => setTimeout(r, 10));

    currentSvgGroup.set({opacity: 0, selectable: false, evented: false});
    
    let displayPaths = [];
    let currentPts = [];
    let currentIsRed = false;

    for(let i=0; i<nodePath.length-1; i++) {
        let u = nodePath[i];
        let v = nodePath[i+1];
        
        let edge = nodes[u].adj.find(e => ((e.u === u && e.v === v) || (e.v === u && e.u === v)) && !e.rendered);
        if(edge) edge.rendered = true;
        
        let stepIsRed = edge ? edge.isBridge : false;
        
        if(currentPts.length === 0) {
            currentPts.push(nodes[u]);
            currentIsRed = stepIsRed;
        }
        
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
        let pts = dp.pts;
        let d = "M " + pts[0].x + " " + pts[0].y;
        for(let j=1; j<pts.length; j++) d += " L " + pts[j].x + " " + pts[j].y;
        
        let pathObj = new fabric.Path(d, {
            fill: null, stroke: dp.isRed ? 'red' : '#2980b9', 
            strokeWidth: dp.isRed ? 2 : 3, strokeDashArray: dp.isRed ? [5, 5] : null, opacity: dp.isRed ? 0.7 : 1,
            strokeLineCap: 'round', strokeLineJoin: 'round',
            selectable: false, isUserStroke: !dp.isRed, isTravelLine: dp.isRed,
            createdAt: Date.now() + i, travelIndex: dp.isRed ? i : undefined, sunaeAbsPoints: pts
        });
        canvas.add(pathObj);
        if(dp.isRed) pathObj.sendToBack();
    });

    canvas.renderAll();

    updateProgress(100, 'Terminé !');
    setTimeout(() => { pContainer.style.display = 'none'; btn.disabled = false; btn.style.opacity = '1'; }, 1000);
};

window.resetSVG = function() {
    if(currentSvgGroup) canvas.remove(currentSvgGroup);
    currentSvgGroup = null;
    resetCanvas();
}

// --- INITIALISATION DU CANEVAS ---
function setupWorkspace(tableName, round, w_param, h_param) {
    currentTable = tableName; isRound = round;
    goToStep(3, currentModule || 'Dessin Libre');

    // --- LE VERROU MATHÉMATIQUE (Fin du bug Ordi/Mobile) ---
    const aspect = TABLE_CFG[tableName] ? TABLE_CFG[tableName].aspect : 1;
    tableWidth = 600;
    tableHeight = round ? 600 : tableWidth / aspect;

    if (canvas) canvas.dispose();
    
    // On force la taille du DOM pour ne pas polluer l'initialisation
    const canvasEl = document.getElementById('sunae-canvas');
    if (canvasEl) { canvasEl.width = tableWidth; canvasEl.height = tableHeight; }

    canvas = new fabric.Canvas('sunae-canvas', {
        width: tableWidth, 
        height: tableHeight,
        enableRetinaScaling: false, // DÉSACTIVE LE PIÈGE DE LA DENSITÉ PIXEL (MOBILE VS PC)
        isDrawingMode: (currentModule === 'Dessin Libre' && drawMode === 'freedraw'), 
        selection: false
    });

    // Ajustement visuel CSS (Zoom de la fenêtre sans toucher aux mathématiques de 600px)
    const container = document.getElementById('canvas-container');
    container.style.width = '100%';
    container.style.maxWidth = tableWidth + 'px';
    container.style.height = 'auto';
    container.style.aspectRatio = round ? '1 / 1' : `${tableWidth} / ${tableHeight}`;
    container.style.borderRadius = isRound ? '50%' : '20px';

    if (isRound) canvas.clipPath = new fabric.Circle({ radius: tableWidth / 2, originX: 'center', originY: 'center', left: tableWidth / 2, top: tableHeight / 2 });
    else canvas.clipPath = new fabric.Rect({ width: tableWidth, height: tableHeight, rx: 20, ry: 20, originX: 'center', originY: 'center', left: tableWidth / 2, top: tableHeight / 2 });

    canvas.freeDrawingBrush.color = '#2980b9'; canvas.freeDrawingBrush.width = 3;

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
}

window.undoStroke = function() {
    const strokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
    if (strokes.length > 0) { canvas.remove(strokes[strokes.length - 1]); updateTravelLines(); }
}

window.resetCanvas = function() {
    canvas.getObjects().forEach(o => { if (!o.isBackgroundImage && o !== currentSvgGroup) canvas.remove(o); });
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

// --- LIGNES DE VOYAGE (POUR LE DESSIN LIBRE UNIQUEMENT) ---
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

// --- LE SIMULATEUR ANIMÉ UNIFIÉ ---
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
                seg.origPathOffset = { x: seg.pathOffset.x, y: seg.pathOffset.y }; seg.origWidth = seg.width; seg.origHeight = seg.height;
            }
            if ((seg.type === 'line' || seg.isTravelLine) && seg.origX2 === undefined) {
                seg.origX1 = seg.x1; seg.origY1 = seg.y1; seg.origX2 = seg.x2; seg.origY2 = seg.y2;
            }
            seg.segmentLength = seg.sunaeAbsPoints ? seg.sunaeAbsPoints.length : 10;
            totalLength += seg.segmentLength;
        });

        if (totalLength === 0) return;
        const targetLength = (percent / 100) * totalLength;
        let currentLength = 0; let currentDotPos = null; let startDotPos = allSegments[0] && allSegments[0].sunaeAbsPoints ? allSegments[0].sunaeAbsPoints[0] : null;

        allSegments.forEach((seg) => {
            if (currentLength + seg.segmentLength <= targetLength) {
                seg.set({ opacity: (seg.isTravelLine ? 0.7 : 1) });
                if (seg.type === 'path') seg.set({ path: seg.origPath });
                if (seg.type === 'line' || seg.isTravelLine) seg.set({ x2: seg.origX2, y2: seg.origY2 });
                if (seg.sunaeAbsPoints) currentDotPos = seg.sunaeAbsPoints[seg.sunaeAbsPoints.length-1];
                currentLength += seg.segmentLength;
            }
            else if (currentLength < targetLength) {
                seg.set({ opacity: (seg.isTravelLine ? 0.7 : 1) });
                const ratio = (targetLength - currentLength) / seg.segmentLength;

                if (seg.type === 'path') {
                    const cmdsToShow = Math.max(1, Math.floor(seg.origPath.length * ratio));
                    seg.set({ path: seg.origPath.slice(0, cmdsToShow) });
                    seg.set({ left: seg.origLeft, top: seg.origTop, pathOffset: new fabric.Point(seg.origPathOffset.x, seg.origPathOffset.y), width: seg.origWidth, height: seg.origHeight });
                    if (seg.sunaeAbsPoints && seg.sunaeAbsPoints.length > 0) {
                        const targetIdx = Math.min(cmdsToShow - 1, seg.sunaeAbsPoints.length - 1);
                        currentDotPos = seg.sunaeAbsPoints[targetIdx];
                    }
                } else if (seg.type === 'line' || seg.isTravelLine) {
                    const newX = seg.origX1 + (seg.origX2 - seg.origX1) * ratio;
                    const newY = seg.origY1 + (seg.origY2 - seg.origY1) * ratio;
                    seg.set({ x2: newX, y2: newY });
                    currentDotPos = {x: newX, y: newY};
                }
                currentLength += seg.segmentLength; 
            }
            else { seg.set({ opacity: 0 }); }
        });

        let svgDots = '';
        if (targetLength > 0 && startDotPos) svgDots += `<div style="position:absolute; width:12px; height:12px; background-color:#2ecc71; border-radius:50%; left:${startDotPos.x-6}px; top:${startDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        if (currentDotPos) svgDots += `<div style="position:absolute; width:12px; height:12px; background-color:#c0392b; border-radius:50%; left:${currentDotPos.x-6}px; top:${currentDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        simOverlay.innerHTML = svgDots;
        canvas.renderAll();
    });
}

// --- EXPORTATION ---
window.exportTHR = function() {
    let customName = document.getElementById('export-filename').value.trim();
    let finalFileName = customName !== "" ? customName : (currentModule === 'Texte Automatique' ? (getGridText() || "Texte_Sunae") : getYYMMDD() + (currentModule === 'Fichier SVG' ? "_ConvertionSVG" : "_Freedrawing"));
    
    // On envoie le VRAI tableWidth mathématique (600) au serveur pour que les coordonnées restent parfaites
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
        if (!canvas) return;
        document.getElementById('bille-slider').value = 100; document.getElementById('bille-slider').dispatchEvent(new Event('input'));
        exportData.drawing = canvas.toJSON(['isUserStroke', 'isTravelLine', 'isBackgroundImage', 'createdAt', 'sunaeAbsPoints']);
    }

    fetch('/export-thr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exportData) })
    .then(r => r.blob()).then(blob => {
        const a = document.createElement('a'); a.href = window.URL.createObjectURL(blob); a.download = `${finalFileName.replace(/\s+/g, '_')}.thr`;
        document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(a.href);
    }).catch(e => alert("Erreur lors de la génération."));
}
