// --- VARIABLES GLOBALES ---
let canvas = null;
let currentTable = null;
let currentModule = null;
let isRound = false;
let globalNativeStrokes = null; 

// --- VERROU MATHÉMATIQUE ---
const tableWidth = 600;
const tableHeight = 600;

const TABLE_CFG = {
    "Origin S": { round: true, aspect: 1.0 },
    "Dimension S": { round: false, aspect: 1300.0 / 600.0 },
    "Dimension L": { round: false, aspect: 1900.0 / 900.0 }
};

// --- DIJKSTRA MIN-HEAP ---
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

// --- FONCTIONS DE NAVIGATION (RÉPARÉES) ---
function goToStep(step, moduleName = null) {
    document.querySelectorAll('.step-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('step-' + step);
    if(target) target.classList.add('active');
    
    if (moduleName) {
        currentModule = moduleName;
        document.getElementById('workspace-title').innerText = currentModule + " | " + currentTable;
        document.getElementById('module-workspace').style.display = 'block';
        
        // Cacher/Montrer les outils spécifiques
        document.getElementById('tools-svg').style.display = (moduleName === 'Fichier SVG') ? 'block' : 'none';
        
        if (canvas) { canvas.clear(); }
    }
}

// --- EXTRACTION NATIVE DU SVG (ZÉRO TRAIT PARASITE) ---
function extractSVGData(svgString) {
    let container = document.createElement('div');
    container.style.position = 'absolute'; container.style.visibility = 'hidden';
    container.innerHTML = svgString;
    document.body.appendChild(container);
    let svgEl = container.querySelector('svg');
    if(!svgEl) return null;

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

        // COUPE STRICTE SUR LES MOVE-TO
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

    let inkW = maxX - minX, inkH = maxY - minY;
    let scale = Math.min((tableWidth * 0.85) / inkW, (tableHeight * 0.85) / inkH);
    return rawStrokes.map(s => s.map(p => ({
        x: (tableWidth/2) + (p.x - (minX + inkW/2)) * scale,
        y: (tableHeight/2) + (p.y - (minY + inkH/2)) * scale
    })));
}

// --- CHARGEMENT ---
const svgUploadInput = document.getElementById('svg-upload-file');
if (svgUploadInput) {
    svgUploadInput.addEventListener('change', function(e) {
        const reader = new FileReader();
        reader.onload = function(f) {
            globalNativeStrokes = extractSVGData(f.target.result);
            if(canvas) {
                canvas.clear();
                globalNativeStrokes.forEach(s => {
                    canvas.add(new fabric.Polyline(s, { fill:null, stroke:'#9b59b6', strokeWidth:2, opacity:0.4, selectable:false }));
                });
                canvas.renderAll();
            }
        };
        reader.readAsText(e.target.files[0]);
    });
}

// --- MOTEUR DE CALCUL ---
window.optimizeSVG = async function() {
    if(!globalNativeStrokes) return;
    const btn = document.getElementById('btn-optimize-svg');
    const warningDiv = document.getElementById('sunae-jump-warning');
    if(warningDiv) warningDiv.style.display = 'none';
    btn.disabled = true;

    let nodes = [], edges = [], spatialGrid = new Map();
    function getNodeId(p) {
        let k = `${Math.round(p.x*10)},${Math.round(p.y*10)}`;
        if(spatialGrid.has(k)) return spatialGrid.get(k);
        let id = nodes.length;
        nodes.push({ x: p.x, y: p.y, id, adj: [] });
        spatialGrid.set(k, id); return id;
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

    let parent = nodes.map((_, i) => i);
    function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
    edges.forEach(e => { let r1 = find(e.u), r2 = find(e.v); if(r1 !== r2) parent[r1] = r2; });
    
    let comps = new Map();
    nodes.forEach(n => { let r = find(n.id); if(!comps.has(r)) comps.set(r, []); comps.get(r).push(n.id); });

    let hasLongBridge = false;
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
                if(b.d > 40) hasLongBridge = true;
                let e = { u: b.u, v: b.v, d: b.d, isBridge: true, used: false };
                nodes[b.u].adj.push(e); nodes[b.v].adj.push(e); edges.push(e);
            }
        });
    }

    let odds = nodes.filter(n => n.adj.length % 2 !== 0).map(n => n.id);
    while(odds.length > 0) {
        let start = odds.pop(), dists = new Float32Array(nodes.length).fill(Infinity), prevs = new Int32Array(nodes.length).fill(-1);
        let pq = new MinHeap(); dists[start] = 0; pq.push(start, 0);
        while(!pq.isEmpty()) {
            let {id: u, dist} = pq.pop();
            if(dist > dists[u]) continue;
            nodes[u].adj.forEach(e => {
                let v = e.u === u ? e.v : e.u;
                let w = e.isBridge ? e.d * 1000000 : e.d; // PÉNALITÉ ANTI-SAUT
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

    function getScore(e) { if(e.isBridge) return 1; if(e.isDuplicate) return 2; return 3; }
    nodes.forEach(n => n.adj.sort((a,b) => getScore(b) - getScore(a)));

    let path = [], stack = [nodes[0].id];
    while(stack.length > 0) {
        let u = stack[stack.length - 1], next = nodes[u].adj.find(e => !e.used);
        if(next) { next.used = true; stack.push(next.u === u ? next.v : next.u); }
        else path.push(stack.pop());
    }

    canvas.clear();
    for(let i=0; i<path.length-1; i++) {
        let u = path[i], v = path[i+1];
        let e = edges.find(e => !e.rendered && ((e.u===u && e.v===v) || (e.v===u && e.u===v)));
        if(edge) edge.rendered = true;
        let isRed = e ? e.isBridge : false;
        canvas.add(new fabric.Line([nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y], {
            stroke: isRed ? 'red' : '#2980b9', strokeWidth: isRed ? 2 : 3, selectable: false,
            isUserStroke: !isRed, isTravelLine: isRed, sunaeAbsPoints: [nodes[u], nodes[v]]
        }));
    }

    if(hasLongBridge && warningDiv) {
        warningDiv.innerText = "⚠️ Attention : Image discontinue. Sauts > 3cm détectés.";
        warningDiv.style.display = 'block';
    }
    btn.disabled = false; canvas.renderAll();
};

// --- INITIALISATION ---
function setupWorkspace(tableName, round) {
    currentTable = tableName; isRound = round;
    const aspect = TABLE_CFG[tableName].aspect;
    let h = round ? tableWidth : tableWidth / aspect;
    if (canvas) canvas.dispose();
    canvas = new fabric.Canvas('sunae-canvas', { width: tableWidth, height: h, enableRetinaScaling: false, selection: false });
    document.getElementById('canvas-container').style.maxWidth = tableWidth + 'px';
    
    // Aller à l'étape du choix de module
    goToStep(2);
}
