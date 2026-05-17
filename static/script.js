// --- VARIABLES GLOBALES ---
let canvas = null;
let ctx = null;
let currentTable = null;
let currentModule = null;
let dynamicCfg = null; // Stocke la configuration texte modifiée par les sliders
let isRound = false;
let drawMode = 'freedraw'; 

let isDrawing = false;
let currentStroke = null;

// Architecture Native
let userStrokes = []; 
let travelLines = []; 
let svgStrokes = [];  
let rawSvgPreview = []; 

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

        // CORRECTIF DU BOUCLIER TRANSPARENT : on cache la grille et on la vide
        const textGrid = document.getElementById('text-grid-container');
        if (textGrid) {
            textGrid.style.display = 'none';
            if (moduleName !== 'Texte Automatique') {
                textGrid.innerHTML = ''; // Détruit les boites de texte qui pourraient bloquer
            }
        }

        if (currentModule === 'Texte Automatique') {
            document.getElementById('tools-texte').style.display = 'block';
            if (textGrid) textGrid.style.display = 'block'; // On ne réaffiche la grille qu'ici
            resetTextSliders();
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
    container.style.aspectRatio = round ? '1 / 1' : `${tableWidth} / ${tableHeight}`;

    canvas.onpointerdown = (e) => {
        e.preventDefault(); 
        if (currentModule !== 'Dessin Libre' || simProgress < 100) return;
        isDrawing = true; canvas.setPointerCapture(e.pointerId);
        let p = getMousePos(e);
        currentStroke = { isUserStroke: true, createdAt: Date.now(), sunaeAbsPoints: [p] };
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

// --- RENDU CANVAS NATIF ---
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

    let totalPoints = all.reduce((sum, obj) => sum + obj.sunaeAbsPoints.length, 0);
    let targetPoints = Math.floor((simProgress / 100) * totalPoints);
    let drawnPoints = 0;
    let currentDotPos = null;

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let obj of all) {
        if (drawnPoints >= targetPoints && simProgress < 100) break;
        let pts = obj.sunaeAbsPoints;
        if (pts.length < 2) { drawnPoints += pts.length; continue; }

        let ptsToDraw = (simProgress === 100) ? pts.length : Math.min(pts.length, targetPoints - drawnPoints);

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for(let i=1; i<ptsToDraw; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
            currentDotPos = pts[i];
        }
        
        ctx.strokeStyle = obj.isTravelLine ? 'rgba(211, 47, 47, 0.7)' : '#2980b9';
        ctx.lineWidth = obj.isTravelLine ? 2 : 3;
        ctx.setLineDash(obj.isTravelLine ? [5, 5] : []);
        ctx.stroke();
        drawnPoints += pts.length;
    }
    ctx.restore();

    let simOverlay = document.getElementById('sim-overlay');
    if (!simOverlay) {
        simOverlay = document.createElement('div');
        simOverlay.id = 'sim-overlay'; simOverlay.style.position = 'absolute'; simOverlay.style.top = '0'; simOverlay.style.left = '0';
        simOverlay.style.width = '100%'; simOverlay.style.height = '100%'; simOverlay.style.pointerEvents = 'none';
        document.getElementById('canvas-container').appendChild(simOverlay);
    }
    
    if (simProgress < 100 && currentDotPos) {
        simOverlay.innerHTML = `<div style="position:absolute; width:12px; height:12px; background-color:#c0392b; border-radius:50%; left:${currentDotPos.x-6}px; top:${currentDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
    } else simOverlay.innerHTML = '';
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

// --- IMPORTATION SVG ---
const svgUploadInput = document.getElementById('svg-upload-file');
if (svgUploadInput) {
    svgUploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(f) {
            
            const container = document.createElement('div');
            container.style.position = 'absolute'; 
            container.style.left = '-9999px'; 
            container.style.top = '-9999px'; 
            document.body.appendChild(container); 
            container.innerHTML = f.target.result;
            
            const svgEl = container.querySelector('svg');
            if(!svgEl) { document.body.removeChild(container); return; }

            if (!svgEl.getAttribute('viewBox')) {
                let w = parseFloat(svgEl.getAttribute('width')) || tableWidth;
                let h = parseFloat(svgEl.getAttribute('height')) || tableHeight;
                svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
            }
            
            const drawAreaW = tableWidth * 0.8;
            const drawAreaH = tableHeight * 0.8;
            svgEl.setAttribute('width', drawAreaW + 'px');
            svgEl.setAttribute('height', drawAreaH + 'px');

            svgEl.querySelectorAll('rect, circle, ellipse, line, polygon, polyline').forEach(el => {
                if (el.getAttribute('fill') === 'none' && el.getAttribute('stroke') === 'none') return;

                let p = document.createElementNS("http://www.w3.org/2000/svg", "path");
                let d = "";
                if (el.tagName === 'rect') {
                    let x=parseFloat(el.getAttribute('x'))||0, y=parseFloat(el.getAttribute('y'))||0;
                    let w=parseFloat(el.getAttribute('width'))||0, h=parseFloat(el.getAttribute('height'))||0;
                    d = `M ${x} ${y} L ${x+w} ${y} L ${x+w} ${y+h} L ${x} ${y+h} Z`;
                } else if (el.tagName === 'circle' || el.tagName === 'ellipse') {
                    let cx=parseFloat(el.getAttribute('cx'))||0, cy=parseFloat(el.getAttribute('cy'))||0;
                    let rx=parseFloat(el.getAttribute('r')||el.getAttribute('rx'))||0, ry=parseFloat(el.getAttribute('r')||el.getAttribute('ry'))||0;
                    d = `M ${cx-rx} ${cy} a ${rx},${ry} 0 1,0 ${rx*2},0 a ${rx},${ry} 0 1,0 -${rx*2},0`;
                } else if (el.tagName === 'line') {
                    d = `M ${el.getAttribute('x1')} ${el.getAttribute('y1')} L ${el.getAttribute('x2')} ${el.getAttribute('y2')}`;
                } else {
                    let pts = (el.getAttribute('points')||"").trim().split(/[\s,]+/);
                    if(pts.length>=2) {
                        d = `M ${pts[0]} ${pts[1]}`;
                        for(let i=2; i<pts.length; i+=2) d += ` L ${pts[i]} ${pts[i+1]}`;
                        if(el.tagName==='polygon') d += ' Z';
                    }
                }
                p.setAttribute('d', d);
                if(el.getAttribute('transform')) p.setAttribute('transform', el.getAttribute('transform'));
                el.parentNode.replaceChild(p, el);
            });

            rawSvgPreview = []; svgStrokes = [];
            const screenStep = 2.0;

            svgEl.querySelectorAll('path').forEach(path => {
                if (path.getAttribute('fill') === 'none' && path.getAttribute('stroke') === 'none') return; 

                const len = path.getTotalLength(); if(len <= 1) return;
                const ctm = path.getCTM(); if(!ctm) return;
                
                let pts = []; let prevRaw = null;
                const scaleFactor = Math.sqrt(ctm.a * ctm.a + ctm.b * ctm.b) || 1;
                const internalStep = Math.max(0.1, screenStep / scaleFactor);

                for(let l=0; l<=len; l+=internalStep) {
                    let pt = path.getPointAtLength(l);
                    
                    if (prevRaw && Math.hypot(pt.x - prevRaw.x, pt.y - prevRaw.y) > internalStep * 1.5) {
                        if (pts.length > 1) rawSvgPreview.push(pts);
                        pts = []; 
                    }
                    prevRaw = pt;
                    
                    let tx = pt.x * ctm.a + pt.y * ctm.c + ctm.e;
                    let ty = pt.x * ctm.b + pt.y * ctm.d + ctm.f;
                    
                    let finalX = tx + (tableWidth - drawAreaW) / 2;
                    let finalY = ty + (tableHeight - drawAreaH) / 2;
                    
                    pts.push(sanitizeCoordinates(finalX, finalY, isRound, tableWidth, tableHeight));
                }
                if(pts.length > 1) rawSvgPreview.push(pts);
            });
            document.body.removeChild(container); renderCanvas();
        };
        reader.readAsText(file);
    });
}

// --- ALGORITHME COMPLET DE ROUTAGE ---
window.optimizeSVG = async function() {
    if(rawSvgPreview.length === 0) return;
    const btn = document.getElementById('btn-optimize-svg');
    const pContainer = document.getElementById('svg-progress-container');
    const pBar = document.getElementById('svg-progress-bar');
    const pText = document.getElementById('svg-progress-text');
    
    btn.disabled = true; pContainer.style.display = 'block';

    function updateProgress(pct, textMsg) { 
        if(pBar) pBar.style.width = pct + '%'; 
        if(pText) pText.innerText = textMsg + ' (' + pct + '%)'; 
    }

    updateProgress(10, 'Extraction des Nœuds...');
    await new Promise(r => setTimeout(r, 50)); 

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

    updateProgress(30, 'Calcul des ponts minimaux...');
    await new Promise(r => setTimeout(r, 50));

    const maxJumpSlider = document.getElementById('max-jump-slider');
    const maxJump = maxJumpSlider ? parseFloat(maxJumpSlider.value) : 40;
    
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
        let remainingComps = comps.length;
        
        bridges.forEach(b => {
            if(cF(b.c1) !== cF(b.c2)) { 
                if (b.d > maxJump) return;
                cP[cF(b.c1)] = cF(b.c2); 
                remainingComps--;
                addEdge(b.u, b.v, true); 
            }
        });
        
        if(remainingComps > 1) {
            alert("❌ Échec du routage.\n\nDes zones sont séparées par plus de " + maxJump + " pixels. Le sable sera rayé si la bille saute.\n\nVeuillez augmenter la tolérance ou relier les zones dans votre éditeur SVG.");
            btn.disabled = false; pContainer.style.display = 'none'; return;
        }
    }

    updateProgress(50, 'Routage agressif sur traits...');
    await new Promise(r => setTimeout(r, 50));

    let odds = nodes.filter(n => n.adj.length % 2 !== 0);
    let passes = 0; let totalOdds = odds.length;
    
    while(odds.length > 0) {
        let start = odds.pop();
        let dist = new Float32Array(nodes.length).fill(Infinity);
        let prev = new Int32Array(nodes.length).fill(-1);
        dist[start.id] = 0; 
        let pq = new MinHeap(); pq.push(start.id, 0);
        
        while(!pq.isEmpty()){
            let curr = pq.pop(); let u = curr.id;
            if(curr.dist > dist[u]) continue;
            for(let e of nodes[u].adj) {
                let v = (e.u === u) ? e.v : e.u;
                let cost = e.isBridge ? e.d * 10000 : e.d; 
                let alt = dist[u] + cost;
                if(alt < dist[v]) { dist[v] = alt; prev[v] = u; pq.push(v, alt); }
            }
        }
        
        let bestTargetIdx = -1; let minDist = Infinity;
        for(let i=0; i<odds.length; i++) {
            if(dist[odds[i].id] < minDist) { minDist = dist[odds[i].id]; bestTargetIdx = i; }
        }
        
        if(bestTargetIdx !== -1) {
            let target = odds.splice(bestTargetIdx, 1)[0];
            let curr = target.id;
            while(curr !== start.id) {
                let p = prev[curr];
                let origEdge = nodes[curr].adj.find(e => (e.u===curr && e.v===p) || (e.v===curr && e.u===p));
                let isNowBridge = origEdge ? origEdge.isBridge : false;
                addEdge(curr, p, isNowBridge, true); 
                curr = p;
            }
        }
        
        passes++;
        if (passes % 10 === 0) {
            updateProgress(50 + Math.floor((1 - (odds.length / totalOdds)) * 30), 'Routage sur les lignes...');
            await new Promise(r => setTimeout(r, 0));
        }
    }

    updateProgress(85, 'Génération du chemin continu...');
    await new Promise(r => setTimeout(r, 50));

    nodes.forEach(n => {
        n.adj.sort((a, b) => {
            let scoreA = a.isBridge ? 1 : (a.isDuplicate ? 2 : 3);
            let scoreB = b.isBridge ? 1 : (b.isDuplicate ? 2 : 3);
            return scoreB - scoreA; 
        });
    });

    let validStartIdx = nodes.findIndex(n => n.adj.length > 0);
    if (validStartIdx === -1) { btn.disabled = false; pContainer.style.display = 'none'; return; }

    let stack = [validStartIdx]; let path = [];
    while(stack.length > 0) {
        let u = stack[stack.length - 1];
        let e = nodes[u].adj.find(ed => !ed.used);
        if(e) { e.used = true; stack.push(e.u === u ? e.v : e.u); } else path.push(stack.pop());
    }
    path.reverse();

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
    svgStrokes.push({isUserStroke: !curRed, isTravelLine: curRed, sunaeAbsPoints: curPts, createdAt: Date.now()+path.length});

    updateProgress(100, 'Terminé !');
    setTimeout(() => { pContainer.style.display = 'none'; btn.disabled = false; renderCanvas(); }, 800);
};

// --- AUTRES OUTILS ---
window.resetCanvas = () => { userStrokes = []; travelLines = []; svgStrokes = []; rawSvgPreview = []; renderCanvas(); };
window.undoStroke = () => { userStrokes.pop(); updateTravelLines(); renderCanvas(); };
window.resetSVG = () => { rawSvgPreview = []; svgStrokes = []; renderCanvas(); };

function setupBackgroundControls() {
    document.getElementById('bg-upload').onchange = (e) => {
        let r = new FileReader(); r.onload = (f) => { bgImageObj = new Image(); bgImageObj.onload = renderCanvas; bgImageObj.src = f.target.result; };
        r.readAsDataURL(e.target.files[0]);
    };
    ['scale', 'angle', 'pan-x', 'pan-y'].forEach(id => {
        document.getElementById('bg-' + id).oninput = function() {
            document.getElementById('val-' + id).innerText = this.value;
            if(id==='scale') bgScale=parseFloat(this.value); if(id==='angle') bgAngle=parseFloat(this.value);
            if(id==='pan-x') bgPanX=parseFloat(this.value); if(id==='pan-y') bgPanY=parseFloat(this.value);
            renderCanvas();
        };
    });
}

function setupSimulator() { document.getElementById('bille-slider').oninput = function() { simProgress = parseInt(this.value); renderCanvas(); }; }


// --- GESTION DYNAMIQUE DU TEXTE ---

window.resetTextGrid = function() {
    document.querySelectorAll('.sunae-letter-box').forEach(inp => inp.value = '');
    document.getElementById('export-filename').placeholder = "Texte_Sunae";
};

window.resetTextSliders = function() {
    if (!currentTable || !TABLE_CFG[currentTable]) return;
    let base = TABLE_CFG[currentTable];
    
    document.getElementById('slider-text-size').value = 100;
    document.getElementById('slider-text-count').value = 100;
    document.getElementById('slider-text-spacing').value = 100;
    
    let linesSlider = document.getElementById('slider-text-lines');
    linesSlider.max = base.rows.length;
    linesSlider.value = base.rows.length;
    
    updateTextTools(false);
};

window.updateTextTools = function(rebuild = true) {
    if (!currentTable || !TABLE_CFG[currentTable]) return;
    let base = TABLE_CFG[currentTable];
    
    let sizeVal = parseInt(document.getElementById('slider-text-size').value);
    let countVal = parseInt(document.getElementById('slider-text-count').value);
    let spacingVal = parseInt(document.getElementById('slider-text-spacing').value);
    let linesVal = parseInt(document.getElementById('slider-text-lines').value);
    
    // 1. Positionnement vertical des lignes
    let max_y = Math.max(...base.y_centers);
    let min_y = Math.min(...base.y_centers);
    let dynY = [];
    
    if (linesVal === 1) {
        dynY.push((max_y + min_y) / 2);
    } else {
        for (let i = 0; i < linesVal; i++) {
            let t = i / (linesVal - 1);
            dynY.push(max_y - t * (max_y - min_y));
        }
    }
    
    // 2. Contrainte verticale
    let max_h_allowed = Infinity;
    if (linesVal > 1) {
        let gap = (max_y - min_y) / (linesVal - 1);
        max_h_allowed = gap * 0.90; 
    } else {
        max_h_allowed = 1.5; 
    }
    
    let target_h = base.h * (sizeVal / 100);
    let target_w = base.w * (sizeVal / 100);
    
    let actual_h = Math.min(target_h, max_h_allowed);
    let actual_w = target_w * (actual_h / target_h); 
    
    dynamicCfg = JSON.parse(JSON.stringify(base));
    dynamicCfg.w = actual_w;
    dynamicCfg.h = actual_h;
    dynamicCfg.y_centers = dynY;
    
    let baseSpc = base.spacing === 0 ? 0.02 : base.spacing;
    dynamicCfg.spacing = baseSpc * (spacingVal / 100);
    if (base.spacing === 0 && spacingVal <= 100) dynamicCfg.spacing = 0;
    
    // 3. Contrainte horizontale
    let dynRows = [];
    let xmax_global = base.round ? 1.0 : base.aspect * (1.0 / Math.sqrt(base.aspect * base.aspect + 1));
    
    for (let i = 0; i < linesVal; i++) {
        let y = dynY[i];
        let available_width = 0;
        
        if (base.round) {
            let r_safe = 0.95; 
            if (Math.abs(y) < r_safe) {
                available_width = 2 * Math.sqrt(r_safe*r_safe - y*y); 
            }
        } else {
            available_width = 2 * xmax_global * 0.95; 
        }
        
        let max_fit = Math.floor((available_width + dynamicCfg.spacing) / (dynamicCfg.w + dynamicCfg.spacing));
        
        let baseIdx = linesVal === 1 ? Math.floor(base.rows.length / 2) : Math.round((i / (linesVal - 1)) * (base.rows.length - 1));
        let target_count = Math.max(1, Math.round(base.rows[baseIdx] * (countVal / 100)));
        
        let actual_count = Math.min(target_count, Math.max(0, max_fit));
        dynRows.push(actual_count);
    }
    dynamicCfg.rows = dynRows;
    
    document.getElementById('val-text-size').innerText = sizeVal;
    document.getElementById('val-text-count').innerText = countVal;
    document.getElementById('val-text-spacing').innerText = spacingVal;
    document.getElementById('val-text-lines').innerText = linesVal;
    
    if (rebuild) buildTextGrid();
};

function getGridText() {
    const cfg = dynamicCfg || TABLE_CFG[currentTable];
    if (!currentTable || !cfg) return "";
    let text = "";
    for (let r = 0; r < cfg.rows.length; r++) {
        for (let c = 0; c < cfg.rows[r]; c++) {
            let input = document.querySelector(`.sunae-letter-box[data-row="${r}"][data-col="${c}"]`);
            if (input && input.value && input.value.trim() !== "") text += input.value.trim();
        }
    }
    return text;
}

function buildTextGrid() {
    const grid = document.getElementById('text-grid-container');
    
    let oldText = "";
    document.querySelectorAll('.sunae-letter-box').forEach(inp => {
        if(inp.value.trim() !== "") oldText += inp.value.trim();
    });
    grid.innerHTML = ''; 
    
    const cfg = dynamicCfg || TABLE_CFG[currentTable];
    if (!cfg) return;

    const center_px = tableWidth / 2.0; 
    const center_py = tableHeight / 2.0;
    let xmax = cfg.round ? 1.0 : cfg.aspect * (1.0 / Math.sqrt(cfg.aspect * cfg.aspect + 1));
    const scale_px = (tableWidth / 2.0) / xmax;

    let charIndex = 0;

    for (let r = 0; r < cfg.rows.length; r++) {
        if (cfg.rows[r] <= 0) continue; 

        let start_x = -((cfg.rows[r] * (cfg.w + cfg.spacing)) - cfg.spacing) / 2.0;
        
        for (let c = 0; c < cfg.rows[r]; c++) {
            let px = center_px + (start_x + (c * (cfg.w + cfg.spacing)) + (cfg.w / 2.0)) * scale_px;
            let py = center_py - cfg.y_centers[r] * scale_px;
            
            let input = document.createElement('input');
            input.type = 'text'; input.maxLength = 1; input.className = 'sunae-letter-box';
            input.dataset.row = r; input.dataset.col = c;
            input.style.width = (cfg.w * scale_px) + 'px'; input.style.height = (cfg.h * scale_px) + 'px';
            input.style.left = (px - (cfg.w * scale_px) / 2) + 'px'; input.style.top = (py - (cfg.h * scale_px) / 2) + 'px';

            if (charIndex < oldText.length) {
                input.value = oldText[charIndex];
                charIndex++;
            }

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

window.exportTHR = function() {
    let customName = document.getElementById('export-filename').value.trim();
    let finalFileName = customName !== "" ? customName : (currentModule === 'Texte Automatique' ? (getGridText() || "Texte_Sunae") : getYYMMDD() + (currentModule === 'Fichier SVG' ? "_ConvertionSVG" : "_Freedrawing"));

    let exportData = { table: currentTable, module: currentModule, canvasWidth: tableWidth, canvasHeight: tableHeight };

    if (currentModule === 'Texte Automatique') {
        const cfg = dynamicCfg || TABLE_CFG[currentTable]; 
        let text_lines = [];
        for (let r = 0; r < cfg.rows.length; r++) {
            let rowText = "";
            for (let c = 0; c < cfg.rows[r]; c++) {
                let input = document.querySelector(`.sunae-letter-box[data-row="${r}"][data-col="${c}"]`);
                rowText += input && input.value ? input.value : " ";
            }
            text_lines.push(rowText);
        }
        exportData.text_lines = text_lines;
        exportData.dynamic_cfg = cfg; 
    } else {
        exportData.drawing = { objects: (currentModule === 'Fichier SVG' ? svgStrokes : [...travelLines, ...userStrokes]) };
    }

    // --- CORRECTIF SAFARI BLOB EXPORT ---
    fetch('/export-thr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(exportData) })
    .then(r => {
        if (!r.ok) throw new Error("Erreur de génération du fichier");
        return r.blob();
    })
    .then(blob => { 
        const fileBlob = new Blob([blob], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(fileBlob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url; 
        a.download = `${finalFileName.replace(/\s+/g, '_')}.thr`; 
        
        document.body.appendChild(a); 
        a.click(); 
        
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 200);
    })
    .catch(err => {
        console.error("Erreur lors de l'export :", err);
        alert("Une erreur est survenue lors de la création de votre fichier. Veuillez réessayer.");
    });
};
