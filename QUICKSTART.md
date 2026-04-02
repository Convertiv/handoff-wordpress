# Quickstart

Get the **Handoff Blocks** plugin running locally with [wp-env](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/), or understand how to **install it on an existing site**.

## What this repo is

- **WordPress plugin** (root = plugin folder: `handoff-blocks.php`, `includes/`, `build/`, …).
- **`compiler/`** — Node app that calls your Handoff API and writes block **source** into `blocks/`.
- **`npm run build`** — Webpack; turns `blocks/` (+ admin + migration) into **`build/`**, which WordPress loads.

## Prerequisites

- [Node.js](https://nodejs.org/) **22+** (see `package.json` `engines`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for wp-env only)
- Git

---

## A. Try it locally (wp-env)

### 1. Clone and enter the repo

```bash
git clone <your-repo-url> handoff-wordpress
cd handoff-wordpress
```

### 2. Install dependencies

```bash
npm install
```

The repo includes a pre-built **`compiler/dist/`**, so you usually **do not** need `npm run build:compiler` unless you are changing TypeScript in **`compiler/src/`**.

To (re)build the compiler CLI from source:

```bash
npm run build:compiler
```

### 3. Configure Handoff (optional but typical)

Copy the example config and edit API URL / secrets:

```bash
cp handoff-wp.config.example.json handoff-wp.config.json
```

Or generate one:

```bash
npm run compile -- init --api-url https://your-handoff-site.com
```

Paths in config should stay **relative to the plugin root**, e.g. `"output": "./blocks"`, `"themeDir": "./theme"`.

### 4. Generate blocks and webpack output

```bash
npm run compile:all
npm run compile:theme
npm run build
```

- **`compile:all`** — fills `blocks/` (and updates `includes/handoff-categories.php`, shared files, etc.).
- **`build`** — creates `build/` for the editor and frontend.

### 5. Start WordPress

Docker must be running:

```bash
npm run wp:start
```

Open **http://localhost:8888** — admin: **admin** / **password**

`.wp-env.json` mounts:

| Mount | Path |
|--------|------|
| Plugin | `.` (this directory) |
| Theme | `./theme` |
| Uploads | `./uploads` |

### 6. Activate theme and plugin

In wp-admin: **Appearance → Themes** and **Plugins**, or CLI:

```bash
npm run wp:cli -- wp theme activate theme
npm run wp:cli -- wp plugin list
npm run wp:cli -- wp plugin activate <slug-from-list>
```

The plugin slug is usually the **folder name** (e.g. `handoff-wordpress`), not `plugin`.

### 7. Handoff admin menu

In wp-admin, open **Handoff** (left menu). One screen with tabs:

- **Blocks** — what’s in `build/`, links to Handoff/Figma when present.
- **Usage** — where blocks appear in published content (refresh to rescan).
- **Migration** — map legacy Handoff pages to blocks (same tool as the old standalone **Handoff Migration** menu).
- **Settings** — *(Administrators only)* edit `handoff-wp.config.json` (connection, paths, groups). Editors with **Edit others’ posts** still see Blocks, Usage, and Migration. Complex `import` rules may be easier in the file or via `npm run compile -- wizard`.

### 8. Use blocks in the editor

Create a page/post, **+** → look for **Handoff** block categories.

---

## B. Install on your own WordPress site

1. Copy the **entire plugin directory** into `wp-content/plugins/` (so `handoff-blocks.php` is at `wp-content/plugins/<your-folder>/handoff-blocks.php`).
2. On a machine with **Node**, from that folder:
   - `npm install`
   - `npm run build:compiler`
   - Add `handoff-wp.config.json` (or copy from example).
   - `npm run compile:all` (and `npm run compile:theme` if you use the bundled theme workflow).
   - `npm run build`
3. Deploy the folder (including `build/` and `blocks/`).
4. Activate **Handoff Blocks** in **Plugins**.

Production **PHP** only needs to serve WordPress; **Node** is for your build/CI step unless you run `wp handoff` on the server (see below).

---

## Common commands

| Command | Purpose |
|---------|---------|
| `npm run wp:start` / `wp:stop` | Start/stop local Docker env |
| `npm run wp:cli -- wp …` | Run WP-CLI in wp-env |
| `npm run build:compiler` | TypeScript → `compiler/dist/` |
| `npm run compile:all` | Regenerate all `blocks/` from Handoff |
| `npm run compile:theme` | Regenerate theme templates under `theme/` |
| `npm run compile -- wizard` | Interactive dynamic-array config |
| `npm run build` | Webpack → `build/` |
| `npm run dev` | Webpack dev server / watch (`wp-scripts start`) |

### WP-CLI: `wp handoff` (optional)

If `wp` and `node` are both on the **same** machine:

```bash
wp handoff compile --all
wp handoff build
wp handoff status
```

The default **wp-env CLI container** often has **no Node** — use **`npm run compile:*`** and **`npm run build` on your host** for local Docker development.

---

## Troubleshooting

**Docker not running** — Start Docker Desktop before `npm run wp:start`.

**Port 8888 in use** — Stop the conflicting service or adjust wp-env port mapping in your config.

**Blocks missing in editor** — Plugin activated? `build/` present? Run `npm run build` again after `compile`.

**CLI / compile errors** — Run `npm run build:compiler` and ensure `handoff-wp.config.json` exists and `apiUrl` is reachable.

---

## Next steps

- Full detail: [README.md](./README.md)
- Config template: [handoff-wp.config.example.json](./handoff-wp.config.example.json)
- Theme sources: [theme/](./theme/)
