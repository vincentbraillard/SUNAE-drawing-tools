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

const TABLE_CFG = {
    "Origin S": { round: true, rows: [6, 8, 8, 6], y_centers: [0.45, 0.15, -0.15, -0.45], w: 0.20, h: 0.24, spacing: 0.00, aspect: 1.0 },
    "Dimension S": { round: false, rows: [14, 14, 14], y_centers: [0.25, 0.0, -0.25], w: 0.11, h: 0.15, spacing: 0.015, aspect: 1300.0 / 600.0 },
    "Dimension L": { round: false, rows: [20, 20, 20, 20], y_centers: [0.27, 0.09, -0.09, -0.27], w: 0.075, h: 0.11, spacing: 0.01, aspect: 1900.0 / 900.0 }
};

// --- HELPERS : NOM DU FICHIER ---
function getYYMMDD() {
    const d = new Date();
    return String(d.getFullYear()).slice(-2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}

function getGridText() {
    if (!currentTable || !TABLE_CFG[currentTable]) return "";
    const cfg = TABLE_CFG[currentTable];
    let text = "";
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

    const center_px = canvas.width / 2.0; const center_py = canvas.height / 2.0;
    let xmax = cfg.round ? 1.0 : cfg.aspect * (1.0 / Math.sqrt(cfg.aspect * cfg.aspect + 1));
    const scale_px = (canvas.width / 2.0) / xmax;

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
                currentSvgGroup.set({
                    left: canvas.width / 2, top: canvas.height / 2,
                    originX: 'center', originY: 'center',
                    borderColor: '#9b59b6', cornerColor: '#9b59b6', transparentCorners: false
                });
                let scale = Math.min(canvas.width / currentSvgGroup.width, canvas.height / currentSvgGroup.height) * 0.8;
                currentSvgGroup.scale(scale);
                canvas.add(currentSvgGroup); canvas.setActiveObject(currentSvgGroup); canvas.renderAll();
            });
        };
        reader.readAsText(file);
    });
}

// --- ALGORITHME SANDIFY : EXTRACTION WYSIWYG + VRAI 2-OPT ---
window.optimizeSVG = async function() {
    if(!currentSvgGroup) return;

    const btn = document.getElementById('btn-optimize-svg');
    const pContainer = document.getElementById('svg-progress-container');
    const pBar = document.getElementById('svg-progress-bar');
    const pText = document.getElementById('svg-progress-text');

    btn.disabled = true; btn.style.opacity = '0.5'; pContainer.style.display = 'block';
    
    function updateProgress(pct, textMsg) {
        pBar.style.width = pct + '%'; pText.innerText = textMsg + ' (' + pct + '%)';
    }

    updateProgress(0, 'Extraction des tracés (WYSIWYG)...');
    await new Promise(r => setTimeout(r, 50)); 
    
    let rawStrokes = [];
    let objectsToProcess = currentSvgGroup._objects || [currentSvgGroup];

    // 1. EXTRACTION PARFAITE (CORRECTION DU DÉCALAGE ET DE L'ÉCHELLE)
    // En lisant directement la matrice absolue de chaque objet, on supprime la double échelle !
    for(let i=0; i<objectsToProcess.length; i++) {
        let obj = objectsToProcess[i];
        let objMat = obj.calcTransformMatrix(); 
        
        if (obj.type === 'path') {
            // Découpage propre des sous-chemins
            let subPaths = [];
            let currentPathCmds = [];
            obj.path.forEach(cmd => {
                if ((cmd[0] === 'M' || cmd[0] === 'm') && currentPathCmds.length > 0) {
                    subPaths.push(currentPathCmds);
                    currentPathCmds = [cmd];
                } else {
                    currentPathCmds.push(cmd);
                }
            });
            if(currentPathCmds.length > 0) subPaths.push(currentPathCmds);

            let svgNS = "http://www.w3.org/2000/svg";
            for(let sp of subPaths) {
                let pathEl = document.createElementNS(svgNS, "path");
                pathEl.setAttribute('d', sp.map(cmd => cmd.join(' ')).join(' '));
                let len = pathEl.getTotalLength();
                if(len > 1) {
                    let pts = [];
                    let step = 2; // Haute Résolution
                    for(let l=0; l<=len; l+=step) {
                        let pt = pathEl.getPointAtLength(l);
                        let ptX = pt.x; let ptY = pt.y;
                        if(obj.pathOffset) { ptX -= obj.pathOffset.x; ptY -= obj.pathOffset.y; }
                        let transformed = fabric.util.transformPoint({x: ptX, y: ptY}, objMat);
                        pts.push(sanitizeCoordinates(transformed.x, transformed.y, isRound, canvas.width, canvas.height));
                    }
                    let pt = pathEl.getPointAtLength(len);
                    let ptX = pt.x; let ptY = pt.y;
                    if(obj.pathOffset) { ptX -= obj.pathOffset.x; ptY -= obj.pathOffset.y; }
                    let transformed = fabric.util.transformPoint({x: ptX, y: ptY}, objMat);
                    pts.push(sanitizeCoordinates(transformed.x, transformed.y, isRound, canvas.width, canvas.height));
                    
                    if(pts.length > 1) rawStrokes.push(pts);
                }
            }
        }
        else if (obj.type === 'polygon' || obj.type === 'polyline') {
            let pts = obj.points.map(pt => {
                let ptX = pt.x; let ptY = pt.y;
                if (obj.pathOffset) { ptX -= obj.pathOffset.x; ptY -= obj.pathOffset.y; }
                let transformed = fabric.util.transformPoint({x: ptX, y: ptY}, objMat);
                return sanitizeCoordinates(transformed.x, transformed.y, isRound, canvas.width, canvas.height);
            });
            if (obj.type === 'polygon' && pts.length > 0) pts.push(pts[0]);
            if (pts.length > 1) rawStrokes.push(pts);
        }
        else if (obj.type === 'line') {
            let p1x = obj.x1, p1y = obj.y1, p2x = obj.x2, p2y = obj.y2;
            if (obj.pathOffset) { p1x -= obj.pathOffset.x; p1y -= obj.pathOffset.y; p2x -= obj.pathOffset.x; p2y -= obj.pathOffset.y; }
            let t1 = fabric.util.transformPoint({x: p1x, y: p1y}, objMat);
            let t2 = fabric.util.transformPoint({x: p2x, y: p2y}, objMat);
            rawStrokes.push([
                sanitizeCoordinates(t1.x, t1.y, isRound, canvas.width, canvas.height),
                sanitizeCoordinates(t2.x, t2.y, isRound, canvas.width, canvas.height)
            ]);
        }
    }

    if (rawStrokes.length === 0) { btn.disabled = false; btn.style.opacity = '1'; pContainer.style.display = 'none'; return; }

    updateProgress(20, 'Tri Initial (Nearest Neighbor)...');
    await new Promise(r => setTimeout(r, 20));

    // 2. TSP : NEAREST NEIGHBOR PURE (Distance Euclidienne)
    function dist(p1, p2) { return Math.hypot(p1.x - p2.x, p1.y - p2.y); }

    let optimized = [];
    let unvisited = [...rawStrokes];
    optimized.push(unvisited.shift());
    
    let totalStrokes = unvisited.length;
    let processedStrokes = 0;

    while(unvisited.length > 0) {
        let currEnd = optimized[optimized.length-1][optimized[optimized.length-1].length-1];
        let bestIdx = -1, bestDist = Infinity, reverse = false;
        
        for(let i=0; i<unvisited.length; i++) {
            let s = unvisited[i];
            let dStart = dist(s[0], currEnd);
            let dEnd = dist(s[s.length-1], currEnd);
            if(dStart < bestDist) { bestDist = dStart; bestIdx = i; reverse = false; }
            if(dEnd < bestDist) { bestDist = dEnd; bestIdx = i; reverse = true; }
        }
        
        let nextStroke = unvisited.splice(bestIdx, 1)[0];
        if(reverse) nextStroke.reverse();
        optimized.push(nextStroke);

        processedStrokes++;
        if (processedStrokes % 50 === 0) {
            updateProgress(20 + Math.floor((processedStrokes / totalStrokes) * 30), 'Tri Initial...');
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // 3. 2-OPT (LE VRAI CORRECTIF DE SANDIFY POUR DEMELER LES LIGNES ROUGES)
    updateProgress(50, 'Démêlage des tracés (2-Opt)...');
    await new Promise(r => setTimeout(r, 20));

    let improved = true;
    let passes = 0;
    while(improved && passes < 15) { 
        improved = false;
        passes++;
        
        for (let i = 0; i < optimized.length - 1; i++) {
            for (let k = i + 1; k < optimized.length; k++) {
                let currEnd = optimized[i][optimized[i].length - 1];
                let nextStart = optimized[i + 1][0];
                let kEnd = optimized[k][optimized[k].length - 1];
                let kNextStart = (k + 1 < optimized.length) ? optimized[k + 1][0] : null;

                // VRAIE Mathématique 2-Opt pour tracer les graphes ouverts
                let d1 = dist(currEnd, nextStart);
                let d2 = kNextStart ? dist(kEnd, kNextStart) : 0;
                let currentTotal = d1 + d2;

                let new_d1 = dist(currEnd, kEnd);
                let new_d2 = kNextStart ? dist(nextStart, kNextStart) : 0;
                let newTotal = new_d1 + new_d2;

                if (newTotal < currentTotal - 0.001) {
                    // On retourne l'ordre des traits ET les points à l'intérieur
                    let subArray = optimized.slice(i + 1, k + 1);
                    subArray.reverse();
                    subArray.forEach(stroke => stroke.reverse());
                    optimized.splice(i + 1, k - i, ...subArray);
                    improved = true;
                }
            }
        }
        updateProgress(50 + Math.min(40, passes * 3), 'Optimisation 2-Opt...');
        await new Promise(r => setTimeout(r, 0));
    }

    updateProgress(90, 'Génération du dessin...');
    await new Promise(r => setTimeout(r, 20));

    currentSvgGroup.set({opacity: 0, selectable: false, evented: false});
    
    // 4. DESSIN WYSIWYG
    optimized.forEach((stroke, i) => {
        let d = "M " + stroke[0].x + " " + stroke[0].y;
        for(let j=1; j<stroke.length; j++) d += " L " + stroke[j].x + " " + stroke[j].y;
        let pathObj = new fabric.Path(d, {
            fill: null, stroke: '#2980b9', strokeWidth: 3, strokeLineCap: 'round', strokeLineJoin: 'round',
            selectable: false, isUserStroke: true, createdAt: Date.now() + i, sunaeAbsPoints: stroke
        });
        canvas.add(pathObj);
    });

    updateTravelLines();

    updateProgress(100, 'Terminé !');
    setTimeout(() => { pContainer.style.display = 'none'; btn.disabled = false; btn.style.opacity = '1'; }, 1000);
};

window.resetSVG = function() {
    if(currentSvgGroup) canvas.remove(currentSvgGroup);
    currentSvgGroup = null;
    resetCanvas();
}

// --- INITIALISATION DU CANEVAS ---
function setupWorkspace(tableName, round, w, h) {
    currentTable = tableName; isRound = round;
    goToStep(3, currentModule || 'Dessin Libre');

    if (canvas) canvas.dispose();
    const container = document.getElementById('canvas-container');
    container.style.width = w + 'px'; container.style.height = h + 'px';
    container.style.borderRadius = isRound ? '50%' : '20px';

    canvas = new fabric.Canvas('sunae-canvas', {
        width: w, height: h, isDrawingMode: (currentModule === 'Dessin Libre' && drawMode === 'freedraw'), selection: false
    });

    if (isRound) canvas.clipPath = new fabric.Circle({ radius: w / 2, originX: 'center', originY: 'center', left: w / 2, top: h / 2 });
    else canvas.clipPath = new fabric.Rect({ width: w, height: h, rx: 20, ry: 20, originX: 'center', originY: 'center', left: w / 2, top: h / 2 });

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
                absPoints.push(sanitizeCoordinates(p.x, p.y, isRound, canvas.width, canvas.height));
            } else if (cmd[0] === 'Q') {
                let p = fabric.util.transformPoint({x: cmd[3] - pathObj.pathOffset.x, y: cmd[4] - pathObj.pathOffset.y}, objMat);
                absPoints.push(sanitizeCoordinates(p.x, p.y, isRound, canvas.width, canvas.height)); 
            }
        }

        pathObj.set({ selectable: false, isUserStroke: true, createdAt: Date.now(), sunaeAbsPoints: absPoints });
        updateTravelLines();
    });

    canvas.on('mouse:down', function(o) {
        if (currentModule !== 'Dessin Libre' || drawMode !== 'line' || document.getElementById('bille-slider').value < 100) return;
        isDrawingLine = true; let p = sanitizeCoordinates(canvas.getPointer(o.e).x, canvas.getPointer(o.e).y, isRound, canvas.width, canvas.height);
        tempLine = new fabric.Line([p.x, p.y, p.x, p.y], { strokeWidth: 3, fill: '#2980b9', stroke: '#2980b9', originX: 'center', originY: 'center', selectable: false, evented: false, isUserStroke: true, createdAt: Date.now() });
        canvas.add(tempLine);
    });

    canvas.on('mouse:move', function(o) {
        if (!isDrawingLine) return;
        let p = sanitizeCoordinates(canvas.getPointer(o.e).x, canvas.getPointer(o.e).y, isRound, canvas.width, canvas.height);
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
                bgImageObj.set({ originX: 'center', originY: 'center', left: canvas.width / 2, top: canvas.height / 2, opacity: 0.5, selectable: false, evented: false, isBackgroundImage: true });
                canvas.add(bgImageObj); bgImageObj.sendToBack(); canvas.renderAll();
            });
        };
        reader.readAsDataURL(e.target.files[0]);
    });
}

// --- LIGNES DE VOYAGE ---
function getStrokeStart(stroke) {
    if (stroke.type === 'path' && stroke.sunaeAbsPoints && stroke.sunaeAbsPoints.length > 0) return stroke.sunaeAbsPoints[0];
    return { x: stroke.origX1 !== undefined ? stroke.origX1 : stroke.x1, y: stroke.origY1 !== undefined ? stroke.origY1 : stroke.y1 };
}

function getStrokeEnd(stroke) {
    if (stroke.type === 'path' && stroke.sunaeAbsPoints && stroke.sunaeAbsPoints.length > 0) return stroke.sunaeAbsPoints[stroke.sunaeAbsPoints.length - 1];
    return { x: stroke.origX2 !== undefined ? stroke.origX2 : stroke.x2, y: stroke.origY2 !== undefined ? stroke.origY2 : stroke.y2 };
}

function updateTravelLines() {
    canvas.getObjects().filter(o => o.isTravelLine).forEach(line => canvas.remove(line));

    const userStrokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
    
    for (let i = 1; i < userStrokes.length; i++) {
        const prevEnd = getStrokeEnd(userStrokes[i - 1]);
        const currStart = getStrokeStart(userStrokes[i]);

        if (prevEnd && currStart) {
            const redLine = new fabric.Line([prevEnd.x, prevEnd.y, currStart.x, currStart.y], {
                stroke: 'red', strokeWidth: 2, strokeDashArray: [5, 5], opacity: 0.7,
                selectable: false, evented: false, isTravelLine: true, travelIndex: i - 1,
                sunaeAbsPoints: [prevEnd, currStart] // Indispensable pour la simulation
            });
            canvas.add(redLine);
            redLine.sendToBack();
        }
    }
    if (bgImageObj) bgImageObj.sendToBack();
    canvas.renderAll();
}

// --- LE SIMULATEUR ANIMÉ ---
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
        const strokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
        const travels = canvas.getObjects().filter(o => o.isTravelLine).sort((a, b) => a.travelIndex - b.travelIndex);

        if (percent === 100) {
            if (currentModule === 'Dessin Libre') canvas.isDrawingMode = (drawMode === 'freedraw');
            canvas.getObjects().forEach(o => {
                if (o.isUserStroke || o.isTravelLine) {
                    o.set({ opacity: (o.isTravelLine ? 0.7 : 1) });
                    if (o.type === 'path' && o.origPath) {
                        o.set({ path: o.origPath, left: o.origLeft, top: o.origTop, pathOffset: new fabric.Point(o.origPathOffset.x, o.origPathOffset.y), width: o.origWidth, height: o.origHeight });
                    }
                    if ((o.type === 'line' || o.isTravelLine) && o.origX2 !== undefined) o.set({ x2: o.origX2, y2: o.origY2 });
                }
            });
            canvas.renderAll(); return;
        }

        canvas.isDrawingMode = false;
        
        let allSegments = [];
        for (let i = 0; i < strokes.length; i++) {
            if (i > 0) {
                const exactTravel = travels.find(t => t.travelIndex === i - 1);
                if (exactTravel) allSegments.push(exactTravel);
            }
            allSegments.push(strokes[i]);
        }

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
    
    let exportData = { table: currentTable, module: currentModule, canvasWidth: canvas ? canvas.width : 600, canvasHeight: canvas ? canvas.height : 600 };

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
