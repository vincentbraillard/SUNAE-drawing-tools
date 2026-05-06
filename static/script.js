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

    canvas = new fabric.Canvas('sunae-canvas', {
        width: w,
        height: h,
        isDrawingMode: true,
        selection: false
    });

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
                isTravelLine: true
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

// --- 6. LE SIMULATEUR ANIMÉ (Au pixel près !) ---
function setupSimulator() {
    const slider = document.getElementById('bille-slider');
    
    // Ajout d'une div pour dessiner les points Vert/Rouge de la simulation
    let simOverlay = document.getElementById('sim-overlay');
    if (!simOverlay) {
        simOverlay = document.createElement('div');
        simOverlay.id = 'sim-overlay';
        simOverlay.style.position = 'absolute';
        simOverlay.style.top = '0';
        simOverlay.style.left = '0';
        simOverlay.style.width = '100%';
        simOverlay.style.height = '100%';
        simOverlay.style.pointerEvents = 'none'; // Laisse passer les clics
        document.getElementById('canvas-container').appendChild(simOverlay);
    }
    
    slider.addEventListener('input', function() {
        const percent = parseInt(this.value);
        simOverlay.innerHTML = ''; // Efface les anciens points

        // Mode Dessin
        if (percent === 100) {
            canvas.isDrawingMode = (drawMode === 'freedraw');
            canvas.getObjects().forEach(o => {
                if (o.isUserStroke || o.isTravelLine) {
                    o.set({ opacity: (o.isTravelLine ? 0.7 : 1) });
                    // On retire le "masquage" partiel
                    if(o.strokeDashArray && o.isUserStroke) o.strokeDashArray = null; 
                }
            });
            canvas.renderAll();
            return;
        }

        // Mode Simulation
        canvas.isDrawingMode = false;
        
        const strokes = canvas.getObjects().filter(o => o.isUserStroke);
        const travels = canvas.getObjects().filter(o => o.isTravelLine);
        
        let allSegments = [];
        let totalLength = 0;

        // 1. Calcul de la longueur totale de l'animation
        for (let i = 0; i < strokes.length; i++) {
            if (i > 0 && travels[i-1]) {
                const tr = travels[i-1];
                tr.segmentLength = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1);
                totalLength += tr.segmentLength;
                allSegments.push(tr);
            }
            
            const st = strokes[i];
            // Calcul approximatif de la longueur d'un Path (si ce n'est pas une ligne droite)
            let len = 0;
            if (st.type === 'path') {
                for(let j=1; j<st.path.length; j++) {
                     let p1 = st.path[j-1];
                     let p2 = st.path[j];
                     if(p1.length >=3 && p2.length >=3) {
                         len += Math.hypot(p2[1]-p1[1], p2[2]-p1[2]);
                     }
                }
            } else if (st.type === 'line') {
                len = Math.hypot(st.x2 - st.x1, st.y2 - st.y1);
            }
            // Si on n'arrive pas à calculer (très rare), on donne une valeur par défaut
            st.segmentLength = len > 0 ? len : 50; 
            totalLength += st.segmentLength;
            
            allSegments.push(st);
        }

        if (totalLength === 0) return;

        // Longueur que la bille doit avoir parcourue au moment T du slider
        const targetLength = (percent / 100) * totalLength;
        let currentLength = 0;
        let currentDotPos = null;
        let startDotPos = null;

        // 2. Affichage progressif ("Draw-on")
        allSegments.forEach((seg, index) => {
            const isTravel = seg.isTravelLine;
            
            // Si on récupère le premier point du premier segment
            if (index === 0) {
                 if (seg.type === 'path') startDotPos = {x: seg.path[0][1], y: seg.path[0][2]};
                 else if (seg.type === 'line') startDotPos = {x: seg.x1, y: seg.y1};
            }

            if (currentLength + seg.segmentLength <= targetLength) {
                // Segment complètement affiché
                seg.set({ opacity: (isTravel ? 0.7 : 1) });
                if(!isTravel) seg.strokeDashArray = null; // Affiche tout
                
                // Maj position bille
                if (seg.type === 'path') currentDotPos = {x: seg.path[seg.path.length-1][1], y: seg.path[seg.path.length-1][2]};
                else if (seg.type === 'line') currentDotPos = {x: seg.x2, y: seg.y2};
                
                currentLength += seg.segmentLength;
            } 
            else if (currentLength < targetLength) {
                // Segment PARTIELLEMENT affiché (La fameuse animation !)
                const remainingLength = targetLength - currentLength;
                
                seg.set({ opacity: (isTravel ? 0.7 : 1) });
                
                // On utilise la magie de strokeDashArray pour masquer le "futur" du trait
                seg.set('strokeDashArray', [remainingLength, seg.segmentLength]);
                
                // Calcul position approximative de la bille rouge sur ce segment
                let ratio = remainingLength / seg.segmentLength;
                if (seg.type === 'path') {
                    // Approximation simple pour les paths : on prend le point final du sous-segment
                    let targetCmdIndex = Math.floor(ratio * seg.path.length);
                    if(targetCmdIndex >= seg.path.length) targetCmdIndex = seg.path.length - 1;
                    if(seg.path[targetCmdIndex] && seg.path[targetCmdIndex].length >= 3) {
                         currentDotPos = {x: seg.path[targetCmdIndex][1], y: seg.path[targetCmdIndex][2]};
                    }
                } else if (seg.type === 'line' || isTravel) {
                    currentDotPos = {
                        x: seg.x1 + (seg.x2 - seg.x1) * ratio,
                        y: seg.y1 + (seg.y2 - seg.y1) * ratio
                    };
                }

                currentLength += seg.segmentLength; // On force à passer au Else
            } 
            else {
                // Segment dans le futur, totalement caché
                seg.set({ opacity: 0 });
            }
        });

        // 3. Dessin des points SVG par-dessus le canevas HTML5 (Point Vert / Rouge)
        let svgDots = '';
        if (targetLength > 0 && startDotPos) {
             svgDots += `<div style="position:absolute; width:12px; height:12px; background-color:#2ecc71; border-radius:50%; left:${startDotPos.x-6}px; top:${startDotPos.y-6}px;"></div>`;
        }
        if (currentDotPos) {
             svgDots += `<div style="position:absolute; width:12px; height:12px; background-color:#c0392b; border-radius:50%; left:${currentDotPos.x-6}px; top:${currentDotPos.y-6}px;"></div>`;
        }
        simOverlay.innerHTML = svgDots;

        canvas.renderAll();
    });
}

// --- 7. EXPORTATION VERS FLASK ---
function exportTHR() {
    if (!canvas) return;

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
