# 👋 Meet Riya

Riya is a small AI assistant that doesn't just *talk* about your files, she actually **works with them**.

Ask her to read an invoice, find a report, fix a line in a config file, or create an Excel sheet you can download. She picks the right tool, checks what happened, and keeps going until the job is done (or tells you honestly that it isn't).

Under the hood she's a **FastAPI** backend that talks to a model on **Ollama Cloud**.

---

## ✨ What can she do?

- 📂 **Look around**: list folders and search for files by name or pattern.
- 📖 **Read files**: text and code files, PDF, Word (`.docx`), Excel (`.xlsx`, `.xls`) and CSV.
- ✍️ **Create files**: text, code, CSV and real **Excel (`.xlsx`)** files.
- 🔧 **Edit files**: swap one piece of text for another in a text file.
- 📎 **Answer from uploads**: attach up to 5 documents (max 5 MB each) to a message and ask questions about them.
- ⬇️ **Give you a download link**: when she creates a file, a download button shows up in the chat and the file lands in *your* Downloads folder.

---

## 🔁 How does she think? (the "closed loop")

Most chatbots answer once and stop. Riya works in a loop:

1. You send a request.
2. The model decides: *"Can I just answer, or do I need a tool?"*
3. If a tool is needed, the backend runs it.
4. The tool's result goes **back to the model**, so she can see what really happened.
5. She either calls another tool or gives you the final answer.

Two rules keep her honest and safe:

- She must **never claim success unless the tool result confirms it**.
- She can loop at most **8 times**, so she can't get stuck forever. If she hits the limit, she says the task may be incomplete.

When tools were used, the reply also includes a short *execution summary* so you can see exactly what she did.

---

## 🧰 Her tools

| Tool | What it does |
| --- | --- |
| `list_directory` | Shows files and folders inside a directory |
| `find_files` | Searches for files with a pattern like `*.pdf` (up to 500 results) |
| `read_file` | Reads TXT/code, CSV, PDF, DOCX, XLSX, XLS files |
| `write_file` | Creates or overwrites a file. For `.xlsx`, content is a list of rows like `[["Name","Age"],["Ali",25]]` |
| `edit_file` | Replaces the first match of some text in a text file (not for `.xlsx`) |

**Good to know:** PDF, DOCX and XLS files can be read but not written. Only supported text-type files and `.xlsx` can be created.

---

## 🚀 Getting started

### 1. Install the packages

```bash
pip install fastapi uvicorn ollama python-dotenv pdfplumber python-docx openpyxl xlrd
```

### 2. Create a `.env` file

```env
OLLAMA_API_KEY=your_key_here
ALLOWED_MODELS=gemma4:31b-cloud
USE_FORMATTER=true
WORKSPACE_PATH=./agent_files
```

| Variable | What it's for |
| --- | --- |
| `OLLAMA_API_KEY` | **Required.** Your Ollama Cloud key |
| `ALLOWED_MODELS` | Comma-separated list of models users may pick. Anything else is rejected |
| `USE_FORMATTER` | `true` turns the reply into HTML (bold, lists, tables). Keep it `true` if your frontend renders HTML |
| `WORKSPACE_PATH` | The folder Riya is allowed to work in |

> ⚠️ Never commit your `.env` file. Add it to `.gitignore`.

### 3. Plug the router into your app

```python
from fastapi import FastAPI
from agent_router import router

app = FastAPI()
app.include_router(router)
```

*(Add CORS middleware too if your frontend runs on a different port, e.g. Vite on `5173`.)*

### 4. Run it

```bash
uvicorn main:app --reload --port 8000
```

---

## 🔌 API

### `POST /chat`

Send a conversation, get Riya's reply.

```json
{
  "model": "gemma4:31b-cloud",
  "messages": [
    { "role": "user", "content": "Create an Excel file with 5 random employees" }
  ],
  "options": { "num_predict": 2048 },
  "documents": []
}
```

- `model` and `messages` are required.
- `documents` is optional. Each item looks like `{ "name": "invoice.pdf", "base64": "..." }`.
- Returns `{ "message": { "role": "assistant", "content": "<html>" } }`.

### `GET /model_list`

Returns the models you allowed in `ALLOWED_MODELS`.

### `GET /download/{filename}`

Downloads a file from the workspace. Riya adds these links to her replies automatically, so you don't have to build them by hand.

---

## 💬 Things you can try

- "Find the invoice PDF in the invoices folder and tell me the vendor and total."
- "Create notes.txt with a short to-do list."
- "Replace `debug=false` with `debug=true` in config.ini."
- "Create an Excel file with sample sales data that I can download."
- *(with an uploaded file)* "Summarise this document in 5 points."

---

## 🛡️ Safety built in

- **Workspace lock:** every path is checked, and anything outside the workspace folder is refused.
- **Model allowlist:** only models in `ALLOWED_MODELS` can run.
- **Bad tool calls don't crash the server:** errors are handed back to the model so she can try again.
- **Size limits:** 5 MB per upload, 5 documents per message, and very long tool output is trimmed.

---

## 🌐 Deploying (e.g. on Render)

1. Push your code to GitHub (without `.env`).
2. Add your environment variables in the Render dashboard. Set `WORKSPACE_PATH=/tmp/agent_files` (Windows paths won't work on Linux).
3. Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"
```

4. Point your frontend at the Render URL instead of `localhost`.

---

## ⚠️ Honest limitations

- **Files live on the server, not on your laptop.** Riya can't see your personal computer. Download links are how files reach you.
- **One shared workspace.** Right now all users share the same folder, so two people creating `data.xlsx` would overwrite each other. Per-user folders are the next thing to add before opening this up to many people.
- **Temporary storage on free hosting.** Files can disappear after a restart, so download them right away.
- **No "are you sure?" step.** `write_file` can overwrite an existing file without asking.
- **Vague requests can burn the loop limit.** "Read my important file" with no name may end with Riya asking you for more details.
- **File tools only.** She can't send emails or talk to other apps unless you add tools for that.

---

## 🗺️ Ideas for later

- Per-user or per-chat workspace folders
- Confirmation before overwriting files
- Permanent storage (like S3) for created files
- Smarter handling of very large files

---

Built with Python, FastAPI and Ollama Cloud. Questions or ideas? Open an issue and say hi. 🙂