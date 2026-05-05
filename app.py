import streamlit as st
from streamlit_drawable_canvas import st_canvas
import json

# --- 1. CONFIGURATION DE LA PAGE ---
st.set_page_config(page_title="Sunae Studio", layout="wide", initial_sidebar_state="collapsed")

# --- 2. CONFIGURATIONS DES TABLES ---
# Utilisation de dimensions strictes "scaled" (zone sable interne)
TABLE_CONFIGS = {
    "Origin S": {"is_round": True, "canvas_w": 345, "canvas_h": 345}, # Ø690 scaled
    "Dimension S": {"is_round": False, "canvas_w": 590, "canvas_h": 242}, # 1179x485 scaled
    "Dimension L": {"is_round": False, "canvas_w": 898, "canvas_h": 398} # 1796x796 scaled
}

# --- 3. INJECTION DU CSS GLOBAL ---
def inject_global_css():
    st.markdown("""
    <style>
    /* Masquer les éléments par défaut de Streamlit */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    
    /* === LE SLIDER EN BILLE CHROMÉE === */
    .stSlider [role="slider"] {
        background: radial-gradient(circle at 30% 30%, #ffffff 0%, #a9a9a9 30%, #404040 80%, #111111 100%) !important;
        border: none !important;
        box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.4), inset -2px -2px 4px rgba(0,0,0,0.5) !important;
        width: 28px !important; 
        height: 28px !important; 
        border-radius: 50% !important;
    }
    .stSlider > div > div > div {
        background: #d4c5b0 !important; 
        height: 8px !important;
        border-radius: 4px !important;
        box-shadow: inset 0px 2px 4px rgba(0,0,0,0.4) !important;
    }
    
    /* === LE CADRE DE LA TABLE (Centrage) === */
    div[data-testid="stVerticalBlock"] > div:has(iframe), div[data-testid="stVerticalBlock"] > div:has(svg.sunae-canvas-frame) {
        display: flex;
        justify-content: center;
    }
    
    /* === MAGIE CSS : CARTES BLEU NUIT (ÉTAPE 1 ET 2) === */
    /* Cible uniquement les blocs qui ont nos marqueurs invisibles */
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="column"] {
        background-color: #171d2b !important; /* Bleu nuit élégant */
        border-radius: 12px !important;
        border: 1px solid #2a3441 !important; /* Léger contour arrondi */
        padding: 15px !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3) !important;
    }
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="column"] * {
        color: #ffffff !important; /* Texte blanc */
    }
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="column"] img {
        width: 100%;
        border-radius: 8px;
        margin-bottom: 15px;
    }
    /* Boutons dans les cartes */
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="stButton"] button {
        background-color: transparent !important;
        border: 1px solid #dfc391 !important; /* Border doré (#dfc391) */
        border-radius: 6px !important;
        transition: 0.3s;
    }
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="stButton"] button:hover {
        background-color: #dfc391 !important; /* Background doré (#dfc391) sur hover */
        color: #171d2b !important; /* Texte bleu nuit sur hover */
    }
    
    /* === RÉDUCTION TAILLE IMAGES TABLES (ÉTAPE 2) === */
    div[data-testid="stVerticalBlock"]:has(.step2-marker) [data-testid="column"] img {
        width: 60% !important; /* Réduction à 60% */
        margin: 0 auto 15px auto !important; /* Centrage horizontal */
        display: block;
    }
    </style>
    """, unsafe_allow_html=True)

# --- 4. GESTION DE LA NAVIGATION ET MÉMOIRE ---
if 'step' not in st.session_state: st.session_state.step = 1
if 'module' not in st.session_state: st.session_state.module = None
if 'table' not in st.session_state: st.session_state.table = None
if 'my_drawing' not in st.session_state: st.session_state.my_drawing = None
if 'canvas_key' not in st.session_state: st.session_state.canvas_key = 0

def set_module(mod_name):
    st.session_state.module = mod_name
    st.session_state.step = 2

def set_table(table_name):
    st.session_state.table = table_name
    st.session_state.step = 3
    st.session_state.my_drawing = None # Reset dessin
    st.session_state.canvas_key += 1

def reset_app():
    st.session_state.step = 1
    st.session_state.module = None
    st.session_state.table = None

def undo_last_stroke():
    """Fonction pour le bouton Étape Précédente"""
    if st.session_state.my_drawing and "objects" in st.session_state.my_drawing:
        if len(st.session_state.my_drawing["objects"]) > 0:
            st.session_state.my_drawing["objects"].pop()
            st.session_state.canvas_key += 1 # Force le canvas à se mettre à jour

# --- 5. EXÉCUTION DE L'INTERFACE ---
inject_global_css()

# En-tête : Logo Sunae
col_sp1, col_logo, col_sp2 = st.columns([1, 1, 1])
with col_logo:
    try: 
        st.image("2023_LOGO_SUNAE.png", use_container_width=True)
    except: 
        st.markdown("<h1 style='text-align: center; color: #8fa89b;'>SUNAE STUDIO</h1>", unsafe_allow_html=True)
st.write("---")

# ==========================================
# ÉTAPE 1 : CHOIX DU MODULE
# ==========================================
if st.session_state.step == 1:
    st.markdown("<span class='step-marker'></span>", unsafe_allow_html=True) # Marqueur CSS pour le fond bleu
    st.markdown("<h2 style='text-align: center; margin-bottom: 30px;'>1. Sélectionnez votre Expérience</h2>", unsafe_allow_html=True)

    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("img_texte.png", use_container_width=True)
        except: pass
        st.markdown("### Écrire un Texte")
        st.write("Incrustez vos mots préférés dans le sable.")
        st.button("Choisir", key="btn_mod_text", on_click=set_module, args=("Texte Automatique",), use_container_width=False)
    with c2:
        try: st.image("img_dessin.png", use_container_width=True)
        except: pass
        st.markdown("### Dessin Libre")
        st.write("Laissez parler votre créativité.")
        st.button("Choisir", key="btn_mod_draw", on_click=set_module, args=("Dessin Libre",), use_container_width=False)
    with c3:
        try: st.image("img_svg.png", use_container_width=True)
        except: pass
        st.markdown("### Convertir Fichier SVG")
        st.write("Transformez vos logos et motifs existants.")
        st.button("Choisir", key="btn_mod_svg", on_click=set_module, args=("Fichier SVG",), use_container_width=False)

# ==========================================
# ÉTAPE 2 : CHOIX DE LA TABLE
# ==========================================
elif st.session_state.step == 2:
    st.markdown("<span class='step-marker step2-marker'></span>", unsafe_allow_html=True) # Marqueurs CSS (Fond bleu + Images réduites)
    st.button("⬅ Retour aux expériences", on_click=reset_app)
    st.markdown(f"<h2 style='text-align: center; margin-bottom: 30px;'>2. Votre Table Sunae</h2>", unsafe_allow_html=True)
    
    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("carre_dimension L.png", use_container_width=True)
        except: st.warning("Image introuvable")
        st.markdown("### Dimension L")
        st.write("Rectangulaire - 2000x1000mm")
        st.button("Choisir", key="btn_tab_dl", on_click=set_table, args=("Dimension L",), use_container_width=False)
    with c2:
        try: st.image("carre_Origin S.png", use_container_width=True)
        except: st.warning("Image introuvable")
        st.markdown("### Origin S")
        st.write("Ronde - Ø850mm")
        st.button("Choisir", key="btn_tab_os", on_click=set_table, args=("Origin S",), use_container_width=False)
    with c3:
        try: st.image("carre_dimension S.png", use_container_width=True)
        except: st.warning("Image introuvable")
        st.markdown("### Dimension S")
        st.write("Rectangulaire - 1400x700mm")
        st.button("Choisir", key="btn_tab_ds", on_click=set_table, args=("Dimension S",), use_container_width=False)

# ==========================================
# ÉTAPE 3 : ESPACE DE TRAVAIL (WORKSPACE)
# ==========================================
elif st.session_state.step == 3:
    cfg = TABLE_CONFIGS[st.session_state.table]
    w = cfg["canvas_w"]
    h = cfg["canvas_h"]
    
    c_btn, c_title = st.columns([1, 4])
    c_btn.button("⬅ Changer de table", on_click=lambda: setattr(st.session_state, 'step', 2))
    c_title.markdown(f"<h3 style='text-align: center;'>Studio : {st.session_state.module} | Table : {st.session_state.table}</h3>", unsafe_allow_html=True)
    st.write("---")

    if st.session_state.module == "Dessin Libre":
        
        st.markdown("#### Simulation du parcours de la bille")
        slider_val = st.slider(" ", 0, 100, 100, label_visibility="collapsed")
        st.write("---")

        col_tools, col_canvas = st.columns([1, 4])
        
        with col_tools:
            st.markdown("### Outils de Dessin")
            drawing_mode = st.radio("Mode :", ("✏️ Dessiner", "📏 Ligne Droite", "🧹 Effacer"))
            stroke_width = st.slider("Épaisseur du trait", 1, 15, 3)
            
            st.button("↩ Étape précédente", on_click=undo_last_stroke, use_container_width=True)
            
            # Gestion correcte de la gomme : freedraw avec couleur sable
            if drawing_mode == "✏️ Dessiner": d_mode, s_color = "freedraw", "#2980b9"
            elif drawing_mode == "📏 Ligne Droite": d_mode, s_color = "line", "#2980b9"
            else: d_mode, s_color = "freedraw", "#f4ebd8" # L'effaceur peindra avec la couleur sable
            
            st.markdown("<br>", unsafe_allow_html=True)
            st.button("💾 EXPORTER (.THR)", type="primary", use_container_width=True)

        with col_canvas:
            
            # MODE DESSIN (Slider à 100%)
            if slider_val == 100:
                # Injection CSS du cadre de la table pour le canevas (Transparent)
                if cfg["is_round"]:
                    cadre_css = f"""
                    <style>
                    iframe[title="streamlit_drawable_canvas.st_canvas"] {{
                        border: 45px solid #121212 !important; /* Bord noir */
                        border-radius: 50% !important; /* Rond */
                        box-shadow: 0px 25px 50px rgba(0,0,0,0.6), inset 0 0 15px rgba(0,0,0,0.5) !important;
                        margin: 0 auto !important;
                        display: block !important;
                        width: {w}px !important; height: {h}px !important;
                        max-width: {w}px !important; max-height: {h}px !important;
                    }}
                    </style>
                    """
                else:
                    cadre_css = f"""
                    <style>
                    iframe[title="streamlit_drawable_canvas.st_canvas"] {{
                        border: 40px solid #121212 !important;
                        border-radius: 20px !important;
                        box-shadow: 0px 25px 50px rgba(0,0,0,0.6), inset 0 0 15px rgba(0,0,0,0.5) !important;
                        margin: 0 auto !important;
                        display: block !important;
                        width: {w}px !important; height: {h}px !important;
                        max-width: {w}px !important; max-height: {h}px !important;
                    }}
                    </style>
                    """
                st.markdown(cadre_css, unsafe_allow_html=True)

                canvas_result = st_canvas(
                    fill_color="rgba(255, 165, 0, 0)",
                    stroke_width=stroke_width,
                    stroke_color=s_color,
                    background_color="#f4ebd8", # Fond sable natif pour garantir la zone beige
                    height=h, width=w,
                    drawing_mode=d_mode,
                    initial_drawing=st.session_state.my_drawing, # Restaure la mémoire
                    display_toolbar=False, # Masquer la barre d'outils
                    key=f"canvas_sunae_{st.session_state.canvas_key}",
                )
                
                # Mise à jour de la mémoire en temps réel
                if canvas_result.json_data is not None:
                    st.session_state.my_drawing = canvas_result.json_data
            
            # MODE SIMULATION (Slider < 100%)
            else:
                # Injection CSS du cadre de la table pour le SVG miniature (Transparent)
                if cfg["is_round"]:
                    cadre_css = """
                    <style>
                    svg.sunae-canvas-frame {
                        border: 45px solid #121212 !important;
                        border-radius: 50% !important;
                        box-shadow: 0px 25px 50px rgba(0,0,0,0.6), inset 0 0 15px rgba(0,0,0,0.4) !important;
                    }
                    </style>
                    """
                else:
                    cadre_css = """
                    <style>
                    svg.sunae-canvas-frame {
                        border: 40px solid #121212 !important;
                        border-radius: 20px !important;
                        box-shadow: 0px 25px 50px rgba(0,0,0,0.6), inset 0 0 15px rgba(0,0,0,0.4) !important;
                    }
                    </style>
                    """
                st.markdown(cadre_css, unsafe_allow_html=True)

                # Génération du rendu SVG "miroir" qui remplace exactement le canevas
                svg_content = f'<svg class="sunae-canvas-frame" width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="margin: 0 auto; display: block;">'
                
                if st.session_state.my_drawing and "objects" in st.session_state.my_drawing:
                    paths = []
                    # 1. Analyse du dessin
                    for obj in st.session_state.my_drawing["objects"]:
                        if obj["type"] == "path":
                            # Extraction des commandes pour le chemin SVG
                            d_str = " ".join([ " ".join(map(str, cmd)) for cmd in obj["path"] ])
                            start_pt = (obj["path"][0][1], obj["path"][0][2])
                            end_pt = (obj["path"][-1][-2], obj["path"][-1][-1])
                            paths.append({"d": d_str, "start": start_pt, "end": end_pt, "cmd_len": len(obj["path"]), "obj": obj})
                        elif obj["type"] == "line":
                            d_str = f"M {obj['left']+obj['x1']} {obj['top']+obj['y1']} L {obj['left']+obj['x2']} {obj['top']+obj['y2']}"
                            start_pt = (obj['left']+obj['x1'], obj['top']+obj['y1'])
                            end_pt = (obj['left']+obj['x2'], obj['top']+obj['y2'])
                            paths.append({"d": d_str, "start": start_pt, "end": end_pt, "cmd_len": 2, "obj": obj})
                    
                    # 2. Rendu de l'animation
                    if paths:
                        total_cmds = sum(p["cmd_len"] for p in paths)
                        cmds_to_draw = int((slider_val / 100.0) * total_cmds)
                        
                        current_cmds = 0
                        current_end = None
                        start_dot = paths[0]["start"]
                        
                        for p in paths:
                            if current_cmds >= cmds_to_draw: break
                            
                            # Lignes rouges de voyage (entre le trait précédent et le nouveau)
                            if current_end is not None:
                                svg_content += f'<line x1="{current_end[0]}" y1="{current_end[1]}" x2="{p["start"][0]}" y2="{p["start"][1]}" stroke="red" stroke-width="2" />'
                            
                            cmds_in_path = p["cmd_len"]
                            color = p["obj"].get("stroke", "#2980b9")
                            stroke_w = p["obj"].get("strokeWidth", 3)
                            
                            if current_cmds + cmds_in_path <= cmds_to_draw:
                                # Dessine le trait complet
                                svg_content += f'<path d="{p["d"]}" fill="none" stroke="{color}" stroke-width="{stroke_w}" stroke-linecap="round" stroke-linejoin="round"/>'
                                current_end = p["end"]
                                current_cmds += cmds_in_path
                            else:
                                # Dessin partiel (pour simuler la bille en plein milieu d'un trait)
                                rem = cmds_to_draw - current_cmds
                                if p["obj"]["type"] == "path":
                                    partial = p["obj"]["path"][:rem]
                                    d_str = " ".join([ " ".join(map(str, cmd)) for cmd in partial ])
                                    svg_content += f'<path d="{d_str}" fill="none" stroke="{color}" stroke-width="{stroke_w}" stroke-linecap="round" stroke-linejoin="round"/>'
                                    current_end = (partial[-1][-2], partial[-1][-1])
                                else:
                                    # Ligne droite partielle
                                    px = p["start"][0] + (p["end"][0] - p["start"][0]) * (rem / 2)
                                    py = p["start"][1] + (p["end"][1] - p["start"][1]) * (rem / 2)
                                    svg_content += f'<line x1="{p["start"][0]}" y1="{p["start"][1]}" x2="{px}" y2="{py}" stroke="{color}" stroke-width="{stroke_w}" stroke-linecap="round"/>'
                                    current_end = (px, py)
                                break
                        
                        # Ajout des Points Vert et Rouge
                        if cmds_to_draw > 0:
                            svg_content += f'<circle cx="{start_dot[0]}" cy="{start_dot[1]}" r="6" fill="#2ecc71"/>' # Départ
                            if current_end:
                                svg_content += f'<circle cx="{current_end[0]}" cy="{current_end[1]}" r="6" fill="#c0392b"/>' # Fin
                
                svg_content += '</svg>'
                st.markdown(svg_content, unsafe_allow_html=True)
                
    else:
        st.warning(f"Le module '{st.session_state.module}' est en cours de portage.")
