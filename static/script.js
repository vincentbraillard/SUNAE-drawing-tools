// VARIABLES GLOBALES
let canvas;
let activeModule = 'text'; // 'text' ou 'drawing'
let activeTable = 'Origin S';
let bgImage; // Stocke l'objet image de fond Fabric

// --- A. INITIALISATION ---

document.addEventListener('DOMContentLoaded', () => {
    initializeCanvas();
    updateUIForActiveModule();
    setupBackgroundControls();
    // Par défaut pour la démo, on simule l'état final de la table ronde
    updateTableInfo('Origin S', 600);
});

function initializeCanvas() {
    canvas = new fabric.Canvas('sunae-canvas', {
        width: 600,
        height: 600,
        backgroundColor: '#F4EBDA', // Couleur sable claire
        isDrawingMode: false // Désactivé par défaut (module texte)
    });
}

// --- B. GESTION DU LAYOUT (LA FONCTION CLÉ) ---

// Fonction qui masque les éléments selon le module actif
function updateUIForActiveModule() {
    console.log("Mise à jour de l'UI pour:", activeModule);
    
    // Titres de la bannière
    const moduleLabel = activeModule === 'text' ? 'Texte Automatique' : 'Dessin Libre';
    document.getElementById('txt-active-module').innerText = moduleLabel;
    document.getElementById('txt-active-table').innerText = activeTable;

    // Éléments à MASQUER en mode Texte
    const simPanel = document.getElementById('simulation-panel');
    const bgPanel = document.getElementById('background-image-panel');

    if (activeModule === 'text') {
        simPanel.classList.add('hidden'); // Masque la simulation
        bgPanel.classList.add('hidden');  // Masque l'image de fond
        
        // Active les outils texte, désactive les outils dessin
        document.getElementById('text-module-tools').classList.add('active');
        document.getElementById('drawing-module-tools').classList.remove('active');
        
        // Sécurité pour le canevas
        canvas.isDrawingMode = false;
    } 
    else { // Module Dessin Libre
        simPanel.classList.remove('hidden'); // Affiche la simulation
        bgPanel.classList.remove('hidden');  // Affiche l'image de fond
        
        // Active les outils dessin, désactive les outils texte
        document.getElementById('drawing-module-tools').classList.add('active');
        document.getElementById('text-module-tools').classList.remove('active');
    }
}

// --- C. OUTILS TEXTE AUTOMATIQUE ---

function addTextToCanvas() {
    const input = document.getElementById('text-input');
    const textStr = input.value || 'Sunae';
    
    const sText = new fabric.Text(textStr, {
        left: canvas.width / 2,
        top: canvas.height / 2,
        fill: '#34495E', // Couleur sombre pour simuler le creux
        fontFamily: 'Courier New, monospace',
        fontSize: 30,
        originX: 'center', originY: 'center',
        padding: 5
    });

    canvas.add(sText);
    canvas.setActiveObject(sText);
    canvas.renderAll();
}

function deleteSelectedText() {
    const activeObj = canvas.getActiveObject();
    if (activeObj && activeObj.type === 'text') {
        canvas.remove(activeObj);
        canvas.renderAll();
    }
}

function clearCanvasTextOnly() {
    canvas.getObjects('text').forEach(textObj => canvas.remove(textObj));
    canvas.renderAll();
}

// --- D. OUTILS DESSIN LIBRE (Masqués en mode texte) ---

function setDrawingMode(mode) {
    if (activeModule !== 'drawing') return; // Sécurité
    canvas.isDrawingMode = (mode === 'freedraw');
    // Logique supplémentaire pour les lignes droites ici...
}

function resetWorkspace() {
    canvas.clear();
    canvas.backgroundColor = '#F4EBDA';
    bgImage = null; // Reset image cache
    canvas.renderAll();
}

// --- E. CONTRÔLES IMAGE DE FOND (Masqués en mode texte) ---

function setupBackgroundControls() {
    const uploadInput = document.getElementById('bg-upload');
    const scaleSlider = document.getElementById('bg-scale');
    // ... rotation, panX, panY ...

    uploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || activeModule !== 'drawing') return; // Empêche l'import en mode texte

        const reader = new FileReader();
        reader.onload = (f) => {
            fabric.Image.fromURL(f.target.result, (img) => {
                // Supprime l'ancienne si elle existe
                if (bgImage) canvas.remove(bgImage);
                bgImage = img;
                bgImage.set({
                    left: canvas.width / 2, top: canvas.height / 2,
                    originX: 'center', originY: 'center',
                    selectable: false, evented: false, // Pas d'interaction directe
                    opacity: 0.5
                });
                canvas.add(bgImage);
                bgImage.sendToBack();
                canvas.renderAll();
            });
        };
        reader.readAsDataURL(file);
    });

    scaleSlider.addEventListener('input', (e) => {
        if (!bgImage) return;
        const scale = parseFloat(e.target.value);
        bgImage.scale(scale);
        canvas.renderAll();
    });
}

// --- F. UTILITAIRES ---

// Simulation du changement de table/canevas
function updateTableInfo(name, size) {
    activeTable = name;
    canvas.setDimensions({ width: size, height: size });
    canvas.renderAll();
}

// Fonction pour simuler le changement de module (pour tes tests)
function toggleActiveModule() {
    activeModule = activeModule === 'text' ? 'drawing' : 'text';
    updateUIForActiveModule();
}
