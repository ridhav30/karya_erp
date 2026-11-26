# Installing karya_erp in an existing Frappe bench

These steps assume the repo is already cloned at `apps/karya_erp` and the site is `site1.local`. Run them from the bench folder.

## 1. Install the app into the bench's Python env

```bash
cd /home/ridhav/frappe-bench
./env/bin/pip install -e apps/karya_erp
```

## 2. Register the app in `apps.txt`

```bash
printf '\nkarya_erp\n' >> sites/apps.txt
```

## 3. Install the app on the site

```bash
bench --site site1.local install-app karya_erp
```

## 4. Build the assets

This creates the `sites/assets/karya_erp` symlink. Without it, the frontend files return 404.

```bash
bench build --app karya_erp
```

## 5. Start the server

```bash
bench start
```

## Rebuilding the frontend after code changes

```bash
cd apps/karya_erp/frontend && npm install && npm run build
```

## Troubleshooting

**404 on `/assets/karya_erp/frontend/...` (CSS, JS, `manifest.webmanifest`)**
The assets symlink is missing. Run `bench build --app karya_erp`, then hard-refresh the browser (Ctrl+Shift+R).
