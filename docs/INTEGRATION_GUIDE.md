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

In your terminal or `~/.config/goose/config.yaml`:

```bash
export OPENAI_BASE_URL="http://localhost:4000/v1"
export OPENAI_API_KEY="prompt-router"

# Start Goose using auto-routing
goose session --model auto
```

Or configure the OpenAI provider in `config.yaml`:
```yaml
extensions:
  developer:
    enabled: true
providers:
  openai:
    base_url: "http://localhost:4000/v1"
    api_key: "prompt-router"
default_model: "auto"
```

---

## 2. Cursor IDE

1. Open **Cursor Settings** (gear icon or `Ctrl+,` / `Cmd+,`).
2. Navigate to **Models**.
3. Under **OpenAI API Key**, input any placeholder string: `prompt-router`.
4. Check **Override OpenAI Base URL** and enter:
   ```
   http://localhost:4000/v1
   ```
5. Click **Add Model** and add `auto`.
6. Select `auto` as your active model in Cursor Chat and Composer.

---

## 3. Claude Code CLI

When configuring Claude Code to connect via an OpenAI proxy:

```bash
export OPENAI_BASE_URL="http://localhost:4000/v1"
export OPENAI_API_KEY="prompt-router"
claude --model auto
```

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
