# Ensure folders exist
$destDir = "c:\Users\user\Documents\app\ai_tycoon\public\images"
New-Item -ItemType Directory -Force -Path "$destDir\characters" | Out-Null
New-Item -ItemType Directory -Force -Path "$destDir\avatars" | Out-Null
New-Item -ItemType Directory -Force -Path "$destDir\logos" | Out-Null
New-Item -ItemType Directory -Force -Path "$destDir\flags" | Out-Null

$srcDir = "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b"

Copy-Item -Path "$srcDir\game_logo_candidates_1781282203242.png" -Destination "$destDir\game_logo_candidates.png" -Force

# Characters
Copy-Item -Path "$srcDir\char_musk_1781319565028.png" -Destination "$destDir\characters\musk.png" -Force
Copy-Item -Path "$srcDir\char_jensen_1781319581046.png" -Destination "$destDir\characters\jensen.png" -Force
Copy-Item -Path "$srcDir\char_zuck_1781319592813.png" -Destination "$destDir\characters\zuck.png" -Force
Copy-Item -Path "$srcDir\char_jobs_1781319605670.png" -Destination "$destDir\characters\jobs.png" -Force
Copy-Item -Path "$srcDir\char_google_1781319617666.png" -Destination "$destDir\characters\google.png" -Force
Copy-Item -Path "$srcDir\char_jack_1781319628128.png" -Destination "$destDir\characters\jack.png" -Force
Copy-Item -Path "$srcDir\char_ren_1781319640885.png" -Destination "$destDir\characters\ren.png" -Force
Copy-Item -Path "$srcDir\char_pony_1781319651518.png" -Destination "$destDir\characters\pony.png" -Force
Copy-Item -Path "$srcDir\char_liang_1781319660993.png" -Destination "$destDir\characters\liang.png" -Force
Copy-Item -Path "$srcDir\char_robin_1781319672223.png" -Destination "$destDir\characters\robin.png" -Force
Copy-Item -Path "$srcDir\char_tsmc_1781319683286.png" -Destination "$destDir\characters\tsmc.png" -Force
Copy-Item -Path "$srcDir\char_toyota_1781319695894.png" -Destination "$destDir\characters\toyota.png" -Force
Copy-Item -Path "$srcDir\char_lee_1781319706062.png" -Destination "$destDir\characters\lee.png" -Force

# Chibis
Copy-Item -Path "$srcDir\chibi_musk_1781319721918.png" -Destination "$destDir\avatars\musk_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_jensen_1781319731181.png" -Destination "$destDir\avatars\jensen_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_zuck_1781319746893.png" -Destination "$destDir\avatars\zuck_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_jobs_1781319756297.png" -Destination "$destDir\avatars\jobs_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_google_1781319766178.png" -Destination "$destDir\avatars\google_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_jack_1781319770000_1781340246015.png" -Destination "$destDir\avatars\jack_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_ren_1781319780000_1781340255917.png" -Destination "$destDir\avatars\ren_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_pony_1781319790000_1781340271006.png" -Destination "$destDir\avatars\pony_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_liang_1781319800000_1781340282292.png" -Destination "$destDir\avatars\liang_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_robin_1781319810000_1781340296091.png" -Destination "$destDir\avatars\robin_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_tsmc_1781319820000_1781340310114.png" -Destination "$destDir\avatars\tsmc_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_toyota_1781319830000_1781340324631.png" -Destination "$destDir\avatars\toyota_chibi.png" -Force
Copy-Item -Path "$srcDir\chibi_lee_1781319840000_1781340337232.png" -Destination "$destDir\avatars\lee_chibi.png" -Force

# Corporate Logos
Copy-Item -Path "$srcDir\logo_tesla_spacex_1781319850000_1781340352050.png" -Destination "$destDir\logos\tesla_spacex.png" -Force
Copy-Item -Path "$srcDir\logo_nvidia_1781319860000_1781340362979.png" -Destination "$destDir\logos\nvidia.png" -Force
Copy-Item -Path "$srcDir\logo_meta_1781319870000_1781340378907.png" -Destination "$destDir\logos\meta.png" -Force
Copy-Item -Path "$srcDir\logo_apple_1781319880000_1781340394511.png" -Destination "$destDir\logos\apple.png" -Force
Copy-Item -Path "$srcDir\logo_google_1781319890000_1781340407252.png" -Destination "$destDir\logos\google.png" -Force
Copy-Item -Path "$srcDir\logo_alibaba_1781319900000_1781340420378.png" -Destination "$destDir\logos\alibaba.png" -Force
Copy-Item -Path "$srcDir\logo_huawei_1781319910000_1781340434225.png" -Destination "$destDir\logos\huawei.png" -Force
Copy-Item -Path "$srcDir\logo_tencent_1781319920000_1781340447411.png" -Destination "$destDir\logos\tencent.png" -Force
Copy-Item -Path "$srcDir\logo_deepseek_1781319930000_1781340461089.png" -Destination "$destDir\logos\deepseek.png" -Force
Copy-Item -Path "$srcDir\logo_baidu_1781319940000_1781340475660.png" -Destination "$destDir\logos\baidu.png" -Force
Copy-Item -Path "$srcDir\logo_tsmc_1781319950000_1781358261270.png" -Destination "$destDir\logos\tsmc.png" -Force
Copy-Item -Path "$srcDir\logo_toyota_1781319960000_1781358273659.png" -Destination "$destDir\logos\toyota.png" -Force
Copy-Item -Path "$srcDir\logo_samsung_1781319970000_1781358285291.png" -Destination "$destDir\logos\samsung.png" -Force

# Flags (with final adjusted versions)
Copy-Item -Path "$srcDir\flag_us_final_1781320080000_1781407555201.png" -Destination "$destDir\flags\flag_us.png" -Force
Copy-Item -Path "$srcDir\flag_cn_final_1781320090000_1781407569218.png" -Destination "$destDir\flags\flag_cn.png" -Force
Copy-Item -Path "$srcDir\flag_tw_final_adjusted_1781320130000_1781408492119.png" -Destination "$destDir\flags\flag_tw.png" -Force
Copy-Item -Path "$srcDir\flag_jp_final_1781320120000_1781407610993.png" -Destination "$destDir\flags\flag_jp.png" -Force
Copy-Item -Path "$srcDir\flag_kr_final_1781320110000_1781407598054.png" -Destination "$destDir\flags\flag_kr.png" -Force

Write-Output "Direct copy completed successfully!"
