import streamlit as st
from streamlit_drawable_canvas import st_canvas
import json

# --- 1. CONFIGURATION DE LA PAGE ---
st.set_page_config(page_title="Sunae Studio", layout="wide", initial_sidebar_state="collapsed")

# --- 2. CONFIGURATIONS DES TABLES ---
TABLE_CONFIGS = {
    "Origin S": {"is_round": True, "canvas_w": 600, "canvas_h": 600},
    "Dimension S": {"is_round": False, "canvas_w": 700, "canvas_h": 350},
    "Dimension L": {"is_round": False, "canvas_w": 800, "canvas_h": 400}
}

# --- 3. INJECTION DU CSS GLOBAL ---
def inject_global_css():
    st.markdown("""
    <style>
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    
    /* LA BILLE CHROMÉE DU SLIDER */
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
    
    /* Centrage strict du canevas pour éviter la déformation */
    div[data-testid="stVerticalBlock"] > div:has(iframe) {
        display: flex;
        justify-content: center;
    }
    </style>
    """, unsafe_allow_html=True)

# --- 4. GESTION DE LA NAVIGATION ---
if 'step' not in st.session_state: st.session_state.step = 1
if 'module' not in st.session_state: st.session_state.module = None
if 'table' not in st.session_state: st.session_state.table = None

def set_module(mod_name):
    st.session_state.module = mod_name
    st.session_state.step = 2

def set_table(table_name):
    st.session_state.table = table_name
    st.session_state.step = 3

def reset_app():
    st.session_state.step = 1
    st.session_state.module = None
    st.session_state.table = None

# --- 5. EXÉCUTION DE L'INTERFACE ---
inject_global_css()

# En-tête : Logo
col_sp1, col_logo, col_sp2 = st.columns([1, 1, 1])
with col_logo:
    try: 
        st.image("2023_LOGO_SUNAE.png", use_container_width=True)
    except: 
        st.markdown("<h1 style='text-align: center; color: #8fa89b;'>SUNAE STUDIO</h1>", unsafe_allow_html=True)
st.write("---")

# ==========================================
# ÉTAPE 1 : CHOIX DU MODULE (CARTES BLEU NUIT)
# ==========================================
if st.session_state.step == 1:
    # CSS Spécifique pour les cartes de l'étape 1
    st.markdown("""
    <style>
    div[data-testid="column"] {
        background-color: #171d2b; /* Bleu nuit élégant */
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #2a3441;
        padding-bottom: 20px;
    }
    div[data-testid="column"] img {
        width: 100%;
        border-radius: 12px 12px 0 0;
        margin-bottom: 5px;
    }
    div[data-testid="column"] h3 {
        color: #ffffff !important;
        padding: 0 15px;
        margin-top: 10px;
        margin-bottom: 5px;
        font-size: 1.4rem;
    }
    div[data-testid="column"] p {
        color: #e2e8f0 !important;
        padding: 0 15px;
        font-size: 1rem;
        margin-bottom: 20px;
    }
    /* Style du bouton "Choisir" */
    div[data-testid="column"] button {
        margin-left: 15px;
        background-color: transparent !important;
        border: 1px solid #dfc391 !important;
        color: #ffffff !important;
        border-radius: 8px !important;
        font-weight: 500;
        padding: 5px 20px;
        transition: all 0.3s ease;
    }
    div[data-testid="column"] button:hover {
        background-color: #dfc391 !important;
        color: #171d2b !important;
    }
    </style>
    """, unsafe_allow_html=True)

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
    st.button("⬅ Retour aux expériences", on_click=reset_app)
    st.markdown(f"<h2 style='text-align: center; margin-bottom: 30px;'>2. Votre Table Sunae</h2>", unsafe_allow_html=True)
    
    # CSS pour le style sombre des cartes des tables
    st.markdown("""
    <style>
    div[data-testid="column"] {
        background-color: #1a1a1a;
        border-radius: 12px;
        padding-bottom: 20px;
        border: 1px solid #333;
    }
    div[data-testid="column"] h3, div[data-testid="column"] p {
        color: #ffffff;
        padding: 0 15px;
    }
    div[data-testid="column"] button { margin-left: 15px; }
    </style>
    """, unsafe_allow_html=True)

    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("carre_dimension L.png", use_container_width=True)
        except: st.warning("Image introuvable")
        st.markdown("### Dimension L")
        st.write("Rectangulaire - 2000x1000mm")
        st.button("Choisir", key="btn_tab_dl", on_click=set_table, args=("Dimension L",))
    with c2:
        try: st.image("carre_Origin S.png", use_container_width=True)
        except: st.warning("Image introuvable")
        st.markdown("### Origin S")
        st.write("Ronde - Ø850mm")
        st.button("Choisir", key="btn_tab_os", on_click=set_table, args=("Origin S",))
    with c3:
        try: st.image("carre_dimension S.png", use_container_width=True)
        except: st.warning("Image introuvable")
        st.markdown("### Dimension S")
        st.write("Rectangulaire - 1400x700mm")
        st.button("Choisir", key="btn_tab_ds", on_click=set_table, args=("Dimension S",))

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

    # Cadre Noir Externe
    if cfg["is_round"]:
        cadre_css = f"""
        <style>
        iframe[title="streamlit_drawable_canvas.st_canvas"] {{
            border: 45px solid #121212 !important;
            border-radius: 50% !important;
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

    if st.session_state.module == "Dessin Libre":
        col_tools, col_canvas = st.columns([1, 3])
        
        with col_tools:
            st.markdown("### Outils de Dessin")
            drawing_mode = st.radio("Mode :", ("✏️ Dessiner", "📏 Ligne Droite", "🧹 Effacer"))
            stroke_width = st.slider("Épaisseur du trait", 1, 15, 3)
            
            # GESTION CORRECTE DE LA GOMME : Mode freedraw avec couleur sable
            if drawing_mode == "✏️ Dessiner":
                d_mode = "freedraw"
                s_color = "#2980b9"
            elif drawing_mode == "📏 Ligne Droite":
                d_mode = "line"
                s_color = "#2980b9"
            else:
                d_mode = "freedraw"
                s_color = "#f4ebd8" # Efface en peignant avec la couleur du sable
            
            st.markdown("<br><br>", unsafe_allow_html=True)
            st.button("💾 EXPORTER (.THR)", type="primary", use_container_width=True)

        with col_canvas:
            # Création du canevas interactif. Le fond est injecté nativement !
            canvas_result = st_canvas(
                fill_color="rgba(255, 165, 0, 0)",
                stroke_width=stroke_width,
                stroke_color=s_color,
                background_color="#f4ebd8", # Fond sable solide natif
                height=h,
                width=w,
                drawing_mode=d_mode,
                key="canvas_sunae",
            )
            
        # ==========================================
        # LE SIMULATEUR SVG EN DIRECT (Points + Trajet)
        # ==========================================
        st.write("---")
        st.markdown("#### Simulation du parcours de la bille")
        slider_val = st.slider(" ", 0, 100, 100, label_visibility="collapsed")
        
        # Parse le dessin pour générer la preview
        if canvas_result.json_data is not None and "objects" in canvas_result.json_data:
            paths = []
            for obj in canvas_result.json_data["objects"]:
                if obj["type"] == "path":
                    # Extraction des coordonnées du pinceau
                    pts = [(cmd[-2], cmd[-1]) for cmd in obj["path"] if cmd[0] in ["M", "L", "Q"]]
                    if pts: paths.append(pts)
                elif obj["type"] == "line":
                    paths.append([(obj["left"]+obj["x1"], obj["top"]+obj["y1"]), (obj["left"]+obj["x2"], obj["top"]+obj["y2"])])
            
            if paths:
                # Calcul de la portion à afficher selon le slider
                total_pts = sum(len(p) for p in paths)
                pts_to_draw = int((slider_val / 100.0) * total_pts)
                
                drawn_paths = []
                current_count = 0
                start_pt = paths[0][0]
                end_pt = None
                
                for path in paths:
                    if current_count + len(path) <= pts_to_draw:
                        drawn_paths.append(path)
                        current_count += len(path)
                        if len(path) > 0: end_pt = path[-1]
                    else:
                        remaining = pts_to_draw - current_count
                        if remaining > 0:
                            drawn_paths.append(path[:remaining])
                            end_pt = path[remaining - 1]
                        break

                # Génération du rendu SVG miniature
                sim_w, sim_h = w // 2, h // 2
                br = "50%" if cfg["is_round"] else "15px"
                svg = f'<div style="display:flex; justify-content:center;"><svg width="{sim_w}" height="{sim_h}" viewBox="0 0 {w} {h}" style="background-color:#f4ebd8; border-radius:{br}; border: 8px solid #121212; box-shadow: 0px 5px 15px rgba(0,0,0,0.5);">'
                
                for p in drawn_paths:
                    if len(p) > 1:
                        path_d = "M " + " L ".join([f"{x},{y}" for x, y in p])
                        svg += f'<path d="{path_d}" fill="none" stroke="#2980b9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
                
                if start_pt and pts_to_draw > 0:
                    svg += f'<circle cx="{start_pt[0]}" cy="{start_pt[1]}" r="8" fill="#2ecc71"/>' # Point Vert
                if end_pt and pts_to_draw > 0:
                    svg += f'<circle cx="{end_pt[0]}" cy="{end_pt[1]}" r="8" fill="#c0392b"/>' # Point Rouge
                    
                svg += '</svg></div>'
                
                st.markdown(svg, unsafe_allow_html=True)
    else:
        st.warning(f"Le module '{st.session_state.module}' est en cours de portage vers la version web.")
