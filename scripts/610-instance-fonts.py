#!/usr/bin/env python3
"""Instance variable fonts to static Light/Regular/Bold at specific wght values.

Produces files matching our BUILTIN_FONT naming:
  NotoSansArabic-{Light,Regular,Bold}.ttf
  Cairo-{Light,Regular,Bold}.ttf
  NotoNaskhArabic-{Light,Regular,Bold}.ttf   (light=400 — same as Regular; range is 400-700)
  NotoKufiArabic-{Light,Regular,Bold}.ttf
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

WEIGHTS = {'Light': 300, 'Regular': 400, 'Bold': 700}

JOBS = [
    ('notosansarabic', 'NotoSansArabic[wdth,wght].ttf', 'NotoSansArabic'),
    ('cairo',          'Cairo[slnt,wght].ttf',          'Cairo'),
    ('notokufiarabic', 'NotoKufiArabic[wght].ttf',      'NotoKufiArabic'),
]

# Noto Naskh Arabic range is 400-700; light = 400 (= Regular) — the ticket
# requires this to be documented explicitly in the entry.
NASKH_JOBS = [('notonaskharabic', 'NotoNaskhArabic[wght].ttf', 'NotoNaskhArabic')]

base = Path('/tmp/gf-dl')

def instance_wght(src: Path, wght: int, out: Path) -> None:
    font = TTFont(str(src))
    # Pin: wght=<value>. For wdth-axis sources, keep default wdth (100). slnt=0.
    axes = {'wght': wght}
    if 'fvar' in font:
        fvar_tags = {ax.axisTag for ax in font['fvar'].axes}
        if 'wdth' in fvar_tags:
            axes['wdth'] = 100
        if 'slnt' in fvar_tags:
            axes['slnt'] = 0
    inst = instantiateVariableFont(font, axes)
    inst.save(str(out))

for folder, var_name, prefix in JOBS:
    src = base / folder / var_name
    for weight_name, wght_val in WEIGHTS.items():
        out = base / folder / f'{prefix}-{weight_name}.ttf'
        instance_wght(src, wght_val, out)
        print(f'✓ {prefix}-{weight_name}.ttf  (wght={wght_val})  {out.stat().st_size}B')

# Noto Naskh Arabic: wght range 400-700. Light folds to 400 (= Regular).
for folder, var_name, prefix in NASKH_JOBS:
    src = base / folder / var_name
    for weight_name, wght_val in [('Light', 400), ('Regular', 400), ('Bold', 700)]:
        out = base / folder / f'{prefix}-{weight_name}.ttf'
        instance_wght(src, wght_val, out)
        note = ' (= Regular; wght range 400-700)' if weight_name == 'Light' else ''
        print(f'✓ {prefix}-{weight_name}.ttf  (wght={wght_val}){note}  {out.stat().st_size}B')
