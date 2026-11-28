#!/usr/bin/env bash
# Install Karya Erp on a site of the bench this folder sits in.
#
#   Put karya_erp.zip in your bench's apps/ folder, then from the bench folder:
#     [ -f apps/karya_erp/operator.json ] && rm -rf apps/karya_erp     # remove an older version, if any
#     unzip -q -o apps/karya_erp.zip -d apps/
#     bash apps/karya_erp/install.sh <site>
#
# Already installed? The same steps update it: the script runs migrate instead of install-app.
#
# The bench folder is found from this script's location (apps/karya_erp/install.sh → ../..).
# ERPNext (and HRMS, for HR features) must be on the bench; this script installs them on the site if missing.
set -euo pipefail
APP=karya_erp
SITE="${1:?usage: bash $APP/install.sh <site>}"
BENCH="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
cd "$BENCH"
[ -f sites/apps.txt ] || { echo "$BENCH is not a bench folder (no sites/apps.txt). Put $APP inside your bench's apps/ folder."; exit 1; }
[ -d "sites/$SITE" ] || { echo "Site $SITE not found. Sites here: $(cd sites && ls -d */ | tr -d / | grep -v '^assets$' | tr '\n' ' ')"; exit 1; }
echo "Bench: $BENCH   Site: $SITE"

echo "1/5 Python package"
if [ -x env/bin/pip ]; then env/bin/pip install -q -e "apps/$APP"
elif env/bin/python -m pip --version >/dev/null 2>&1; then env/bin/python -m pip install -q -e "apps/$APP"
else uv pip install -q --python env/bin/python -e "apps/$APP"; fi

echo "2/5 sites/apps.txt"
[ -z "$(tail -c1 sites/apps.txt)" ] || echo >> sites/apps.txt
grep -qx "$APP" sites/apps.txt || echo "$APP" >> sites/apps.txt

echo "3/5 Apps this one needs on $SITE: erpnext"
for NEED in erpnext; do
  INSTALLED="$(bench --site "$SITE" list-apps 2>/dev/null)"
  echo "$INSTALLED" | grep -qw "$NEED" && continue
  if [ -d "apps/$NEED" ]; then
    echo "  installing $NEED"; bench --site "$SITE" install-app "$NEED"
  else
    echo "$NEED is not on this bench. Get it first:  bench get-app $NEED"; exit 1
  fi
done
INSTALLED="$(bench --site "$SITE" list-apps 2>/dev/null)"

echo "4/5 Install on $SITE"
if echo "$INSTALLED" | grep -qw "$APP"; then
  bench --site "$SITE" migrate          # already installed: apply the new version
else
  bench --site "$SITE" install-app "$APP"
fi

echo "5/5 UI files"
if [ ! -f "apps/$APP/$APP/public/frontend/index.html" ]; then
  (cd "apps/$APP/frontend" && npm install && npm run build)
fi
bench build --app "$APP"
bench --site "$SITE" clear-cache

echo
echo "Done. Restart bench (Ctrl+C on bench start, then bench start again), then open /karya_erp on $SITE."
