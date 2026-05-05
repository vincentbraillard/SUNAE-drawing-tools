import streamlit as st
from streamlit_drawable_canvas import st_canvas

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
    
    /* LA BILLE CHROMÉE */
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
    
    div[data-testid="column"] img {
        border-radius: 10px;
        box-shadow: 0px 4px 10px rgba(0,0,0,0.1);
        margin-bottom: 15px;
    }
    
    /* Forcer le centrage de la zone de dessin */
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
# ÉTAPE 1 : CHOIX DU MODULE
# ==========================================
if st.session_state.step == 1:
    st.markdown("<h2 style='text-align: center; margin-bottom: 30px;'>1. Sélectionnez votre Expérience</h2>", unsafe_allow_html=True)

    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("img_texte.png", use_container_width=True)
        except: pass
        st.markdown("### Écrire un Texte")
        st.write("Incrustez vos mots préférés dans le sable.")
        st.button("Choisir", key="btn_mod_text", on_click=set_module, args=("Texte Automatique",), use_container_width=True)
    with c2:
        try: st.image("img_dessin.png", use_container_width=True)
        except: pass
        st.markdown("### Dessin Libre")
        st.write("Laissez parler votre créativité.")
        st.button("Choisir", key="btn_mod_draw", on_click=set_module, args=("Dessin Libre",), use_container_width=True)
    with c3:
        try: st.image("img_svg.png", use_container_width=True)
        except: pass
        st.markdown("### Convertir Fichier SVG")
        st.write("Transformez vos logos et motifs existants.")
        st.button("Choisir", key="btn_mod_svg", on_click=set_module, args=("Fichier SVG",), use_container_width=True)

# ==========================================
# ÉTAPE 2 : CHOIX DE LA TABLE
# ==========================================
elif st.session_state.step == 2:
    st.button("⬅ Retour aux expériences", on_click=reset_app)
    st.markdown(f"<h2 style='text-align: center; margin-bottom: 30px;'>2. Votre Table Sunae</h2>", unsafe_allow_html=True)
    
    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("carre_dimension L.png", use_container_width=True)
        except: st.warning("Image Dimension L introuvable")
        st.markdown("### Dimension L")
        st.write("Rectangulaire - 2000x1000mm")
        st.button("Choisir", key="btn_tab_dl", on_click=set_table, args=("Dimension L",), use_container_width=True)
    with c2:
        try: st.image("carre_Origin S.png", use_container_width=True)
        except: st.warning("Image Origin S introuvable")
        st.markdown("### Origin S")
        st.write("Ronde - Ø850mm")
        st.button("Choisir", key="btn_tab_os", on_click=set_table, args=("Origin S",), use_container_width=True)
    with c3:
        try: st.image("carre_dimension S.png", use_container_width=True)
        except: st.warning("Image Dimension S introuvable")
        st.markdown("### Dimension S")
        st.write("Rectangulaire - 1400x700mm")
        st.button("Choisir", key="btn_tab_ds", on_click=set_table, args=("Dimension S",), use_container_width=True)

# ==========================================
# ÉTAPE 3 : ESPACE DE TRAVAIL (WORKSPACE)
# ==========================================
elif st.session_state.step == 3:
    cfg = TABLE_CONFIGS[st.session_state.table]
    
    c_btn, c_title = st.columns([1, 4])
    c_btn.button("⬅ Changer de table", on_click=lambda: setattr(st.session_state, 'step', 2))
    c_title.markdown(f"<h3 style='text-align: center;'>Studio : {st.session_state.module} | Table : {st.session_state.table}</h3>", unsafe_allow_html=True)
    st.write("---")

    # CORRECTION : On verrouille les dimensions strictes pour éviter la déformation (ovale)
    w = cfg["canvas_w"]
    h = cfg["canvas_h"]
    
    if cfg["is_round"]:
        cadre_css = f"""
        <style>
        iframe[title="streamlit_drawable_canvas.st_canvas"] {{
            border: 45px solid #121212 !important;
            border-radius: 50% !important;
            box-shadow: 0px 25px 50px rgba(0,0,0,0.6), inset 0 0 15px rgba(0,0,0,0.3) !important;
            background-color: #f4ebd8 !important;
            margin: 0 auto !important;
            display: block !important;
            width: {w}px !important;
            height: {h}px !important;
            max-width: {w}px !important;
            max-height: {h}px !important;
        }}
        </style>
        """
    else:
        cadre_css = f"""
        <style>
        iframe[title="streamlit_drawable_canvas.st_canvas"] {{
            border: 40px solid #121212 !important;
            border-radius: 20px !important;
            box-shadow: 0px 25px 50px rgba(0,0,0,0.6), inset 0 0 15px rgba(0,0,0,0.3) !important;
            background-color: #f4ebd8 !important;
            margin: 0 auto !important;
            display: block !important;
            width: {w}px !important;
            height: {h}px !important;
            max-width: {w}px !important;
            max-height: {h}px !important;
        }}
        </style>
        """
    st.markdown(cadre_css, unsafe_allow_html=True)

    if st.session_state.module == "Dessin Libre":
        col_tools, col_canvas = st.columns([1, 4])
        
        with col_tools:
            st.markdown("### Outils de Dessin")
            drawing_mode = st.radio("Mode :", ("✏️ Dessiner", "📏 Ligne Droite", "🧹 Effacer"))
            stroke_width = st.slider("Épaisseur du trait", 1, 15, 3)
            
            mode_map = {"✏️ Dessiner": "freedraw", "📏 Ligne Droite": "line", "🧹 Effacer": "eraser"}
            
            st.markdown("<br><br>", unsafe_allow_html=True)
            st.button("💾 EXPORTER (.THR)", type="primary", use_container_width=True)

        with col_canvas:
            # Création du canevas interactif
            canvas_result = st_canvas(
                fill_color="rgba(255, 165, 0, 0)",
                stroke_width=stroke_width,
                stroke_color="#2980b9" if mode_map[drawing_mode] != "eraser" else "#f4ebd8", 
                background_color="rgba(0,0,0,0)",
                height=h,
                width=w,
                drawing_mode=mode_map[drawing_mode],
                key="canvas_sunae",
            )
            
    else:
        st.warning(f"Le module '{st.session_state.module}' est en cours de portage vers la version web.")

    st.write("---")
    st.markdown("#### Simulation du parcours de la bille")
    st.slider(" ", 0, 100, 50, label_visibility="collapsed")
