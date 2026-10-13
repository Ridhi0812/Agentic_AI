
import json
import ollama
from ollama import AsyncClient
from fastapi import APIRouter, Request
from pathlib import Path

router = APIRouter()
client = AsyncClient(host="http://localhost:11434")

MAX_LOOPS = 8

# File operations are restricted to this workspace.
WORKSPACE = Path.cwd().resolve()


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
                "description": "Read a supported file such as TXT, PY, JSON, CSV, XLSX or PDF.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "File path relative to workspace."
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
                "description": "Create a new text file or overwrite an existing text file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "File path relative to workspace."
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
                            "description": "File path relative to workspace."
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

    # =====================================================
    # 2. TOOL EXECUTION / DISPATCH
    # =====================================================

    def _safe_path(self, path):
        """Resolve paths and prevent access outside the workspace."""
        target = (WORKSPACE / path).resolve()

        if not target.is_relative_to(WORKSPACE):
            raise ValueError("Access outside the workspace is not allowed.")

        return target

    async def dispatch(self, name, args):
        """Execute the tool selected by the model."""
        if not isinstance(args, dict):
            raise ValueError("Tool arguments must be a dictionary.")

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
            # Do not follow symlinks outside the workspace.
            try:
                item.resolve().relative_to(WORKSPACE)
            except ValueError:
                continue

            results.append(str(item.relative_to(WORKSPACE)))

            if len(results) >= 500:
                break

        return json.dumps(results, ensure_ascii=False)

    async def _read_file(self, path):
        file_path = self._safe_path(path)

        if not file_path.is_file():
            raise ValueError("File does not exist.")

        suffix = file_path.suffix.lower()

        if suffix in {
            ".txt", ".md", ".py", ".json",
            ".yaml", ".yml", ".html", ".css",
            ".js", ".ts", ".jsx", ".tsx", ".csv",
            ".xml", ".ini", ".log"
        }:
            return file_path.read_text(encoding="utf-8")

        if suffix == ".pdf":
            import pdfplumber

            with pdfplumber.open(file_path) as pdf:
                return "\n".join(
                    page.extract_text() or "" for page in pdf.pages
                )

        if suffix == ".xlsx":
            from openpyxl import load_workbook

            workbook = load_workbook(
                file_path, read_only=True, data_only=True
            )
            output = {}

            for sheet in workbook.worksheets:
                output[sheet.title] = [
                    list(row) for row in sheet.iter_rows(values_only=True)
                ]

            workbook.close()
            return json.dumps(output, default=str, ensure_ascii=False)

        raise ValueError(f"Unsupported file type: {suffix}")

    async def _write_file(self, path, content):
        file_path = self._safe_path(path)

        if file_path.suffix.lower() not in {
            ".txt", ".md", ".py", ".json", ".yaml",
            ".yml", ".html", ".css", ".js", ".ts",
            ".jsx", ".tsx", ".csv", ".xml", ".ini", ".log"
        }:
            raise ValueError("Writing is limited to supported text files.")

        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

        return f"File written successfully: {file_path.relative_to(WORKSPACE)}"

    async def _edit_file(self, path, old_text, new_text):
        file_path = self._safe_path(path)

        if not file_path.is_file():
            raise ValueError("File does not exist.")

        if file_path.suffix.lower() not in {
            ".txt", ".md", ".py", ".json", ".yaml",
            ".yml", ".html", ".css", ".js", ".ts",
            ".jsx", ".tsx", ".csv", ".xml", ".ini", ".log"
        }:
            raise ValueError("Editing is limited to supported text files.")

        content = file_path.read_text(encoding="utf-8")

        if old_text not in content:
            return "Edit failed: old_text was not found in the file."

        updated = content.replace(old_text, new_text)
        file_path.write_text(updated, encoding="utf-8")

        return f"File edited successfully: {file_path.relative_to(WORKSPACE)}"


_tools = Tools()
tools = Tools.DEFINITIONS


# =========================================================
# SYSTEM PROMPT
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
# FORMATTER
# =========================================================

async def formator(input_data):
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
        model="gemma4:31b-cloud",
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
# 3. AGENT LOOP
# =========================================================

async def message(model_name, tokens, messages):
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

        # Pass the tool definitions to Ollama here.
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

        # No more tool calls: model has produced its final answer.
        if not tool_calls:
            answer = assistant_message.content or ""
            break

        # Preserve the assistant's tool-call message in the history.
        ollama_messages.append(assistant_message)

        for tool_call in tool_calls:
            tool_name = tool_call.function.name
            tool_args = tool_call.function.arguments

            logs.append(
                f"Loop {loop_count}: {tool_name}({tool_args})"
            )

            # Execute the requested function in Python.
            result = await _tools.dispatch(tool_name, tool_args)

            logs.append(f"Result: {result[:500]}")

            # Send the tool result back to the model.
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

    return await formator(answer)


# =========================================================
# FASTAPI CHAT ROUTE
# =========================================================

@router.post("/chat")
async def chatbot(request: Request):
    try:
        body = await request.json()

        messages = body["messages"]
        model_name = body["model"]
        tokens = body.get("options", {}).get("num_predict", 2048)

        print(f"Model: {model_name}")
        print(f"Tokens: {tokens}")

        answer = await message(model_name, tokens, messages)

        return {
            "message": {
                "role": "assistant",
                "content": answer
            }
        }

    except Exception as exc:
        print(f"Chat error: {exc}")

        return {
            "message": {
                "role": "assistant",
                "content": str(exc)
            }
        }


# =========================================================
# FASTAPI MODEL LIST ROUTE
# =========================================================

@router.get("/model_list")
async def models(request: Request):
    try:
        model_response = await client.list()

        model_names = [
            item.model for item in model_response.models
        ]

        return {"models": model_names}

    except Exception as exc:
        return {
            "error": str(exc),
            "models": []
        }
