# Hatch OS agent tools (v0)

Chat can act inside the firm via tools. The department switcher is **UX context**, not an LLM firewall.

## Isolation

| Layer | Rule |
| --- | --- |
| **Read / retrieve / reason** | Firm-capable. `search_library` and Ask citations may use every department’s Library. |
| **Write / create / update** | ACL = departments the **user can open**. Same bar as a human editing Files. Enterprise is a view, not a write target. |
| **Cross-department** | `handoff_to_department` — notify + learn. **No** silent write into the peer’s Files (e.g. do not update another dept’s P&L). |

## Day-one tools

| Tool | Scope |
| --- | --- |
| `search_library` | Firm-wide indexed corpus (`inLibrary`) |
| `list_files` | Files tree for a department or the Enterprise union |
| `read_file` | Extracted text by file id or name |
| `write_draft` | Markdown draft into Files **only** if the user has that department |
| `handoff_to_department` | Stub inbox: record summary + facts; notify peer dept; no remote write |

Chat may emit a trailing line:

```
TOOL {"name":"write_draft","arguments":{"departmentId":"little-elm","filename":"notes.md","text":"..."}}
TOOL {"name":"handoff_to_department","arguments":{"toDepartmentId":"hq-ops","summary":"...","facts":"..."}}
```

The orchestrator executes that line after the model streams, then shows a tool chip. UI also exposes Handoff on Chat and Drive import on Files.

`GET` / `POST` `/api/tools` — schemas, audit, and explicit execution. `POST` with `{ query }` (no `name`) runs the Hermes agent loop. Plain Ask / non-tool chat stays on Qwen (`HATCH_LLM_*`). Set `HATCH_AGENT_LLM_*` for Hermes; if unset, the agent lane falls back to Qwen. See [INTERIM_INFERENCE.md](./INTERIM_INFERENCE.md).

## Dogfood workspaces

| Workspace | Who |
| --- | --- |
| Little Elm | Store team |
| Prosper | Store team |
| HQ Ops | Daniel / ops |
| Enterprise | Daniel (exec) — firm-wide Files/Library view |

## Non-goals (v0)

Unrestricted browser agent. Frontier APIs for firm content. Pretending department Chat sandboxes the model. Real Drive OAuth (connect + sample-folder stub only).
