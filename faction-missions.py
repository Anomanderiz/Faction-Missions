import json
import uuid
from datetime import datetime
from pathlib import Path
import streamlit as st
import base64

APP_TITLE = "Waterdeep Faction Missions"

# Data lives in the user's home dir (as before)
APP_DIR = Path.home() / ".waterdeep_faction_missions"
APP_DIR.mkdir(parents=True, exist_ok=True)
DATA_FILE = APP_DIR / "missions.json"  # persistent on this machine

# App root (for assets)
APP_ROOT = Path(__file__).resolve().parent
BACKGROUND_IMAGE = APP_ROOT / "assets" / "parchment.jpg"

FACTIONS = [
    "Emerald Enclave 🌿",
    "Lord's Alliance 👑",
    "Harpers 🎼",
    "Force Grey 🥷",
    "Zhentarim 🐍",
    "Order of the Gauntlet 🛡",
]

# ---------- Utility ----------

def _empty_db():
    return {
        "version": 1,
        "updated_at": datetime.utcnow().isoformat(),
        "missions": []  # list of mission dicts
    }

def load_db():
    # Prefer in-memory session; else read from disk; else empty
    if 'db' in st.session_state and isinstance(st.session_state['db'], dict):
        return st.session_state['db']
    if DATA_FILE.exists():
        try:
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            if "missions" not in data:
                data = _empty_db()
            st.session_state['db'] = data
            return data
        except Exception:
            data = _empty_db()
            st.session_state['db'] = data
            return data
    data = _empty_db()
    st.session_state['db'] = data
    return data

def save_db(data):
    data['updated_at'] = datetime.utcnow().isoformat()
    # Ensure app dir exists (defensive)
    APP_DIR.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    st.session_state['db'] = data

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
        "status": "Available",  # Available | Accepted | Completed | Failed
        "assigned_to": "",      # Player/PC name(s)
        "notes": ""
    }

def get_faction_missions(db, faction):
    return [m for m in db["missions"] if m["faction"] == faction]

def update_mission(db, mission_id: str, **fields):
    changed = False
    for m in db["missions"]:
        if m["id"] == mission_id:
            for k, v in fields.items():
                if v is not None:
                    m[k] = v
            m["updated_at"] = datetime.utcnow().isoformat()
            changed = True
            break
    if changed:
        save_db(db)
    return changed

def delete_mission(db, mission_id: str):
    before = len(db["missions"])
    db["missions"] = [m for m in db["missions"] if m["id"] != mission_id]
    if len(db["missions"]) != before:
        save_db(db)
        return True
    return False

# ---------- UI helpers ----------

def mission_card(m, key_prefix=""):
    with st.container(border=True):
        c1, c2 = st.columns([3, 1])
        with c1:
            st.subheader(m["title"])
            st.caption(f'{m["faction"]} • {m["location"]} • Reward: {m["reward"]}')
            st.write(m["hook"])
            if m.get("notes"):
                with st.expander("DM Notes"):
                    st.write(m["notes"])
        with c2:
            st.markdown(f"**Status:** {m['status']}")
            if m.get("assigned_to"):
                st.caption(f"Assigned to: {m['assigned_to']}")
            st.caption(f"Updated: {m['updated_at'].split('T')[0]}")

        c3, c4, c5, c6 = st.columns(4)
        with c3:
            if st.button("View", key=f"{key_prefix}view-{m['id']}"):
                st.session_state["selected_mission_id"] = m["id"]
                st.rerun()
        with c4:
            if st.button("Accept", key=f"{key_prefix}accept-{m['id']}"):
                update_mission(m_db, m["id"], status="Accepted")
                st.rerun()
        with c5:
            if st.button("Complete", key=f"{key_prefix}complete-{m['id']}"):
                update_mission(m_db, m["id"], status="Completed")
                st.rerun()
        with c6:
            if st.button("Fail", key=f"{key_prefix}fail-{m['id']}"):
                update_mission(m_db, m["id"], status="Failed")
                st.rerun()

def mission_detail_view(db, mission_id: str):
    m = next((x for x in db["missions"] if x["id"] == mission_id), None)
    if not m:
        st.warning("Mission not found.")
        return

    st.header(m["title"])
    st.caption(f'{m["faction"]} • {m["location"]}')
    st.write(m["hook"])
    st.divider()

    col1, col2, col3 = st.columns([2, 2, 1])
    with col1:
        status = st.selectbox(
            "Status",
            ["Available", "Accepted", "Completed", "Failed"],
            index=["Available","Accepted","Completed","Failed"].index(m["status"])
        )
    with col2:
        assigned_to = st.text_input("Assigned To", value=m.get("assigned_to",""))
    with col3:
        st.caption(f"Last updated: {m['updated_at'].split('T')[0]}")

    notes = st.text_area("DM Notes", value=m.get("notes",""), height=160,
                         placeholder="Clues, complications, timers, consequences…")

    c1, c2, c3 = st.columns([1,1,1])
    with c1:
        if st.button("Save Changes", type="primary"):
            update_mission(db, mission_id, status=status, assigned_to=assigned_to, notes=notes)
            st.success("Saved.")
            st.rerun()
    with c2:
        if st.button("Delete Mission", type="secondary"):
            if delete_mission(db, mission_id):
                st.success("Deleted.")
                st.session_state["selected_mission_id"] = None
                st.rerun()
    with c3:
        if st.button("Back"):
            st.session_state["selected_mission_id"] = None
            st.rerun()

# ---------- Background & Chrome ----------

def set_theme_background(image_path: str | Path, light_opacity=0.55, dark_opacity=0.18):
    """
    Restore the parchment background in light *and* dark modes without
    breaking Streamlit's theme contrast.
    """
    p = Path(image_path) if image_path is not None else None
    if p and p.exists():
        mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        b64 = base64.b64encode(p.read_bytes()).decode()
        tex = f"url('data:{mime};base64,{b64}')"
    else:
        # graceful fallback if the image is missing
        tex = ("radial-gradient(1200px 800px at 30% 8%, rgba(255,255,255,.06), rgba(0,0,0,0)),"
               "radial-gradient(1200px 900px at 90% 85%, rgba(0,0,0,.08), rgba(0,0,0,0))")

    st.markdown(f"""
    <style>
      /* Keep theme-managed colours so text stays readable in both modes */
      .stApp {{ background: var(--background-color) !important; }}
      [data-testid="stAppViewContainer"] {{ background: transparent !important; }}

      /* Texture layer */
      .stApp::before {{
        content: "";
        position: fixed; inset: 0; pointer-events: none; z-index: 0;
        background-image: {tex};
        background-size: cover; background-position: center; background-attachment: fixed;
        opacity: {light_opacity};
      }}

      /* Night-time parchment */
      @media (prefers-color-scheme: dark) {{
        .stApp::before {{ opacity: {dark_opacity}; filter: brightness(.75) contrast(.95) saturate(.9); }}
      }}

      /* Ensure UI sits above the overlay */
      .main, .block-container, [data-testid="stSidebar"], [data-testid="stHeader"] {{
        position: relative; z-index: 1;
      }}
    </style>
    """, unsafe_allow_html=True)

def inject_ui_chrome():
    # Title + strapline
    st.title(APP_TITLE)
    st.caption("A tidy docket of intrigues, errands, and glorious misadventures.")

    # Minimal garnish to keep things dashing yet legible on a textured backdrop
    st.markdown("""
    <style>
      .block-container {
        background: rgba(0,0,0,.55);
        border-radius: 16px;
        padding: 1rem 1.25rem;
        backdrop-filter: blur(2px);
        max-width: 1100px;
        margin-left: auto;
        margin-right: auto;
      }
      [data-testid="stSidebar"] {
        background: rgba(0,0,0,.50);
        backdrop-filter: blur(3px);
      }
      .stButton>button { border-radius: 10px; }
      /* Streamlit multiselect tags */
      [data-baseweb="tag"] { border-radius: 9999px !important; font-weight: 600; }
    </style>
    """, unsafe_allow_html=True)

# ---------- Panels ----------

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
            db["missions"].append(m)
            save_db(db)
            st.success("Mission added.")
            st.rerun()

    st.divider()
    c1, c2 = st.columns([2, 1], vertical_alignment="bottom")
    with c1:
        st.markdown("**Export / Backup**")
        j = json.dumps(db, indent=2, ensure_ascii=False)
        b64 = base64.b64encode(j.encode()).decode()
        st.download_button("Download JSON", data=j, file_name="missions.json", mime="application/json")

    with c2:
        uploaded = st.file_uploader("Restore from JSON", type=["json"], accept_multiple_files=False)
        if uploaded is not None:
            try:
                data = json.loads(uploaded.read().decode("utf-8"))
                if isinstance(data, dict) and "missions" in data:
                    save_db(data)
                    st.success("Database restored.")
                    st.rerun()
                else:
                    st.error("Invalid file: expected a JSON object with a 'missions' list.")
            except Exception as e:
                st.error(f"Could not load file: {e}")

def player_dashboard(db):
    st.subheader("Mission Board")

    # Filters
    f1, f2, f3 = st.columns([2, 2, 1])
    with f1:
        faction = st.multiselect("Faction", FACTIONS, default=FACTIONS)
    with f2:
        status = st.multiselect("Status", ["Available","Accepted","Completed","Failed"],
                                default=["Available","Accepted"])
    with f3:
        search = st.text_input("Search", placeholder="Title, location, hook…")

    filtered = []
    s_lower = (search or "").lower().strip()
    for m in db["missions"]:
        if m["faction"] not in faction:
            continue
        if m["status"] not in status:
            continue
        if s_lower and not (
            s_lower in m["title"].lower()
            or s_lower in m["location"].lower()
            or s_lower in m["hook"].lower()
            or s_lower in m.get("notes","").lower()
        ):
            continue
        filtered.append(m)

    if not filtered:
        st.info("No missions match your current filters.")
        return

    # Sort newest first
    filtered.sort(key=lambda x: x["updated_at"], reverse=True)

    # Render
    global m_db
    m_db = db  # used inside mission_card callbacks
    for m in filtered:
        mission_card(m, key_prefix="dash-")

# ---------- App ----------

def main():
    st.set_page_config(page_title=APP_TITLE, page_icon="🗺️",
                       layout="wide", initial_sidebar_state="collapsed")
    set_theme_background(BACKGROUND_IMAGE)  # ← parchment, theme-aware
    inject_ui_chrome()

    # One-time state init
    if "selected_mission_id" not in st.session_state:
        st.session_state["selected_mission_id"] = None

    db = load_db()

    with st.sidebar:
        st.header("View Mode")
        dm_mode = st.toggle("DM Mode", value=False, help="Toggle to add/edit missions.")
        st.caption(f"Database updated: {db.get('updated_at', '—')}")

    # Detail page if a mission is selected
    if st.session_state.get("selected_mission_id"):
        mission_detail_view(db, st.session_state["selected_mission_id"])
        return

    # Otherwise show the dashboards
    if dm_mode:
        dm_panel(db)
        st.divider()
    player_dashboard(db)

if __name__ == "__main__":
    main()
