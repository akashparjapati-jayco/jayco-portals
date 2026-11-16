#!/bin/bash
# JAYCO Attendance: patch 12 (Forgot PIN). Publishes security rules, then the app.
set -e
cd ~/jayco
curl -sL -o p12.tar.xz https://raw.githubusercontent.com/akashparjapati-jayco/jayco-portals/jayco-deploy-tmp/p12.tar.xz
tar -xJf p12.tar.xz
P=jayco-attendance-ea440
TOK=$(gcloud auth print-access-token)
BODY=$(python3 -c 'import json;print(json.dumps({"source":{"files":[{"name":"firestore.rules","content":open("firestore.rules").read()}]}}))')
RS=$(curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -H "x-goog-user-project: $P" \
  "https://firebaserules.googleapis.com/v1/projects/$P/rulesets" -d "$BODY" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("name") or d)')
case "$RS" in projects/*) ;; *) echo "RULES FAILED: $RS"; exit 1;; esac
curl -s -X PATCH -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -H "x-goog-user-project: $P" \
  "https://firebaserules.googleapis.com/v1/projects/$P/releases/cloud.firestore" \
  -d "{\"release\":{\"name\":\"projects/$P/releases/cloud.firestore\",\"rulesetName\":\"$RS\"}}" | grep -q rulesetName && echo "RULES OK" || { echo "RULES RELEASE FAILED"; exit 1; }
grep -o 'jayco-v[0-9]*' app/sw.js
python3 deploy.py 2>&1 | tail -3
echo "PATCH 12 DONE"
