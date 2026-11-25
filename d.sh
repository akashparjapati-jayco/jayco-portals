set -e
mkdir -p ~/jayco && cd ~/jayco
curl -sL https://raw.githubusercontent.com/akashparjapati-jayco/jayco-portals/jayco-deploy-tmp/jayco.tgz | tar xz
python3 deploy.py
echo "JAYCO PATCH 14 DONE"
