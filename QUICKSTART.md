# Quickstart Guide

Get up and running with the Handoff WordPress Compiler in 5 minutes.

## Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for wp-env)
- Git

## 1. Clone the Repository

```bash
git clone https://github.com/your-org/handoff-wordpress.git
cd handoff-wordpress
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Build the Compiler

```bash
npm run build
```

## 4. Start WordPress

Make sure Docker Desktop is running, then start the local WordPress environment:

```bash
npm run wp:start
```

Wait for the environment to start. Once ready, you can access:

- **WordPress Site**: http://localhost:8888
- **WordPress Admin**: http://localhost:8888/wp-admin
  - Username: `admin`
  - Password: `password`

## 5. Activate the Theme and Plugin

```bash
# Activate the Handoff theme
npm run wp:cli -- wp theme activate theme

# Activate the Handoff Blocks plugin
npm run wp:cli -- wp plugin activate plugin
```

## 6. Configure Your Handoff API (Optional)

Instead of passing `--api-url` every time, create a config file:

```bash
npm run dev -- init --api-url https://demo.handoff.com
```

This creates a `handoff-wp.config.json` file. You can also pass auth credentials:

```bash
npm run dev -- init --api-url https://demo.handoff.com --username myuser --password mypass
```

Or edit the generated file manually:

```json
{
  "apiUrl": "https://demo.handoff.com",
  "output": "./demo/plugin/blocks",
  "themeDir": "./demo/theme",
  "username": "",
  "password": ""
}
```

## 7. Fetch Components from Handoff

Now fetch components from a Handoff API and generate Gutenberg blocks:

```bash
# If you created a config file, just run:
npm run dev -- --all

# Fetch theme templates (header/footer) and the style and script assets
npm run dev -- --theme
```

CLI options override config file values when provided.

## 8. Build the Blocks

After fetching components, build them for WordPress:

```bash
# Compile the js for the plugins
npm run build:plugin
```

## 9. Use the Blocks

1. Go to http://localhost:8888/wp-admin
2. Create a new Page or Post
3. Click the **+** button to add a block
4. Look for **Handoff Blocks** category
5. Add your generated blocks!

## Common Commands

| Command | Description |
|---------|-------------|
| `npm run wp:start` | Start WordPress environment |
| `npm run wp:stop` | Stop WordPress (keeps data) |
| `npm run wp:destroy` | Stop and delete all data |
| `npm run wp:logs` | View WordPress logs |
| `npm run dev -- --help` | Show compiler help |

## Troubleshooting

### Docker not running
Make sure Docker Desktop is running before starting wp-env.

### Port 8888 in use
Stop any other services using port 8888, or configure wp-env to use a different port.

### Blocks not appearing
1. Make sure the plugin is activated
2. Rebuild the blocks: `cd demo/plugin && npm run build`
3. Clear your browser cache

### API connection errors
Verify your Handoff API URL is correct and accessible from your machine.

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Explore the [demo/theme](./demo/theme) folder for theme customization
- Check [demo/plugin](./demo/plugin) for block development
