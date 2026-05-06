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
            if (input && input.value && input.value.trim() !== "") {
                text += input.value.trim();
            }
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

// === GESTION DE L'UI ===
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

// --- MODULE SVG & TSP (ASYNCHRONE ULTRA RAPIDE + CENTRAGE CORRIGÉ) ---
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

window.optimizeSVG = async function() {
    if(!currentSvgGroup) return;

    const btn = document.getElementById('btn-optimize-svg');
    const pContainer = document.getElementById('svg-progress-container');
    const pBar = document.getElementById('svg-progress-bar');
    const pText = document.getElementById('svg-progress-text');

    btn.disabled = true;
    btn.style.opacity = '0.5';
    pContainer.style.display = 'block';
    
    function updateProgress(pct, textMsg) {
        pBar.style.width = pct + '%';
        pText.innerText = textMsg + ' (' + pct + '%)';
    }

    updateProgress(0, 'Analyse géométrique...');
    await new Promise(r => setTimeout(r, 50)); 
    
    let matrix = currentSvgGroup.calcTransformMatrix();
    let rawStrokes = [];
    
    let objectsToProcess = currentSvgGroup.getObjects ? currentSvgGroup.getObjects() : [currentSvgGroup];
    if(currentSvgGroup.type === 'path') objectsToProcess = [currentSvgGroup];

    // --- 1. LECTURE DES POINTS BRUTS ET NORMALISATION GEOMETRIQUE (Secret Sandify #2) ---
    // Nous ne utilisons pas les propriétés Fabric.js visuelles pour le positionnement final.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for(let i=0; i<objectsToProcess.length; i++) {
        let obj = objectsToProcess[i];
        let objMat = fabric.util.multiplyTransformMatrices(matrix, obj.calcTransformMatrix());
        
        if (obj.type === 'path') {
            let currentStroke = [];
            obj.path.forEach(cmd => {
                let px, py;
                if (cmd[0] === 'M' || cmd[0] === 'L') { px = cmd[1]; py = cmd[2]; }
                else if (cmd[0] === 'Q') { px = cmd[3]; py = cmd[4]; }
                else if (cmd[0] === 'C') { px = cmd[5]; py = cmd[6]; }
                else if (cmd[0] === 'Z' || cmd[0] === 'z') {
                    if (currentStroke.length > 0) currentStroke.push(currentStroke[0]);
                    if (currentStroke.length > 1) {
                        rawStrokes.push([...currentStroke]);
                        currentStroke.forEach(p => {
                            minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                            maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
                        });
                    }
                    currentStroke = []; return;
                } else return;

                if (px !== undefined && py !== undefined) {
                    let ptX = px; let ptY = py;
                    if (obj.pathOffset) { ptX -= obj.pathOffset.x; ptY -= obj.pathOffset.y; }
                    let transformed = fabric.util.transformPoint({x: ptX, y: ptY}, objMat);
                    // On ne clampe pas encore aux bords de la table, on garde les coordonnées absolues
                    currentStroke.push(transformed);
                }
            });
            if (currentStroke.length > 1) {
                rawStrokes.push([...currentStroke]);
                currentStroke.forEach(p => {
                    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
                });
            }
        }
        // ... (lecture identique pour polygon, polyline, line, avec mise à jour min/max x/y)
    }

    if (rawStrokes.length === 0) { btn.disabled = false; btn.style.opacity = '1'; pContainer.style.display = 'none'; return; }

    // --- 2. REPOSITIONNEMENT ET REDIMENSIONNEMENT (SANDIFY METHOD) ---
    // On calcule l'échelle pour remplir 90% de la table, et on centre géométriquement.
    const center_px = canvas.width / 2.0; const center_py = canvas.height / 2.0;
    const padding = 20; const targetW = canvas.width - padding * 2; const targetH = canvas.height - padding * 2;
    const srcW = maxX - minX; const srcH = maxY - minY;
    
    const scale = Math.min(targetW / srcW, targetH / srcH);
    const offsetX = center_px - (minX + srcW / 2) * scale;
    const offsetY = center_py - (minY + srcH / 2) * scale;

    let strokes = rawStrokes.map(stroke => {
        return stroke.map(p => {
            // Transformation géométrique globale pour centrer et redimensionner
            let pt = { x: p.x * scale + offsetX, y: p.y * scale + offsetY };
            // Ensuite, on applique sanitizeCoordinates pour le clamping aux bords de la table
            return sanitizeCoordinates(pt.x, pt.y, isRound, canvas.width, canvas.height);
        });
    });

    // ... (3. TSP : CHEMIN LE PLUS COURT, ALGO IDENTIQUE ULTRA RAPIDE)

    // ... (4. DESSIN SUR LE CANEVAS, LIGNES BLEUES ET ROUGES, ALGO IDENTIQUE)
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
        let offsetX = pathObj.left - pathObj.pathOffset.x;
        let offsetY = pathObj.top - pathObj.pathOffset.y;
        let absPoints = []; 

        for (let i = 0; i < pathObj.path.length; i++) {
            let cmd = pathObj.path[i];
            if (cmd[0] === 'M' || cmd[0] === 'L') {
                let p = sanitizeCoordinates(cmd[1] + offsetX, cmd[2] + offsetY, isRound, canvas.width, canvas.height);
                absPoints.push({x: p.x, y: p.y});
            } else if (cmd[0] === 'Q') {
                let p = sanitizeCoordinates(cmd[3] + offsetX, cmd[4] + offsetY, isRound, canvas.width, canvas.height);
                absPoints.push({x: p.x, y: p.y}); 
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

// --- MOTEUR SANDIFY : ROUTAGE PAR LE PÉRIMÈTRE EXTERIEUR (SECRET SANDIFY #3) ---
function getPerimeterTravel(p1, p2, round, w, h) {
    let cx = w / 2, cy = h / 2;
    let th1 = Math.atan2(p1.y - cy, p1.x - cx);
    let th2 = Math.atan2(p2.y - cy, p2.x - cx);
    let dTh = th2 - th1;
    if (dTh > Math.PI) dTh -= 2 * Math.PI;
    if (dTh < -Math.PI) dTh += 2 * Math.PI;
    
    let steps = Math.max(10, Math.floor(Math.abs(dTh) * 20)); 
    let R_route = round ? (w/2 - 2) : Math.max(w, h); 
    let pts = [p1];
    
    for(let i=0; i<=steps; i++) {
        let px = cx + R_route * Math.cos(th1 + dTh * (i / steps));
        let py = cy + R_route * Math.sin(th1 + dTh * (i / steps));
        pts.push(sanitizeCoordinates(px, py, round, w, h)); 
    }
    pts.push(p2);
    return pts;
}

function updateTravelLines() {
    canvas.getObjects().filter(o => o.isTravelLine).forEach(line => canvas.remove(line));
    const userStrokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
    
    for (let i = 1; i < userStrokes.length; i++) {
        let s1 = userStrokes[i - 1].sunaeAbsPoints;
        let s2 = userStrokes[i].sunaeAbsPoints;
        
        if(s1 && s2 && s1.length > 0 && s2.length > 0) {
            // C'est ici que l'on remplace la ligne droite rouge par le périmètre (Sandify)
            let pts = getPerimeterTravel(s1[s1.length-1], s2[0], isRound, canvas.width, canvas.height);
            let d = "M " + pts[0].x + " " + pts[0].y;
            for(let j=1; j<pts.length; j++) d += " L " + pts[j].x + " " + pts[j].y;
            
            const redLine = new fabric.Path(d, {
                stroke: 'red', strokeWidth: 2, strokeDashArray: [5, 5], fill: '', opacity: 0.7,
                selectable: false, evented: false, isTravelLine: true, travelIndex: i - 1, sunaeAbsPoints: pts
            });
            canvas.add(redLine); redLine.sendToBack();
        }
    }
    if (bgImageObj) bgImageObj.sendToBack();
    canvas.renderAll();
}

// ... (setupSimulator, exportTHR IDENTIQUES)
