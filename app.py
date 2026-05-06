from flask import Flask, render_template, request, jsonify
import json
import math

app = Flask(__name__)

# Route principale : Affiche la page web
@app.route('/')
def home():
    return render_template('index.html')

# Route API : Réception des données pour créer le fichier .THR
@app.route('/export-thr', methods=['POST'])
def export_thr():
    data = request.json
    table_type = data.get('table')
    module_name = data.get('module')
    drawing_data = data.get('drawing')
    
    print(f"--- NOUVEL EXPORT ---")
    print(f"Table : {table_type}")
    print(f"Module : {module_name}")
    
    # -------------------------------------------------------------
    # C'est ICI que nous allons intégrer ton script Python d'origine.
    # 1. Si module_name == "Texte Automatique", on lira les objets "isSunaeText" 
    #    et on utilisera ton dictionnaire de lettres pour générer le parcours.
    # 2. Si module_name == "Dessin Libre", on lira les tracés bruts.
    # -------------------------------------------------------------
    
    return jsonify({"status": "success", "message": "Fichier prêt ! (La génération du vrai .THR sera bientôt connectée ici)"})

if __name__ == '__main__':
    app.run(debug=True)
