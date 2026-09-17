# `create-elg-kit`

> Interactive CLI setup wizard for **elg-kit** (Employee-Led Growth rails).

Scaffold production-ready configuration files (`.env` and `slack-manifest.json`) for your organization in seconds.

---

## Quickstart

Run directly without installing via `npx` or `pnpm create`:

```bash
# Using npx
npx create-elg-kit

# Using pnpm
pnpm create elg-kit
```

---

## Interactive Wizard Steps

1. **Company / Organization Name**: Customizes manifest branding and edge URL defaults.
2. **Edge Redirect Domain**: The custom domain for employee shortlinks (default: `go.<company>.com`).
3. **Destination Allowlist Domains**: Whitelist authorized domains (e.g. `company.com,docs.company.com,github.com`) to prevent open redirect vulnerabilities.
4. **AI Inference Provider**: Choose from 4 supported inference tiers:
   - **OpenRouter** (Universal Gateway: Claude 3.7 Sonnet, Gemini 2.5 Pro, DeepSeek, GPT-5) *(Recommended)*
   - **Anthropic** (Direct API: Claude 3.7 Sonnet)
   - **OpenAI** (Direct API: GPT-5.6 / o3-mini)
   - **Local Ollama** (100% private self-hosted: Qwen 2.5 32b, Llama 3.3 70b)
5. **Provider API Key / URL**: Ingests API token or endpoint.
6. **Slack Integration Credentials**: Prompts for Slack Bot User Token (`xoxb-...`), App-Level Token (`xapp-...`), and Signing Secret.
7. **File Generation**: Produces customized `.env` (with random HMAC SHA-256 webhook secret) and `slack-manifest.json`.

---

## CLI Options & Automation

You can run `create-elg-kit` in CI/CD pipelines or scripts using non-interactive flags:

```bash
create-elg-kit [target-dir] [options]
```

| Flag | Description | Default |
| :--- | :--- | :--- |
| `-h, --help` | Show usage information and options | |
| `-v, --version` | Output version number | |
| `--dry-run` | Preview generated configurations without writing to disk | `false` |
| `-y, --yes, --non-interactive` | Skip prompts and accept default / CLI values | `false` |
| `-f, --force` | Overwrite existing `.env` or `slack-manifest.json` | `false` |
| `--dir <path>` | Directory to output files | Current working directory |
| `--company <name>` | Company / Organization name | `"Acme Corp"` |
| `--edge-domain <domain>` | Custom redirect domain | `go.<company>.com` |
| `--allowlist <domains>` | Comma-separated list of destination domains | `<company>.com,docs.<company>.com...` |
| `--app-domain <domain>` | Hostname for Slack webhook endpoints | `elg.<company>.com` |
| `--provider <name>` | `openrouter`, `anthropic`, `openai`, `ollama` | `openrouter` |
| `--api-key <key>` | API key for selected inference provider | |
| `--ollama-url <url>` | Endpoint URL for Ollama | `http://localhost:11434/v1` |
| `--slack-bot-token <tok>` | Slack Bot OAuth Token (`xoxb-...`) | |
| `--slack-app-token <tok>` | Slack App Token (`xapp-...`) | |
| `--slack-signing-secret <sec>` | Slack Signing Secret | |

### Non-Interactive Example

```bash
npx create-elg-kit ./my-elg-deployment \
  --non-interactive \
  --company="Acme Corp" \
  --edge-domain="go.acme.com" \
  --allowlist="acme.com,docs.acme.com,github.com" \
  --app-domain="elg.acme.com" \
  --provider=openrouter \
  --api-key="sk-or-v1-..."
```

---

## Post-Setup Next Steps

Once files are generated:

1. **Install Dependencies:**
   ```bash
   pnpm install
   ```

2. **Import Slack Manifest:**
   - Go to [api.slack.com/apps?new_app=1](https://api.slack.com/apps?new_app=1)
   - Choose **"From an app manifest"** and select your workspace
   - Paste or upload the generated `slack-manifest.json`
   - Under **"Install App"**, click **"Install to Workspace"**

3. **Deploy the Cloudflare Worker:**
   ```bash
   cd packages/edge-redirect && npx wrangler deploy
   ```

4. **Start the ELG Agent:**
   ```bash
   pnpm dev
   ```

---

## License

Apache-2.0. Authored by Rodney Lewis & Sprintz.
