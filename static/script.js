
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

    // Si un canevas existe déjà, on le détruit pour repartir à zéro
    if (canvas) {
        canvas.dispose();
    }

    // Configurer la taille du conteneur HTML
    const container = document.getElementById('canvas-container');
    container.style.width = w + 'px';
    container.style.height = h + 'px';
    container.style.borderRadius = isRound ? '50%' : '20px';

    // Initialiser Fabric.js
    canvas = new fabric.Canvas('sunae-canvas', {
        width: w,
        height: h,
        isDrawingMode: true,
        selection: false // On ne veut pas sélectionner les traits pour les déplacer
    });

    // Paramètres du pinceau (Bleu Sunae, épaisseur 3)
    canvas.freeDrawingBrush.color = '#2980b9';
    canvas.freeDrawingBrush.width = 3;

    // Événements de dessin
    canvas.on('path:created', function(e) {
        e.path.set({ selectable: false, evented: false, isUserStroke: true });
        updateTravelLines();
    });

    // Événements pour l'outil Ligne Droite
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

    // Écouteurs pour les outils
    document.querySelectorAll('input[name="drawMode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            drawMode = this.value;
            canvas.isDrawingMode = (drawMode === 'freedraw' && document.getElementById('bille-slider').value == 100);
        });
    });

    setupBackgroundControls();
    setupSimulator();
}

// --- 3. LOGIQUE DES LIGNES ROUGES DE VOYAGE (En temps réel !) ---
function updateTravelLines() {
    // 1. Supprimer les anciennes lignes rouges
    const objects = canvas.getObjects();
    const travelLines = objects.filter(o => o.isTravelLine);
    travelLines.forEach(line => canvas.remove(line));

    // 2. Récupérer uniquement les vrais traits de l'utilisateur
    const userStrokes = canvas.getObjects().filter(o => o.isUserStroke);
    
    // 3. Calculer et dessiner les nouvelles lignes rouges
    for (let i = 1; i < userStrokes.length; i++) {
        const prevStroke = userStrokes[i - 1];
        const currStroke = userStrokes[i];
        
        let prevEnd, currStart;

        // Trouver la fin du trait précédent
        if (prevStroke.type === 'path') {
            const pathInfo = prevStroke.path[prevStroke.path.length - 1];
            prevEnd = { x: pathInfo[1], y: pathInfo[2] }; // X, Y du dernier point
        } else if (prevStroke.type === 'line') {
            prevEnd = { x: prevStroke.x2, y: prevStroke.y2 };
        }

        // Trouver le début du trait actuel
        if (currStroke.type === 'path') {
            const pathInfo = currStroke.path[0];
            currStart = { x: pathInfo[1], y: pathInfo[2] }; // X, Y du premier point
        } else if (currStroke.type === 'line') {
            currStart = { x: currStroke.x1, y: currStroke.y1 };
        }

        // Dessiner la ligne rouge traitillée
        if (prevEnd && currStart) {
            const redLine = new fabric.Line([prevEnd.x, prevEnd.y, currStart.x, currStart.y], {
                stroke: 'red',
                strokeWidth: 2,
                strokeDashArray: [5, 5],
                opacity: 0.7,
                selectable: false,
                evented: false,
                isTravelLine: true // Marqueur pour pouvoir l'effacer plus tard
            });
            canvas.add(redLine);
            redLine.sendToBack(); // On met la ligne rouge sous les traits bleus
        }
    }
    
    // On s'assure que l'image de fond reste tout derrière
    if (bgImageObj) bgImageObj.sendToBack();
    canvas.renderAll();
}

// --- 4. ACTIONS: UNDO ET RESET ---
function undoStroke() {
    const strokes = canvas.getObjects().filter(o => o.isUserStroke);
    if (strokes.length > 0) {
        const lastStroke = strokes[strokes.length - 1];
        canvas.remove(lastStroke);
        updateTravelLines(); // Recalcule les lignes rouges instantanément
    }
}

function resetCanvas() {
    // Garde uniquement l'image de fond s'il y en a une
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
                updateBgImage(); // Appliquer les sliders existants
            });
        };
        reader.readAsDataURL(file);
    });

    scaleSlider.addEventListener('input', updateBgImage);
    angleSlider.addEventListener('input', updateBgImage);
    panXSlider.addEventListener('input', updateBgImage);
    panYSlider.addEventListener('input', updateBgImage);
}

// --- 6. LE SIMULATEUR ANIMÉ (La Bille) ---
function setupSimulator() {
    const slider = document.getElementById('bille-slider');
    
    slider.addEventListener('input', function() {
        const percent = parseInt(this.value);
        
        // Mode Dessin
        if (percent === 100) {
            canvas.isDrawingMode = (drawMode === 'freedraw');
            canvas.getObjects().forEach(o => {
                if (o.isUserStroke || o.isTravelLine) o.set({ opacity: (o.isTravelLine ? 0.7 : 1) });
            });
            canvas.renderAll();
            return;
        }

        // Mode Simulation
        canvas.isDrawingMode = false;
        
        // On récupère tous les traits (bleus et rouges) triés chronologiquement
        const strokes = canvas.getObjects().filter(o => o.isUserStroke);
        const travels = canvas.getObjects().filter(o => o.isTravelLine);
        
        let allSegments = [];
        for (let i = 0; i < strokes.length; i++) {
            if (i > 0 && travels[i-1]) allSegments.push(travels[i-1]);
            allSegments.push(strokes[i]);
        }

        const totalSegments = allSegments.length;
        if (totalSegments === 0) return;

        const visibleCount = Math.floor((percent / 100) * totalSegments);

        allSegments.forEach((seg, index) => {
            if (index < visibleCount) {
                seg.set({ opacity: (seg.isTravelLine ? 0.7 : 1) }); // Afficher entièrement
            } else if (index === visibleCount) {
                // Pour une simulation encore plus fluide, on pourrait utiliser strokeDashArray ici, 
                // mais pour garantir 0 bug de rendu, on gère par trait entier dans cette version.
                seg.set({ opacity: 0.3 }); // Afficher le trait en cours en semi-transparent
            } else {
                seg.set({ opacity: 0 }); // Cacher les traits futurs
            }
        });

        canvas.renderAll();
    });
}

// --- 7. EXPORTATION VERS FLASK ---
function exportTHR() {
    if (!canvas) return;

    // On prépare les données à envoyer à Python
    const exportData = {
        table: currentTable,
        drawing: canvas.toJSON(['isUserStroke', 'isTravelLine', 'isBackgroundImage'])
    };

    // On envoie au serveur Python (app.py) via fetch API
    fetch('/export-thr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData)
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message); // Affiche le message de succès de Python
    })
    .catch(error => {
        console.error('Erreur:', error);
        alert("Erreur lors de la communication avec le serveur.");
    });
}
