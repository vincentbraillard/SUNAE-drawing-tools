import streamlit as st

# 1. Configuration de la page (Doit être la première commande)
st.set_page_config(page_title="Sunae Studio", layout="wide", initial_sidebar_state="collapsed")

# 2. INJECTION DU CSS PERSONNALISÉ (Le design Sunae)
def inject_css():
    st.markdown("""
    <style>
    /* Transformation du slider en bille chromée */
    .stSlider [role="slider"] {
        background: radial-gradient(circle at 35% 35%, #ffffff 0%, #d4d4d4 20%, #7a7a7a 60%, #1a1a1a 100%) !important;
        border: 1px solid #555 !important;
        box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.5), inset -2px -2px 4px rgba(0,0,0,0.3) !important;
        width: 26px !important;
        height: 26px !important;
        border-radius: 50% !important;
    }
    /* Le sillon du slider (pour rappeler le sable) */
    .stSlider > div > div > div {
        background: #e0d5c1 !important; 
        height: 6px !important;
        box-shadow: inset 0px 2px 3px rgba(0,0,0,0.2) !important;
    }

    /* Cadre : Dimension L (2000x1000 -> Ratio 2:1) */
    .sunae-table-l {
        background: #0a0a0a; border-radius: 30px; padding: 10% 5%;
        box-shadow: inset 0px 5px 15px rgba(255, 255, 255, 0.15), inset 0px -5px 15px rgba(0, 0, 0, 0.8), 0px 15px 30px rgba(0,0,0,0.3);
        aspect-ratio: 2000 / 1000; width: 100%; margin: auto;
    }
    
    /* Cadre : Dimension S (1400x700 -> Ratio 2:1 avec bords plus épais) */
    .sunae-table-s {
        background: #0a0a0a; border-radius: 30px; padding: 11% 8%;
        box-shadow: inset 0px 5px 15px rgba(255, 255, 255, 0.15), inset 0px -5px 15px rgba(0, 0, 0, 0.8), 0px 15px 30px rgba(0,0,0,0.3);
        aspect-ratio: 1400 / 700; width: 100%; margin: auto;
    }
    
    /* Cadre : Origin S (Ronde) */
    .sunae-table-origin {
        background: #0a0a0a; border-radius: 50%; padding: 8.5%;
        box-shadow: inset -5px -5px 20px rgba(0,0,0,0.7), inset 5px 5px 20px rgba(255,255,255,0.2);
        aspect-ratio: 1 / 1; width: 80%; margin: auto;
    }
    
    /* La surface de dessin en sable (Sera utilisée plus tard pour encapsuler le canevas) */
    .sable-area {
        background-color: #f4ebd8; 
        width: 100%; height: 100%;
        border-radius: inherit;
        box-shadow: inset 0px 0px 20px rgba(0,0,0,0.1);
    }
    </style>
    """, unsafe_allow_html=True)

# 3. GESTION DE LA NAVIGATION (Session State)
if 'step' not in st.session_state:
    st.session_state.step = 1
if 'module' not in st.session_state:
    st.session_state.module = None
if 'table' not in st.session_state:
    st.session_state.table = None

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

# 4. EXÉCUTION DE L'INTERFACE
inject_css()

# En-tête avec le logo
col_sp1, col_logo, col_sp2 = st.columns([1, 2, 1])
with col_logo:
    try:
        st.image("2023_LOGO_SUNAE.png", use_container_width=True)
    except FileNotFoundError:
        st.markdown("<h1 style='text-align: center; color: #a9bfa8;'>SUNAE</h1>", unsafe_allow_html=True)

st.write("---")

# --- ÉTAPE 1 : CHOIX DU MODULE ---
if st.session_state.step == 1:
    st.markdown("<h2 style='text-align: center;'>1. Sélectionnez votre Expérience</h2>", unsafe_allow_html=True)
    st.write("")

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
    st.markdown(f"<h2 style='text-align: center;'>2. Votre Table Sunae (Mode : {st.session_state.module})</h2>", unsafe_allow_html=True)
    st.write("")

    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("carre_dimension L.png", use_container_width=True)
        except: st.write("[Image Dimension L]")
        st.markdown("**Dimension L (Rectangulaire)**\n\n2000x1000mm")
        st.button("Choisir", key="btn_tab_dl", on_click=set_table, args=("Dimension L",), use_container_width=True)
    with c2:
        try: st.image("carre_Origin S.png", use_container_width=True)
        except: st.write("[Image Origin S]")
        st.markdown("**Origin S (Ronde)**\n\nØ850mm")
        st.button("Choisir", key="btn_tab_os", on_click=set_table, args=("Origin S",), use_container_width=True)
    with c3:
        try: st.image("carre_dimension S.png", use_container_width=True)
        except: st.write("[Image Dimension S]")
        st.markdown("**Dimension S (Rectangulaire)**\n\n1400x700mm")
        st.button("Choisir", key="btn_tab_ds", on_click=set_table, args=("Dimension S",), use_container_width=True)

# --- ÉTAPE 3 : WORKSPACE (L'Espace de travail) ---
elif st.session_state.step == 3:
    st.button("⬅ Changer de table", on_click=lambda: setattr(st.session_state, 'step', 2))
    st.markdown(f"<h3 style='text-align: center;'>Mode : {st.session_state.module} | Table : {st.session_state.table}</h3>", unsafe_allow_html=True)

    # Attribution de la bonne classe CSS selon la table
    css_class = "sunae-table-l"
    if st.session_state.table == "Origin S": 
        css_class = "sunae-table-origin"
    elif st.session_state.table == "Dimension S": 
        css_class = "sunae-table-s"

    # Construction du rendu visuel de la table avec le sable
    st.markdown(f"""
    <div style="padding: 20px;">
        <div class="{css_class}">
            <div class="sable-area">
                <!-- Les outils de dessin interactifs seront injectés ici à la prochaine étape -->
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.write("---")
    
    # Le slider stylisé en bille
    st.slider("Simulation du tracé de la bille", 0, 100, 50)
