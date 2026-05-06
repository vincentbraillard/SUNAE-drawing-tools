from flask import Flask, render_template, request, jsonify
import json
import math

app = Flask(__name__)

# Route principale : Affiche la page web
@app.route('/')
def home():
    return render_template('index.html')

# Route API : C'est ici que Javascript enverra le dessin pour le convertir en .THR
@app.route('/export-thr', methods=['POST'])
def export_thr():
    data = request.json
    drawing_data = data.get('drawing')
    table_type = data.get('table')
    
    # -------------------------------------------------------------
    # ICI : Nous remettrons tes mathématiques Python d'origine 
    # pour générer le fichier .THR à partir de drawing_data.
    # -------------------------------------------------------------
    
    print(f"Dessin reçu pour la table : {table_type}")
    print(f"Nombre d'objets tracés : {len(drawing_data)}")
    
    # Pour l'instant, on renvoie juste un message de succès
    return jsonify({"status": "success", "message": "Fichier THR généré (simulation)"})

if __name__ == '__main__':
    # Lancement du serveur local
    app.run(debug=True)
