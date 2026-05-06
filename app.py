import streamlit as st
from streamlit_drawable_canvas import st_canvas
from PIL import Image, ImageDraw
import base64
from io import BytesIO
import math

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
    /* Masquer les menus par défaut */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    
    /* LE SLIDER EN BILLE CHROMÉE */
    .stSlider [role="slider"] {
        background: radial-gradient(circle at 30% 30%, #ffffff 0%, #a9a9a9 30%, #404040 80%, #111111 100%) !important;
        border: none !important;
        box-shadow: 2px 4px 6px rgba(0, 0, 0, 0.4), inset -2px -2px 4px rgba(0,0,0,0.5) !important;
        width: 28px !important; height: 28px !important; border-radius: 50% !important;
    }
    .stSlider > div > div > div {
        background: #d4c5b0 !important; height: 8px !important;
        border-radius: 4px !important; box-shadow: inset 0px 2px 4px rgba(0,0,0,0.4) !important;
    }
    
    /* CENTRAGE DU CANEVAS */
    div[data-testid="stVerticalBlock"] > div:has(iframe), div[data-testid="stVerticalBlock"] > div:has(svg.sunae-canvas-frame) {
        display: flex; justify-content: center;
    }
    
    /* CARTES BLEU NUIT */
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="column"] {
        background-color: #171d2b !important; border-radius: 12px !important;
        border: 1px solid #2a3441 !important; padding: 15px !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3) !important; text-align: center;
    }
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="column"] * { color: #ffffff !important; }
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="column"] img {
        width: 100%; border-radius: 8px; margin-bottom: 15px;
    }
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="stButton"] button {
        background-color: transparent !important; border: 1px solid #dfc391 !important;
        border-radius: 6px !important; transition: 0.3s;
    }
    div[data-testid="stVerticalBlock"]:has(.step-marker) [data-testid="stButton"] button:hover {
        background-color: #dfc391 !important; color: #171d2b !important;
    }
    div[data-testid="stVerticalBlock"]:has(.step2-marker) [data-testid="column"] img {
        width: 60% !important; margin: 0 auto 15px auto !important; display: block;
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
    st.session_state.my_drawing = None
    st.session_state.canvas_key += 1

def reset_app():
    st.session_state.step = 1
    st.session_state.module = None
    st.session_state.table = None

def undo_last_stroke():
    if st.session_state.my_drawing and "objects" in st.session_state.my_drawing:
        if len(st.session_state.my_drawing["objects"]) > 0:
            st.session_state.my_drawing["objects"].pop()
            st.session_state.canvas_key += 1 # Force update only on undo

def reset_drawing():
    st.session_state.my_drawing = None
    st.session_state.canvas_key += 1

# --- FONCTION DESSIN TRAITILLÉ (Pour la ligne rouge de voyage) ---
def draw_dashed_line(draw, pt1, pt2, fill, width=2, dash_length=8):
    x1, y1 = pt1
    x2, y2 = pt2
    dist = math.hypot(x2 - x1, y2 - y1)
    if dist < dash_length: return
    dashes = int(dist / dash_length)
    for i in range(dashes):
        if i % 2 == 0:
            sx = x1 + (x2 - x1) * (i / dashes)
            sy = y1 + (y2 - y1) * (i / dashes)
            ex = x1 + (x2 - x1) * ((i + 1) / dashes)
            ey = y1 + (y2 - y1) * ((i + 1) / dashes)
            draw.line([(sx, sy), (ex, ey)], fill=fill, width=width)

# --- GÉNÉRATION DES IMAGES DE FOND ---
def get_base_image(uploaded_file, scale, angle, pan_x, pan_y, w, h):
    """Génère le fond sable + l'image uploadée (Sans lignes rouges)"""
    base = Image.new("RGBA", (w, h), (244, 235, 216, 255)) # Couleur Sable garantie
    if uploaded_file is not None:
        try:
            img = Image.open(uploaded_file).convert("RGBA")
            new_w, new_h = int(img.width * scale), int(img.height * scale)
            if new_w > 0 and new_h > 0:
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                img = img.rotate(-angle, expand=True)
                cx, cy = (w // 2) + pan_x, (h // 2) - pan_y
                px, py = cx - (img.width // 2), cy - (img.height // 2)
                temp = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                temp.paste(img, (px, py), img)
                base = Image.alpha_composite(base, temp)
        except Exception: pass
    return base

def add_red_lines_to_image(base_img, drawing_data):
    """Ajoute les lignes rouges directement dans l'image de fond"""
    img = base_img.copy()
    if drawing_data and "objects" in drawing_data:
        draw = ImageDraw.Draw(img)
        last_pt = None
        for obj in drawing_data["objects"]:
            if obj["type"] == "path":
                start_pt = (obj["path"][0][1], obj["path"][0][2])
                if last_pt is not None:
                    draw_dashed_line(draw, last_pt, start_pt, fill=(211, 47, 47, 200)) # Rouge pointillé
                
                # Récupère la fin du trait bleu
                end_cmd = obj["path"][-1]
                if len(end_cmd) >= 3:
                    last_pt = (end_cmd[-2], end_cmd[-1])
                elif len(obj["path"]) > 1:
                    end_cmd = obj["path"][-2]
                    if len(end_cmd) >= 3: last_pt = (end_cmd[-2], end_cmd[-1])
            
            elif obj["type"] == "line":
                start_pt = (obj['left']+obj['x1'], obj['top']+obj['y1'])
                if last_pt is not None:
                    draw_dashed_line(draw, last_pt, start_pt, fill=(211, 47, 47, 200))
                last_pt = (obj['left']+obj['x2'], obj['top']+obj['y2'])
    return img

# --- 5. EXÉCUTION DE L'INTERFACE ---
inject_global_css()

col_sp1, col_logo, col_sp2 = st.columns([1, 1, 1])
with col_logo:
    try: st.image("2023_LOGO_SUNAE.png", use_container_width=True)
    except: st.markdown("<h1 style='text-align: center;'>SUNAE STUDIO</h1>", unsafe_allow_html=True)
st.write("---")

# ==========================================
# ÉTAPE 1 ET 2 : MENUS
# ==========================================
if st.session_state.step == 1:
    st.markdown("<span class='step-marker'></span>", unsafe_allow_html=True)
    st.markdown("<h2 style='text-align: center; margin-bottom: 30px;'>1. Sélectionnez votre Expérience</h2>", unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("img_texte.png", use_container_width=True)
        except: pass
        st.markdown("### Écrire un Texte")
        st.write("Incrustez vos mots préférés dans le sable.")
        st.button("Choisir", key="btn_mod_text", on_click=set_module, args=("Texte Automatique",))
    with c2:
        try: st.image("img_dessin.png", use_container_width=True)
        except: pass
        st.markdown("### Dessin Libre")
        st.write("Laissez parler votre créativité.")
        st.button("Choisir", key="btn_mod_draw", on_click=set_module, args=("Dessin Libre",))
    with c3:
        try: st.image("img_svg.png", use_container_width=True)
        except: pass
        st.markdown("### Convertir Fichier SVG")
        st.write("Transformez vos logos et motifs existants.")
        st.button("Choisir", key="btn_mod_svg", on_click=set_module, args=("Fichier SVG",))

elif st.session_state.step == 2:
    st.markdown("<span class='step-marker step2-marker'></span>", unsafe_allow_html=True)
    st.button("⬅ Retour aux expériences", on_click=reset_app)
    st.markdown(f"<h2 style='text-align: center; margin-bottom: 30px;'>2. Votre Table Sunae</h2>", unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    with c1:
        try: st.image("carre_dimension L.png", use_container_width=True)
        except: pass
        st.markdown("### Dimension L")
        st.write("Rectangulaire - 2000x1000mm")
        st.button("Choisir", key="btn_tab_dl", on_click=set_table, args=("Dimension L",))
    with c2:
        try: st.image("carre_Origin S.png", use_container_width=True)
        except: pass
        st.markdown("### Origin S")
        st.write("Ronde - Ø850mm")
        st.button("Choisir", key="btn_tab_os", on_click=set_table, args=("Origin S",))
    with c3:
        try: st.image("carre_dimension S.png", use_container_width=True)
        except: pass
        st.markdown("### Dimension S")
        st.write("Rectangulaire - 1400x700mm")
        st.button("Choisir", key="btn_tab_ds", on_click=set_table, args=("Dimension S",))

# ==========================================
# ÉTAPE 3 : ESPACE DE TRAVAIL
# ==========================================
elif st.session_state.step == 3:
    cfg = TABLE_CONFIGS[st.session_state.table]
    w, h = cfg["canvas_w"], cfg["canvas_h"]
    
    c_btn, c_title = st.columns([1, 4])
    c_btn.button("⬅ Changer de table", on_click=lambda: setattr(st.session_state, 'step', 2))
    c_title.markdown(f"<h3 style='text-align: center;'>Studio : {st.session_state.module} | {st.session_state.table}</h3>", unsafe_allow_html=True)
    st.write("---")

    if st.session_state.module == "Dessin Libre":
        st.markdown("#### Simulation du parcours de la bille")
        slider_val = st.slider(" ", 0, 100, 100, label_visibility="collapsed")
        st.write("---")

        col_tools, col_canvas = st.columns([1, 3])
        
        with col_tools:
            st.markdown("### Outils de Dessin")
            drawing_mode = st.radio("Mode :", ("✏️ Dessiner", "📏 Ligne Droite"))
            c_btn1, c_btn2 = st.columns(2)
            c_btn1.button("↩ Étape Préc.", on_click=undo_last_stroke, use_container_width=True)
            c_btn2.button("🗑 Reset", on_click=reset_drawing, use_container_width=True)
            
            d_mode = "freedraw" if drawing_mode == "✏️ Dessiner" else "line"
            
            st.markdown("---")
            st.markdown("### Image de fond")
            uploaded_file = st.file_uploader("Importer une image", type=["png", "jpg", "jpeg"], label_visibility="collapsed")
            bg_scale = st.slider("Échelle", 0.1, 3.0, 1.0, 0.05)
            bg_angle = st.slider("Rotation (°)", -180, 180, 0)
            bg_pan_x = st.slider("Déplacer X", -400, 400, 0)
            bg_pan_y = st.slider("Déplacer Y", -400, 400, 0)
            st.markdown("<br>", unsafe_allow_html=True)
            st.button("💾 EXPORTER (.THR)", type="primary", use_container_width=True)

        with col_canvas:
            # CSS ANTI-FOND-NOIR : Force la couleur sable sur l'iframe
            br = "50%" if cfg["is_round"] else "20px"
            st.markdown(f"""<style>
            iframe[title="streamlit_drawable_canvas.st_canvas"], svg.sunae-canvas-frame {{
                border: 4px dashed #bdc3c7 !important; border-radius: {br} !important;
                background-color: #f4ebd8 !important; /* Sable garanti */
                margin: 0 auto !important; display: block !important;
                width: {w}px !important; height: {h}px !important;
            }}
            </style>""", unsafe_allow_html=True)
            
            # --- GÉNÉRATION DU FOND DE BASE ---
            base_img = get_base_image(uploaded_file, bg_scale, bg_angle, bg_pan_x, bg_pan_y, w, h)
            
            # === MODE 1 : DESSIN (Slider 100%) ===
            if slider_val == 100:
                # Ajoute les lignes rouges à l'image envoyée au canevas
                bg_with_red_lines = add_red_lines_to_image(base_img, st.session_state.my_drawing)
                
                canvas_result = st_canvas(
                    fill_color="rgba(255, 165, 0, 0)",
                    stroke_width=3, stroke_color="#2980b9",
                    background_color="#f4ebd8", # Sable garanti
                    background_image=bg_with_red_lines, # L'image contient les pointillés rouges !
                    height=h, width=w,
                    drawing_mode=d_mode,
                    initial_drawing=st.session_state.my_drawing,
                    display_toolbar=False,
                    key=f"canvas_{st.session_state.canvas_key}", # Clé statique = PAS DE CLIGNOTEMENT
                )
                
                # Enregistrement silencieux du tracé
                if canvas_result.json_data is not None:
                    st.session_state.my_drawing = canvas_result.json_data
            
            # === MODE 2 : SIMULATION (Slider < 100%) ===
            else:
                # En simulation, on prend l'image de base SANS lignes rouges (car on va les animer en SVG)
                buffered = BytesIO()
                base_img.save(buffered, format="PNG")
                b64_base = base64.b64encode(buffered.getvalue()).decode()
                
                svg_content = f'<svg class="sunae-canvas-frame" width="{w}" height="{h}" viewBox="0 0 {w} {h}" style="background-color: #f4ebd8;">'
                svg_content += f'<image href="data:image/png;base64,{b64_base}" x="0" y="0" width="{w}" height="{h}" />'
                
                if st.session_state.my_drawing and "objects" in st.session_state.my_drawing:
                    segments = []
                    last_pt = None
                    start_dot = None
                    
                    for obj in st.session_state.my_drawing["objects"]:
                        if obj["type"] == "path":
                            s_pt = (obj["path"][0][1], obj["path"][0][2])
                            e_pt = (obj["path"][-1][-2], obj["path"][-1][-1])
                            if start_dot is None: start_dot = s_pt
                            if last_pt is not None:
                                dist = math.hypot(s_pt[0] - last_pt[0], s_pt[1] - last_pt[1])
                                segments.append({"type": "travel", "start": last_pt, "end": s_pt, "cmd_len": max(1, int(dist / 5))})
                            d_str = " ".join([ " ".join(map(str, cmd)) for cmd in obj["path"] ])
                            segments.append({"type": "draw", "d": d_str, "path": obj["path"], "start": s_pt, "end": e_pt, "cmd_len": len(obj["path"]), "obj": obj})
                            
                            end_cmd = obj["path"][-1]
                            if len(end_cmd) >= 3: last_pt = (end_cmd[-2], end_cmd[-1])
                            elif len(obj["path"]) > 1:
                                end_cmd = obj["path"][-2]
                                if len(end_cmd) >= 3: last_pt = (end_cmd[-2], end_cmd[-1])
                                
                        elif obj["type"] == "line":
                            s_pt = (obj['left']+obj['x1'], obj['top']+obj['y1'])
                            e_pt = (obj['left']+obj['x2'], obj['top']+obj['y2'])
                            if start_dot is None: start_dot = s_pt
                            if last_pt is not None:
                                dist = math.hypot(s_pt[0] - last_pt[0], s_pt[1] - last_pt[1])
                                segments.append({"type": "travel", "start": last_pt, "end": s_pt, "cmd_len": max(1, int(dist / 5))})
                            segments.append({"type": "line", "start": s_pt, "end": e_pt, "cmd_len": 2, "obj": obj})
                            last_pt = e_pt
                    
                    if segments:
                        total_cmds = sum(seg["cmd_len"] for seg in segments)
                        cmds_to_draw = int((slider_val / 100.0) * total_cmds)
                        current_cmds = 0
                        current_end = None
                        
                        for seg in segments:
                            if current_cmds >= cmds_to_draw: break
                            if seg["type"] == "travel":
                                if current_cmds + seg["cmd_len"] <= cmds_to_draw:
                                    svg_content += f'<line x1="{seg["start"][0]}" y1="{seg["start"][1]}" x2="{seg["end"][0]}" y2="{seg["end"][1]}" stroke="#d32f2f" stroke-width="2" stroke-dasharray="5,5" opacity="0.8"/>'
                                    current_end = seg["end"]
                                    current_cmds += seg["cmd_len"]
                                else:
                                    ratio = (cmds_to_draw - current_cmds) / seg["cmd_len"]
                                    px = seg["start"][0] + (seg["end"][0] - seg["start"][0]) * ratio
                                    py = seg["start"][1] + (seg["end"][1] - seg["start"][1]) * ratio
                                    svg_content += f'<line x1="{seg["start"][0]}" y1="{seg["start"][1]}" x2="{px}" y2="{py}" stroke="#d32f2f" stroke-width="2" stroke-dasharray="5,5" opacity="0.8"/>'
                                    current_end = (px, py)
                                    break
                            elif seg["type"] == "draw":
                                color = seg["obj"].get("stroke", "#2980b9")
                                if current_cmds + seg["cmd_len"] <= cmds_to_draw:
                                    svg_content += f'<path d="{seg["d"]}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
                                    current_end = seg["end"]
                                    current_cmds += seg["cmd_len"]
                                else:
                                    partial = seg["path"][:max(1, cmds_to_draw - current_cmds)]
                                    d_str = " ".join([ " ".join(map(str, cmd)) for cmd in partial ])
                                    svg_content += f'<path d="{d_str}" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
                                    current_end = (partial[-1][-2], partial[-1][-1])
                                    break
                            elif seg["type"] == "line":
                                color = seg["obj"].get("stroke", "#2980b9")
                                if current_cmds + seg["cmd_len"] <= cmds_to_draw:
                                    svg_content += f'<line x1="{seg["start"][0]}" y1="{seg["start"][1]}" x2="{seg["end"][0]}" y2="{seg["end"][1]}" stroke="{color}" stroke-width="3" stroke-linecap="round"/>'
                                    current_end = seg["end"]
                                    current_cmds += seg["cmd_len"]
                                else:
                                    ratio = (cmds_to_draw - current_cmds) / seg["cmd_len"]
                                    px = seg["start"][0] + (seg["end"][0] - seg["start"][0]) * ratio
                                    py = seg["start"][1] + (seg["end"][1] - seg["start"][1]) * ratio
                                    svg_content += f'<line x1="{seg["start"][0]}" y1="{seg["start"][1]}" x2="{px}" y2="{py}" stroke="{color}" stroke-width="3" stroke-linecap="round"/>'
                                    current_end = (px, py)
                                    break
                        
                        if cmds_to_draw > 0 and start_dot:
                            svg_content += f'<circle cx="{start_dot[0]}" cy="{start_dot[1]}" r="6" fill="#2ecc71"/>'
                        if current_end:
                            svg_content += f'<circle cx="{current_end[0]}" cy="{current_end[1]}" r="6" fill="#c0392b"/>'
                
                svg_content += '</svg>'
                st.markdown(svg_content, unsafe_allow_html=True)
                
    else:
        st.warning(f"Le module '{st.session_state.module}' est en cours de portage vers le web.")
