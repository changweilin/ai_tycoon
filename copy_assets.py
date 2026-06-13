import os
import shutil
import glob
import traceback

# Source directory is the artifact folder
src_dir = r"C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b"
# Destination directory in workspace
dest_dir = os.path.join("public", "images")
log_path = "log.txt"

with open(log_path, "w", encoding="utf-8") as log:
    def write_log(msg):
        print(msg)
        log.write(msg + "\n")
        log.flush()

    write_log("Starting copy_assets.py...")
    write_log(f"Current working directory: {os.getcwd()}")
    write_log(f"src_dir: {src_dir} (exists: {os.path.exists(src_dir)})")
    write_log(f"dest_dir: {dest_dir} (exists: {os.path.exists(dest_dir)})")

    def copy_file(src, dest_name, target_subfolder=""):
        try:
            target_dir = os.path.join(dest_dir, target_subfolder) if target_subfolder else dest_dir
            os.makedirs(target_dir, exist_ok=True)
            dest = os.path.join(target_dir, dest_name)
            shutil.copy2(src, dest)
            write_log(f"Copied {src} -> {dest}")
        except Exception as e:
            write_log(f"Failed to copy {src} -> {dest_name}: {e}")
            write_log(traceback.format_exc())

    # Check source files in artifact directory
    if os.path.exists(src_dir):
        files = os.listdir(src_dir)
        write_log(f"Files found in src_dir: {files}")
        
        # 1. Copy game_logo_candidates
        logo_files = [f for f in files if f.startswith("game_logo_candidates_") and f.endswith(".png")]
        if logo_files:
            latest_logo = max([os.path.join(src_dir, f) for f in logo_files], key=os.path.getmtime)
            copy_file(latest_logo, "game_logo_candidates.png")
            
        # 2. Copy characters (char_*.png)
        char_files = [f for f in files if f.startswith("char_") and f.endswith(".png")]
        for f in char_files:
            # Extract character name, e.g. char_musk_123.png -> musk.png
            parts = f.split("_")
            if len(parts) >= 2:
                char_name = parts[1]
                copy_file(os.path.join(src_dir, f), f"{char_name}.png", "characters")
                
        # 3. Copy chibis (chibi_*.png)
        chibi_files = [f for f in files if f.startswith("chibi_") and f.endswith(".png")]
        for f in chibi_files:
            # Extract chibi name, e.g. chibi_musk_123.png -> musk_chibi.png
            parts = f.split("_")
            if len(parts) >= 2:
                char_name = parts[1]
                copy_file(os.path.join(src_dir, f), f"{char_name}_chibi.png", "avatars")
                
    else:
        write_log("src_dir does not exist!")

    write_log("Finished copy_assets.py")
