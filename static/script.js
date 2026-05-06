// --- VARIABLES GLOBALES ---
let canvas = null;
let currentTable = null;
let currentModule = null;
let isRound = false;
let drawMode = 'freedraw'; 

let isDrawingLine = false;
let tempLine = null;
let bgImageObj = null;

// Configurations des grilles de texte importées du Python
const TABLE_CFG = {
    "Origin S": { round: true, rows: [6, 8, 8, 6], y_centers: [0.45, 0.15, -0.15, -0.45], w: 0.20, h: 0.24, spacing: 0.00, aspect: 1.0 },
    "Dimension S": { round: false, rows: [14, 14, 14], y_centers: [0.25, 0.0, -0.25], w: 0.11, h: 0.15, spacing: 0.015, aspect: 1300.0 / 600.0 },
    "Dimension L": { round: false, rows: [20, 20, 20, 20], y_centers: [0.27, 0.09, -0.09, -0.27], w: 0.075, h: 0.11, spacing: 0.01, aspect: 1900.0 / 900.0 }
};

// --- FONCTION DE SÉCURITÉ DES BORDURES ---
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

// --- 1. NAVIGATION DES ÉTAPES ---
function goToStep(step, moduleName = null) {
    document.querySelectorAll('.step-section').forEach(el => el.classList.remove('active'));
    document.getElementById('step-' + step).classList.add('active');
    
    if (moduleName) {
        currentModule = moduleName;
        document.getElementById('workspace-title').innerText = currentModule + " | " + currentTable;
        document.getElementById('module-workspace').style.display = 'block';

        const simSection = document.getElementById('simulation-section');
        const simHr = document.getElementById('sim-hr');
        const bgSection = document.getElementById('background-section');
        const toolsDessin = document.getElementById('tools-dessin');
        const toolsTexte = document.getElementById('tools-texte');
        const gridContainer = document.getElementById('text-grid-container');

        if (currentModule === 'Texte Automatique') {
            simSection.style.display = 'none';
            simHr.style.display = 'none';
            bgSection.style.display = 'none';
            toolsDessin.style.display = 'none';
            
            toolsTexte.style.display = 'block';
            if (canvas) {
                canvas.isDrawingMode = false;
                canvas.clear(); 
            }
            setTimeout(buildTextGrid, 50); 
            
        } else {
            simSection.style.display = 'block';
            simHr.style.display = 'block';
            bgSection.style.display = 'block';
            toolsDessin.style.display = 'block';
            
            toolsTexte.style.display = 'none';
            gridContainer.innerHTML = ''; 
            if (canvas) {
                canvas.isDrawingMode = (drawMode === 'freedraw');
                updateTravelLines();
            }
        }
    }
}

// --- GÉNÉRATION DE LA GRILLE WYSIWYG ---
function buildTextGrid() {
    const grid = document.getElementById('text-grid-container');
    grid.innerHTML = '';
    const cfg = TABLE_CFG[currentTable];
    if (!cfg) return;

    const center_px = canvas.width / 2.0;
    const center_py = canvas.height / 2.0;
    
    let xmax = 1.0;
    if (!cfg.round) {
        let ymax = 1.0 / Math.sqrt(cfg.aspect * cfg.aspect + 1);
        xmax = cfg.aspect * ymax;
    }
    const scale_px = (canvas.width / 2.0) / xmax;

    const entry_w = cfg.w * scale_px;
    const entry_h = cfg.h * scale_px;

    for (let r = 0; r < cfg.rows.length; r++) {
        let length = cfg.rows[r];
        let y_center = cfg.y_centers[r];
        let total_width = (length * (cfg.w + cfg.spacing)) - cfg.spacing;
        let start_x = -(total_width / 2.0);

        for (let c = 0; c < length; c++) {
            let char_x = start_x + (c * (cfg.w + cfg.spacing));
            let center_cx = char_x + (cfg.w / 2.0);
            
            let px = center_px + center_cx * scale_px;
            let py = center_py - y_center * scale_px;

            let input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 1;
            input.className = 'sunae-letter-box';
            input.dataset.row = r;
            input.dataset.col = c;
            
            input.style.width = entry_w + 'px';
            input.style.height = entry_h + 'px';
            input.style.left = (px - entry_w / 2) + 'px';
            input.style.top = (py - entry_h / 2) + 'px';

            input.addEventListener('keyup', function(e) {
                if (['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                this.value = this.value.toUpperCase();
                
                if (this.value.length === 1) {
                    let next = document.querySelector(`.sunae-letter-box[data-row="${r}"][data-col="${c+1}"]`);
                    if (!next) next = document.querySelector(`.sunae-letter-box[data-row="${r+1}"][data-col="0"]`);
                    if (next) next.focus();
                }
            });

            grid.appendChild(input);
        }
    }
}

window.resetTextGrid = function() {
    document.querySelectorAll('.sunae-letter-box').forEach(input => input.value = '');
}

// --- 2. INITIALISATION DE L'ESPACE DE TRAVAIL ---
function setupWorkspace(tableName, round, w, h) {
    currentTable = tableName;
    isRound = round;
    
    goToStep(3, currentModule || 'Dessin Libre');

    if (canvas) canvas.dispose();

    const container = document.getElementById('canvas-container');
    container.style.width = w + 'px';
    container.style.height = h + 'px';
    container.style.borderRadius = isRound ? '50%' : '20px';

    canvas = new fabric.Canvas('sunae-canvas', {
        width: w, height: h,
        isDrawingMode: (currentModule === 'Dessin Libre' && drawMode === 'freedraw'),
        selection: false
    });

    if (isRound) canvas.clipPath = new fabric.Circle({ radius: w / 2, originX: 'center', originY: 'center', left: w / 2, top: h / 2 });
    else canvas.clipPath = new fabric.Rect({ width: w, height: h, rx: 20, ry: 20, originX: 'center', originY: 'center', left: w / 2, top: h / 2 });

    canvas.freeDrawingBrush.color = '#2980b9';
    canvas.freeDrawingBrush.width = 3;

    // --- GESTION DU DESSIN LIBRE (CORRECTION DU SAUT DE TRACÉ) ---
    canvas.on('path:created', function(e) {
        if (currentModule !== 'Dessin Libre') return;
        
        let pathObj = e.path;
        let absPoints = []; 

        // On calcule les points absolus (bloqués aux bords) SANS MODIFIER LE TRAIT VISUEL !
        for (let i = 0; i < pathObj.path.length; i++) {
            let cmd = pathObj.path[i];
            if (cmd[0] === 'M' || cmd[0] === 'L') {
                let relX = cmd[1] - pathObj.pathOffset.x;
                let relY = cmd[2] - pathObj.pathOffset.y;
                let pt = fabric.util.transformPoint(new fabric.Point(relX, relY), pathObj.calcTransformMatrix());
                let p = sanitizeCoordinates(pt.x, pt.y, isRound, canvas.width, canvas.height);
                absPoints.push({x: p.x, y: p.y});
            } else if (cmd[0] === 'Q') {
                let crX = cmd[1] - pathObj.pathOffset.x;
                let crY = cmd[2] - pathObj.pathOffset.y;
                let cpt = fabric.util.transformPoint(new fabric.Point(crX, crY), pathObj.calcTransformMatrix());
                let cp = sanitizeCoordinates(cpt.x, cpt.y, isRound, canvas.width, canvas.height);
                
                let rX = cmd[3] - pathObj.pathOffset.x;
                let rY = cmd[4] - pathObj.pathOffset.y;
                let pt = fabric.util.transformPoint(new fabric.Point(rX, rY), pathObj.calcTransformMatrix());
                let p = sanitizeCoordinates(pt.x, pt.y, isRound, canvas.width, canvas.height);
                absPoints.push({x: p.x, y: p.y}); 
            }
        }

        pathObj.set({
            selectable: false, 
            isUserStroke: true, 
            createdAt: Date.now(),
            sunaeAbsPoints: absPoints // Sauvegardé silencieusement pour le serveur
        });
        
        pathObj.absStartX = absPoints[0].x; 
        pathObj.absStartY = absPoints[0].y;
        pathObj.absEndX = absPoints[absPoints.length - 1].x; 
        pathObj.absEndY = absPoints[absPoints.length - 1].y;

        updateTravelLines();
    });

    canvas.on('mouse:down', function(o) {
        if (currentModule !== 'Dessin Libre' || drawMode !== 'line' || document.getElementById('bille-slider').value < 100) return;
        isDrawingLine = true;
        var pointer = canvas.getPointer(o.e);
        let p = sanitizeCoordinates(pointer.x, pointer.y, isRound, canvas.width, canvas.height);
        tempLine = new fabric.Line([p.x, p.y, p.x, p.y], {
            strokeWidth: 3, fill: '#2980b9', stroke: '#2980b9', originX: 'center', originY: 'center',
            selectable: false, evented: false, isUserStroke: true, createdAt: Date.now()
        });
        canvas.add(tempLine);
    });

    canvas.on('mouse:move', function(o) {
        if (!isDrawingLine) return;
        var pointer = canvas.getPointer(o.e);
        let p = sanitizeCoordinates(pointer.x, pointer.y, isRound, canvas.width, canvas.height);
        tempLine.set({ x2: p.x, y2: p.y });
        canvas.renderAll();
    });

    canvas.on('mouse:up', function() {
        if (!isDrawingLine) return;
        isDrawingLine = false;
        if (tempLine) updateTravelLines();
    });

    document.querySelectorAll('input[name="drawMode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            drawMode = this.value;
            if(currentModule === 'Dessin Libre') {
                canvas.isDrawingMode = (drawMode === 'freedraw' && document.getElementById('bille-slider').value == 100);
            }
        });
    });

    setupBackgroundControls();
    setupSimulator();
    if (currentModule === 'Texte Automatique') buildTextGrid();
}

// --- FONCTIONS MATHÉMATIQUES ---
function getStrokeStart(stroke) {
    if (stroke.type === 'path') return { x: stroke.absStartX, y: stroke.absStartY };
    else return { 
        x: stroke.origX1 !== undefined ? stroke.origX1 : stroke.x1, 
        y: stroke.origY1 !== undefined ? stroke.origY1 : stroke.y1 
    };
}

function getStrokeEnd(stroke) {
    if (stroke.type === 'path') return { x: stroke.absEndX, y: stroke.absEndY };
    else return { 
        x: stroke.origX2 !== undefined ? stroke.origX2 : stroke.x2, 
        y: stroke.origY2 !== undefined ? stroke.origY2 : stroke.y2 
    };
}

// --- 3. LOGIQUE DES LIGNES ROUGES ---
function updateTravelLines() {
    canvas.getObjects().filter(o => o.isTravelLine).forEach(line => canvas.remove(line));

    const userStrokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
    
    for (let i = 1; i < userStrokes.length; i++) {
        const prevEnd = getStrokeEnd(userStrokes[i - 1]);
        const currStart = getStrokeStart(userStrokes[i]);

        if (prevEnd && currStart) {
            const redLine = new fabric.Line([prevEnd.x, prevEnd.y, currStart.x, currStart.y], {
                stroke: 'red', strokeWidth: 2, strokeDashArray: [5, 5], opacity: 0.7,
                selectable: false, evented: false, isTravelLine: true, travelIndex: i - 1
            });
            canvas.add(redLine);
            redLine.sendToBack();
        }
    }
    if (bgImageObj) bgImageObj.sendToBack();
    canvas.renderAll();
}

// --- 4. ACTIONS: UNDO ET RESET ---
window.undoStroke = function() {
    const strokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
    if (strokes.length > 0) {
        canvas.remove(strokes[strokes.length - 1]);
        updateTravelLines();
    }
}

window.resetCanvas = function() {
    canvas.getObjects().forEach(o => { if (!o.isBackgroundImage) canvas.remove(o); });
    canvas.renderAll();
}

// --- 5. GESTION DE L'IMAGE DE FOND ---
function setupBackgroundControls() {
    const uploadInput = document.getElementById('bg-upload');
    const scaleSlider = document.getElementById('bg-scale');
    const angleSlider = document.getElementById('bg-angle');
    const panXSlider = document.getElementById('bg-pan-x');
    const panYSlider = document.getElementById('bg-pan-y');

    function updateBgImage() {
        if (!bgImageObj) return;
        const scale = parseFloat(scaleSlider.value);
        const angle = parseInt(angleSlider.value);
        const panX = parseInt(panXSlider.value);
        const panY = parseInt(panYSlider.value);
        document.getElementById('val-scale').innerText = scale.toFixed(2);
        document.getElementById('val-angle').innerText = angle;
        document.getElementById('val-pan-x').innerText = panX;
        document.getElementById('val-pan-y').innerText = panY;

        bgImageObj.set({ scaleX: scale, scaleY: scale, angle: angle, left: (canvas.width / 2) + panX, top: (canvas.height / 2) - panY });
        canvas.renderAll();
    }

    uploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(f) {
            fabric.Image.fromURL(f.target.result, function(img) {
                if (bgImageObj) canvas.remove(bgImageObj);
                bgImageObj = img;
                bgImageObj.set({ originX: 'center', originY: 'center', left: canvas.width / 2, top: canvas.height / 2, opacity: 0.5, selectable: false, evented: false, isBackgroundImage: true });
                canvas.add(bgImageObj);
                bgImageObj.sendToBack();
                updateBgImage();
            });
        };
        reader.readAsDataURL(file);
    });

    scaleSlider.addEventListener('input', updateBgImage);
    angleSlider.addEventListener('input', updateBgImage);
    panXSlider.addEventListener('input', updateBgImage);
    panYSlider.addEventListener('input', updateBgImage);
}

// --- 6. LE SIMULATEUR ANIMÉ ---
function setupSimulator() {
    const slider = document.getElementById('bille-slider');
    let simOverlay = document.getElementById('sim-overlay');
    if (!simOverlay) {
        simOverlay = document.createElement('div');
        simOverlay.id = 'sim-overlay';
        simOverlay.style.position = 'absolute'; simOverlay.style.top = '0'; simOverlay.style.left = '0';
        simOverlay.style.width = '100%'; simOverlay.style.height = '100%'; simOverlay.style.pointerEvents = 'none';
        simOverlay.style.borderRadius = isRound ? '50%' : '20px'; simOverlay.style.overflow = 'hidden';
        document.getElementById('canvas-container').appendChild(simOverlay);
    }
    
    slider.addEventListener('input', function() {
        if (currentModule !== 'Dessin Libre') return; 

        const percent = parseInt(this.value);
        simOverlay.innerHTML = '';

        const strokes = canvas.getObjects().filter(o => o.isUserStroke).sort((a, b) => a.createdAt - b.createdAt);
        const travels = canvas.getObjects().filter(o => o.isTravelLine).sort((a, b) => a.travelIndex - b.travelIndex);

        if (percent === 100) {
            canvas.isDrawingMode = (drawMode === 'freedraw');
            canvas.getObjects().forEach(o => {
                if (o.isUserStroke || o.isTravelLine) {
                    o.set({ opacity: (o.isTravelLine ? 0.7 : 1) });
                    if (o.type === 'path' && o.origPath) o.set({ path: o.origPath });
                    if ((o.type === 'line' || o.isTravelLine) && o.origX2 !== undefined) o.set({ x2: o.origX2, y2: o.origY2 });
                }
            });
            canvas.renderAll();
            return;
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
            if (seg.type === 'path' && !seg.origPath) seg.origPath = seg.path;
            if ((seg.type === 'line' || seg.isTravelLine) && seg.origX2 === undefined) {
                seg.origX1 = seg.x1; seg.origY1 = seg.y1; seg.origX2 = seg.x2; seg.origY2 = seg.y2;
            }

            if (seg.type === 'path') seg.segmentLength = seg.origPath.length;
            else if (seg.type === 'line' || seg.isTravelLine) {
                seg.segmentLength = Math.max(1, Math.hypot(seg.origX2 - seg.origX1, seg.origY2 - seg.origY1) / 4);
            }
            totalLength += seg.segmentLength;
        });

        if (totalLength === 0) return;
        const targetLength = (percent / 100) * totalLength;
        let currentLength = 0; let currentDotPos = null; let startDotPos = null;

        allSegments.forEach((seg, index) => {
            if (index === 0) startDotPos = getStrokeStart(seg);

            if (currentLength + seg.segmentLength <= targetLength) {
                seg.set({ opacity: (seg.isTravelLine ? 0.7 : 1) });
                if (seg.type === 'path') seg.set({ path: seg.origPath });
                if (seg.type === 'line' || seg.isTravelLine) seg.set({ x2: seg.origX2, y2: seg.origY2 });
                currentDotPos = getStrokeEnd(seg);
                currentLength += seg.segmentLength;
            }
            else if (currentLength < targetLength) {
                seg.set({ opacity: (seg.isTravelLine ? 0.7 : 1) });
                const remainingLength = targetLength - currentLength;
                const ratio = remainingLength / seg.segmentLength;

                if (seg.type === 'path') {
                    const cmdsToShow = Math.max(1, Math.floor(seg.origPath.length * ratio));
                    const currentPath = seg.origPath.slice(0, cmdsToShow);
                    seg.set({ path: currentPath });

                    const lastCmd = currentPath[cmdsToShow - 1];
                    if (lastCmd && lastCmd.length >= 3) currentDotPos = {x: lastCmd[lastCmd.length-2], y: lastCmd[lastCmd.length-1]};
                    else currentDotPos = {x: lastCmd[1], y: lastCmd[2]};
                    
                    const offsetX = seg.left - seg.pathOffset.x;
                    const offsetY = seg.top - seg.pathOffset.y;
                    currentDotPos = { x: currentDotPos.x + offsetX, y: currentDotPos.y + offsetY };
                    
                } else if (seg.type === 'line' || seg.isTravelLine) {
                    const sx = seg.origX1 !== undefined ? seg.origX1 : seg.x1;
                    const sy = seg.origY1 !== undefined ? seg.origY1 : seg.y1;
                    const ex = seg.origX2 !== undefined ? seg.origX2 : seg.x2;
                    const ey = seg.origY2 !== undefined ? seg.origY2 : seg.y2;

                    const newX = sx + (ex - sx) * ratio;
                    const newY = sy + (ey - sy) * ratio;

                    seg.set({ x2: newX, y2: newY });
                    currentDotPos = {x: newX, y: newY};
                }
                currentLength += seg.segmentLength; 
            }
            else {
                seg.set({ opacity: 0 });
            }
        });

        let svgDots = '';
        if (targetLength > 0 && startDotPos) svgDots += `<div style="position:absolute; width:12px; height:12px; background-color:#2ecc71; border-radius:50%; left:${startDotPos.x-6}px; top:${startDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        if (currentDotPos) svgDots += `<div style="position:absolute; width:12px; height:12px; background-color:#c0392b; border-radius:50%; left:${currentDotPos.x-6}px; top:${currentDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        simOverlay.innerHTML = svgDots;

        canvas.renderAll();
    });
}

// --- 7. EXPORTATION VERS FLASK ---
window.exportTHR = function() {
    let exportData = {
        table: currentTable,
        module: currentModule
    };

    if (currentModule === 'Texte Automatique') {
        const cfg = TABLE_CFG[currentTable];
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
    } else {
        if (!canvas) return;
        document.getElementById('bille-slider').value = 100;
        document.getElementById('bille-slider').dispatchEvent(new Event('input'));
        
        exportData.drawing = canvas.toJSON(['isUserStroke', 'isTravelLine', 'isBackgroundImage', 'createdAt', 'sunaeAbsPoints']);
    }

    fetch('/export-thr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData)
    })
    .then(response => {
        if (!response.ok) throw new Error("Erreur serveur");
        return response.blob();
    })
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        let safeModuleName = currentModule ? currentModule.replace(/\s+/g, '_') : 'Export';
        a.download = `Sunae_${safeModuleName}.thr`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    })
    .catch(error => {
        console.error('Erreur:', error);
        alert("Erreur lors de la génération du fichier .THR.");
    });
}
