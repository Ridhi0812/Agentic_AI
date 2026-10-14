import os
import json
from pathlib import Path

from ollama import AsyncClient
from fastapi import APIRouter, Request, HTTPException

router = APIRouter()

# =========================================================
# OLLAMA CLOUD CONFIGURATION
# =========================================================

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "").strip()

client = AsyncClient(
    host="https://ollama.com",
    headers={
        "Authorization": f"Bearer {OLLAMA_API_KEY}"
    } if OLLAMA_API_KEY else {},
    timeout=120.0,
)

MAX_LOOPS = 8

# Restrict file operations to the backend workspace.
WORKSPACE = Path.cwd().resolve()


def ensure_api_key():
    """Check that the Ollama Cloud API key is configured."""
    if not OLLAMA_API_KEY:
        raise RuntimeError(
            "OLLAMA_API_KEY is missing. "
            "Configure it in the Render environment variables."
        )


# =========================================================
# 1. TOOL DEFINITIONS
# =========================================================

class Tools:

    DEFINITIONS = [
        {
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": "List files and folders inside a directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Directory path relative to the workspace."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "find_files",
                "description": "Find files by name or pattern inside a directory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "pattern": {
                            "type": "string",
                            "description": "File pattern, e.g. *.py or app.py."
                        },
                        "path": {
                            "type": "string",
                            "description": "Directory to search, relative to workspace."
                        }
                    },
                    "required": ["pattern", "path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": (
                    "Read a supported file such as TXT, PY, JSON, "
                    "CSV, XLSX or PDF."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "File path relative to the workspace."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Create or overwrite a supported text file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "File path relative to the workspace."
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write into the file."
                        }
                    },
                    "required": ["path", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace specified text in an existing text file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "File path relative to the workspace."
                        },
                        "old_text": {
                            "type": "string",
                            "description": "Exact existing text to replace."
                        },
                        "new_text": {
                            "type": "string",
                            "description": "Replacement text."
                        }
                    },
                    "required": ["path", "old_text", "new_text"]
                }
            }
        }
    ]

    def _safe_path(self, path):
        target = (WORKSPACE / path).resolve()

        if not target.is_relative_to(WORKSPACE):
            raise ValueError(
                "Access outside the workspace is not allowed."
            )

        return target

    async def dispatch(self, name, args):
        if not isinstance(args, dict):
            raise ValueError(
                "Tool arguments must be a dictionary."
            )

        methods = {
            "list_directory": self._list_directory,
            "find_files": self._find_files,
            "read_file": self._read_file,
            "write_file": self._write_file,
            "edit_file": self._edit_file,
        }

        if name not in methods:
            raise ValueError(f"Unknown tool: {name}")

        try:
            result = await methods[name](**args)
            return str(result)
        except Exception as exc:
            return f"Tool error ({name}): {exc}"

    async def _list_directory(self, path):
        directory = self._safe_path(path)

        if not directory.is_dir():
            raise ValueError("Directory does not exist.")

        items = []

        for item in sorted(directory.iterdir()):
            items.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file"
            })

        return json.dumps(items, ensure_ascii=False)

    async def _find_files(self, pattern, path):
        directory = self._safe_path(path)

        if not directory.is_dir():
            raise ValueError("Directory does not exist.")

        results = []

        for item in directory.rglob(pattern):
            try:
                item.resolve().relative_to(WORKSPACE)
            except ValueError:
                continue

            results.append(
                str(item.relative_to(WORKSPACE))
            )

            if len(results) >= 500:
                break

        return json.dumps(results, ensure_ascii=False)

    async def _read_file(self, path):
        file_path = self._safe_path(path)

        if not file_path.is_file():
            raise ValueError("File does not exist.")

        suffix = file_path.suffix.lower()

        text_extensions = {
            ".txt", ".md", ".py", ".json",
            ".yaml", ".yml", ".html", ".css",
            ".js", ".ts", ".jsx", ".tsx", ".csv",
            ".xml", ".ini", ".log"
        }

        if suffix in text_extensions:
            return file_path.read_text(encoding="utf-8")

        if suffix == ".pdf":
            import pdfplumber

            with pdfplumber.open(file_path) as pdf:
                return "\n".join(
                    page.extract_text() or ""
                    for page in pdf.pages
                )

        if suffix == ".xlsx":
            from openpyxl import load_workbook

            workbook = load_workbook(
                file_path,
                read_only=True,
                data_only=True
            )

            try:
                output = {}

                for sheet in workbook.worksheets:
                    output[sheet.title] = [
                        list(row)
                        for row in sheet.iter_rows(
                            values_only=True
                        )
                    ]

                return json.dumps(
                    output,
                    default=str,
                    ensure_ascii=False
                )
            finally:
                workbook.close()

        raise ValueError(f"Unsupported file type: {suffix}")

    async def _write_file(self, path, content):
        file_path = self._safe_path(path)

        allowed_extensions = {
            ".txt", ".md", ".py", ".json",
            ".yaml", ".yml", ".html", ".css",
            ".js", ".ts", ".jsx", ".tsx",
            ".csv", ".xml", ".ini", ".log"
        }

        if file_path.suffix.lower() not in allowed_extensions:
            raise ValueError(
                "Writing is limited to supported text files."
            )

        file_path.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        file_path.write_text(
            content,
            encoding="utf-8"
        )

        return (
            "File written successfully: "
            f"{file_path.relative_to(WORKSPACE)}"
        )

    async def _edit_file(self, path, old_text, new_text):
        file_path = self._safe_path(path)

        if not file_path.is_file():
            raise ValueError("File does not exist.")

        allowed_extensions = {
            ".txt", ".md", ".py", ".json",
            ".yaml", ".yml", ".html", ".css",
            ".js", ".ts", ".jsx", ".tsx",
            ".csv", ".xml", ".ini", ".log"
        }

        if file_path.suffix.lower() not in allowed_extensions:
            raise ValueError(
                "Editing is limited to supported text files."
            )

        content = file_path.read_text(
            encoding="utf-8"
        )

        if old_text not in content:
            return "Edit failed: old_text was not found in the file."

        updated = content.replace(old_text, new_text)

        file_path.write_text(
            updated,
            encoding="utf-8"
        )

        return (
            "File edited successfully: "
            f"{file_path.relative_to(WORKSPACE)}"
        )


_tools = Tools()
tools = Tools.DEFINITIONS


# =========================================================
# 2. SYSTEM PROMPT
# =========================================================

SYSTEM_PROMPT = """
Your name is Riya.

You are an intelligent closed-loop agent.

1. Read the user's request.
2. Select an appropriate tool when needed.
3. Inspect the tool's result.
4. If the result is insufficient, call another tool if appropriate.
5. Do not claim an operation succeeded unless its tool result confirms it.
6. If more information is needed, ask the user.
7. Provide a clear final answer after completing the task.
8. Never invent tool results.
"""


# =========================================================
# 3. HTML FORMATTER
# =========================================================

async def formator(input_data, model_name):
    formatter_messages = [
        {
            "role": "system",
            "content": """
Format the input as HTML only.
Use appropriate headings, paragraphs, lists, tables and code tags.
Preserve the meaning and code.
Do not add suggestions or information that is absent from the input.
Return only the formatted output.
"""
        },
        {
            "role": "user",
            "content": input_data
        }
    ]

    response = await client.chat(
        model=model_name,
        messages=formatter_messages
    )

    answer = response.message.content or ""
    answer = answer.strip()

    if answer.startswith("```"):
        answer = answer.replace("```html", "", 1)

        if answer.endswith("```"):
            answer = answer[:-3]

    return answer.strip()


# =========================================================
# 4. AGENT LOOP
# =========================================================

async def message(model_name, tokens, messages):
    ensure_api_key()

    ollama_messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    ollama_messages.extend(messages)

    loop_count = 0
    logs = []
    answer = ""

    while loop_count < MAX_LOOPS:
        loop_count += 1

        response = await client.chat(
            model=model_name,
            messages=ollama_messages,
            tools=tools,
            options={
                "num_predict": tokens
            }
        )

        assistant_message = response.message
        tool_calls = assistant_message.tool_calls or []

        if not tool_calls:
            answer = assistant_message.content or ""
            break

        ollama_messages.append(assistant_message)

        for tool_call in tool_calls:
            tool_name = tool_call.function.name
            tool_args = tool_call.function.arguments

            logs.append(
                f"Loop {loop_count}: "
                f"{tool_name}({tool_args})"
            )

            result = await _tools.dispatch(
                tool_name,
                tool_args
            )

            logs.append(
                f"Result: {result[:500]}"
            )

            ollama_messages.append({
                "role": "tool",
                "name": tool_name,
                "content": str(result)
            })

    else:
        answer = (
            f"Agent reached the maximum limit of {MAX_LOOPS} loops. "
            "The task may not be complete."
        )

    if logs:
        answer += (
            "\n\nAgent execution summary:\n"
            f"Loops used: {loop_count}\n"
            + "\n".join(logs)
        )

    print(f"Agent loops: {loop_count}")
    print(f"Final answer: {answer}")

    return await formator(answer, model_name)


# =========================================================
# 5. FASTAPI CHAT ROUTE
# =========================================================

@router.post("/chat")
async def chatbot(request: Request):
    try:
        ensure_api_key()

        body = await request.json()

        messages = body.get("messages", [])
        model_name = body.get("model", "").strip()
        tokens = body.get(
            "options", {}
        ).get("num_predict", 2048)

        if not model_name:
            raise HTTPException(
                status_code=400,
                detail="A model name is required."
            )

        if not isinstance(messages, list) or not messages:
            raise HTTPException(
                status_code=400,
                detail="At least one message is required."
            )

        print(f"Model: {model_name}")
        print(f"Tokens: {tokens}")

        answer = await message(
            model_name,
            tokens,
            messages
        )

        return {
            "message": {
                "role": "assistant",
                "content": answer
            }
        }

    except HTTPException:
        raise

    except Exception as exc:
        print(f"Chat error: {exc}")

        raise HTTPException(
            status_code=502,
            detail=f"Chat request failed: {str(exc)}"
        ) from exc


# =========================================================
# 6. FASTAPI MODEL LIST ROUTE  ← UPDATED
# =========================================================

@router.get("/model_list")
async def models(request: Request):
    return {
        "models": [
            "gemma4:31b",
            "gemma4:12b",
            "gemma4:e4b",
            "llama3.1:latest",
            "qwen2.5:3b",
            "llama3.2:3b",
        ]
    }