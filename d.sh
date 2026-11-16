#!/bin/bash
# JAYCO Attendance: download patch 11 and deploy it from Cloud Shell.
set -e
cd ~/jayco
curl -sL -o p11.tar.xz https://raw.githubusercontent.com/akashparjapati-jayco/jayco-portals/jayco-deploy-tmp/p11.tar.xz
tar -xJvf p11.tar.xz
grep -o 'jayco-v[0-9]*' app/sw.js
python3 deploy.py 2>&1 | tail -3
