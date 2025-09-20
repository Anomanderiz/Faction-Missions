import json
import uuid
from datetime import datetime
from pathlib import Path
import base64
import streamlit as st

APP_TITLE = "Waterdeep Faction Missions"

# ---------- Storage ----------
APP_DIR = Path.home() / ".waterdeep_faction_missions"
APP_DIR.mkdir(parents=True, exist_ok=True)
DATA_FILE = APP_DIR / "missions.json"

APP_ROOT = Path(__file__).resolve().parent
BACKGROUND_IMAGE = APP_ROOT / "background.jpg"  # <- your repo image

FACTIONS = [
    "Emerald Enclave 🌿",
    "Lord's Alliance 👑",
    "Harpers 🎼",
    "Force Grey 🥷",
    "Zhentarim 🐍",
    "Order of the Gauntlet 🛡",
]

# ---------- DB ----------
def _empty_db():
    return {"version": 1, "updated_at": datetime.utcnow().isoformat(), "missions": []}

def load_db():
    if "db" in st.session_state and isinstance(st.session_state["db"], dict):
        return st.session_state["db"]
    if DATA_FILE.exists():
        try:
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            data = _empty_db()
    else:
        data = _empty_db()
    st.session_state["db"] = data
    return data

def save_db(data):
    data["updated_at"] = datetime.utcnow().isoformat()
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    st.session_state["db"] = data

def new_mission(faction, title, reward, location, hook):
    now = datetime.utcnow().isoformat()
    return {
        "id": str(uuid.uuid4()),
        "faction": faction,
        "title": title.strip(),
        "reward": reward.strip(),
        "location": location.strip(),
        "hook": hook.strip(),
        "created_at": now,
        "updated_at": now,
        "status": "Available",
        "assigned_to": "",
        "notes": "",
    }

def update_mission(db, mission_id: str, **fields):
    for m in db["missions"]:
        if m["id"] == mission_id:
            for k, v in fields.items():
                if v is not None:
                    m[k] = v
            m["updated_at"] = datetime.utcnow().isoformat()
            save_db(db)
            return True
    return False

def delete_mission(db, mission_id: str):
    before = len(db["missions"])
    db["missions"] = [m for m in db["missions"] if m["id"] != mission_id]
    if len(db["missions"]) != before:
        save_db(db)
        return True
    return False

# ---------- GLASS BACKGROUND & CHROME ----------
def set_glass_background(image_path: Path, overlay_strength=0.35, vignette=0.25, blur_px=0):
    """
    Full glass UI with your background.jpg.
    - overlay_strength: dark scrim to keep text legible (0..1)
    - vignette: extra darkening at edges (0..1)
    - blur_px: optional background blur (GPU expensive; 0 keeps image crisp)
    """
    if image_path.exists():
        mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
        b64 = base64.b64encode(image_path.read_bytes()).decode()
        url = f"data:{mime};base64,{b64}"
    else:
        # Fallback plain gradient if file missing
        url = None

    bg_image_css = (
        f"background-image: url('{url}');"
        if url
        else "background-image: radial-gradient(1200px 800px at 30% 8%, #1c1c1c, #0d0d0d);"
    )

    st.markdown(
        f"""
<style>
/* Page background (fixed) */
.stApp {{
  background: #0b0b0b !important;
}}
.stApp::before {{
  content: "";
  position: fixed; inset: 0; z-index: 0;
  {bg_image_css}
  background-size: cover; background-position: center; background-repeat: no-repeat;
  filter: blur({blur_px}px);
  transform: translateZ(0); /* hint for GPU */
}}

/* Global dark scrim + vignette to guarantee contrast on busy art */
.stApp::after {{
  content: "";
  position: fixed; inset: 0; z-index: 0;
  background:
    radial-gradient(1200px 800px at 50% 60%, rgba(0,0,0,0) 0%, rgba(0,0,0,{vignette}) 80%),
    rgba(0,0,0,{overlay_strength});
  pointer-events: none;
}}

/* Glass container for the main column */
.block-container {{
  position: relative; z-index: 1;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 18px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.35);
  backdrop-filter: blur(14px) saturate(120%);
  -webkit-backdrop-filter: blur(14px) saturate(120%);
  padding: 1rem 1.25rem;
  max-width: 1100px;
  margin-left: auto; margin-right: auto;
}}

/* Sidebar glass */
[data-testid="stSidebar"] {{
  background: rgba(255,255,255,0.08) !important;
  border-left: 1px solid rgba(255,255,255,0.2);
  backdrop-filter: blur(16px) saturate(130%);
  -webkit-backdrop-filter: blur(16px) saturate(130%);
}}

/* Make all "border=True" containers look like glass cards */
div[data-testid="stVerticalBlockBorderWrapper"] {{
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 16px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  backdrop-filter: blur(12px) saturate(125%);
  -webkit-backdrop-filter: blur(12px) saturate(125%);
}}

/* Typography – bright and crisp on dark art */
html, .stApp, .markdown, p, span, label, textarea, input, .stMarkdown, .stTextInput>div>div>input {{
  color: #eaeef5 !important;
}}
/* Dim secondary labels slightly */
label, .stCaption, .st-emotion-cache-16idsys p, .st-emotion-cache-1629p8f p {{ color: #c9d1e1 !important; }}
/* Inputs & buttons */
.stButton>button {{
  border-radius: 12px; border: 1px solid rgba(255,255,255,0.28);
  background: rgba(255,255,255,0.08);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}}
.stButton>button:hover {{ background: rgba(255,255,255,0.14); }}
/* Tag pills a bit punchier */
[data-baseweb="tag"] {{
  border-radius: 9999px !important; font-weight: 600;
  background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.22);
}}
/* Text inputs / selects glass */
.stTextInput>div>div>input, .stSelectbox>div>div>div, .stMultiSelect>div>div>div {{
  background: rgba(0,0,0,0.35) !important;
  border-radius: 10px !important;
  border: 1px solid rgba(255,255,255,0.22) !important;
}}
</style>
""",
        unsafe_allow_html=True,
    )

def chrome_header():
    st.title(APP_TITLE)
    st.caption("A tidy docket of intrigues, errands, and glorious misadventures.")

# ---------- UI ----------
def mission_card(m, key_prefix=""):
    with st.container(border=True):
        c1, c2 = st.columns([3, 1])
        with c1:
            st.subheader(m["title"])
            st.caption(f'{m["faction"]} • {m["location"]} • Reward: {m["reward"]}')
            st.write(m["hook"])
            if m.get("notes"):
                with st.expander("Notes"):
                    st.write(m["notes"])
        with c2:
            st.markdown(f"**Status:** {m['status']}")
            if m.get("assigned_to"):
                st.caption(f"Assigned to: {m['assigned_to']}")
            st.caption(f"Updated: {m['updated_at'].split('T')[0]}")

        c3, c4, c5, c6 = st.columns(4)
        with c3:
            if st.button("View", key=f"{key_prefix}view-{m['id']}"):
                st.session_state["selected_mission_id"] = m["id"]; st.rerun()
        with c4:
            if st.button("Accept", key=f"{key_prefix}accept-{m['id']}"):
                update_mission(m_db, m["id"], status="Accepted"); st.rerun()
        with c5:
            if st.button("Complete", key=f"{key_prefix}complete-{m['id']}"):
                update_mission(m_db, m["id"], status="Completed"); st.rerun()
        with c6:
            if st.button("Fail", key=f"{key_prefix}fail-{m['id']}"):
                update_mission(m_db, m["id"], status="Failed"); st.rerun()

def mission_detail_view(db, mission_id: str):
    m = next((x for x in db["missions"] if x["id"] == mission_id), None)
    if not m:
        st.warning("Mission not found."); return
    st.header(m["title"])
    st.caption(f'{m["faction"]} • {m["location"]}')
    st.write(m["hook"])
    st.divider()

    col1, col2, col3 = st.columns([2, 2, 1])
    with col1:
        status = st.selectbox("Status",
                              ["Available", "Accepted", "Completed", "Failed"],
                              index=["Available","Accepted","Completed","Failed"].index(m["status"]))
    with col2:
        assigned_to = st.text_input("Assigned To", value=m.get("assigned_to",""))
    with col3:
        st.caption(f"Last updated: {m['updated_at'].split('T')[0]}")

    notes = st.text_area("DM Notes", value=m.get("notes",""), height=160)

    c1, c2, c3 = st.columns([1,1,1])
    with c1:
        if st.button("Save Changes", type="primary"):
            update_mission(db, mission_id, status=status, assigned_to=assigned_to, notes=notes)
            st.success("Saved."); st.rerun()
    with c2:
        if st.button("Delete Mission", type="secondary"):
            if delete_mission(db, mission_id):
                st.success("Deleted."); st.session_state["selected_mission_id"] = None; st.rerun()
    with c3:
        if st.button("Back"): st.session_state["selected_mission_id"] = None; st.rerun()

def dm_panel(db):
    st.subheader("DM Panel")
    with st.expander("Add Mission", expanded=True):
        c1, c2 = st.columns(2)
        with c1:
            faction = st.selectbox("Faction", FACTIONS, index=0)
            title = st.text_input("Title", placeholder="Recover the Moonshard from the Crypt of Kelemvor")
            location = st.text_input("Location", placeholder="City of the Dead → Kelemvorite Crypt")
        with c2:
            reward = st.text_input("Reward", placeholder="300 gp + favour")
            hook = st.text_area("Hook", height=120,
                                placeholder="Witnesses saw necromancers ferrying a luminous shard into the crypt after midnight…")
        if st.button("Add Mission", type="primary", disabled=not title.strip()):
            m = new_mission(faction, title, reward, location, hook)
            db["missions"].append(m); save_db(db)
            st.success("Mission added."); st.rerun()

    st.divider()
    c1, c2 = st.columns([2, 1], vertical_alignment="bottom")
    with c1:
        st.markdown("**Export / Backup**")
        j = json.dumps(db, indent=2, ensure_ascii=False)
        st.download_button("Download JSON", data=j, file_name="missions.json", mime="application/json")
    with c2:
        uploaded = st.file_uploader("Restore from JSON", type=["json"])
        if uploaded is not None:
            try:
                data = json.loads(uploaded.read().decode("utf-8"))
                if isinstance(data, dict) and "missions" in data:
                    save_db(data); st.success("Database restored."); st.rerun()
                else:
                    st.error("Invalid file: expected a JSON object with a 'missions' list.")
            except Exception as e:
                st.error(f"Could not load file: {e}")

def player_dashboard(db):
    st.subheader("Mission Board")
    f1, f2, f3 = st.columns([2, 2, 1])
    with f1:
        faction = st.multiselect("Faction", FACTIONS, default=FACTIONS)
    with f2:
        status = st.multiselect("Status", ["Available","Accepted","Completed","Failed"],
                                default=["Available","Accepted"])
    with f3:
        search = st.text_input("Search", placeholder="Title, location, hook…")

    filtered, s = [], (search or "").lower().strip()
    for m in db["missions"]:
        if m["faction"] not in faction: continue
        if m["status"] not in status: continue
        if s and not (s in m["title"].lower() or s in m["location"].lower()
                      or s in m["hook"].lower() or s in m.get("notes","").lower()):
            continue
        filtered.append(m)

    if not filtered:
        st.info("No missions match your current filters."); return

    filtered.sort(key=lambda x: x["updated_at"], reverse=True)
    global m_db; m_db = db
    for m in filtered:
        mission_card(m, key_prefix="dash-")

def tweak_top_bar(mode: str = "compact"):
    """
    mode:
      - 'compact'   → transparent, slim, keeps the sidebar toggle
      - 'glass'     → floating glass pill for the toolbar
      - 'hidden'    → removes the header entirely
    """
    if mode == "hidden":
        st.markdown("""
        <style>
          header[data-testid="stHeader"] { display: none !important; }
          .block-container { padding-top: 1rem; } /* pull content up */
        </style>
        """, unsafe_allow_html=True)
        return

    if mode == "glass":
        st.markdown("""
        <style>
          header[data-testid="stHeader"] { background: transparent !important; box-shadow: none !important; }
          /* Float the toolbar as a glass pill in the top-right */
          [data-testid="stToolbar"] {
            position: fixed; top: 10px; right: 14px; z-index: 1000;
            background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.22);
            border-radius: 12px; padding: 4px 8px;
            backdrop-filter: blur(8px) saturate(130%); -webkit-backdrop-filter: blur(8px) saturate(130%);
          }
        </style>
        """, unsafe_allow_html=True)
        return

    # 'compact' (default): keep the sidebar toggle, but make the bar transparent and slim
    st.markdown("""
    <style>
      /* Strip the heavy header styling */
      header[data-testid="stHeader"] { background: transparent !important; box-shadow: none !important; }
      /* Compress header height without hiding the sidebar toggle */
      header[data-testid="stHeader"] > div:first-child { padding-top: 6px !important; padding-bottom: 6px !important; }
      /* Give the toolbar a subtle glass chip so it doesn’t float naked */
      [data-testid="stToolbar"] {
        background: rgba(0,0,0,0.30); border: 1px solid rgba(255,255,255,0.18);
        border-radius: 10px; padding: 2px 6px;
        backdrop-filter: blur(6px) saturate(120%); -webkit-backdrop-filter: blur(6px) saturate(120%);
      }
    </style>
    """, unsafe_allow_html=True)


# ---------- App ----------
def main():
    st.set_page_config(page_title=APP_TITLE, page_icon="🗺️", layout="wide", initial_sidebar_state="collapsed")
    set_glass_background(BACKGROUND_IMAGE, overlay_strength=0.38, vignette=0.30, blur_px=0)
    tweak_top_bar("hidden")   # try 'glass' or 'hidden' if you prefer

    chrome_header()

    if "selected_mission_id" not in st.session_state:
        st.session_state["selected_mission_id"] = None

    db = load_db()

    with st.sidebar:
        st.header("View Mode")
        dm_mode = st.toggle("DM Mode", value=False, help="Toggle to add/edit missions.")
        st.caption(f"Database updated: {db.get('updated_at', '—')}")

    if st.session_state.get("selected_mission_id"):
        mission_detail_view(db, st.session_state["selected_mission_id"])
        return

    if dm_mode:
        dm_panel(db)
        st.divider()
    player_dashboard(db)

if __name__ == "__main__":
    main()
