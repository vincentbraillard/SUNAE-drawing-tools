// --- VARIABLES GLOBALES ---
let canvas = null;
let currentTable = null;
let isRound = false;
let drawMode = 'freedraw'; 

// Variables pour l'outil "Ligne Droite"
let isDrawingLine = false;
let tempLine = null;

// Variables pour l'image de fond
let bgImageObj = null;

// --- 1. NAVIGATION DES ÉTAPES ---
function goToStep(step, moduleName = null) {
    document.querySelectorAll('.step-section').forEach(el => el.classList.remove('active'));
    document.getElementById('step-' + step).classList.add('active');
    
    if (moduleName) {
        document.getElementById('workspace-title').innerText = moduleName + " | " + currentTable;
        if (moduleName === 'Dessin Libre') {
            document.getElementById('module-dessin-libre').style.display = 'block';
        } else {
            document.getElementById('module-dessin-libre').style.display = 'none';
        }
    }
}

// --- 2. INITIALISATION DE L'ESPACE DE TRAVAIL ---
function setupWorkspace(tableName, round, w, h) {
    currentTable = tableName;
    isRound = round;
    
    document.getElementById('workspace-title').innerText = "Dessin Libre | " + currentTable;
    goToStep(3);

    if (canvas) {
        canvas.dispose();
    }

    const container = document.getElementById('canvas-container');
    container.style.width = w + 'px';
    container.style.height = h + 'px';
    container.style.borderRadius = isRound ? '50%' : '20px';
    container.style.overflow = 'hidden';

    canvas = new fabric.Canvas('sunae-canvas', {
        width: w,
        height: h,
        isDrawingMode: true,
        selection: false
    });

    if (isRound) {
        canvas.clipPath = new fabric.Circle({
            radius: w / 2,
            originX: 'center', originY: 'center',
            left: w / 2, top: h / 2
        });
    } else {
        canvas.clipPath = new fabric.Rect({
            width: w, height: h,
            rx: 20, ry: 20,
            originX: 'center', originY: 'center',
            left: w / 2, top: h / 2
        });
    }

    canvas.freeDrawingBrush.color = '#2980b9';
    canvas.freeDrawingBrush.width = 3;

    canvas.on('path:created', function(e) {
        e.path.set({ selectable: false, evented: false, isUserStroke: true });
        updateTravelLines();
    });

    canvas.on('mouse:down', function(o) {
        if (drawMode !== 'line' || document.getElementById('bille-slider').value < 100) return;
        isDrawingLine = true;
        var pointer = canvas.getPointer(o.e);
        var points = [pointer.x, pointer.y, pointer.x, pointer.y];
        tempLine = new fabric.Line(points, {
            strokeWidth: 3,
            fill: '#2980b9',
            stroke: '#2980b9',
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false,
            isUserStroke: true
        });
        canvas.add(tempLine);
    });

    canvas.on('mouse:move', function(o) {
        if (!isDrawingLine || drawMode !== 'line') return;
        var pointer = canvas.getPointer(o.e);
        tempLine.set({ x2: pointer.x, y2: pointer.y });
        canvas.renderAll();
    });

    canvas.on('mouse:up', function(o) {
        if (drawMode !== 'line') return;
        isDrawingLine = false;
        if (tempLine) {
            updateTravelLines();
        }
    });

    document.querySelectorAll('input[name="drawMode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            drawMode = this.value;
            canvas.isDrawingMode = (drawMode === 'freedraw' && document.getElementById('bille-slider').value == 100);
        });
    });

    setupBackgroundControls();
    setupSimulator();
}

// --- 3. LOGIQUE DES LIGNES ROUGES DE VOYAGE ---
function updateTravelLines() {
    const objects = canvas.getObjects();
    const travelLines = objects.filter(o => o.isTravelLine);
    travelLines.forEach(line => canvas.remove(line));

    const userStrokes = canvas.getObjects().filter(o => o.isUserStroke);
    
    for (let i = 1; i < userStrokes.length; i++) {
        const prevStroke = userStrokes[i - 1];
        const currStroke = userStrokes[i];
        
        let prevEnd, currStart;

        if (prevStroke.type === 'path') {
            const pathInfo = prevStroke.path[prevStroke.path.length - 1];
            prevEnd = { x: pathInfo[1], y: pathInfo[2] };
        } else if (prevStroke.type === 'line') {
            prevEnd = { x: prevStroke.x2, y: prevStroke.y2 };
        }

        if (currStroke.type === 'path') {
            const pathInfo = currStroke.path[0];
            currStart = { x: pathInfo[1], y: pathInfo[2] };
        } else if (currStroke.type === 'line') {
            currStart = { x: currStroke.x1, y: currStroke.y1 };
        }

        if (prevEnd && currStart) {
            const redLine = new fabric.Line([prevEnd.x, prevEnd.y, currStart.x, currStart.y], {
                stroke: 'red',
                strokeWidth: 2,
                strokeDashArray: [5, 5],
                opacity: 0.7,
                selectable: false,
                evented: false,
                isTravelLine: true,
                travelIndex: i - 1 // LE CORRECTIF EST ICI : Un numéro d'ordre strict
            });
            canvas.add(redLine);
            redLine.sendToBack();
        }
    }
    
    if (bgImageObj) bgImageObj.sendToBack();
    canvas.renderAll();
}

// --- 4. ACTIONS: UNDO ET RESET ---
function undoStroke() {
    const strokes = canvas.getObjects().filter(o => o.isUserStroke);
    if (strokes.length > 0) {
        const lastStroke = strokes[strokes.length - 1];
        canvas.remove(lastStroke);
        updateTravelLines();
    }
}

function resetCanvas() {
    const objects = canvas.getObjects();
    objects.forEach(o => {
        if (!o.isBackgroundImage) canvas.remove(o);
    });
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

        bgImageObj.set({
            scaleX: scale,
            scaleY: scale,
            angle: angle,
            left: (canvas.width / 2) + panX,
            top: (canvas.height / 2) - panY
        });
        
        canvas.renderAll();
    }

    uploadInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(f) {
            const data = f.target.result;
            fabric.Image.fromURL(data, function(img) {
                if (bgImageObj) canvas.remove(bgImageObj);
                
                bgImageObj = img;
                bgImageObj.set({
                    originX: 'center',
                    originY: 'center',
                    left: canvas.width / 2,
                    top: canvas.height / 2,
                    opacity: 0.5,
                    selectable: false,
                    evented: false,
                    isBackgroundImage: true
                });
                
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

// --- 6. LE SIMULATEUR ANIMÉ (Ordre Parfait) ---
function setupSimulator() {
    const slider = document.getElementById('bille-slider');
    
    let simOverlay = document.getElementById('sim-overlay');
    if (!simOverlay) {
        simOverlay = document.createElement('div');
        simOverlay.id = 'sim-overlay';
        simOverlay.style.position = 'absolute';
        simOverlay.style.top = '0';
        simOverlay.style.left = '0';
        simOverlay.style.width = '100%';
        simOverlay.style.height = '100%';
        simOverlay.style.pointerEvents = 'none';
        
        simOverlay.style.borderRadius = isRound ? '50%' : '20px';
        simOverlay.style.overflow = 'hidden';
        
        document.getElementById('canvas-container').appendChild(simOverlay);
    }
    
    slider.addEventListener('input', function() {
        const percent = parseInt(this.value);
        simOverlay.innerHTML = '';

        const strokes = canvas.getObjects().filter(o => o.isUserStroke);
        
        // LE CORRECTIF EST ICI : On force le tri des lignes rouges par leur numéro d'ordre
        const travels = canvas.getObjects()
            .filter(o => o.isTravelLine)
            .sort((a, b) => a.travelIndex - b.travelIndex);

        if (percent === 100) {
            canvas.isDrawingMode = (drawMode === 'freedraw');
            canvas.getObjects().forEach(o => {
                if (o.isUserStroke || o.isTravelLine) {
                    o.set({ opacity: (o.isTravelLine ? 0.7 : 1) });
                    if (o.type === 'path' && o.origPath) o.set({ path: o.origPath });
                    if (o.type === 'line' && o.origX2 !== undefined) o.set({ x2: o.origX2, y2: o.origY2 });
                }
            });
            canvas.renderAll();
            return;
        }

        canvas.isDrawingMode = false;
        
        let allSegments = [];
        for (let i = 0; i < strokes.length; i++) {
            if (i > 0 && travels[i-1]) allSegments.push(travels[i-1]);
            allSegments.push(strokes[i]);
        }

        let totalLength = 0;

        allSegments.forEach(seg => {
            if (seg.type === 'path' && !seg.origPath) seg.origPath = seg.path;
            if (seg.type === 'line' && seg.origX2 === undefined) {
                seg.origX1 = seg.x1; seg.origY1 = seg.y1;
                seg.origX2 = seg.x2; seg.origY2 = seg.y2;
            }

            if (seg.type === 'path') {
                seg.segmentLength = seg.origPath.length;
            } else if (seg.type === 'line') {
                const dist = Math.hypot(seg.origX2 - seg.origX1, seg.origY2 - seg.origY1);
                seg.segmentLength = Math.max(1, dist / 4);
            }
            totalLength += seg.segmentLength;
        });

        if (totalLength === 0) return;

        const targetLength = (percent / 100) * totalLength;
        let currentLength = 0;
        let currentDotPos = null;
        let startDotPos = null;

        allSegments.forEach((seg, index) => {
            if (index === 0) {
                 if (seg.type === 'path') startDotPos = {x: seg.origPath[0][1], y: seg.origPath[0][2]};
                 else if (seg.type === 'line') startDotPos = {x: seg.origX1, y: seg.origY1};
            }

            if (currentLength + seg.segmentLength <= targetLength) {
                seg.set({ opacity: (seg.isTravelLine ? 0.7 : 1) });
                if (seg.type === 'path') seg.set({ path: seg.origPath });
                if (seg.type === 'line') seg.set({ x2: seg.origX2, y2: seg.origY2 });

                if (seg.type === 'path') {
                    const lastCmd = seg.origPath[seg.origPath.length-1];
                    currentDotPos = {x: lastCmd[lastCmd.length-2], y: lastCmd[lastCmd.length-1]};
                } else if (seg.type === 'line') {
                    currentDotPos = {x: seg.origX2, y: seg.origY2};
                }
                currentLength += seg.segmentLength;
            }
            else if (currentLength < targetLength) {
                seg.set({ opacity: (seg.isTravelLine ? 0.7 : 1) });
                const remainingLength = targetLength - currentLength;
                const ratio = remainingLength / seg.segmentLength;

                if (seg.type === 'path') {
                    const cmdsToShow = Math.max(1, Math.floor(seg.origPath.length * ratio));
                    seg.set({ path: seg.origPath.slice(0, cmdsToShow) });

                    const lastCmd = seg.origPath[cmdsToShow - 1];
                    if (lastCmd && lastCmd.length >= 3) {
                        currentDotPos = {x: lastCmd[lastCmd.length-2], y: lastCmd[lastCmd.length-1]};
                    } else {
                        currentDotPos = {x: lastCmd[1], y: lastCmd[2]};
                    }
                } else if (seg.type === 'line') {
                    const newX2 = seg.origX1 + (seg.origX2 - seg.origX1) * ratio;
                    const newY2 = seg.origY1 + (seg.origY2 - seg.origY1) * ratio;
                    seg.set({ x2: newX2, y2: newY2 });
                    currentDotPos = {x: newX2, y: newY2};
                }
                currentLength += seg.segmentLength; 
            }
            else {
                seg.set({ opacity: 0 });
            }
        });

        let svgDots = '';
        if (targetLength > 0 && startDotPos) {
             svgDots += `<div style="position:absolute; width:12px; height:12px; background-color:#2ecc71; border-radius:50%; left:${startDotPos.x-6}px; top:${startDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        }
        if (currentDotPos) {
             svgDots += `<div style="position:absolute; width:12px; height:12px; background-color:#c0392b; border-radius:50%; left:${currentDotPos.x-6}px; top:${currentDotPos.y-6}px; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`;
        }
        simOverlay.innerHTML = svgDots;

        canvas.renderAll();
    });
}

// --- 7. EXPORTATION VERS FLASK ---
function exportTHR() {
    if (!canvas) return;

    document.getElementById('bille-slider').value = 100;
    document.getElementById('bille-slider').dispatchEvent(new Event('input'));

    const exportData = {
        table: currentTable,
        drawing: canvas.toJSON(['isUserStroke', 'isTravelLine', 'isBackgroundImage'])
    };

    fetch('/export-thr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData)
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
    })
    .catch(error => {
        console.error('Erreur:', error);
        alert("Erreur lors de la communication avec le serveur.");
    });
}
