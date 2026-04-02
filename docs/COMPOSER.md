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
