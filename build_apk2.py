#!/usr/bin/env python3
"""APK 1.0.1: same package and SAME signing key as 1.0.0 (installs as an update), but with
location delegation OFF so Chrome handles location itself (it works in Chrome on the workers' phones).
Run in Cloud Shell from ~/jayco:  python3 build_apk2.py"""
import base64, glob, json, os, re, shutil, urllib.request, zipfile
os.chdir(os.path.expanduser('~/jayco'))
# Keep the original key safe before anything else.
if not os.path.exists('apk_key_backup'):
    shutil.copytree('apk_out', 'apk_key_backup')
ks = 'apk_key_backup/signing.keystore'
info = open('apk_key_backup/signing-key-info.txt').read()
def grab(label):
    m = re.search(label + r'\s*:\s*(\S+)', info, re.I)
    if not m:
        raise SystemExit('Could not read "%s" from signing-key-info.txt. Labels found: %s' % (label, re.findall(r'^([^:\n]+):', info, re.M)))
    return m.group(1)
store_pw, alias, key_pw = grab('Key store password'), grab('Key alias'), grab('Key password')
HOST = 'jayco-attendance-ea440.web.app'; URL = 'https://' + HOST
opts = {
  "packageId": "com.jaycohousing.attendance", "name": "JAYCO Attendance", "launcherName": "JAYCO",
  "appVersion": "1.0.1", "appVersionCode": 2, "host": HOST, "pwaUrl": URL, "startUrl": "/",
  "webManifestUrl": URL + "/manifest.json", "fullScopeUrl": URL + "/",
  "iconUrl": URL + "/icons/icon-512.png", "maskableIconUrl": URL + "/icons/icon-512.png", "monochromeIconUrl": None,
  "themeColor": "#d40000", "themeColorDark": "#222426", "backgroundColor": "#ffffff",
  "navigationColor": "#222426", "navigationColorDark": "#222426", "navigationDividerColor": "#222426",
  "navigationDividerColorDark": "#222426", "display": "standalone", "orientation": "portrait",
  "fallbackType": "customtabs", "enableNotifications": False, "enableSiteSettingsShortcut": True,
  "isChromeOSOnly": False, "isMetaQuest": False, "includeSourceCode": False, "splashScreenFadeOutDuration": 300,
  "shortcuts": [], "features": {"locationDelegation": {"enabled": False}}, "additionalTrustedOrigins": [],
  "minSdkVersion": 24, "signingMode": "mine",
  "signing": {"file": "data:application/octet-stream;base64," + base64.b64encode(open(ks, 'rb').read()).decode(),
              "alias": alias, "fullName": "JAYCO Engineering India", "organization": "JAYCO Engineering India",
              "organizationalUnit": "HR", "countryCode": "IN", "keyPassword": key_pw, "storePassword": store_pw},
}
req = urllib.request.Request('https://pwabuilder-cloudapk.azurewebsites.net/generateApkZip?ref=jayco',
    data=json.dumps(opts).encode(), method='POST', headers={'Content-Type': 'application/json'})
print('Building APK 1.0.1 (takes 1-3 minutes)...')
try:
    with urllib.request.urlopen(req, timeout=600) as r: data = r.read()
except urllib.error.HTTPError as e:
    raise SystemExit('Build failed: %s %s' % (e.code, e.read().decode()[:1500]))
open('jayco-apk-101.zip', 'wb').write(data)
shutil.rmtree('apk_out_101', ignore_errors=True)
zipfile.ZipFile('jayco-apk-101.zip').extractall('apk_out_101')
apk = [p for p in glob.glob('apk_out_101/*.apk') if 'unsigned' not in p]
assert apk, 'no signed apk in package: %s' % os.listdir('apk_out_101')
old = json.load(open('apk_key_backup/assetlinks.json'))[0]['target']['sha256_cert_fingerprints']
new = json.load(open('apk_out_101/assetlinks.json'))[0]['target']['sha256_cert_fingerprints']
print('Same signing key as 1.0.0:', old == new)
assert old == new, 'Signing key differs - do NOT give this APK to workers'
shutil.copy(apk[0], os.path.expanduser('~/JAYCO-Attendance-1.0.1.apk'))
print('APK READY:', os.path.getsize(os.path.expanduser('~/JAYCO-Attendance-1.0.1.apk')), 'bytes')
