import os
import shutil
import traceback

src_dir = r"C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b"
dest_dir = r"c:\Users\user\Documents\app\ai_tycoon\public\images"
log_path = r"c:\Users\user\Documents\app\ai_tycoon\copy_direct_out_python.txt"

mapping = {
    # Game logo candidates
    "game_logo_candidates_1781282203242.png": ("", "game_logo_candidates.png"),

    # Characters
    "char_musk_1781319565028.png": ("characters", "musk.png"),
    "char_jensen_1781319581046.png": ("characters", "jensen.png"),
    "char_zuck_1781319592813.png": ("characters", "zuck.png"),
    "char_jobs_1781319605670.png": ("characters", "jobs.png"),
    "char_google_1781319617666.png": ("characters", "google.png"),
    "char_jack_1781319628128.png": ("characters", "jack.png"),
    "char_ren_1781319640885.png": ("characters", "ren.png"),
    "char_pony_1781319651518.png": ("characters", "pony.png"),
    "char_liang_1781319660993.png": ("characters", "liang.png"),
    "char_robin_1781319672223.png": ("characters", "robin.png"),
    "char_tsmc_1781319683286.png": ("characters", "tsmc.png"),
    "char_toyota_1781319695894.png": ("characters", "toyota.png"),
    "char_lee_1781319706062.png": ("characters", "lee.png"),

    # Chibi avatars
    "chibi_musk_1781319721918.png": ("avatars", "musk_chibi.png"),
    "chibi_jensen_1781319731181.png": ("avatars", "jensen_chibi.png"),
    "chibi_zuck_1781319746893.png": ("avatars", "zuck_chibi.png"),
    "chibi_jobs_1781319756297.png": ("avatars", "jobs_chibi.png"),
    "chibi_google_1781319766178.png": ("avatars", "google_chibi.png"),
    "chibi_jack_1781319770000_1781340246015.png": ("avatars", "jack_chibi.png"),
    "chibi_ren_1781319780000_1781340255917.png": ("avatars", "ren_chibi.png"),
    "chibi_pony_1781319790000_1781340271006.png": ("avatars", "pony_chibi.png"),
    "chibi_liang_1781319800000_1781340282292.png": ("avatars", "liang_chibi.png"),
    "chibi_robin_1781319810000_1781340296091.png": ("avatars", "robin_chibi.png"),
    "chibi_tsmc_1781319820000_1781340310114.png": ("avatars", "tsmc_chibi.png"),
    "chibi_toyota_1781319830000_1781340324631.png": ("avatars", "toyota_chibi.png"),
    "chibi_lee_1781319840000_1781340337232.png": ("avatars", "lee_chibi.png"),

    # Group logos
    "logo_tesla_spacex_1781319850000_1781340352050.png": ("logos", "tesla_spacex.png"),
    "logo_nvidia_1781319860000_1781340362979.png": ("logos", "nvidia.png"),
    "logo_meta_1781319870000_1781340378907.png": ("logos", "meta.png"),
    "logo_apple_1781319880000_1781340394511.png": ("logos", "apple.png"),
    "logo_google_1781319890000_1781340407252.png": ("logos", "google.png"),
    "logo_alibaba_1781319900000_1781340420378.png": ("logos", "alibaba.png"),
    "logo_huawei_1781319910000_1781340434225.png": ("logos", "huawei.png"),
    "logo_tencent_1781319920000_1781340447411.png": ("logos", "tencent.png"),
    "logo_deepseek_1781319930000_1781340461089.png": ("logos", "deepseek.png"),
    "logo_baidu_1781319940000_1781340475660.png": ("logos", "baidu.png"),
    "logo_tsmc_1781319950000_1781358261270.png": ("logos", "tsmc.png"),
    "logo_toyota_1781319960000_1781358273659.png": ("logos", "toyota.png"),
    "logo_samsung_1781319970000_1781358285291.png": ("logos", "samsung.png"),

    # Flags
    "flag_us_final_1781320080000_1781407555201.png": ("flags", "flag_us.png"),
    "flag_cn_final_1781320090000_1781407569218.png": ("flags", "flag_cn.png"),
    "flag_tw_final_adjusted_1781320130000_1781408492119.png": ("flags", "flag_tw.png"),
    "flag_jp_final_1781320120000_1781407610993.png": ("flags", "flag_jp.png"),
    "flag_kr_final_1781320110000_1781407598054.png": ("flags", "flag_kr.png"),
}

with open(log_path, "w", encoding="utf-8") as log:
    def write_log(msg):
        print(msg)
        log.write(msg + "\n")
        log.flush()

    write_log("Starting copy_assets.py...")
    
    # Ensure dest folders exist
    for sub in ["characters", "avatars", "logos", "flags"]:
        p = os.path.join(dest_dir, sub)
        if not os.path.exists(p):
            os.makedirs(p, exist_ok=True)
            write_log(f"Created directory: {p}")

    success_count = 0
    fail_count = 0

    for src_file, (sub_dir, dest_file) in mapping.items():
        src_path = os.path.join(src_dir, src_file)
        dest_path = os.path.join(dest_dir, sub_dir, dest_file) if sub_dir else os.path.join(dest_dir, dest_file)
        
        try:
            if os.path.exists(src_path):
                shutil.copy2(src_path, dest_path)
                write_log(f"SUCCESS: {src_file} -> {dest_path}")
                success_count += 1
            else:
                write_log(f"ERROR: Source file does not exist: {src_path}")
                fail_count += 1
        except Exception as e:
            write_log(f"ERROR: Failed to copy {src_file} to {dest_path}: {e}")
            write_log(traceback.format_exc())
            fail_count += 1

    write_log(f"Copy completed. Success: {success_count}, Failed: {fail_count}")
