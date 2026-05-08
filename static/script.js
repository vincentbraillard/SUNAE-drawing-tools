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
let rawSvgPreview = []; // Import brut (segments séparés)

// Image de fond
let bgImageObj = null;
let bgScale = 1.0, bgAngle = 0, bgPanX = 0, bgPanY = 0;

// Simulateur
let simProgress = 100;

// --- CONFIGURATION TABLES ---
let tableWidth = 600;
let tableHeight = 600;

const TABLE_CFG = {
    "Origin S": { round: true, rows: [6, 8, 8, 6], y_centers: [0.45, 0.15, -0.15, -0.45], w: 0.20, h: 0.24, spacing: 0.00, aspect: 1.0 },
    "Dimension S": { round: false, rows: [14, 14, 14], y_centers: [0.25, 0.0, -0.25], w: 0.11, h: 0.15, spacing: 0.015, aspect: 1300.0 / 600.0 },
    "Dimension L": { round: false, rows: [20, 20, 20, 20], y_centers: [0.27, 0.09, -0.09, -0.27], w: 0.075, h: 0.11, spacing: 0.01, aspect: 1900.0 / 900.0 }
};

// --- STRUCTURES DE DONNÉES (TSP) ---
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

function sanitizeCoordinates(x, y, round, w, h) {
    if (round) {
        const cx = w / 2; const cy = h / 2; const radius = (w / 2) - 2; 
        const dx = x - cx; const dy = y - cy; const dist = Math.hypot(dx, dy);
        if (dist > radius) return { x: cx + (radius * dx / dist), y: cy + (radius * dy / dist) };
        return { x, y };
    }
    return { x: Math.max(2, Math.min(w - 2, x)), y: Math.max(2, Math.min(h - 2, y)) };
}

function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return sanitizeCoordinates((evt.clientX - rect.left) * scaleX, (evt.clientY - rect.top) * scaleY, isRound, tableWidth, tableHeight);
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

        if (currentModule === 'Texte Automatique') {
            document.getElementById('tools-texte').style.display = 'block';
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
        currentStroke = { isUserStroke: true, createdAt: Date.now(), sunaeAbsPoints: [getMousePos(e)] };
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

// --- RENDU ---
function renderCanvas() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    if (isRound) ctx.arc(tableWidth/2, tableHeight/2, tableWidth/2, 0, Math.PI * 2);
    else ctx.rect(0, 0, tableWidth, tableHeight);
    ctx.clip();

    if (bgImageObj) {
        ctx.save();
        ctx.translate(tableWidth/2 + bgPanX, tableHeight/2 + bgPanY);
        ctx.rotate(bgAngle * Math.PI / 180);
        ctx.scale(bgScale, bgScale);
        ctx.globalAlpha = 0.4;
        ctx.drawImage(bgImageObj, -bgImageObj.width/2, -bgImageObj.height/2);
        ctx.restore();
    }

    let all = (currentModule === 'Fichier SVG') ? 
        (svgStrokes.length > 0 ? svgStrokes : rawSvgPreview.map(pts => ({isUserStroke:true, sunaeAbsPoints:pts}))) : 
        [...travelLines, ...userStrokes].sort((a,b) => a.createdAt - b.createdAt);
    
    if (currentStroke) all.push(currentStroke);

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    all.forEach(obj => {
        let pts = obj.sunaeAbsPoints;
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for(let i=1; i<pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        
        ctx.strokeStyle = obj.isTravelLine ? 'rgba(211, 47, 47, 0.6)' : '#2980b9';
        ctx.lineWidth = obj.isTravelLine ? 2 : 3;
        ctx.setLineDash(obj.isTravelLine ? [5, 5] : []);
        ctx.stroke();
    });
    ctx.restore();
}

// --- IMPORTATION SVG (AVEC DÉTECTION DE GAP) ---
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
            const svgEl = container.querySelector('svg');
            if(!svgEl) { document.body.removeChild(container); return; }

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
                let pts = []; let prevRaw = null;
                const step = Math.max(0.1, 2.0 / scale); 

                for(let l=0; l<=len; l+=step) {
                    let pt = path.getPointAtLength(l);
                    if (prevRaw && Math.hypot(pt.x - prevRaw.x, pt.y - prevRaw.y) > step * 3) {
                        if (pts.length > 1) rawSvgPreview.push(pts);
                        pts = []; 
                    }
                    prevRaw = pt;
                    let tx = pt.x * ctm.a + pt.y * ctm.c + ctm.e;
                    let ty = pt.x * ctm.b + pt.y * ctm.d + ctm.f;
                    pts.push(sanitizeCoordinates((tx * scale) + offsetX, (ty * scale) + offsetY, isRound, tableWidth, tableHeight));
                }
                if(pts.length > 1) rawSvgPreview.push(pts);
            });
            document.body.removeChild(container); renderCanvas();
        };
        reader.readAsText(file);
    });
}

// --- OPTIMISATION ALGORITHMIQUE ---
window.optimizeSVG = async function() {
    if(rawSvgPreview.length === 0) return;
    const btn = document.getElementById('btn-optimize-svg');
    const pContainer = document.getElementById('svg-progress-container');
    const pBar = document.getElementById('svg-progress-bar');
    btn.disabled = true; pContainer.style.display = 'block';

    let nodes = []; let edges = [];
    function addNode(p) {
        for(let n of nodes) { if(Math.hypot(n.x - p.x, n.y - p.y) < 2.0) return n.id; }
        let id = nodes.length; nodes.push({x: p.x, y: p.y, id: id, adj: []}); return id;
    }
    function addEdge(u, v, isBridge = false, isDuplicate = false) {
        if(u === v) return;
        let d = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
        let e = {u, v, d, isBridge, isDuplicate, used: false, rendered: false};
        nodes[u].adj.push(e); nodes[v].adj.push(e); edges.push(e);
    }

    rawSvgPreview.forEach(pts => {
        let prev = addNode(pts[0]);
        for(let i=1; i<pts.length; i++) { let curr = addNode(pts[i]); addEdge(prev, curr); prev = curr; }
    });

    // KRUSKAL AVEC LIMITE UI
    const maxJump = parseFloat(document.getElementById('max-jump-slider').value);
    let parent = nodes.map((_, i) => i);
    function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
    edges.forEach(e => { if(find(e.u) !== find(e.v)) parent[find(e.u)] = find(e.v); });

    let comps = []; let compMap = {};
    nodes.forEach(n => { let r = find(n.id); if(compMap[r] === undefined) { compMap[r] = comps.length; comps.push([]); } comps[compMap[r]].push(n.id); });

    if(comps.length > 1) {
        let bridges = [];
        for(let i=0; i<comps.length; i++) {
            for(let j=i+1; j<comps.length; j++) {
                let minDist = Infinity, bestU, bestV;
                comps[i].forEach(u => comps[j].forEach(v => {
                    let d = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
                    if(d < minDist) { minDist = d; bestU = u; bestV = v; }
                }));
                bridges.push({u:bestU, v:bestV, d:minDist, c1:i, c2:j});
            }
        }
        bridges.sort((a,b) => a.d - b.d);
        let cP = comps.map((_, i) => i);
        function cF(i) { return cP[i] === i ? i : (cP[i] = cF(cP[i])); }
        bridges.forEach(b => {
            if(cF(b.c1) !== cF(b.c2) && b.d <= maxJump) { cP[cF(b.c1)] = cF(b.c2); addEdge(b.u, b.v, true); }
        });
        if(cP.filter((p, i) => p === i).length > 1) {
            alert("Erreur : Des zones sont trop éloignées (> " + maxJump + "px).");
            btn.disabled = false; pContainer.style.display = 'none'; return;
        }
    }

    // DIJKSTRA & HIERHOLZER (Simplifié pour la réponse)
    let odds = nodes.filter(n => n.adj.length % 2 !== 0);
    while(odds.length > 0) {
        let start = odds.pop();
        let dist = new Array(nodes.length).fill(Infinity); let prev = new Array(nodes.length).fill(-1);
        dist[start] = 0; let pq = new MinHeap(); pq.push(start, 0);
        while(!pq.isEmpty()){
            let u = pq.pop().id;
            nodes[u].adj.forEach(e => {
                let v = (e.u === u) ? e.v : e.u;
                let cost = e.isBridge ? e.d * 1000 : e.d;
                if(dist[u] + cost < dist[v]) { dist[v] = dist[u] + cost; prev[v] = u; pq.push(v, dist[v]); }
            });
        }
        let target = odds.pop(); let curr = target;
        while(curr !== start) { let p = prev[curr]; addEdge(curr, p, false, true); curr = p; }
    }

    let stack = [0]; let path = [];
    while(stack.length > 0) {
        let u = stack[stack.length - 1];
        let e = nodes[u].adj.find(ed => !ed.used);
        if(e) { e.used = true; stack.push(e.u === u ? e.v : e.u); } else path.push(stack.pop());
    }

    svgStrokes = []; let curPts = []; let curRed = false;
    for(let i=0; i<path.length-1; i++) {
        let u = path[i], v = path[i+1];
        let e = nodes[u].adj.find(ed => ((ed.u===u&&ed.v===v)||(ed.v===u&&ed.u===v)) && !ed.rendered);
        if(e) e.rendered = true;
        let isRed = e ? e.isBridge : false;
        if(curPts.length > 0 && curRed !== isRed) {
            svgStrokes.push({isUserStroke: !curRed, isTravelLine: curRed, sunaeAbsPoints: curPts, createdAt: Date.now()+i});
            curPts = [nodes[u]];
        }
        curRed = isRed; curPts.push(nodes[v]);
    }
    svgStrokes.push({isUserStroke: !curRed, isTravelLine: curRed, sunaeAbsPoints: curPts, createdAt: Date.now()});

    btn.disabled = false; pContainer.style.display = 'none'; renderCanvas();
};

// --- AUTRES ---
window.resetCanvas = () => { userStrokes = []; travelLines = []; svgStrokes = []; rawSvgPreview = []; renderCanvas(); };
window.resetSVG = () => { rawSvgPreview = []; svgStrokes = []; renderCanvas(); };
function setupBackgroundControls() {
    document.getElementById('bg-upload').onchange = (e) => {
        let r = new FileReader(); r.onload = (f) => { bgImageObj = new Image(); bgImageObj.onload = renderCanvas; bgImageObj.src = f.target.result; };
        r.readAsDataURL(e.target.files[0]);
    };
}
function setupSimulator() { document.getElementById('bille-slider').oninput = function() { simProgress = parseInt(this.value); renderCanvas(); }; }
window.exportTHR = function() {
    let exportData = { table: currentTable, module: currentModule, canvasWidth: tableWidth, canvasHeight: tableHeight, drawing: { objects: (currentModule === 'Fichier SVG' ? svgStrokes : [...travelLines, ...userStrokes]) } };
    fetch('/export-thr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exportData) })
    .then(r => r.blob()).then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `export.thr`; a.click(); });
};
