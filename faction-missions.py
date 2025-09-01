
import json
import uuid
from datetime import datetime
from pathlib import Path
import streamlit as st
import base64

APP_TITLE = "Waterdeep Faction Missions"
DATA_FILE = Path("missions.json")
FACTIONS = [
    "Emerald Enclave 🌿",
    "Lord's Alliance 👑",
    "Harpers 🎼",
    "Force Grey 🥷",
]

# Path to your background image (put it next to app.py or adjust as needed)
BACKGROUND_IMAGE = "background.jpg"


# ---------- Data Layer ----------

def _empty_db():
    return {
        "version": 1,
        "updated_at": datetime.utcnow().isoformat(),
        "missions": []  # list of mission dicts
    }


def load_db():
    if DATA_FILE.exists():
        try:
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            if "missions" not in data:
                data = _empty_db()
            return data
        except Exception:
            return _empty_db()
    else:
        return _empty_db()


def save_db(data):
    data["updated_at"] = datetime.utcnow().isoformat()
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ---------- Helpers ----------

def new_mission(faction: str, title: str, reward: str, location: str, hook: str):
    return {
        "id": str(uuid.uuid4()),
        "faction": faction,
        "title": title.strip(),
        "reward": reward.strip(),
        "location": location.strip(),
        "hook": hook.strip(),
        "status": "Available",  # Available | Accepted | Completed | Failed
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }


def get_faction_missions(db, faction: str):
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


# ---------- UI Components ----------

CARD_CSS = """
<style>
.card {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 14px;
  padding: 0.9rem 1rem;
  margin: 0.4rem 0 0.8rem 0;
  box-shadow: 0 2px 14px rgba(0,0,0,0.08);
  background: rgba(0,0,0,0.25);
}
.badge { display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; opacity: 0.85; }
.badge-Available { background: rgba(16,185,129,0.15); color: rgb(16,185,129); }
.badge-Accepted  { background: rgba(59,130,246,0.15); color: rgb(59,130,246); }
.badge-Completed { background: rgba(139,92,246,0.15); color: rgb(139,92,246); }
.badge-Failed    { background: rgba(244,63,94,0.15); color: rgb(244,63,94); }
.small { opacity: 1.0; font-size: 1.0rem; }
.title { font-weight: 700; font-size: 1.5rem; }
</style>
"""


def mission_card(m, key_prefix: str = ""):
    st.markdown(CARD_CSS, unsafe_allow_html=True)
    with st.container(border=False):
        st.markdown(
            f"""
            <div class="card">
              <div class="title">{m['title']}</div>
              <div class="small">📍 {m['location']} · 💰 {m['reward']} · <span class="badge badge-{m['status']}">{m['status']}</span></div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        cols = st.columns([1, 1, 1, 2])
        open_clicked = cols[0].button("Open", key=f"open_{key_prefix}{m['id']}")
        if open_clicked:
            st.session_state["selected_mission_id"] = m["id"]
            st.rerun()


def mission_detail_view(db, mission_id: str):
    m = next((x for x in db["missions"] if x["id"] == mission_id), None)
    if not m:
        st.info("This mission has vanished into the Weave.")
        return

    st.header(m["title"])
    st.write(f"**Faction:** {m['faction']}")
    st.write(f"**Location:** {m['location']}")
    st.write(f"**Reward:** {m['reward']}")
    st.write(f"**Status:** {m['status']}")

    # --- Player actions (snappy, state-safe) ---
    c1, c2, c3, c4 = st.columns(4)
    status = m["status"]
    if status == "Available":
        if c1.button("Accept mission", key=f"accept_{m['id']}"):
            update_mission(db, m["id"], status="Accepted")
            st.success("Mission accepted.")
            st.rerun()
    elif status == "Accepted":
        if c1.button("Mark Completed", key=f"complete_{m['id']}"):
            update_mission(db, m["id"], status="Completed")
            st.success("Marked completed.")
            st.rerun()
        if c2.button("Mark Failed", key=f"fail_{m['id']}"):
            update_mission(db, m["id"], status="Failed")
            st.warning("Marked failed.")
            st.rerun()
        if c3.button("Reset to Available", key=f"reset_{m['id']}"):
            update_mission(db, m["id"], status="Available")
            st.info("Reset to available.")
            st.rerun()
    else:  # Completed or Failed
        if c1.button("Reopen (Available)", key=f"reopen_{m['id']}"):
            update_mission(db, m["id"], status="Available")
            st.info("Reopened.")
            st.rerun()
        if c2.button("Accept", key=f"accept2_{m['id']}"):
            update_mission(db, m["id"], status="Accepted")
            st.success("Accepted.")
            st.rerun()

    st.write("")
    st.subheader("Story Hook / Context")
    st.write(m["hook"] or "No hook provided yet.")

    st.divider()
    if st.button("← Back to Dashboard", key=f"back_{m['id']}", use_container_width=True):
        st.session_state["selected_mission_id"] = None
        st.rerun()


# ---------- Background ----------

def set_app_background(image_path: str, opacity: float = 0.58):
    """Inject a full-app background image at given opacity without blocking UI.
    Works across recent Streamlit versions by layering behind the app view container.
    """
    try:
        img_bytes = Path(image_path).read_bytes()
        b64 = base64.b64encode(img_bytes).decode()
        css = f"""
        <style>
        /* Keep the app transparent so our pseudo-element shows through */
        [data-testid="stAppViewContainer"] {{
            background: transparent !important;
        }}
        /* Background layer behind everything */
        [data-testid="stAppViewContainer"]::before {{
            content: "";
            position: fixed;
            inset: 0;
            background-image: url('data:image/jpeg;base64,{b64}');
            background-size: cover;
            background-position: center;
            background-attachment: fixed;
            opacity: {opacity};
            z-index: 0;              /* base layer */
            pointer-events: none;    /* never intercept clicks */
        }}
        /* Ensure real UI sits above the background */
        .main, .block-container, [data-testid="stSidebar"], [data-testid="stHeader"] {{
            position: relative;
            z-index: 1;
        }}
        </style>
        """
        st.markdown(css, unsafe_allow_html=True)
    except Exception as e:
        st.caption(f"Background image not loaded: {e}")


def inject_ui_chrome(ui_opacity: float = 0.35, sidebar_opacity: float = 0.50, expander_opacity: float = 0.28):
    """Adds semi-transparent dark backgrounds to improve readability over imagery
    and centers layout & widgets for a unified look."""
    css = f"""
    <style>
    /* Main content panel */
    .block-container {{
        background: rgba(0,0,0,{ui_opacity});
        border-radius: 16px;
        padding: 1rem 1.25rem;
        backdrop-filter: blur(2px);
        /* Center the whole content area and limit width for readability */
        max-width: 1100px;
        margin-left: auto;
        margin-right: auto;
        text-align: center;
    }}

    /* Center typical text blocks */
    .block-container [data-testid="stMarkdownContainer"],
    .block-container p, .block-container h1, .block-container h2, .block-container h3,
    .block-container h4, .block-container h5, .block-container h6 {{
        text-align: center;
    }}

    /* Sidebar readability & centering */
    [data-testid="stSidebar"] {{
        background: rgba(0,0,0,{sidebar_opacity});
        backdrop-filter: blur(3px);
        text-align: center;
    }}
    [data-testid="stSidebar"] [data-testid="stMarkdownContainer"],
    [data-testid="stSidebar"] label {{
        text-align: center;
        width: 100%;
    }}

    /* Inputs centered */
    .stTextInput input, .stTextArea textarea {{
        text-align: center;
    }}
    .stSelectbox > div, .stMultiSelect > div {{
        margin-left: auto; margin-right: auto;
    }}

    /* Buttons centered */
    .stButton > button, .stDownloadButton > button {{
        display: block; /* full-width block for margin auto to work */
        margin-left: auto; margin-right: auto;
    }}

    /* Make column content center-aligned */
    [data-testid="column"] > div {{
        display: flex; flex-direction: column; align-items: center;
    }}

    /* Expanders & headers */
    .stExpander, details {{
        background: rgba(0,0,0,{expander_opacity}) !important;
        border-radius: 12px !important;
    }}
    [data-testid="stHeader"] {{
        background: rgba(0,0,0,{ui_opacity});
        backdrop-filter: blur(2px);
    }}

    /* Mission cards center */
    .card {{ text-align: center; }}
    .card .small {{ justify-content: center; display: flex; gap: 0.5rem; }}
    </style>
    """
    st.markdown(css, unsafe_allow_html=True)


# ---------- Pages ----------

def dm_panel(db):
    st.subheader("Dungeon Master Tools")

    # Quick import/export
    with st.expander("Backup & Restore", expanded=False):
        c1, c2 = st.columns(2)
        with c1:
            st.download_button(
                label="Download missions.json",
                data=json.dumps(db, indent=2, ensure_ascii=False),
                file_name="missions.json",
                mime="application/json",
            )
        with c2:
            uploaded = st.file_uploader("Restore from JSON", type=["json"], accept_multiple_files=False)
            if uploaded is not None:
                try:
                    data = json.loads(uploaded.read().decode("utf-8"))
                    if isinstance(data, dict) and "missions" in data:
                        save_db(data)
                        st.success("Database restored. Refresh the app.")
                    else:
                        st.error("Invalid file: expected a JSON object with a 'missions' list.")
                except Exception as e:
                    st.error(f"Could not load file: {e}")

    # Add & manage missions per faction
    for faction in FACTIONS:
        with st.expander(f"➕ Add / Manage — {faction}", expanded=False):
            st.markdown("**Add a mission**")
            with st.form(f"add_form_{faction}"):
                title = st.text_input("Title", key=f"title_{faction}")
                reward = st.text_input("Reward", key=f"reward_{faction}")
                location = st.text_input("Location", key=f"location_{faction}")
                hook = st.text_area("Story hook / context", key=f"hook_{faction}")
                submitted = st.form_submit_button("Add Mission")
            if submitted:
                if not title.strip():
                    st.warning("Title is required.")
                else:
                    m = new_mission(faction, title, reward, location, hook)
                    db["missions"].append(m)
                    save_db(db)
                    st.success("Mission added.")

            st.markdown("---")
            st.markdown("**Existing missions**")
            missions = get_faction_missions(db, faction)
            if not missions:
                st.write("No missions yet.")
            for m in missions:
                with st.expander(f"✏️ {m['title']}", expanded=False):
                    c1, c2 = st.columns([3, 1])
                    with c1:
                        title = st.text_input("Title", value=m["title"], key=f"edit_title_{m['id']}")
                        reward = st.text_input("Reward", value=m["reward"], key=f"edit_reward_{m['id']}")
                        location = st.text_input("Location", value=m["location"], key=f"edit_location_{m['id']}")
                        status = st.selectbox(
                            "Status",
                            ["Available", "Accepted", "Completed", "Failed"],
                            index=["Available", "Accepted", "Completed", "Failed"].index(m["status"]),
                            key=f"edit_status_{m['id']}"
                        )
                        hook = st.text_area("Story hook / context", value=m["hook"], key=f"edit_hook_{m['id']}")
                    with c2:
                        st.write("")
                        st.write("")
                        if st.button("Save", key=f"save_{m['id']}"):
                            update_mission(db, m["id"], title=title, reward=reward, location=location, status=status, hook=hook)
                            st.success("Saved.")
                            st.rerun()
                        if st.button("Delete", key=f"delete_{m['id']}"):
                            if delete_mission(db, m["id"]):
                                st.success("Deleted.")
                                st.rerun()
                            else:
                                st.error("Could not delete (mission not found).")


def player_dashboard(db):
    st.subheader("Player Dashboard")

    # Filter/search quality-of-life
    with st.expander("Filters", expanded=False):
        col1, col2 = st.columns(2)
        with col1:
            status_filter = st.multiselect(
                "Status",
                ["Available", "Accepted", "Completed", "Failed"],
                default=["Available", "Accepted"],
            )
        with col2:
            search = st.text_input("Search title / location / reward")

    for faction in FACTIONS:
        st.markdown(f"### {faction}")
        missions = get_faction_missions(db, faction)
        if 'status_filter' in locals() and status_filter:
            missions = [m for m in missions if m['status'] in status_filter]
        if 'search' in locals() and search.strip():
            q = search.lower().strip()
            missions = [
                m for m in missions
                if q in m['title'].lower() or q in m['location'].lower() or q in m['reward'].lower()
            ]

        if not missions:
            st.caption("No missions to show.")
        for m in missions:
            mission_card(m, key_prefix=faction.replace(' ', '_'))


# ---------- App ----------

def main():
    st.set_page_config(page_title=APP_TITLE, page_icon="🗺️", layout="wide", initial_sidebar_state="collapsed")
    st.title(APP_TITLE)

    if "selected_mission_id" not in st.session_state:
        st.session_state["selected_mission_id"] = None

    db = load_db()

    with st.sidebar:
        st.header("View Mode")
        dm_mode = st.toggle("DM Mode", value=False, help="Toggle to add/edit missions.")
        show_bg = st.toggle("Show background", value=True)
        bg_opacity = st.slider("Background opacity", 0.0, 1.0, 0.58, 0.01)
        st.caption(f"Database updated: {db['updated_at']}")

    # Apply background (optional)
    #if show_bg:
    set_app_background(BACKGROUND_IMAGE, opacity=bg_opacity)
    # Always add UI readability layer and centering
    inject_ui_chrome()

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
