R81-01 focused reproduction, by fontprobe.mjs (run from a checkout; it forces each font on both the body and the display font; Figtree and Roboto from @fontsource 5.3.0 woff2 files, the others installed on this machine). Local server, MCHEZO_CONTENT_TEST_MODE=approve-provisional. Not a gate verdict.

Before: the stylesheet of the tested de913bf (served from that build).

## before the repair: de913bf's layout
| font | size | cards (px) | tallest | list | start 1 on screen | game 2 title on screen | font available |
|---|---|---|---|---|---|---|---|
| as installed here (Inter) | 320×640 | 283, 286, 303 | 303 | 895 | yes | yes | n/a |
| as installed here (Inter) | 360×640 | 264, 266, 266 | 266 | 820 | yes | yes | n/a |
| as installed here (Inter) | 390×844 | 266, 268, 268 | 268 | 826 | yes | yes | n/a |
| Figtree (the intended body font) | 320×640 | 283, 266, 283 | 283 | 856 | yes | yes | yes |
| Figtree (the intended body font) | 360×640 | 264, 266, 266 | 266 | 820 | yes | yes | yes |
| Figtree (the intended body font) | 390×844 | 230, 230, 249 | 249 | 733 | yes | yes | yes |
| Roboto (Android's system font) | 320×640 | 283, 266, 283 | 283 | 856 | yes | yes | yes |
| Roboto (Android's system font) | 360×640 | 264, 266, 266 | 266 | 820 | yes | yes | yes |
| Roboto (Android's system font) | 390×844 | 230, 230, 249 | 249 | 733 | yes | yes | yes |
| Liberation Sans (Arial metrics) | 320×640 | 283, 266, 283 | 283 | 856 | yes | yes | yes |
| Liberation Sans (Arial metrics) | 360×640 | 264, 266, 266 | 266 | 820 | yes | yes | yes |
| Liberation Sans (Arial metrics) | 390×844 | 266, 249, 268 | 268 | 806 | yes | yes | yes |
| FreeSans (Helvetica metrics, ~SF) | 320×640 | 283, 266, 283 | 283 | 856 | yes | yes | yes |
| FreeSans (Helvetica metrics, ~SF) | 360×640 | 264, 266, 266 | 266 | 820 | yes | yes | yes |
| FreeSans (Helvetica metrics, ~SF) | 390×844 | 247, 230, 249 | 249 | 750 | yes | yes | yes |
| DejaVu Sans (wide Linux fallback) | 320×640 | 302, 302, 341 | 341 | 970 | yes | yes | yes |
| DejaVu Sans (wide Linux fallback) | 360×640 | 283, 266, 266 | 283 | 840 | yes | yes | yes |
| DejaVu Sans (wide Linux fallback) | 390×844 | 266, 268, 268 | 268 | 826 | yes | yes | yes |

After: the repair (86baf14).

## after the repair: cover beside title and players only
| font | size | cards (px) | tallest | list | start 1 on screen | game 2 title on screen | font available |
|---|---|---|---|---|---|---|---|
| as installed here (Inter) | 320×640 | 247, 246, 265 | 265 | 782 | yes | yes | n/a |
| as installed here (Inter) | 360×640 | 248, 246, 265 | 265 | 783 | yes | yes | n/a |
| as installed here (Inter) | 390×844 | 226, 246, 246 | 246 | 741 | yes | yes | n/a |
| Figtree (the intended body font) | 320×640 | 247, 246, 265 | 265 | 782 | yes | yes | yes |
| Figtree (the intended body font) | 360×640 | 248, 246, 246 | 248 | 763 | yes | yes | yes |
| Figtree (the intended body font) | 390×844 | 226, 226, 246 | 246 | 722 | yes | yes | yes |
| Roboto (Android's system font) | 320×640 | 247, 246, 265 | 265 | 782 | yes | yes | yes |
| Roboto (Android's system font) | 360×640 | 248, 246, 246 | 248 | 763 | yes | yes | yes |
| Roboto (Android's system font) | 390×844 | 226, 226, 246 | 246 | 722 | yes | yes | yes |
| Liberation Sans (Arial metrics) | 320×640 | 247, 246, 265 | 265 | 782 | yes | yes | yes |
| Liberation Sans (Arial metrics) | 360×640 | 228, 246, 246 | 246 | 743 | yes | yes | yes |
| Liberation Sans (Arial metrics) | 390×844 | 226, 226, 246 | 246 | 722 | yes | yes | yes |
| FreeSans (Helvetica metrics, ~SF) | 320×640 | 247, 246, 265 | 265 | 782 | yes | yes | yes |
| FreeSans (Helvetica metrics, ~SF) | 360×640 | 228, 246, 246 | 246 | 743 | yes | yes | yes |
| FreeSans (Helvetica metrics, ~SF) | 390×844 | 226, 226, 246 | 246 | 722 | yes | yes | yes |
| DejaVu Sans (wide Linux fallback) | 320×640 | 266, 265, 284 | 284 | 839 | yes | yes | yes |
| DejaVu Sans (wide Linux fallback) | 360×640 | 248, 246, 265 | 265 | 783 | yes | yes | yes |
| DejaVu Sans (wide Linux fallback) | 390×844 | 250, 246, 265 | 265 | 784 | yes | yes | yes |
