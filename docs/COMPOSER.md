# Installing Handoff Blocks via Composer

This plugin is distributed through a **private GitHub repository**. Composer pulls the code directly from Git tags — no Packagist registration is required.

## Prerequisites

- **Composer 2** (`composer --version`)
- **PHP >= 7.4**
- **Git** (for VCS checkout) _or_ a GitHub personal-access token for HTTPS
- Access to the private GitHub repository

## Quick start

### 1. Add the VCS repository

In your project's `composer.json`, register the private repo:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "https://github.com/YOUR_ORG/handoff-wordpress.git"
    }
  ]
}
```

Replace `YOUR_ORG/handoff-wordpress` with the actual owner and repo name.

### 2. Authenticate with GitHub

Choose **one** of the following methods:

**HTTPS token** (recommended for CI):

```bash
composer config --global http-basic.github.com x-access-token ghp_YOUR_TOKEN
```

Or set the `COMPOSER_AUTH` environment variable:

```bash
export COMPOSER_AUTH='{"http-basic":{"github.com":{"username":"x-access-token","password":"ghp_YOUR_TOKEN"}}}'
```

Use a [fine-grained personal-access token](https://github.com/settings/tokens?type=beta) with **Contents → Read** permission on the repository.

**SSH** (recommended for local development):

If your SSH key is already registered with GitHub, Composer will use it automatically when the repository URL uses the `git@github.com:` scheme:

```json
{
  "repositories": [
    {
      "type": "vcs",
      "url": "git@github.com:YOUR_ORG/handoff-wordpress.git"
    }
  ]
}
```

### 3. Require the package

```bash
composer require handoff/blocks:^1.0
```

This installs the plugin into `wp-content/plugins/handoff-blocks/` (assuming the default WordPress Composer Installers path).

### 4. Activate

```bash
wp plugin activate handoff-blocks
```

Or activate from **Plugins** in the WordPress admin.

## Content directory

Generated blocks and build output live in `wp-content/handoff/` by default — outside the plugin directory. This means they survive `composer update` and can be version-controlled in your project repo.

```
wp-content/
├── plugins/
│   └── handoff-blocks/   ← Composer-managed (not in your repo)
├── handoff/              ← HANDOFF_CONTENT_DIR (in your repo)
│   ├── blocks/           ← compiler output
│   ├── build/            ← webpack output (WordPress loads from here)
│   ├── shared/           ← shared editor components (written by compiler)
│   └── includes/         ← handoff-categories.php (generated)
```

Commit `wp-content/handoff/` to your project's git repo. The plugin reads blocks from `HANDOFF_CONTENT_DIR/build/` at runtime.

To use a different location, define the constant in `wp-config.php`:

```php
define('HANDOFF_CONTENT_DIR', WP_CONTENT_DIR . '/handoff');
```

For Handoff API credentials, add these to `wp-config.php` (never stored in the database):

```php
define('HANDOFF_API_URL', 'https://your-handoff-instance.com/api');
define('HANDOFF_API_USERNAME', 'user');
define('HANDOFF_API_PASSWORD', 'pass');
```

## Config storage

Plugin configuration (API URL, groups, import rules) is stored in the WordPress database (`wp_options`). The admin **Settings** tab reads and writes this option directly. Credentials can be overridden via `wp-config.php` constants (see above) and are never persisted to the database when set that way.

To version-control your config, use the WP-CLI export/import commands:

```bash
# Export current config to a file
wp handoff config export > handoff-config.json

# Import config from a file (e.g. after a fresh install)
wp handoff config import handoff-config.json
```

On first activation, if `wp_options` has no config but a `handoff-wp.config.json` file exists (in the content directory or plugin root), it is automatically imported.

## Using a release ZIP instead

Every tagged release automatically builds a ready-to-install ZIP via GitHub Actions. The ZIP contains compiled compiler output and webpack bundles — no Node.js required on the server.

Download the ZIP from the [Releases page](../../releases) and either:

- Upload it through **Plugins → Add New → Upload Plugin** in wp-admin, or
- Extract it into `wp-content/plugins/`

This is the simplest path for sites that do not use Composer.

## Pinning versions

Prefer tagged semver releases in your `require` constraint:

```json
"require": {
  "handoff/blocks": "^1.0"
}
```

Avoid `dev-main` in production — it tracks the latest commit and may include breaking changes.

## Bedrock / custom `wp-content` layouts

If you use [Bedrock](https://roots.io/bedrock/) or a non-standard directory structure, Composer Installers respects `installer-paths` in your project's `composer.json`:

```json
{
  "extra": {
    "installer-paths": {
      "web/app/plugins/{$name}/": ["type:wordpress-plugin"]
    }
  }
}
```

The plugin's `extra.installer-name` is `handoff-blocks`, so it will install into the directory named `handoff-blocks` under whichever plugin path you configure.

## Security notes

- Use **read-only** access tokens or deploy keys — the installer never needs write access.
- Never commit `auth.json` or tokens to version control. Use environment variables or Composer's global config instead.
- The GitHub Actions workflow uses `GITHUB_TOKEN` (automatic, scoped to the repo) to attach assets — no additional secrets are required for the release build itself.
