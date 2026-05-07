// --- VARIABLES GLOBALES ---
let canvas = null;
let currentTable = null;
let currentModule = null;
let isRound = false;
let globalNativeStrokes = null; // Données géométriques pures

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

// --- EXTRACTION NATIVE DU SVG (ZÉRO FABRICJS) ---
function extractSVGData(svgString) {
    let parser = new DOMParser();
    let doc = parser.parseFromString(svgString, "image/svg+xml");
    let svgEl = doc.querySelector('svg');
    if(!svgEl) return null;

    // On crée un conteneur invisible pour que le navigateur puisse calculer les longueurs
    let container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.width = '0'; container.style.height = '0';
    container.style.overflow = 'hidden';
    container.innerHTML = svgString;
    document.body.appendChild(container);
    let realSvg = container.querySelector('svg');

    let elements = realSvg.querySelectorAll('path, line, polyline, polygon');
    let rawStrokes = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
        let strokesFromElement = [];
        if (el.tagName.toLowerCase() === 'path') {
            // Analyse des segments pour couper sur les MoveTo (M/m)
            let pathData = el.getAttribute('d');
            let tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            let segments = pathData.split(/[Mm]/); // Coupe sur les ordres de levée de crayon
            
            segments.forEach(seg => {
                if(!seg.trim()) return;
                tempPath.setAttribute('d', 'M' + seg);
                let len = tempPath.getTotalLength();
                if(len > 0.5) {
                    let pts = [];
                    for(let l=0; l<=len; l+=2) {
                        let p = tempPath.getPointAtLength(l);
                        pts.push({x: p.x, y: p.y});
                        if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
                        if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y;
                    }
                    rawStrokes.push(pts);
                }
            });
        } else {
            // Pour les lignes/polygones simples
            let len = (el.getTotalLength) ? el.getTotalLength() : 5; 
            let pts = [];
            for(let l=0; l<=len; l+=2) {
                let p = (el.getPointAtLength) ? el.getPointAtLength(l) : {x:0,y:0};
                pts.push({x: p.x, y: p.y});
                if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
                if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y;
            }
            rawStrokes.push(pts);
        }
    });

    document.body.removeChild(container);

    // Normalisation WYSIWYG
    let inkW = maxX - minX; let inkH = maxY - minY;
    let scale = Math.min((tableWidth * 0.8) / inkW, (tableHeight * 0.8) / inkH);
    
    return rawStrokes.map(stroke => stroke.map(p => ({
        x: (tableWidth / 2) + (p.x - (minX + inkW / 2)) * scale,
        y: (tableHeight / 2) + (p.y - (minY + inkH / 2)) * scale
    })));
}

// --- CHARGEMENT ---
const svgUploadInput = document.getElementById('svg-upload-file');
if (svgUploadInput) {
    svgUploadInput.addEventListener('change', function(e) {
        const reader = new FileReader();
        reader.onload = function(f) {
            globalNativeStrokes = extractSVGData(f.target.result);
            if(globalNativeStrokes) {
                canvas.clear();
                globalNativeStrokes.forEach(stroke => {
                    let pts = stroke.map(p => ({x: p.x, y: p.y}));
                    canvas.add(new fabric.Polyline(pts, { fill:null, stroke:'#9b59b6', strokeWidth:2, opacity:0.3, selectable:false }));
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
    const pBar = document.getElementById('svg-progress-bar');
    const warningDiv = document.getElementById('sunae-jump-warning');
    if(warningDiv) warningDiv.style.display = 'none';

    btn.disabled = true;
    
    let nodes = [];
    let edges = [];
    let spatialGrid = new Map();

    function getNodeId(p) {
        let key = `${Math.round(p.x*2)},${Math.round(p.y*2)}`;
        if(spatialGrid.has(key)) return spatialGrid.get(key);
        let id = nodes.length;
        nodes.push({ x: p.x, y: p.y, id, adj: [] });
        spatialGrid.set(key, id);
        return id;
    }

    // 1. On remplit le graphe
    globalNativeStrokes.forEach(stroke => {
        let prev = getNodeId(stroke[0]);
        for(let i=1; i<stroke.length; i++){
            let curr = getNodeId(stroke[i]);
            if(prev !== curr){
                let d = Math.hypot(nodes[prev].x - nodes[curr].x, nodes[prev].y - nodes[curr].y);
                let edge = { u: prev, v: curr, d, isBridge: false, used: false };
                nodes[prev].adj.push(edge); nodes[curr].adj.push(edge); edges.push(edge);
            }
            prev = curr;
        }
    });

    // 2. Kruskal (Liaison des zones)
    let parent = nodes.map((_, i) => i);
    function find(i) { return parent[i] === i ? i : (parent[i] = find(parent[i])); }
    edges.forEach(e => { let r1 = find(e.u), r2 = find(e.v); if(r1 !== r2) parent[r1] = r2; });
    
    let comps = new Map();
    nodes.forEach(n => { let r = find(n.id); if(!comps.has(r)) comps.set(r, []); comps.get(r).push(n.id); });

    let hasLongBridge = false;
    if(comps.size > 1) {
        let compArr = Array.from(comps.values());
        let bridges = [];
        for(let i=0; i<compArr.length; i++){
            for(let j=i+1; j<compArr.length; j++){
                let minD = Infinity, bestU, bestV;
                compArr[i].forEach(u => compArr[j].forEach(v => {
                    let d = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
                    if(d < minD){ minD = d; bestU = u; bestV = v; }
                }));
                bridges.push({u: bestU, v: bestV, d: minD, c1: i, c2: j});
            }
        }
        bridges.sort((a,b) => a.d - b.d);
        let cP = compArr.map((_, i) => i);
        function cf(i) { return cP[i] === i ? i : (cP[i] = cf(cP[i])); }
        bridges.forEach(b => {
            if(cf(b.c1) !== cf(b.c2)){
                cP[cf(b.c1)] = cf(b.c2);
                if(b.d > 40) hasLongBridge = true;
                let edge = { u: b.u, v: b.v, d: b.d, isBridge: true, used: false };
                nodes[b.u].adj.push(edge); nodes[b.v].adj.push(edge); edges.push(edge);
            }
        });
    }

    // 3. Dijkstra (Repassage forcé)
    let odds = nodes.filter(n => n.adj.length % 2 !== 0).map(n => n.id);
    while(odds.length > 0) {
        let start = odds.pop();
        let dists = new Float32Array(nodes.length).fill(Infinity);
        let prevs = new Int32Array(nodes.length).fill(-1);
        let pq = new MinHeap();
        dists[start] = 0; pq.push(start, 0);

        while(!pq.isEmpty()){
            let {id: u, dist} = pq.pop();
            if(dist > dists[u]) continue;
            nodes[u].adj.forEach(e => {
                let v = e.u === u ? e.v : e.u;
                let weight = e.isBridge ? e.d * 1000000 : e.d; // PÉNALITÉ MASSIVE
                if(dists[u] + weight < dists[v]){
                    dists[v] = dists[u] + weight;
                    prevs[v] = u; pq.push(v, dists[v]);
                }
            });
        }
        let target = -1, minD = Infinity, tIdx = -1;
        odds.forEach((id, idx) => { if(dists[id] < minD){ minD = dists[id]; target = id; tIdx = idx; }});
        if(target !== -1){
            odds.splice(tIdx, 1);
            let c = target;
            while(c !== start){
                let p = prevs[c];
                let orig = nodes[c].adj.find(e => (e.u===p && e.v===c) || (e.v===p && e.u===c));
                let edge = { u: p, v: c, d: orig.d, isBridge: orig.isBridge, isDuplicate: true, used: false };
                nodes[p].adj.push(edge); nodes[c].adj.push(edge); edges.push(edge);
                c = p;
            }
        }
    }

    // 4. Hierholzer (Chemin continu)
    function getScore(e) { if(e.isBridge) return 1; if(e.isDuplicate) return 2; return 3; }
    nodes.forEach(n => n.adj.sort((a,b) => getScore(b) - getScore(a)));

    let path = [], stack = [nodes[0].id];
    while(stack.length > 0){
        let u = stack[stack.length - 1];
        let next = nodes[u].adj.find(e => !e.used);
        if(next){ next.used = true; stack.push(next.u === u ? next.v : next.u); }
        else path.push(stack.pop());
    }

    // 5. Rendu FabricJS (uniquement pour l'affichage)
    canvas.clear();
    for(let i=0; i<path.length-1; i++){
        let u = path[i], v = path[i+1];
        let edge = edges.find(e => !e.rendered && ((e.u===u && e.v===v) || (e.v===u && e.u===v)));
        if(edge) edge.rendered = true;
        let isRed = edge ? edge.isBridge : false;
        canvas.add(new fabric.Line([nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y], {
            stroke: isRed ? 'red' : '#2980b9', strokeWidth: isRed ? 2 : 3,
            selectable: false, isUserStroke: !isRed, isTravelLine: isRed, sunaeAbsPoints: [nodes[u], nodes[v]]
        }));
    }

    if(hasLongBridge && warningDiv) {
        warningDiv.innerText = "⚠️ Attention : Image discontinue. Sauts > 3cm détectés.";
        warningDiv.style.display = 'block';
    }
    btn.disabled = false; btn.style.opacity = '1';
    canvas.renderAll();
};

// --- INITIALISATION ---
function setupWorkspace(tableName, round) {
    currentTable = tableName; isRound = round;
    const aspect = TABLE_CFG[tableName].aspect;
    let h = round ? tableWidth : tableWidth / aspect;
    if (canvas) canvas.dispose();
    canvas = new fabric.Canvas('sunae-canvas', { width: tableWidth, height: h, enableRetinaScaling: false, selection: false });
    document.getElementById('canvas-container').style.maxWidth = tableWidth + 'px';
}
