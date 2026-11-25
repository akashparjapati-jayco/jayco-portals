#!/usr/bin/env python3
"""Publish firestore.rules with the Firebase Rules REST API using the signed-in gcloud account."""
import json, subprocess, urllib.request
P = 'jayco-attendance-ea440'
TOKEN = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
def call(method, url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method=method, headers={
        'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json', 'x-goog-user-project': P})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e: raise SystemExit(f'{method} {url} failed: {e.code} {e.read().decode()[:600]}')
API = 'https://firebaserules.googleapis.com/v1'
rs = call('POST', f'{API}/projects/{P}/rulesets', {'source': {'files': [{'name': 'firestore.rules', 'content': open('firestore.rules').read()}]}})
rel = f'projects/{P}/releases/cloud.firestore'
call('PATCH', f'{API}/{rel}', {'release': {'name': rel, 'rulesetName': rs['name']}})
print('RULES PUBLISHED:', rs['name'])
