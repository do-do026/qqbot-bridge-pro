#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 上传前密钥扫描：代码 + 文档
import os, re

ROOTS = ['/sdcard/Download/qqbot-pro/package', '/sdcard/Download/qqbot-pro/bridge-docs', '/sdcard/Download/qqbot-pro/README.md', '/sdcard/Download/qqbot-pro/STATUS.md', '/sdcard/Download/qqbot-pro/HANDOFF.md', '/sdcard/Download/qqbot-pro/ARCHITECTURE.md']
SKIP_DIRS = {'.git', 'node_modules', 'test', '__pycache__'}
PATTERNS = [
    (re.compile(r'ghp_[A-Za-z0-9]{20,}'), 'GitHub token'),
    (re.compile(r'sk-[A-Za-z0-9]{20,}'), 'sk- key'),
    (re.compile(r'X5eDnNyaCpS6kP5lS9raJ3nYJ5sfTH6v'), 'QQ app secret'),
    (re.compile(r'df62261613da4b1c92c435ae14548967'), 'Operit API token'),
    (re.compile(r'(appSecret|api_key|apikey|token)\s*[:=]\s*["\']([A-Za-z0-9]{16,})["\']', re.I), 'key-value pattern'),
    (re.compile(r'Bearer\s+[A-Za-z0-9]{16,}'), 'bearer'),
]

def scan_file(path):
    try:
        with open(path, encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception:
        return
    for pat, name in PATTERNS:
        for m in pat.finditer(content):
            snippet = content[max(0, m.start()-30):m.end()+30].replace('\n', ' ')
            print(f'[HIT] {name} in {path}: ...{snippet}...')

def walk(root):
    if os.path.isfile(root):
        scan_file(root)
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            scan_file(os.path.join(dirpath, fn))

for r in ROOTS:
    if os.path.exists(r):
        walk(r)
print('SCAN_DONE')