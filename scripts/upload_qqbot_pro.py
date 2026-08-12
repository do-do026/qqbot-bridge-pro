#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Upload qqbot-pro (v0.3.0, merged with bridge) to do-do026/qqbot-bridge-pro via GitHub REST API.
Usage: GITHUB_TOKEN=xxx python3 upload_qqbot_pro.py
Files: local qqbot-pro tree -> repo root. Old repo files not in the new tree get deleted.
"""
import base64
import json
import os
import sys
import urllib.request
import urllib.error

OWNER = "do-do026"
REPO = "qqbot-bridge-pro"
BRANCH = "main"
API = f"https://api.github.com/repos/{OWNER}/{REPO}"
BASE = "/sdcard/Download/qqbot-pro"
COMMIT_MSG = "qqbot-pro: Epic G3 replyTo implemented (numbered replyTo, stable batch key, anchor fallback) + docs updated 2026-08-12"

TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
if not TOKEN:
    print("ERROR: GITHUB_TOKEN env not set")
    sys.exit(1)

SKIP_SUFFIXES = (".bak", ".backup", ".toolpkg", "~", ".pyc")
SKIP_NAMES = {"tmp_packagemanager.xml", "tmp_packagemanager_merge.xml"}


def collect_local_files():
    """local_rel -> local_abs, repo path identical to local_rel"""
    files = []
    roots = ["README.md", "STATUS.md", "HANDOFF.md", "ARCHITECTURE.md",
             "bridge-docs", "package", "scripts"]
    for root in roots:
        full = os.path.join(BASE, root)
        if os.path.isfile(full):
            files.append((root, full))
        elif os.path.isdir(full):
            for dirpath, dirnames, filenames in os.walk(full):
                dirnames[:] = [d for d in dirnames if d not in (".git", "__pycache__", "test")]
                for fn in filenames:
                    if fn.startswith(SKIP_SUFFIXES) or fn in SKIP_NAMES:
                        continue
                    if any(fn.endswith(s) for s in SKIP_SUFFIXES):
                        continue
                    rel = os.path.relpath(os.path.join(dirpath, fn), BASE)
                    files.append((rel, os.path.join(dirpath, fn)))
    return files


def api_request(path, method, payload=None):
    url = API + path
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"raw": body}
        return e.code, parsed


def list_repo_files():
    status, data = api_request(f"/git/trees/{BRANCH}?recursive=1", "GET")
    if status != 200:
        print(f"list tree FAIL {status} {data.get('message', '')}")
        return []
    return [t["path"] for t in data.get("tree", []) if t["type"] == "blob"]


def delete_file(repo_path):
    status, data = api_request(f"/contents/{repo_path}", "GET")
    if status != 200:
        return False
    sha = data.get("sha")
    status, data = api_request(f"/contents/{repo_path}", "DELETE", {
        "message": COMMIT_MSG,
        "sha": sha,
        "branch": BRANCH,
    })
    if status in (200, 202):
        print(f"DEL {repo_path}")
        return True
    print(f"DEL FAIL {repo_path} -> {status} {data.get('message', '')}")
    return False


def upload_file(repo_path, local_abs):
    with open(local_abs, "rb") as f:
        content = f.read()
    status, data = api_request(f"/contents/{repo_path}", "GET")
    sha = data.get("sha") if status == 200 else None
    payload = {
        "message": COMMIT_MSG,
        "content": base64.b64encode(content).decode("ascii"),
        "branch": BRANCH,
    }
    if sha:
        payload["sha"] = sha
    status, data = api_request(f"/contents/{repo_path}", "PUT", payload)
    if status in (200, 201):
        print(f"OK  {repo_path} ({len(content)}B)")
        return True
    print(f"FAIL {repo_path} -> {status} {data.get('message', '')}")
    return False


def main():
    files = collect_local_files()
    print(f"local files to upload: {len(files)}")
    repo_files = list_repo_files()
    print(f"repo files currently: {len(repo_files)}")
    local_set = set(rel for rel, _ in files)
    stale = [p for p in repo_files if p not in local_set]
    print(f"stale files to delete: {len(stale)}")
    for p in stale:
        delete_file(p)
    ok = True
    for rel, local_abs in files:
        if not upload_file(rel, local_abs):
            ok = False
    print("ALL_OK" if ok else "HAS_FAILURES")


if __name__ == "__main__":
    main()