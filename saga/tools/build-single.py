"""Bundle Step builds into one self-contained HTML body (for sharing as a single page / artifact).
Usage: python3 build-single.py <bundle.js> <out.html>"""
import base64, re, sys
js_path, out = sys.argv[1], sys.argv[2]
css = open('css/style.css').read()
for f in ['cinzel-700', 'cinzel-decorative-700']:
    css = css.replace(f'url(../fonts/{f}.woff2)', 'url(data:font/woff2;base64,' + base64.b64encode(open(f'fonts/{f}.woff2', 'rb').read()).decode() + ')')
urls = {}
import os
files = [f for f in os.listdir('art') if f.endswith(('.jpg', '.png'))] + ['sprites/' + f for f in os.listdir('art/sprites') if f.endswith('.png')] + ['kingdom/' + f for f in os.listdir('art/kingdom') if f.endswith(('.jpg', '.png'))]
for f in files:
    mime = 'image/jpeg' if f.endswith('.jpg') else 'image/png'
    urls[f] = f'data:{mime};base64,' + base64.b64encode(open('art/' + f, 'rb').read()).decode()
html = open('index.html').read()
body = html[html.index('<body>') + 6:html.index('</body>')]
body = re.sub(r'\s*<script type="module" src="js/main.js"></script>', '', body)
js = open(js_path).read().replace('</script', '<\\/script')
import json
import re as _re
ver = _re.search(r"APP_VERSION = '([^']+)'", open('js/version.js').read()).group(1)
page = f'''<title>Forest Pinball Saga</title>
<meta name="app-version" content="{ver}">
<meta name="theme-color" content="#05070a">
<style>
{css}
</style>
{body}
<script>window.__ART_URLS__ = {json.dumps(urls)};</script>
<script type="module">
{js}
</script>
'''
open(out, 'w').write(page)
print(round(len(page) / 1024), 'KB')
