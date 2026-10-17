#!/usr/bin/env python3
"""Builds the inline SVG icon sprite from Material Design Icons (Pictogrammers Free License, see
public/vendor/icons/LICENSE) and writes it into public/index.html between the icons markers, plus a
copy at public/vendor/icons/sprite.svg. Usage: python3 tools/make_icons.py [path-to-mdi-svg-folder]

The UI references icons as <svg class="ic"><use href="#i-NAME"/></svg> (see ic() in public/js/util.js).
"""
import os, re, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/usr/local/lib/python3.13/dist-packages/material/templates/.icons/material'
ROOT = os.path.join(os.path.dirname(__file__), '..')
ICONS = {  # sprite name: MDI file name
    'plan': 'sign-direction', 'network': 'transit-connection-variant', 'rain': 'weather-pouring', 'alert': 'alert-outline',
    'share': 'account-multiple-outline', 'admin': 'shield-outline', 'search': 'magnify', 'swap': 'swap-vertical',
    'mic': 'microphone', 'clock': 'clock-outline', 'watch': 'eye-outline', 'speak': 'volume-high', 'download': 'download',
    'alarm': 'alarm', 'chat': 'message-text-outline', 'pin': 'map-marker', 'info': 'information-outline', 'chevron': 'chevron-down',
    'close': 'close', 'check': 'check', 'sun': 'white-balance-sunny', 'moon': 'weather-night', 'layers': 'layers-outline',
    'backup': 'lifebuoy', 'rush': 'traffic-light-outline', 'send': 'arrow-up', 'route': 'map-marker-path', 'switch-user': 'account-switch-outline',
    'refresh': 'refresh', 'blocked': 'alert-octagon-outline', 'student': 'account-school-outline', 'budget': 'wallet-outline',
    'transfer': 'transfer', 'timer': 'timer-sand', 'legend': 'map-legend', 'tune': 'tune-variant', 'detour': 'routes', 'translate': 'translate',
}

symbols = []
for name, f in ICONS.items():
    svg = open(os.path.join(SRC, f + '.svg'), encoding='utf-8').read()
    vb = re.search(r'viewBox="([^"]+)"', svg).group(1)
    inner = re.sub(r'^<svg[^>]*>|</svg>\s*$', '', svg.strip())
    symbols.append(f'<symbol id="i-{name}" viewBox="{vb}">{inner}</symbol>')
sprite = '<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">' + ''.join(symbols) + '</svg>'

out_dir = os.path.join(ROOT, 'public', 'vendor', 'icons')
os.makedirs(out_dir, exist_ok=True)
open(os.path.join(out_dir, 'sprite.svg'), 'w', encoding='utf-8').write(sprite + '\n')
lic = os.path.join(SRC, 'LICENSE')
if os.path.exists(lic):
    open(os.path.join(out_dir, 'LICENSE'), 'w', encoding='utf-8').write(
        'Icons: Material Design Icons by Pictogrammers (https://pictogrammers.com/library/mdi/)\n\n' + open(lic, encoding='utf-8').read())

idx = os.path.join(ROOT, 'public', 'index.html')
html = open(idx, encoding='utf-8').read()
html, n = re.subn(r'<!-- icons:start -->.*?<!-- icons:end -->', '<!-- icons:start -->' + sprite + '<!-- icons:end -->', html, flags=re.S)
if n != 1: sys.exit('index.html needs exactly one <!-- icons:start --><!-- icons:end --> block')
open(idx, 'w', encoding='utf-8').write(html)
print(f'{len(ICONS)} icons, sprite {len(sprite)} bytes')
