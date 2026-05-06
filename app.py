from flask import Flask, render_template, request, send_file
import io
import math
import json

app = Flask(__name__)

# =====================================================================
# 1. TON DICTIONNAIRE DE LETTRES SUNAE (À COPIER DEPUIS TON ANCIEN SCRIPT)
# =====================================================================
# Remplace ce faux dictionnaire par ton vrai dictionnaire de lettres continues.
# Exemple : "A": [[x1, y1], [x2, y2]...]
SUNAE_FONT = {
    "A": [[0, 1], [0.5, 0], [1, 1], [0.8, 0.5], [0.2, 0.5]], # Faux tracé d'exemple
    "B": [[0, 1], [0, 0], [0.8, 0], [1, 0.2], [0.8, 0.5], [0, 0.5], [1, 0.7], [0.8, 1], [0, 1]],
    " ": [] # Espace vide
}

# =====================================================================
# 2. TES FONCTIONS MATHÉMATIQUES (À COPIER DEPUIS TON ANCIEN SCRIPT)
# =====================================================================
def cartesian_to_thetarho(x, y, center_x, center_y, max_radius):
    """
    Convertit des coordonnées cartésiennes (X, Y) en polaires (Theta, Rho)
    Rho doit être compris entre 0.0 (centre) et 1.0 (bord).
    """
    # Recentrage
    dx = x - center_x
    dy = y - center_y
    
    # Inversion de l'axe Y (car en web le Y descend, sur la table il monte)
    dy = -dy 
    
    # Calcul de la distance au centre (Rho)
    distance = math.hypot(dx, dy)
    rho = distance / max_radius
    if rho > 1.0: rho = 1.0 # Sécurité ultime
    
    # Calcul de l'angle (Theta)
    theta = math.atan2(dy, dx)
    
    return theta, rho

def format_thr_line(theta, rho):
    """Formate la ligne au standard Sandify/Sunae"""
    return f"{theta:.5f} {rho:.5f}\n"


# =====================================================================
# 3. LE MOTEUR DU SERVEUR FLASK (NE PAS MODIFIER)
# =====================================================================
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/export-thr', methods=['POST'])
def export_thr():
    data = request.json
    table_type = data.get('table')
    module_name = data.get('module')
    objects = data.get('drawing', {}).get('objects', [])

    # Définition des dimensions physiques selon le choix de la table
    is_round = False
    if table_type == "Origin S":
        w, h = 600, 600
        is_round = True
    elif table_type == "Dimension S":
        w, h = 700, 350
    elif table_type == "Dimension L":
        w, h = 800, 400
    else:
        w, h = 600, 600 # Fallback par défaut

    center_x, center_y = w / 2, h / 2
    max_radius = min(w, h) / 2

    thr_lines = []

    # Analyse de tous les objets dessinés sur la page web
    for obj in objects:
        
        # --- CAS 1 : C'EST UN TEXTE SUNAE ---
        if obj.get('isSunaeText'):
            text = obj.get('text', '').upper()
            left = obj.get('left', center_x)
            top = obj.get('top', center_y)
            scale = obj.get('scaleX', 1.0)
            angle = obj.get('angle', 0.0)
            
            # --- À TOI DE JOUER ICI ---
            # Tu dois utiliser ton dictionnaire `SUNAE_FONT` pour générer le parcours
            # en appliquant l'échelle (scale), la rotation (angle) et le déplacement (left, top).
            # Pour l'instant, je mets un commentaire en attendant ton code.
            
            # for char in text:
            #     if char in SUNAE_FONT:
            #         for pt in SUNAE_FONT[char]:
            #             x_transforme = ...
            #             y_transforme = ...
            #             theta, rho = cartesian_to_thetarho(x_transforme, y_transforme, center_x, center_y, max_radius)
            #             thr_lines.append(format_thr_line(theta, rho))
            
            pass # (À supprimer quand tu auras mis ton code)

        # --- CAS 2 : C'EST UN TRAIT LIBRE OU UNE LIGNE ROUGE ---
        elif obj.get('isUserStroke') or obj.get('isTravelLine'):
            
            if obj.get('type') == 'path':
                for cmd in obj.get('path', []):
                    # cmd ressemble à ['L', x, y] ou ['M', x, y]
                    if len(cmd) >= 3:
                        x = cmd[-2]
                        y = cmd[-1]
                        theta, rho = cartesian_to_thetarho(x, y, center_x, center_y, max_radius)
                        thr_lines.append(format_thr_line(theta, rho))
            
            elif obj.get('type') == 'line':
                # Point de départ
                x1, y1 = obj.get('x1'), obj.get('y1')
                t1, r1 = cartesian_to_thetarho(x1, y1, center_x, center_y, max_radius)
                thr_lines.append(format_thr_line(t1, r1))
                
                # Point d'arrivée
                x2, y2 = obj.get('x2'), obj.get('y2')
                t2, r2 = cartesian_to_thetarho(x2, y2, center_x, center_y, max_radius)
                thr_lines.append(format_thr_line(t2, r2))


    # 4. CRÉATION DU FICHIER EN MÉMOIRE ET ENVOI
    # Si le dessin est vide, on crée au moins un point au centre
    if not thr_lines:
        thr_lines.append("0.00000 0.00000\n")

    file_content = "".join(thr_lines)
    
    mem_file = io.BytesIO()
    mem_file.write(file_content.encode('utf-8'))
    mem_file.seek(0)

    safe_name = module_name.replace(" ", "_") if module_name else "Export"
    
    return send_file(
        mem_file,
        as_attachment=True,
        download_name=f"Sunae_{safe_name}.thr",
        mimetype='text/plain'
    )

if __name__ == '__main__':
    app.run(debug=True)
