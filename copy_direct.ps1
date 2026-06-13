# Ensure folders exist
$destDir = "c:\Users\user\Documents\app\ai_tycoon\public\images"
New-Item -ItemType Directory -Force -Path "$destDir\characters" | Out-Null
New-Item -ItemType Directory -Force -Path "$destDir\avatars" | Out-Null

Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\game_logo_candidates_1781282203242.png" -Destination "$destDir\game_logo_candidates.png" -Force

Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_musk_1781319565028.png" -Destination "$destDir\characters\musk.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_jensen_1781319581046.png" -Destination "$destDir\characters\jensen.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_zuck_1781319592813.png" -Destination "$destDir\characters\zuck.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_jobs_1781319605670.png" -Destination "$destDir\characters\jobs.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_google_1781319617666.png" -Destination "$destDir\characters\google.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_jack_1781319628128.png" -Destination "$destDir\characters\jack.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_ren_1781319640885.png" -Destination "$destDir\characters\ren.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_pony_1781319651518.png" -Destination "$destDir\characters\pony.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_liang_1781319660993.png" -Destination "$destDir\characters\liang.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_robin_1781319672223.png" -Destination "$destDir\characters\robin.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_tsmc_1781319683286.png" -Destination "$destDir\characters\tsmc.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_toyota_1781319695894.png" -Destination "$destDir\characters\toyota.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\char_lee_1781319706062.png" -Destination "$destDir\characters\lee.png" -Force

Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\chibi_musk_1781319721918.png" -Destination "$destDir\avatars\musk_chibi.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\chibi_jensen_1781319731181.png" -Destination "$destDir\avatars\jensen_chibi.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\chibi_zuck_1781319746893.png" -Destination "$destDir\avatars\zuck_chibi.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\chibi_jobs_1781319756297.png" -Destination "$destDir\avatars\jobs_chibi.png" -Force
Copy-Item -Path "C:\Users\user\.gemini\antigravity-ide\brain\e2c09497-5008-4272-9beb-e6b92c53eb5b\chibi_google_1781319766178.png" -Destination "$destDir\avatars\google_chibi.png" -Force

Write-Output "Direct copy completed successfully!"
