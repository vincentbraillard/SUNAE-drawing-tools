import streamlit as st
from streamlit_drawable_canvas import st_canvas
import json

# 1. Configuration de la page
st.set_page_config(page_title="Sunae Studio", layout="wide", initial_sidebar_state="collapsed")

# 2. CONFIGURATIONS DES TABLES
TABLE_CONFIGS = {
    "Origin S": {"is_round": True, "canvas_w": 600, "canvas_h": 600},
    "Dimension S": {"is_round": False, "canvas_w": 700, "canvas_h": 350},
    "Dimension L": {"is_round": False, "canvas_w": 800, "canvas_h": 400}
}

# 3. INJECTION DU CSS PERSONNALISÉ
def inject_css():
    st.markdown("""
    <style>
    /* Masquer le menu hamburger Streamlit et le footer pour faire plus pro */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    
    /* Transformation du slider en bille chromée */
    .stSlider [role="slider"] {
        background: radial-gradient(circle at 35% 35%, #ffffff 0%, #d4d4d4 20%, #7a7a7a 60%, #1a1a1a 100%) !important;
        border: 1px solid #555 !important;
        box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.5), inset -2px -2px 4px rgba(0,0,0,0.3) !important;
        width: 26px !important; height: 26px !important; border-radius: 50% !important;
    }
    .stSlider > div > div > div {
        background: #e0d5c1 !important; height: 6px !important;
        box-shadow: inset 0px 2px 3px rgba(0,0,0,0.2) !important;
    }

    /* Styles d'encadrement pour simuler la table */
    .table-container {
        background: #0a0a0a;
        margin: 20px auto;
        display: flex;
        justify-content: center;
        align-items: center;
        box-shadow: 0px 15px 30px rgba(0,0,0,0.5), inset 0px 5px 15px rgba(255, 255, 255, 0.15);
    }
    .table-round { border-radius: 50%; padding: 40px; width: 680px; height: 680px; }
    .table-rect-l { border-radius: 30px; padding: 40px; width: 880px; height: 480px; }
    .table-rect-s { border-radius: 30px; padding: 40px; width: 780px; height: 430px; }
    
    /* Ombre interne du sable */
    canvas {
        box-shadow: inset 0px 0px 20px rgba(0,0,0,0.3) !important;
        border-radius: inherit !important;
    }
    </style>
    """, unsafe_allow_html=True)

# 4. GESTION DE LA NAVIGATION
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

# --- EXÉCUTION DE L'INTERFACE ---
inject_css()

# En-tête
col_sp1, col_logo, col_sp2 = st.columns([1, 2, 1])
with col_logo:
    try: st.image("2023_LOGO_SUNAE.png", use_container_width=True)
    except: st.markdown("<h1 style='text-align: center;'>SUNAE</h1>", unsafe_allow_html=True)
st.write("---")

# --- ÉTAPE 1 : CHOIX DU MODULE ---
if st.session_state.step == 1:
    st.markdown("<h2 style='text-align: center;'>1. Sélectionnez votre Expérience</h2><br>", unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    with c1:
        st.info("📝 **Écrire un Texte**\n\nIncrustez vos mots préférés dans le sable.")
        st.button("Choisir", key="btn_mod_text", on_click=set_module, args=("Texte",), use_container_width=True)
    with c2:
        st.info("✍️ **Dessin Libre**\n\nLaissez parler votre créativité.")
        st.button("Choisir", key="btn_mod_draw", on_click=set_module, args=("Dessin Libre",), use_container_width=True)
    with c3:
        st.info("🎨 **Convertir SVG**\n\nTransformez vos logos et motifs existants.")
        st.button("Choisir", key="btn_mod_svg", on_click=set_module, args=("Fichier SVG",), use_container_width=True)

# --- ÉTAPE 2 : CHOIX DE LA TABLE ---
elif st.session_state.step == 2:
    st.button("⬅ Retour aux expériences", on_click=reset_app)
    st.markdown(f"<h2 style='text-align: center;'>2. Votre Table Sunae (Mode : {st.session_state.module})</h2><br>", unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("carre_dimension L.png", use_container_width=True)
        except: pass
        st.markdown("**Dimension L** (2000x1000mm)")
        st.button("Choisir", key="btn_tab_dl", on_click=set_table, args=("Dimension L",), use_container_width=True)
    with c2:
        try: st.image("carre_Origin S.png", use_container_width=True)
        except: pass
        st.markdown("**Origin S** (Ronde Ø850mm)")
        st.button("Choisir", key="btn_tab_os", on_click=set_table, args=("Origin S",), use_container_width=True)
    with c3:
        try: st.image("carre_dimension S.png", use_container_width=True)
        except: pass
        st.markdown("**Dimension S** (1400x700mm)")
        st.button("Choisir", key="btn_tab_ds", on_click=set_table, args=("Dimension S",), use_container_width=True)

# --- ÉTAPE 3 : WORKSPACE (L'Espace de travail) ---
elif st.session_state.step == 3:
    c_btn, c_title = st.columns([1, 4])
    c_btn.button("⬅ Changer de table", on_click=lambda: setattr(st.session_state, 'step', 2))
    c_title.markdown(f"<h3 style='text-align: center;'>✍️ {st.session_state.module} | {st.session_state.table}</h3>", unsafe_allow_html=True)

    cfg = TABLE_CONFIGS[st.session_state.table]
    
    # Choix de la classe CSS pour le cadre visuel
    if cfg["is_round"]: frame_class = "table-round"
    elif st.session_state.table == "Dimension L": frame_class = "table-rect-l"
    else: frame_class = "table-rect-s"

    st.write("---")

    # --- MODULE DESSIN LIBRE ---
    if st.session_state.module == "Dessin Libre":
        col_tools, col_canvas = st.columns([1, 4])
        
        with col_tools:
            st.markdown("### Outils")
            drawing_mode = st.radio("Mode :", ("Dessin", "Ligne droite", "Effacer"))
            stroke_width = st.slider("Épaisseur du trait", 1, 10, 3)
            
            mode_map = {"Dessin": "freedraw", "Ligne droite": "line", "Effacer": "eraser"}
            
            st.markdown("<br><br>", unsafe_allow_html=True)
            st.button("💾 EXPORTER (.THR)", type="primary", use_container_width=True)

        with col_canvas:
            # On simule le cadre noir avec HTML, et on place le canvas Streamlit dedans
            st.markdown(f'<div class="table-container {frame_class}">', unsafe_allow_html=True)
            
            canvas_result = st_canvas(
                fill_color="rgba(255, 165, 0, 0)",  # Transparent
                stroke_width=stroke_width,
                stroke_color="#2980b9" if mode_map[drawing_mode] != "eraser" else "#f4ebd8",
                background_color="#f4ebd8", # Couleur sable
                height=cfg["canvas_h"],
                width=cfg["canvas_w"],
                drawing_mode=mode_map[drawing_mode],
                key="canvas",
            )
            st.markdown('</div>', unsafe_allow_html=True)

    # --- AUTRES MODULES (Bientôt) ---
    else:
        st.warning(f"Le module '{st.session_state.module}' est en cours de construction pour le web.")

    st.write("---")
    st.slider("Simulation de l'avancement de la bille", 0, 100, 0)
