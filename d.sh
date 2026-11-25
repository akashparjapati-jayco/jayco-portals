set -e
mkdir -p ~/jayco && cd ~/jayco
curl -sL https://raw.githubusercontent.com/akashparjapati-jayco/jayco-portals/jayco-deploy-tmp/jayco.tgz | tar xz
curl -sL https://raw.githubusercontent.com/akashparjapati-jayco/jayco-portals/jayco-deploy-tmp/rules.py -o rules.py
python3 rules.py
python3 deploy.py
echo "JAYCO PATCH 13 DONE"
