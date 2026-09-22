# Client Integration Guide

Prompt-Router emulates the standard OpenAI API protocol (`/v1/chat/completions` and `/v1/models`). Any developer interface, IDE, coding agent, or script that supports OpenAI endpoints can connect with zero modification to upstream code.

The default local endpoint is:
```
Base URL: http://localhost:4000/v1
API Key:  prompt-router (or any placeholder string)
Model:    auto (or jev-smart-router)
```

---

## 1. Goose AI Agent

Goose can connect to Prompt-Router using either **Native Custom Provider Integration** (recommended) or standard **OpenAI Environment Overrides**.

### Option A: Native Custom Provider (Already Configured on This Machine)
Prompt-Router integrates natively into Goose's provider selector via:
- **Windows Path**: `%APPDATA%\Block\goose\config\custom_providers\custom_prompt_router.json`
- **Linux / macOS Path**: `~/.config/goose/custom_providers/custom_prompt_router.json`

```json
{
  "name": "custom_prompt_router",
  "engine": "openai",
  "display_name": "Prompt-Router (Jev)",
  "description": "Schema-constrained Jev System One smart router gateway",
  "api_key_env": "PROMPT_ROUTER_API_KEY",
  "base_url": "http://localhost:4000/v1",
  "models": [
    {
      "name": "auto",
      "context_limit": 200000,
      "reasoning": true
    },
    {
      "name": "jev-smart-router",
      "context_limit": 200000,
      "reasoning": true
    }
  ]
}
```

To run Goose using Prompt-Router:
```bash
# Start an interactive Goose session
goose session --provider custom_prompt_router --model auto

# Or run non-interactive prompts / recipes
goose run -t "Your prompt here" --provider custom_prompt_router --model auto
```

### Option B: Quick Environment Variable Override
In any terminal:
```powershell
# PowerShell
$env:OPENAI_BASE_URL = "http://localhost:4000/v1"
$env:OPENAI_API_KEY = "prompt-router"
goose session --model auto
```

```bash
# Bash / Zsh
export OPENAI_BASE_URL="http://localhost:4000/v1"
export OPENAI_API_KEY="prompt-router"
goose session --model auto
```

---

## 2. Cursor IDE (Requires Public Tunnel)

> ⚠️ **Architecture Note**: Cursor processes custom OpenAI Base URL calls through its cloud infrastructure rather than directly from your local machine. Therefore, `http://localhost:4000/v1` will fail. You must expose Prompt-Router through a secure public tunnel:
>
> ```bash
> # Expose port 4000 via ngrok
> ngrok http 4000
> ```
> Copy the resulting HTTPS forwarding URL (e.g. `https://xxxx.ngrok-free.app/v1`).

1. Open **Cursor Settings** (gear icon or `Ctrl+,` / `Cmd+,`).
2. Navigate to **Models**.
3. Under **OpenAI API Key**, input any placeholder string: `prompt-router`.
4. Check **Override OpenAI Base URL** and enter your public tunnel URL:
   ```
   https://xxxx.ngrok-free.app/v1
   ```
5. Click **Add Model** and add `auto` (or `jev-smart-router`).
6. Select `auto` as your active model in Cursor Chat and Composer.

---

## 3. Anthropic Protocol Notice (Claude Code)

> ℹ️ **Protocol Compatibility**: Claude Code communicates natively with the Anthropic Messages API (`/v1/messages`), whereas Prompt-Router emulates the OpenAI Protocol (`/v1/chat/completions`). To route Claude Code through Prompt-Router, run an Anthropic-to-OpenAI translation adapter or proxy. For native OpenAI-compatible agents (Goose, Cursor, VS Code Continue / Cline), no adapter is required.

---

## 4. VS Code (Continue / Cline / Roo Code)

### Continue Extension (`~/.continue/config.json`)
```json
{
  "models": [
    {
      "title": "Prompt-Router (Jev Auto)",
      "provider": "openai",
      "model": "auto",
      "apiBase": "http://localhost:4000/v1",
      "apiKey": "prompt-router"
    }
  ]
}
```

### Cline / Roo Code Extension
1. In the extension settings, select **OpenAI Compatible**.
2. **Base URL**: `http://localhost:4000/v1`
3. **API Key**: `prompt-router`
4. **Model ID**: `auto`

---

## 5. Anti-Gravity IDE

Set the environment variables before starting Anti-Gravity:
```bash
export OPENAI_BASE_URL="http://localhost:4000/v1"
export OPENAI_API_KEY="prompt-router"
```
Or set the Endpoint URL to `http://localhost:4000/v1` in Anti-Gravity's LLM Settings panel.

---

## 6. Python Application Example

```python
from openai import OpenAI

# Connect to Prompt-Router
client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="prompt-router"
)

# Stream responses with zero hallucination and automatic model routing
stream = client.chat.completions.create(
    model="auto",
    messages=[
        {"role": "user", "content": "Write a fast async web scraper in Python."}
    ],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

---

## 7. Multi-Turn Session Continuity & Cache Affinity in IDE Clients

When using Prompt-Router with coding tools that manage long multi-turn sessions (e.g. Cursor Chat, Claude Code, Goose, or Continue):

### Automatic Zero-Config Session Affinity
You do not need to configure anything in your IDE client. Prompt-Router automatically tracks multi-turn conversational threads using **Root Message Fingerprinting**:
- It computes a SHA-256 hash of the initial system prompt and root user prompt.
- As the session context expands beyond **$12{,}000$ tokens**, the router locks in **Sticky Session Affinity** to the initial anchor model (e.g. Claude 3.5 Sonnet).
- This ensures follow-up turns take advantage of **75%–90% KV prompt caching discounts** at the provider level, eliminating cache-thrashing penalties.

### Explicit Session Headers (SDKs and Custom Agents)
If you are developing custom agentic harnesses or scripts, you can optionally pass explicit session identifiers via HTTP headers:

```python
# Python SDK Example with Session Continuity
response = client.chat.completions.create(
    model="auto",
    messages=conversation_messages,
    extra_headers={
        "X-Session-ID": "project-refactor-session-42"
    }
)
```

Supported headers include:
- `X-Session-ID`
- `Session-ID`
- `Conversation-ID`


---

## 7. Node.js Application Example

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:4000/v1',
  apiKey: 'prompt-router'
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'auto',
    messages: [
      { role: 'user', content: 'Design a distributed rate limiter in Redis.' }
    ]
  });

  console.log(completion.choices[0].message.content);
}

main();
```
