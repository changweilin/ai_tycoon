import os
from PIL import Image

src_img_path = r"C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\game_logo_candidates_hitech_coldwar_1781410500716.png"
dest_logo_path = r"c:\Users\user\Documents\app\ai_tycoon\public\images\game_logo.png"

try:
    if os.path.exists(src_img_path):
        img = Image.open(src_img_path)
        width, height = img.size
        
        # 4x4 grid, so each logo is 1/4 of width and height
        cell_w = width // 4
        cell_h = height // 4
        
        # Row 1, Column 3 (0-indexed: row 0, col 2)
        left = 2 * cell_w
        top = 0 * cell_h
        right = 3 * cell_w
        bottom = 1 * cell_h
        
        cropped_img = img.crop((left, top, right, bottom))
        
        # Ensure destination directory exists
        os.makedirs(os.path.dirname(dest_logo_path), exist_ok=True)
        
        cropped_img.save(dest_logo_path)
        print(f"SUCCESS: Cropped logo saved to {dest_logo_path}")
    else:
        print(f"ERROR: Source image not found at {src_img_path}")
except Exception as e:
    print(f"ERROR: {e}")
