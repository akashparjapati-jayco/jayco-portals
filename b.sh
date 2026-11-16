#!/bin/bash
set -e
cd ~/jayco
curl -sL -o build_apk2.py https://raw.githubusercontent.com/akashparjapati-jayco/jayco-portals/jayco-deploy-tmp/build_apk2.py
python3 build_apk2.py
cloudshell download ~/JAYCO-Attendance-1.0.1.apk
