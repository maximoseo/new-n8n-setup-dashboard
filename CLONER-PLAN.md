# n8n Workflow + Google Sheets Cloner — Full Technical Plan

**Project**: Automated Workflow Cloning System with Google Sheets Creation
**Dashboard**: https://new-n8n-setup-dashboard.maximo-seo.ai/ (Render srv-d8ajvl0jo6nc73epndgg)
**n8n Instance**: https://websiseo.app.n8n.cloud/ (405 workflows, 130+ domains)
**User**: Tomerake (Hebrew/Israeli, manages 130+ client websites)
**Date**: 2026-06-02

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture](#2-architecture)
3. [Complete Data Flow](#3-complete-data-flow)
4. [API Reference](#4-api-reference)
5. [Database Schema (Supabase)](#5-database-schema-supabase)
6. [UI/UX — Hebrew RTL 5-Step Wizard](#6-uiux--hebrew-rtl-5-step-wizard)
7. [Core Cloning Engine](#7-core-cloning-engine)
8. [Google Sheet Creation Engine](#8-google-sheet-creation-engine)
9. [Excel Parsing & Data Mapping](#9-excel-parsing--data-mapping)
10. [Per-Node-Type Adaptation Logic](#10-per-node-type-adaptation-logic)
11. [File Structure](#11-file-structure)
12. [Implementation Phases](#12-implementation-phases)
13. [Edge Cases & Testing Strategy](#13-edge-cases--testing-strategy)
14. [Security Considerations](#14-security-considerations)

---

## 1. Executive Summary

Build a **5-step wizard** that allows Tomerake to:

1. **Connect** to any n8n instance via API key
2. **Select** a source workflow from 405+ existing workflows
3. **Upload** an Excel file (.xlsx) with keyword research data
4. **Configure** new site details (domain, WordPress, SMTP)
5. **Clone** — system creates a new Google Sheet with the Excel data, clones the n8n workflow with all node adaptations, and activates it

**Key innovation**: The system doesn't just copy workflow JSON — it creates a **real Google Sheet** via the Sheets API, maps Excel tabs to sheet tabs, writes the data, then rewires the cloned workflow to point to the new sheet.

**Existing assets to reuse**:
- `webs-html-improvements-files/n8n_readonly_client.py` → extend with write methods
- `webs-html-improvements-files/n8n_template_extractor.py` → `identify_domain()` logic
- `webs-html-improvements-files/server.py` → add new routes (existing Flask-style server)
- `~/.hermes/skills/productivity/google-workspace/scripts/google_api.py` → `sheets_create()`, `sheets_update()`, `sheets_append()` patterns
- `webs-html-improvements-files/dtapet-project/original/n8n_workflow.json` → real workflow test fixture (3003 lines, 23+ nodes)

---

## 2. Architecture

### 2.1 System Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Dashboard (Render)                                │
│                  Flask/HTTP server + Hebrew RTL frontend               │
│                                                                       │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ Step 1   │  │ Step 2    │  │ Step 3    │  │ Step 4    │  │ Step 5  │ │
│  │ Connect  │→│ Browse &  │→│ Upload    │→│ Configure │→│ Clone & │ │
│  │ n8n API  │  │ Select WF │  │ Excel     │  │ New Site  │  │ Activate│ │
│  └─────────┘  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Cloner Engine (Python)                         │ │
│  │                                                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │ │
│  │  │ Workflow      │  │ Sheet        │  │ Excel                  │ │ │
│  │  │ Analyzer      │  │ Creator      │  │ Parser                 │ │ │
│  │  │              │  │              │  │                        │ │ │
│  │  │ - Parse JSON  │  │ - Create doc │  │ - Read .xlsx           │ │ │
│  │  │ - Find nodes  │  │ - Add tabs   │  │ - Map sheets→tabs     │ │ │
│  │  │ - Detect refs │  │ - Write data │  │ - Extract headers     │ │ │
│  │  └──────────────┘  └──────────────┘  └───────────────────────┘ │ │
│  │                                                                  │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │ │
│  │  │ Node          │  │ Credential   │  │ Domain                │ │ │
│  │  │ Adapter       │  │ Manager      │  │ Replacer              │ │ │
│  │  └──────────────┘  └──────────────┘  └───────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────┬────────────────────┬───────────────────────────────┘
                   │                    │
         ┌─────────▼─────────┐  ┌──────▼──────────────────┐
         │   n8n Cloud API   │  │  Google Sheets API       │
         │                   │  │  (via OAuth2 token)       │
         │  GET /workflows   │  │                           │
         │  POST /workflows  │  │  spreadsheets.create      │
         │  POST /activate   │  │  spreadsheets.batchUpdate │
         │  GET /credentials │  │  values.update            │
         │  POST /credentials│  │  values.append            │
         └───────────────────┘  └───────────────────────────┘
```

### 2.2 Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend | Python (custom HTTP server) | Consistent with existing `server.py` on Render |
| Frontend | Single HTML + vanilla JS | Consistent with existing dashboard pattern |
| n8n API | `urllib.request` | Existing pattern in `n8n_readonly_client.py` |
| Google Sheets API | `google-api-python-client` | Already used in `google_api.py` |
| Excel parsing | `openpyxl` | Standard Python xlsx library |
| Database | Supabase (PostgreSQL) | Already used by existing dashboard |
| Deployment | Render auto-deploy | Existing infrastructure |

### 2.3 Credential Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Credential Flow                       │
│                                                         │
│  User provides:                                         │
│    ├─ n8n API Key + Instance URL (per session)          │
│    ├─ WordPress URL + username + app password            │
│    ├─ SMTP host + user + password (optional)             │
│    └─ Google Sheets OAuth2 credential ID (select from    │
│       existing credentials on the n8n instance)          │
│                                                         │
│  System uses:                                            │
│    ├─ Google OAuth2 token (from ~/.hermes/google_token.json)│
│    │   for creating sheets directly via Sheets API       │
│    └─ n8n API for creating WP/SMTP credentials and       │
│       the cloned workflow                                │
│                                                         │
│  Key insight:                                            │
│    Google Sheets OAuth2 creds in n8n CANNOT be created   │
│    via API (require browser OAuth flow). Solution:        │
│    1. Create the sheet via Hermes' own Google OAuth token │
│    2. In the cloned workflow, REUSE an existing           │
│       googleSheetsOAuth2Api credential from the instance  │
│    3. The sheet permissions must grant access to the      │
│       Google account behind the n8n OAuth2 credential     │
└────────────────────────────────────────────────────────┘
```

---

## 3. Complete Data Flow

### 3.1 End-to-End Sequence

```
User                Dashboard              n8n API          Google Sheets API
 │                     │                      │                    │
 │ 1. Enter creds      │                      │                    │
 │────────────────────→│                      │                    │
 │                     │ GET /workflows       │                    │
 │                     │─────────────────────→│                    │
 │                     │←─────────────────────│                    │
 │ 2. Show workflows   │                      │                    │
 │←────────────────────│                      │                    │
 │                     │                      │                    │
 │ 3. Select workflow  │                      │                    │
 │────────────────────→│                      │                    │
 │                     │ GET /workflows/:id   │                    │
 │                     │─────────────────────→│                    │
 │                     │←─────────────────────│                    │
 │ 4. Show analysis    │                      │                    │
 │←────────────────────│                      │                    │
 │  (detected nodes,   │                      │                    │
 │   domains, sheets)  │                      │                    │
 │                     │                      │                    │
 │ 5. Upload .xlsx     │                      │                    │
 │────────────────────→│                      │                    │
 │                     │ Parse Excel locally   │                    │
 │                     │                      │                    │
 │ 6. Configure site   │                      │                    │
 │────────────────────→│                      │                    │
 │  (domain, WP, SMTP) │                      │                    │
 │                     │                      │                    │
 │ 7. Click "Clone"    │                      │                    │
 │────────────────────→│                      │                    │
 │                     │                      │                    │
 │                     │ ── Phase A: Create Google Sheet ──────────→│
 │                     │    spreadsheets.create                     │
 │                     │←──────────────────────────────────────────│
 │                     │    batchUpdate (add tabs)                  │
 │                     │──────────────────────────────────────────→│
 │                     │    values.update (write Excel data)        │
 │                     │──────────────────────────────────────────→│
 │                     │←──────────────────────────────────────────│
 │                     │                      │                    │
 │                     │ ── Phase B: Clone Workflow ───────────────→│
 │                     │    (transform JSON in memory)              │
 │                     │    POST /workflows                         │
 │                     │─────────────────────→│                    │
 │                     │←─────────────────────│                    │
 │                     │                      │                    │
 │                     │ ── Phase C: Activate ─────────────────────→│
 │                     │    POST /workflows/:id/activate            │
 │                     │─────────────────────→│                    │
 │                     │←─────────────────────│                    │
 │                     │                      │                    │
 │ 8. Show results     │                      │                    │
 │←────────────────────│                      │                    │
 │  (new sheet URL,    │                      │                    │
 │   new workflow ID,  │                      │                    │
 │   change summary)   │                      │                    │
```

### 3.2 Step-by-Step Detail

**Step 1 — Connect**: User provides n8n instance URL + API key. Dashboard validates by calling `GET /api/v1/workflows?limit=1`. Stores creds in server-side session (30-min TTL).

**Step 2 — Browse**: Dashboard calls `GET /api/v1/workflows?limit=100` with cursor pagination. Frontend displays searchable/filterable list. Shows workflow name, node count, detected domain.

**Step 3 — Upload Excel**: User uploads `.xlsx` file. Server parses it with `openpyxl`, returns sheet names + column headers + row count to frontend. No data stored on server beyond the parsed structure.

**Step 4 — Configure**: User enters:
- New domain (auto-detected old domain from workflow analysis)
- WordPress URL + credentials
- SMTP settings (optional)
- Which Google Sheets OAuth2 credential to reuse (dropdown of existing creds from n8n)
- Mapping: which Excel sheet → which Google Sheet tab

**Step 5 — Clone**: System executes Phase A → B → C in sequence. Returns comprehensive change report.

---

## 4. API Reference

### 4.1 n8n REST API Endpoints Used

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| `GET` | `/api/v1/workflows?limit=100&cursor=xxx` | List workflows (paginated) | `X-N8N-API-KEY` |
| `GET` | `/api/v1/workflows/{id}` | Get full workflow JSON | `X-N8N-API-KEY` |
| `POST` | `/api/v1/workflows` | Create new workflow | `X-N8N-API-KEY` |
| `POST` | `/api/v1/workflows/{id}/activate` | Activate workflow | `X-N8N-API-KEY` |
| `GET` | `/api/v1/credentials` | List existing credentials | `X-N8N-API-KEY` |
| `POST` | `/api/v1/credentials` | Create new credential | `X-N8N-API-KEY` |

**Auth header**: `X-N8N-API-KEY: <api-key>`

**Workflow JSON structure** (from real dtapet.com workflow):
```json
{
  "name": "https://www.dtapet.com/ - חנות",
  "nodes": [
    {
      "id": "uuid",
      "name": "Grab New Cluster",
      "type": "n8n-nodes-base.googleSheets",
      "typeVersion": 4.5,
      "position": [-5728, 2912],
      "parameters": {
        "documentId": {
          "__rl": true,
          "value": "1wKDR3T2Y4vJyGGdfAXKKJwq8VmT9slNsfjcv7ji_5rA",
          "mode": "list",
          "cachedResultName": "https://www.dtapet.com/ - MAOR - N8N אוטומציות",
          "cachedResultUrl": "https://docs.google.com/spreadsheets/d/1wKDR3T2Y4vJyGGdfAXKKJwq8VmT9slNsfjcv7ji_5rA/edit?usp=drivesdk"
        },
        "sheetName": {
          "__rl": true,
          "value": 683869339,
          "mode": "list",
          "cachedResultName": "מחקר + כתבות",
          "cachedResultUrl": "https://docs.google.com/spreadsheets/d/.../edit#gid=683869339"
        },
        "filtersUI": {
          "values": [{"lookupColumn": "Published", "lookupValue": "production"}]
        }
      },
      "credentials": {
        "googleSheetsOAuth2Api": {
          "id": "jbfYzjBzecDo24f5",
          "name": "Google Sheets account 3"
        }
      }
    }
  ],
  "connections": { ... },
  "settings": { "executionOrder": "v1" }
}
```

**Credential creation** (WordPress):
```python
POST /api/v1/credentials
{
  "name": "newsite.co.il - WordPress",
  "type": "wordpressApi",
  "data": {
    "user": "admin",
    "password": "xxxx xxxx xxxx xxxx xxxx xxxx",
    "url": "https://www.newsite.co.il"
  }
}
# Response: { "id": "abc123", "name": "...", "type": "..." }
```

### 4.2 Google Sheets API Endpoints Used

All via `google-api-python-client` (service = `build_service('sheets', 'v4')`):

| Operation | API Call | Purpose |
|-----------|---------|---------|
| Create spreadsheet | `service.spreadsheets().create(body=...)` | Create new Google Sheet |
| Add tabs | `service.spreadsheets().batchUpdate(spreadsheetId=..., body={"requests": [{"addSheet": {...}}]})` | Add multiple sheet tabs |
| Write data | `service.spreadsheets().values().update(spreadsheetId=..., range=..., body={"values": [...]}, valueInputOption="USER_ENTERED")` | Write Excel data to tabs |
| Append rows | `service.spreadsheets().values().append(...)` | Append additional data |
| Get metadata | `service.spreadsheets().get(spreadsheetId=...)` | Read existing sheet structure |
| Format cells | `service.spreadsheets().batchUpdate(...)` with `repeatCell` requests | Bold headers, set column widths |

**Create spreadsheet with initial tabs**:
```python
body = {
    "properties": {"title": "newsite.co.il - חנות - N8N אוטומציות"},
    "sheets": [
        {"properties": {"title": "מחקר + כתבות", "index": 0}},
        {"properties": {"title": "מוצרים", "index": 1}},
        {"properties": {"title": "בלוג", "index": 2}}
    ]
}
result = service.spreadsheets().create(
    body=body,
    fields="spreadsheetId,properties,spreadsheetUrl,sheets.properties"
).execute()
# Returns: spreadsheetId, sheet IDs (gid) for each tab
```

**Write data to a specific tab**:
```python
service.spreadsheets().values().update(
    spreadsheetId=spreadsheet_id,
    range=f"'{tab_name}'!A1",
    body={"values": rows},
    valueInputOption="USER_ENTERED"
).execute()
```

**Format headers (bold + freeze)**:
```python
requests = [
    {
        "repeatCell": {
            "range": {"sheetId": gid, "startRowIndex": 0, "endRowIndex": 1},
            "cell": {"userEnteredFormat": {"textFormat": {"bold": True}}},
            "fields": "userEnteredFormat.textFormat.bold"
        }
    },
    {
        "updateSheetProperties": {
            "properties": {"sheetId": gid, "gridProperties": {"frozenRowCount": 1}},
            "fields": "gridProperties.frozenRowCount"
        }
    }
]
service.spreadsheets().batchUpdate(
    spreadsheetId=spreadsheet_id,
    body={"requests": requests}
).execute()
```

### 4.3 Dashboard API Endpoints (to add to `server.py`)

```
POST /api/cloner/connect
  Body: { instance_url, api_key }
  Response: { ok, workflow_count, session_id }

GET /api/cloner/workflows?search=&domain=&limit=50&cursor=
  Headers: X-Cloner-Session
  Response: { ok, workflows: [{id, name, node_count, domains, is_active}], next_cursor }

GET /api/cloner/workflow/{id}/analyze
  Headers: X-Cloner-Session
  Response: {
    ok,
    workflow: { name, node_count },
    analysis: {
      domains: ["dtapet.com", "bloklive.com"],
      google_sheets_nodes: [
        { node_name: "Grab New Cluster", documentId: "...", sheetName: "מחקר + כתבות", gid: 683869339 }
      ],
      wordpress_nodes: [
        { node_name: "Create Post", url: "https://bloklive.com/", credential_id: "Fp3VeI4L5ZgNjyqj" }
      ],
      http_request_nodes: [
        { node_name: "Image Generation", url: "https://api.kie.ai/api/v1/jobs/createTask" }
      ],
      code_nodes: [
        { node_name: "Cleaning Image Prompts", has_domain_refs: false }
      ],
      email_nodes: [],
      credentials_used: [
        { type: "googleSheetsOAuth2Api", id: "jbfYzjBzecDo24f5", name: "Google Sheets account 3" },
        { type: "wordpressApi", id: "Fp3VeI4L5ZgNjyqj", name: "https://bloklive.com/" }
      ]
    }
  }

POST /api/cloner/parse-excel
  Body: multipart/form-data with .xlsx file
  Response: {
    ok,
    sheets: [
      { name: "מחקר + כתבות", columns: ["Keyword", "Volume", "Intent"], row_count: 150 },
      { name: "מוצרים", columns: ["Product", "Category", "Price"], row_count: 45 }
    ]
  }

GET /api/cloner/credentials
  Headers: X-Cloner-Session
  Response: {
    ok,
    google_sheets_credentials: [
      { id: "jbfYzjBzecDo24f5", name: "Google Sheets account 3" }
    ],
    wordpress_credentials: [...]
  }

POST /api/cloner/preview
  Body: {
    source_workflow_id,
    mapping: {
      old_domain, new_domain,
      wp_url, wp_username, wp_app_password,
      sheet_tab_mappings: [{ excel_sheet: "מחקר", target_tab: "מחקר + כתבות" }],
      gsheets_credential_id,
      smtp: { host, user, pass } // optional
    }
  }
  Response: {
    ok,
    preview: {
      workflow_name: "newsite.co.il - חנות",
      total_nodes: 23,
      nodes_to_change: 8,
      changes: [
        { node: "Grab New Cluster", type: "googleSheets", field: "documentId", old: "1wK...", new: "(will be created)" },
        { node: "Create Post", type: "wordpress", field: "credential", old: "bloklive.com", new: "newsite.co.il" },
        ...
      ],
      sheet_preview: {
        title: "newsite.co.il - חנות - N8N אוטומציות",
        tabs: ["מחקר + כתבות", "מוצרים"],
        total_rows: 195
      }
    }
  }

POST /api/cloner/clone
  Body: {
    source_workflow_id,
    mapping: { ... },  // same as preview
    options: {
      activate: true,
      create_sheet: true,
      sheet_title: "newsite.co.il - חנות - N8N אוטומציות",
      share_with_email: "user@example.com"  // optional
    }
  }
  Response: {
    ok,
    sheet: {
      spreadsheet_id: "new_id_here",
      url: "https://docs.google.com/spreadsheets/d/new_id_here/edit",
      tabs_created: ["מחקר + כתבות", "מוצרים"],
      rows_written: 195
    },
    workflow: {
      id: "new_wf_id",
      name: "newsite.co.il - חנות",
      url: "https://websiseo.app.n8n.cloud/workflow/new_wf_id",
      active: true
    },
    changes: [
      { node: "Grab New Cluster", change: "documentId → new_id", status: "ok" },
      { node: "Create Post", change: "credential → newsite.co.il WordPress", status: "ok" },
      ...
    ],
    summary: {
      total_changes: 12,
      google_sheets_nodes: 2,
      wordpress_nodes: 3,
      http_request_nodes: 2,
      code_nodes: 3,
      email_nodes: 0,
      credentials_created: 1
    }
  }
```

---

## 5. Database Schema (Supabase)

```sql
-- Clone jobs tracking
CREATE TABLE cloner_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  
  -- Source
  source_workflow_id VARCHAR(50) NOT NULL,
  source_workflow_name VARCHAR(500),
  source_instance_url VARCHAR(500),
  source_domain VARCHAR(255),
  
  -- Target sheet
  new_spreadsheet_id VARCHAR(100),
  new_spreadsheet_url VARCHAR(1000),
  sheet_title VARCHAR(500),
  tabs_created TEXT[],          -- ["מחקר + כתבות", "מוצרים"]
  rows_written INTEGER DEFAULT 0,
  excel_file_name VARCHAR(255),
  
  -- Target workflow
  new_workflow_id VARCHAR(50),
  new_workflow_name VARCHAR(500),
  new_workflow_url VARCHAR(1000),
  new_domain VARCHAR(255),
  is_active BOOLEAN DEFAULT false,
  
  -- WordPress
  wp_url VARCHAR(500),
  wp_credential_id VARCHAR(50),
  
  -- Change tracking
  total_changes INTEGER DEFAULT 0,
  changes_json JSONB,           -- detailed change log
  node_summary JSONB,           -- {google_sheets: 2, wordpress: 3, ...}
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',  -- pending, creating_sheet, cloning, activating, completed, failed
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  user_agent TEXT,
  ip_address INET
);

-- Per-node change log
CREATE TABLE cloner_node_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES cloner_jobs(id) ON DELETE CASCADE,
  node_name VARCHAR(500),
  node_type VARCHAR(100),
  change_type VARCHAR(50),       -- documentId, sheetName, credential, domain_replace, code_replace
  field_path VARCHAR(255),       -- e.g., "parameters.documentId.value"
  old_value TEXT,
  new_value TEXT,
  status VARCHAR(20) DEFAULT 'ok',  -- ok, skipped, warning
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Excel upload temp storage (ephemeral, cleaned up after 1 hour)
CREATE TABLE cloner_excel_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  file_name VARCHAR(255),
  file_size_bytes INTEGER,
  sheet_structure JSONB,         -- [{name, columns, row_count}]
  data_json JSONB,               -- actual parsed data (for small files)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

-- Indexes
CREATE INDEX idx_cloner_jobs_session ON cloner_jobs(session_id);
CREATE INDEX idx_cloner_jobs_status ON cloner_jobs(status, created_at DESC);
CREATE INDEX idx_cloner_jobs_domain ON cloner_jobs(new_domain);
CREATE INDEX idx_cloner_node_changes_job ON cloner_node_changes(job_id);
CREATE INDEX idx_cloner_excel_session ON cloner_excel_uploads(session_id, expires_at);
```

---

## 6. UI/UX — Hebrew RTL 5-Step Wizard

### 6.1 Step 1: חיבור ל-n8n (Connect to n8n)

```
┌─────────────────────────────────────────────────────────────┐
│  🔗 שלב 1: חיבור לחשבון n8n                                 │
│                                                              │
│  כתובת Instance: [https://websiseo.app.n8n.cloud/         ] │
│  API Key:        [••••••••••••••••••••••••••••••••••••    ] │
│                                                              │
│  [🔌 בדוק חיבור]                                             │
│                                                              │
│  ✅ חיבור הצליח! נמצאו 405 וורקפלואוים                       │
│  ⏱️ החיבור יפוג בעוד 30 דקות                                 │
│                                                              │
│                                              [➡️ הבא]        │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Step 2: בחירת תבנית (Select Template Workflow)

```
┌─────────────────────────────────────────────────────────────┐
│  📋 שלב 2: בחירת וורקפלואו מקור                              │
│                                                              │
│  🔍 חיפוש: [_______________] [סינון לפי דומיין ▼]            │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ☐ dtapet.com - חנות                    23 nodes  ✅     │ │
│  │ ☐ mshrclean.co.il - תוכן               15 nodes  ✅     │ │
│  │ ☐ oritmartin.com - בלוג                18 nodes  ✅     │ │
│  │ ☐ caesarstone.co.il - מאמרים           12 nodes  ✅     │ │
│  │ ☐ bloklive.com - פרסום                  8 nodes  ✅     │ │
│  │ ...                                                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ── תצוגה מקדימה (כשבוחרים וורקפלואו) ──                     │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 📊 ניתוח: dtapet.com - חנות                             │ │
│  │                                                          │ │
│  │ 🌐 דומיינים שזוהו: dtapet.com, bloklive.com              │ │
│  │                                                          │ │
│  │ 📊 Google Sheets: 3 nodes                                │ │
│  │    ├─ "Grab New Cluster" → מחקר + כתבות (gid: 683869339)│ │
│  │    ├─ "Article Saving"   → מחקר + כתבות (gid: 683869339)│ │
│  │    └─ "Update Status"    → פרסום כתבות (gid: 0)         │ │
│  │                                                          │ │
│  │ 🔧 WordPress: 2 nodes                                    │ │
│  │    ├─ "Create Post"  → bloklive.com                      │ │
│  │    └─ "Create Page"  → dtapet.com                        │ │
│  │                                                          │ │
│  │ 🌐 HTTP Requests: 2 nodes                                │ │
│  │    ├─ "Image Generation" → api.kie.ai                    │ │
│  │    └─ "Update Post"      → bloklive.com/wp-json          │ │
│  │                                                          │ │
│  │ 💻 Code Nodes: 5 nodes (2 עם הפניות לדומיין)             │ │
│  │                                                          │ │
│  │ 🔑 אישורים קיימים:                                       │ │
│  │    ├─ Google Sheets: "Google Sheets account 3" (ID: jbfYz)│ │
│  │    └─ WordPress: "https://bloklive.com/" (ID: Fp3Ve)     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  [⬅️ חזרה]                                    [➡️ הבא]      │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Step 3: העלאת קובץ אקסל (Upload Excel)

```
┌─────────────────────────────────────────────────────────────┐
│  📁 שלב 3: העלאת קובץ מחקר מילות מפתח                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                                                          │ │
│  │         📄 גרור קובץ .xlsx לכאן                          │ │
│  │         או לחץ לבחירת קובץ                               │ │
│  │                                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ✅ קובץ הועלה: keyword-research-newsite.xlsx                │
│                                                              │
│  ── גיליונות שזוהו ──                                        │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 📊 "מחקר מילות מפתח"                                    │ │
│  │    עמודות: Keyword | Volume | Intent | Cluster           │ │
│  │    שורות: 150                                            │ │
│  │    ↳ מיפוי לגיליון: [▼ "מחקר + כתבות"]                  │ │
│  │                                                          │ │
│  │ 📊 "מוצרים"                                              │ │
│  │    עמודות: Product | Category | Price | URL              │ │
│  │    שורות: 45                                             │ │
│  │    ↳ מיפוי לגיליון: [▼ "מוצרים"]                        │ │
│  │                                                          │ │
│  │ 📊 "בלוג"                                                │ │
│  │    עמודות: Title | Content | Category | Status           │ │
│  │    שורות: 30                                             │ │
│  │    ↳ מיפוי לגיליון: [▼ צור גיליון חדש "בלוג"]           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  💡 המערכת תיצור Google Sheet חדש עם אותם טאבולים            │
│     ותעתיק את הנתונים מהאקסל                                │
│                                                              │
│  [⬅️ חזרה]                                    [➡️ הבא]      │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Step 4: פרטי אתר חדש (New Site Details)

```
┌─────────────────────────────────────────────────────────────┐
│  🆕 שלב 4: פרטי אתר חדש                                     │
│                                                              │
│  ── דומיין ──                                                │
│  דומיין מקור (מזוהה): [dtapet.com           ] (אוטומטי)     │
│  דומיין חדש:          [newsite.co.il        ]               │
│                                                              │
│  ── WordPress ──                                             │
│  כתובת אתר:    [https://www.newsite.co.il  ]                │
│  שם משתמש:     [admin                      ]               │
│  App Password: [••••••••••••••••••••        ]               │
│  [🔍 בדוק חיבור WordPress]                                  │
│                                                              │
│  ── Google Sheets ──                                         │
│  כותרת הגיליון: [newsite.co.il - חנות - N8N אוטומציות     ] │
│  אישור OAuth2:  [▼ Google Sheets account 3 (jbfYz...)     ] │
│  📋 ייווצר גיליון חדש עם 3 טאבולים                          │
│                                                              │
│  ── SMTP (אופציונלי) ──                                      │
│  ☐ הפעל עדכון SMTP                                          │
│  שרת:   [smtp.gmail.com        ]                            │
│  פורט:  [587                   ]                            │
│  מייל:  [user@newsite.co.il    ]                            │
│  סיסמה: [••••••••••••••        ]                            │
│                                                              │
│  ── Google Sheets credentials ──                              │
│  ☐ שתף את הגיליון עם: [user@gmail.com     ]                │
│                                                              │
│  [⬅️ חזרה]                          [🔍 תצוגה מקדימה]       │
└─────────────────────────────────────────────────────────────┘
```

### 6.5 Step 5: תוצאות (Results)

```
┌─────────────────────────────────────────────────────────────┐
│  ✅ שלב 5: וורקפלואו שוכפל בהצלחה!                          │
│                                                              │
│  ── Google Sheet חדש ──                                      │
│  📊 "newsite.co.il - חנות - N8N אוטומציות"                  │
│  🔗 https://docs.google.com/spreadsheets/d/1ABC.../edit      │
│  טאבולים: מחקר + כתבות (150 שורות), מוצרים (45 שורות)     │
│                                                              │
│  ── וורקפלואו חדש ──                                         │
│  📋 "newsite.co.il - חנות"                                   │
│  🆔 ID: WFxyz123                                             │
│  🔗 https://websiseo.app.n8n.cloud/workflow/WFxyz123         │
│  סטטוס: ✅ פעיל                                              │
│                                                              │
│  ── סיכום שינויים ──                                         │
│  ✅ 3 Google Sheets nodes → גיליון חדש                       │
│  ✅ 2 WordPress nodes → newsite.co.il                        │
│  ✅ 2 HTTP Request nodes → דומיין חדש                        │
│  ✅ 3 Code nodes → find-replace הושלם                        │
│  ✅ 1 credential חדש נוצר (WordPress)                        │
│  ⚠️ 2 nodes לא דורשו שינוי                                   │
│                                                              │
│  ── לוג שינויים מלא ──                                       │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ✅ "Grab New Cluster"                                   │ │
│  │    documentId: 1wK... → 1ABC...                         │ │
│  │    sheetName: gid 683869339 → gid 0 (מחקר + כתבות)     │ │
│  │    credential: Google Sheets account 3 (unchanged)      │ │
│  │                                                          │ │
│  │ ✅ "Create Post"                                        │ │
│  │    credential: bloklive.com → newsite.co.il WordPress   │ │
│  │                                                          │ │
│  │ ✅ "Create Page"                                        │ │
│  │    credential: dtapet.com → newsite.co.il WordPress     │ │
│  │                                                          │ │
│  │ ✅ "Update Post"                                        │ │
│  │    url: bloklive.com/wp-json → newsite.co.il/wp-json    │ │
│  │                                                          │ │
│  │ ✅ "Cleaning Image Prompts"                             │ │
│  │    jsCode: no domain references found                   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  [🔗 פתח ב-n8n] [📊 פתח גיליון] [🔄 שכפל שוב] [🏠 דף הבית] │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Core Cloning Engine

### 7.1 Data Models

```python
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class SiteMapping:
    """All the values needed to clone a workflow to a new site."""
    
    # Domain
    old_domain: str                    # "https://www.dtapet.com"
    new_domain: str                    # "https://www.newsite.co.il"
    
    # WordPress
    wp_url: str                        # "https://www.newsite.co.il"
    wp_username: str                   # "admin"
    wp_app_password: str               # "xxxx xxxx xxxx xxxx xxxx xxxx"
    
    # Google Sheets
    new_sheet_id: str = ""             # Created by Sheet Creator
    new_sheet_url: str = ""
    new_sheet_title: str = ""
    sheet_tab_mappings: list = field(default_factory=list)
    # [{"source_gid": 683869339, "source_name": "מחקר + כתבות",
    #   "target_gid": 0, "target_name": "מחקר + כתבות",
    #   "excel_sheet": "מחקר מילות מפתח"}]
    
    # n8n Credentials
    gsheets_credential_id: str = ""    # Existing OAuth2 cred to reuse
    gsheets_credential_name: str = ""
    wp_credential_id: str = ""         # Created during clone
    
    # SMTP (optional)
    smtp_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_credential_id: str = ""
    
    # Workflow naming
    new_workflow_name: str = ""        # Auto-generated if empty
    
    @property
    def old_domain_clean(self) -> str:
        """Domain without protocol: 'www.dtapet.com'"""
        return self.old_domain.replace("https://", "").replace("http://", "").rstrip("/")
    
    @property
    def new_domain_clean(self) -> str:
        return self.new_domain.replace("https://", "").replace("http://", "").rstrip("/")
    
    def get_target_gid(self, source_gid: int) -> Optional[int]:
        """Look up the target GID for a source GID."""
        for m in self.sheet_tab_mappings:
            if m.get("source_gid") == source_gid:
                return m.get("target_gid")
        return None
    
    def get_target_tab_name(self, source_name: str) -> Optional[str]:
        """Look up the target tab name for a source tab name."""
        for m in self.sheet_tab_mappings:
            if m.get("source_name") == source_name:
                return m.get("target_name")
        return None
```

### 7.2 Workflow Analyzer

```python
class WorkflowAnalyzer:
    """Analyzes an n8n workflow JSON to detect all clonable elements."""
    
    def analyze(self, workflow: dict) -> dict:
        nodes = workflow.get("nodes", [])
        domains = set()
        google_sheets_nodes = []
        wordpress_nodes = []
        http_request_nodes = []
        code_nodes = []
        email_nodes = []
        credentials_used = []
        other_nodes = []
        
        for node in nodes:
            node_type = node.get("type", "")
            node_name = node.get("name", "")
            params = node.get("parameters", {})
            creds = node.get("credentials", {})
            
            # Detect domains in this node
            node_domains = self._find_domains_in_node(node)
            domains.update(node_domains)
            
            # Classify by type
            if node_type == "n8n-nodes-base.googleSheets":
                google_sheets_nodes.append({
                    "node_name": node_name,
                    "documentId": self._extract_rl_value(params.get("documentId")),
                    "documentId_name": self._extract_rl_cached_name(params.get("documentId")),
                    "sheetName": self._extract_rl_value(params.get("sheetName")),
                    "sheetName_name": self._extract_rl_cached_name(params.get("sheetName")),
                    "sheet_gid": self._extract_rl_value(params.get("sheetName")),
                    "operation": params.get("operation", "read"),
                    "credential": self._extract_credential(creds, "googleSheetsOAuth2Api")
                })
            elif node_type == "n8n-nodes-base.wordpress":
                wordpress_nodes.append({
                    "node_name": node_name,
                    "resource": params.get("resource", "post"),
                    "operation": params.get("operation", "create"),
                    "credential": self._extract_credential(creds, "wordpressApi")
                })
            elif node_type == "n8n-nodes-base.httpRequest":
                http_request_nodes.append({
                    "node_name": node_name,
                    "url": params.get("url", ""),
                    "method": params.get("method", "GET"),
                    "has_domain_in_url": bool(node_domains)
                })
            elif node_type == "n8n-nodes-base.code":
                code = params.get("jsCode", "") or params.get("pythonCode", "")
                code_nodes.append({
                    "node_name": node_name,
                    "has_domain_refs": any(d in code for d in node_domains),
                    "code_length": len(code)
                })
            elif "email" in node_type.lower() or "smtp" in node_type.lower():
                email_nodes.append({
                    "node_name": node_name,
                    "node_type": node_type,
                    "credential": self._extract_credential(creds, "smtp")
                })
            else:
                other_nodes.append({
                    "node_name": node_name,
                    "node_type": node_type
                })
            
            # Collect credentials
            for cred_type, cred_info in creds.items():
                credentials_used.append({
                    "type": cred_type,
                    "id": cred_info.get("id"),
                    "name": cred_info.get("name"),
                    "used_by_node": node_name
                })
        
        # Deduplicate credentials
        seen_cred_ids = set()
        unique_credentials = []
        for c in credentials_used:
            if c["id"] not in seen_cred_ids:
                seen_cred_ids.add(c["id"])
                unique_credentials.append(c)
        
        return {
            "workflow_name": workflow.get("name", ""),
            "total_nodes": len(nodes),
            "domains": sorted(domains),
            "google_sheets_nodes": google_sheets_nodes,
            "wordpress_nodes": wordpress_nodes,
            "http_request_nodes": http_request_nodes,
            "code_nodes": code_nodes,
            "email_nodes": email_nodes,
            "other_nodes": other_nodes,
            "credentials_used": unique_credentials
        }
    
    def _extract_rl_value(self, rl):
        """Extract value from n8n resource locator pattern."""
        if isinstance(rl, dict) and rl.get("__rl"):
            return rl.get("value")
        if isinstance(rl, str):
            return rl
        return None
    
    def _extract_rl_cached_name(self, rl):
        if isinstance(rl, dict) and rl.get("__rl"):
            return rl.get("cachedResultName", "")
        return ""
    
    def _extract_credential(self, creds, cred_type):
        for key, val in creds.items():
            if cred_type.lower() in key.lower():
                return {"id": val.get("id"), "name": val.get("name")}
        return None
    
    def _find_domains_in_node(self, node):
        """Find all domains referenced in a node's parameters."""
        import re
        domains = set()
        params_str = json.dumps(node.get("parameters", {}), ensure_ascii=False)
        for match in re.finditer(r'https?://([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', params_str):
            domain = match.group(1).strip('.').lower()
            if not domain.endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.css', '.js')):
                # Exclude common API domains
                if domain not in ('schemas.openxmlformats.org', 'www.w3.org', 'schemas.microsoft.com'):
                    domains.add(domain)
        return domains
```

### 7.3 Core Clone Function

```python
import copy
import re
import json


def clone_workflow(source_workflow: dict, mapping: SiteMapping) -> dict:
    """
    Clone an n8n workflow, replacing all site-specific values.
    
    Args:
        source_workflow: Full workflow JSON from GET /api/v1/workflows/{id}
        mapping: SiteMapping with all replacement values
    
    Returns:
        Modified workflow JSON ready for POST /api/v1/workflows
    """
    cloned = copy.deepcopy(source_workflow)
    
    # 1. Remove read-only fields
    for field in ['id', 'createdAt', 'updatedAt', 'versionId', 'sharedWith']:
        cloned.pop(field, None)
    
    # 2. Rename workflow
    if mapping.new_workflow_name:
        cloned['name'] = mapping.new_workflow_name
    else:
        cloned['name'] = _replace_domain_in_string(
            cloned.get('name', ''), mapping.old_domain_clean, mapping.new_domain_clean
        )
    
    # 3. Process each node
    changes = []
    for node in cloned.get('nodes', []):
        node_changes = _adapt_node(node, mapping)
        changes.extend(node_changes)
    
    # 4. Process connections (node names may have changed)
    # connections use node NAMES as keys — if a node name contains the domain,
    # we need to update the connection keys too
    _update_connection_keys(cloned, mapping)
    
    # 5. Update tags
    for tag in cloned.get('tags', []):
        if isinstance(tag, dict) and 'name' in tag:
            tag['name'] = _replace_domain_in_string(
                tag['name'], mapping.old_domain_clean, mapping.new_domain_clean
            )
    
    # 6. Remove active state (start inactive)
    cloned.pop('active', None)
    
    return cloned, changes
```

---

## 8. Google Sheet Creation Engine

### 8.1 SheetCreator Class

```python
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


class SheetCreator:
    """Creates a new Google Sheet with tab structure and writes data."""
    
    def __init__(self, credentials_path: str):
        self.credentials = Credentials.from_authorized_user_file(credentials_path)
        self.service = build('sheets', 'v4', credentials=self.credentials)
        self.drive_service = build('drive', 'v3', credentials=self.credentials)
    
    def create_from_excel(self, excel_data: dict, title: str, 
                          tab_mappings: list, share_with: str = None) -> dict:
        """
        Create a Google Sheet from parsed Excel data.
        
        Args:
            excel_data: Parsed Excel structure from ExcelParser
            title: Sheet title
            tab_mappings: Which Excel sheets to include and their target tab names
            share_with: Optional email to share the sheet with
        
        Returns:
            { spreadsheet_id, url, tabs: [{name, gid, rows_written}] }
        """
        
        # Step 1: Create spreadsheet with initial tabs
        sheet_specs = []
        for mapping in tab_mappings:
            sheet_specs.append({
                "properties": {
                    "title": mapping["target_name"],
                    "index": len(sheet_specs)
                }
            })
        
        body = {
            "properties": {"title": title},
            "sheets": sheet_specs
        }
        
        result = self.service.spreadsheets().create(
            body=body,
            fields="spreadsheetId,properties,sheets.properties"
        ).execute()
        
        spreadsheet_id = result["spreadsheetId"]
        url = result.get("spreadsheetUrl", f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/edit")
        
        # Extract GIDs from response
        tab_info = []
        for sheet in result.get("sheets", []):
            props = sheet.get("properties", {})
            tab_info.append({
                "name": props.get("title"),
                "gid": props.get("sheetId")
            })
        
        # Step 2: Write data to each tab
        tabs_written = []
        for i, mapping in enumerate(tab_mappings):
            excel_sheet_name = mapping["excel_sheet"]
            target_tab_name = mapping["target_name"]
            target_gid = tab_info[i]["gid"] if i < len(tab_info) else 0
            
            # Get data for this Excel sheet
            rows = excel_data.get(excel_sheet_name, {}).get("rows", [])
            
            if rows:
                # Write data
                self.service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=f"'{target_tab_name}'!A1",
                    body={"values": rows},
                    valueInputOption="USER_ENTERED"
                ).execute()
            
            # Step 3: Format headers (bold, freeze row)
            format_requests = [
                {
                    "repeatCell": {
                        "range": {
                            "sheetId": target_gid,
                            "startRowIndex": 0,
                            "endRowIndex": 1
                        },
                        "cell": {
                            "userEnteredFormat": {
                                "textFormat": {"bold": True},
                                "backgroundColor": {"red": 0.9, "green": 0.9, "blue": 0.9}
                            }
                        },
                        "fields": "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor"
                    }
                },
                {
                    "updateSheetProperties": {
                        "properties": {
                            "sheetId": target_gid,
                            "gridProperties": {"frozenRowCount": 1}
                        },
                        "fields": "gridProperties.frozenRowCount"
                    }
                }
            ]
            
            self.service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"requests": format_requests}
            ).execute()
            
            tabs_written.append({
                "name": target_tab_name,
                "gid": target_gid,
                "rows_written": len(rows)
            })
        
        # Step 4: Share if requested
        if share_with:
            self.drive_service.permissions().create(
                fileId=spreadsheet_id,
                body={
                    "type": "user",
                    "role": "writer",
                    "emailAddress": share_with
                },
                sendNotificationEmail=True
            ).execute()
        
        return {
            "spreadsheet_id": spreadsheet_id,
            "url": url,
            "tabs": tabs_written
        }
    
    def read_existing_sheet_structure(self, spreadsheet_id: str) -> dict:
        """Read the structure of an existing Google Sheet (tabs + columns)."""
        metadata = self.service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields="sheets.properties,sheets.data.columnMetadata"
        ).execute()
        
        tabs = []
        for sheet in metadata.get("sheets", []):
            props = sheet.get("properties", {})
            # Read first row to get headers
            try:
                result = self.service.spreadsheets().values().get(
                    spreadsheetId=spreadsheet_id,
                    range=f"'{props.get('title')}'!1:1"
                ).execute()
                headers = result.get("values", [[]])[0] if result.get("values") else []
            except Exception:
                headers = []
            
            tabs.append({
                "name": props.get("title"),
                "gid": props.get("sheetId"),
                "headers": headers,
                "row_count": props.get("gridProperties", {}).get("rowCount", 0)
            })
        
        return {"spreadsheet_id": spreadsheet_id, "tabs": tabs}
```

---

## 9. Excel Parsing & Data Mapping

### 9.1 ExcelParser Class

```python
import openpyxl
from typing import BinaryIO


class ExcelParser:
    """Parse .xlsx files and extract structure + data."""
    
    def parse(self, file_path_or_stream, max_rows_per_sheet: int = 10000) -> dict:
        """
        Parse an Excel file and return sheet structure + data.
        
        Returns:
            {
                "file_name": "keyword-research.xlsx",
                "sheet_count": 3,
                "sheets": {
                    "מחקר מילות מפתח": {
                        "columns": ["Keyword", "Volume", "Intent", "Cluster"],
                        "row_count": 150,
                        "rows": [
                            ["Keyword", "Volume", "Intent", "Cluster"],  // header row
                            ["best dog food", "5400", "commercial", "dog food"],
                            ...
                        ]
                    },
                    "מוצרים": { ... }
                }
            }
        """
        wb = openpyxl.load_workbook(file_path_or_stream, read_only=True, data_only=True)
        
        sheets = {}
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            rows = []
            headers = []
            
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                # Convert all values to strings (or empty string for None)
                str_row = [str(cell) if cell is not None else "" for cell in row]
                
                if i == 0:
                    headers = str_row
                rows.append(str_row)
                
                if i >= max_rows_per_sheet:
                    break
            
            sheets[sheet_name] = {
                "columns": headers,
                "row_count": len(rows),
                "rows": rows
            }
        
        wb.close()
        
        return {
            "file_name": getattr(file_path_or_stream, 'name', 'unknown.xlsx'),
            "sheet_count": len(sheets),
            "sheets": sheets
        }
    
    def parse_structure_only(self, file_path_or_stream) -> dict:
        """Parse only the structure (sheet names, headers, row counts) without data."""
        wb = openpyxl.load_workbook(file_path_or_stream, read_only=True)
        
        sheets = {}
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            headers = []
            row_count = 0
            
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    headers = [str(cell) if cell is not None else "" for cell in row]
                row_count += 1
            
            sheets[sheet_name] = {
                "columns": headers,
                "row_count": row_count
            }
        
        wb.close()
        return {"sheet_count": len(sheets), "sheets": sheets}
```

### 9.2 Auto-Mapping Logic

```python
def auto_map_excel_to_tabs(excel_sheets: dict, workflow_tabs: list) -> list:
    """
    Auto-map Excel sheet names to workflow Google Sheet tab names.
    
    Uses fuzzy matching on sheet names. Returns list of mappings.
    """
    mappings = []
    used_workflow_tabs = set()
    
    for excel_name in excel_sheets:
        best_match = None
        best_score = 0
        
        for wf_tab in workflow_tabs:
            if wf_tab["name"] in used_workflow_tabs:
                continue
            
            # Exact match
            if excel_name == wf_tab["name"]:
                best_match = wf_tab
                best_score = 1.0
                break
            
            # Contains match
            if excel_name in wf_tab["name"] or wf_tab["name"] in excel_name:
                score = 0.8
                if score > best_score:
                    best_match = wf_tab
                    best_score = score
            
            # Keyword overlap
            excel_words = set(excel_name.lower().split())
            tab_words = set(wf_tab["name"].lower().split())
            overlap = len(excel_words & tab_words)
            if overlap > 0:
                score = overlap / max(len(excel_words), len(tab_words))
                if score > best_score:
                    best_match = wf_tab
                    best_score = score
        
        if best_match and best_score >= 0.5:
            mappings.append({
                "excel_sheet": excel_name,
                "source_gid": best_match.get("gid", 0),
                "source_name": best_match["name"],
                "target_name": best_match["name"],  # Keep same name
                "target_gid": None,  # Will be set after creation
                "confidence": best_score
            })
            used_workflow_tabs.add(best_match["name"])
        else:
            # No match — create new tab
            mappings.append({
                "excel_sheet": excel_name,
                "source_gid": None,
                "source_name": None,
                "target_name": excel_name,  # Use Excel sheet name as tab name
                "target_gid": None,
                "confidence": 0,
                "is_new_tab": True
            })
    
    return mappings
```

---

## 10. Per-Node-Type Adaptation Logic

### 10.1 Complete Node Adapter

```python
def _adapt_node(node: dict, mapping: SiteMapping) -> list:
    """Adapt a single node based on its type. Returns list of changes."""
    node_type = node.get("type", "")
    params = node.get("parameters", {})
    changes = []
    
    # === GOOGLE SHEETS NODE ===
    if node_type == "n8n-nodes-base.googleSheets":
        # Update documentId
        if mapping.new_sheet_id and "documentId" in params:
            old_id = _extract_rl_value(params["documentId"])
            _update_resource_locator(
                params, "documentId",
                mapping.new_sheet_id,
                cached_name=mapping.new_sheet_title,
                cached_url=f"https://docs.google.com/spreadsheets/d/{mapping.new_sheet_id}/edit"
            )
            changes.append({
                "node_name": node.get("name"),
                "node_type": node_type,
                "change": "documentId",
                "old": old_id,
                "new": mapping.new_sheet_id
            })
        
        # Update sheetName (tab)
        if "sheetName" in params:
            source_gid = _extract_rl_value(params["sheetName"])
            source_name = _extract_rl_cached_name(params["sheetName"])
            
            target_gid = mapping.get_target_gid(source_gid)
            target_name = mapping.get_target_tab_name(source_name)
            
            if target_gid is not None and target_name:
                _update_resource_locator(
                    params, "sheetName",
                    target_gid,
                    cached_name=target_name,
                    cached_url=f"https://docs.google.com/spreadsheets/d/{mapping.new_sheet_id}/edit#gid={target_gid}"
                )
                changes.append({
                    "node_name": node.get("name"),
                    "node_type": node_type,
                    "change": "sheetName",
                    "old": f"{source_name} (gid:{source_gid})",
                    "new": f"{target_name} (gid:{target_gid})"
                })
        
        # Update credentials (reuse existing OAuth2)
        if mapping.gsheets_credential_id:
            old_cred = node.get("credentials", {}).get("googleSheetsOAuth2Api", {})
            node["credentials"] = {
                "googleSheetsOAuth2Api": {
                    "id": mapping.gsheets_credential_id,
                    "name": mapping.gsheets_credential_name
                }
            }
            changes.append({
                "node_name": node.get("name"),
                "node_type": node_type,
                "change": "credential",
                "old": f"{old_cred.get('name')} ({old_cred.get('id')})",
                "new": f"{mapping.gsheets_credential_name} ({mapping.gsheets_credential_id})"
            })
    
    # === WORDPRESS NODE ===
    elif node_type == "n8n-nodes-base.wordpress":
        # Create or update credential
        if mapping.wp_credential_id:
            old_cred = node.get("credentials", {}).get("wordpressApi", {})
            node["credentials"] = {
                "wordpressApi": {
                    "id": mapping.wp_credential_id,
                    "name": f"{mapping.new_domain_clean}"
                }
            }
            changes.append({
                "node_name": node.get("name"),
                "node_type": node_type,
                "change": "credential",
                "old": old_cred.get("name", ""),
                "new": mapping.new_domain_clean
            })
        
        # Update any hardcoded URLs in parameters
        _deep_replace_in_dict(params, mapping.old_domain_clean, mapping.new_domain_clean, changes, node.get("name"), node_type)
    
    # === HTTP REQUEST NODE ===
    elif node_type == "n8n-nodes-base.httpRequest":
        if "url" in params:
            old_url = str(params["url"])
            new_url = _replace_domain_in_string(old_url, mapping.old_domain_clean, mapping.new_domain_clean)
            if new_url != old_url:
                params["url"] = new_url
                changes.append({
                    "node_name": node.get("name"),
                    "node_type": node_type,
                    "change": "url",
                    "old": old_url,
                    "new": new_url
                })
        
        # Check headers
        for header in params.get("headerParameters", {}).get("parameters", []):
            old_val = header.get("value", "")
            new_val = _replace_domain_in_string(old_val, mapping.old_domain_clean, mapping.new_domain_clean)
            if new_val != old_val:
                header["value"] = new_val
                changes.append({
                    "node_name": node.get("name"),
                    "node_type": node_type,
                    "change": f"header.{header.get('name', '')}",
                    "old": old_val[:100],
                    "new": new_val[:100]
                })
    
    # === CODE NODE ===
    elif node_type == "n8n-nodes-base.code":
        for code_key in ["jsCode", "pythonCode"]:
            if code_key in params:
                old_code = params[code_key]
                new_code = _replace_domain_in_string(old_code, mapping.old_domain_clean, mapping.new_domain_clean)
                if new_code != old_code:
                    params[code_key] = new_code
                    changes.append({
                        "node_name": node.get("name"),
                        "node_type": node_type,
                        "change": code_key,
                        "old": f"({len(old_code)} chars, domain found)",
                        "new": f"({len(new_code)} chars, domain replaced)"
                    })
    
    # === SET NODE ===
    elif node_type == "n8n-nodes-base.set":
        assignments = params.get("assignments", {}).get("assignments", [])
        for assignment in assignments:
            if isinstance(assignment.get("value"), str):
                old_val = assignment["value"]
                new_val = _replace_domain_in_string(old_val, mapping.old_domain_clean, mapping.new_domain_clean)
                if new_val != old_val:
                    assignment["value"] = new_val
                    changes.append({
                        "node_name": node.get("name"),
                        "node_type": node_type,
                        "change": f"assignment.{assignment.get('name', '')}",
                        "old": old_val[:100],
                        "new": new_val[:100]
                    })
    
    # === EMAIL NODE ===
    elif "email" in node_type.lower() or "smtp" in node_type.lower():
        if mapping.smtp_credential_id:
            # Replace SMTP credential
            for cred_key in node.get("credentials", {}):
                if "smtp" in cred_key.lower() or "email" in cred_key.lower():
                    old_cred = node["credentials"][cred_key]
                    node["credentials"][cred_key] = {
                        "id": mapping.smtp_credential_id,
                        "name": f"SMTP {mapping.smtp_user}"
                    }
                    changes.append({
                        "node_name": node.get("name"),
                        "node_type": node_type,
                        "change": "credential",
                        "old": old_cred.get("name", ""),
                        "new": f"SMTP {mapping.smtp_user}"
                    })
    
    # === IF NODE ===
    elif node_type == "n8n-nodes-base.if":
        _deep_replace_in_dict(params, mapping.old_domain_clean, mapping.new_domain_clean, changes, node.get("name"), node_type)
    
    # === GENERIC: deep scan all string params for domain references ===
    # (runs for ALL node types as a catch-all)
    if not changes:
        _deep_replace_in_dict(params, mapping.old_domain_clean, mapping.new_domain_clean, changes, node.get("name"), node_type)
    
    return changes


def _replace_domain_in_string(text: str, old_domain: str, new_domain: str) -> str:
    """Replace old domain with new domain in any string."""
    if not text or not isinstance(text, str):
        return text
    # Replace both with and without protocol
    text = text.replace(f"https://{old_domain}", f"https://{new_domain}")
    text = text.replace(f"http://{old_domain}", f"http://{new_domain}")
    text = text.replace(old_domain, new_domain)
    return text


def _update_resource_locator(params: dict, key: str, new_value, cached_name="", cached_url=""):
    """Update n8n resource locator (__rl) fields."""
    if key not in params:
        return
    rl = params[key]
    if isinstance(rl, dict) and rl.get("__rl"):
        rl["value"] = new_value
        if cached_name:
            rl["cachedResultName"] = cached_name
        if cached_url:
            rl["cachedResultUrl"] = cached_url
    elif isinstance(rl, str):
        params[key] = new_value


def _deep_replace_in_dict(d: dict, old_domain: str, new_domain: str, changes: list, node_name: str, node_type: str):
    """Recursively replace domain references in all string values of a dict."""
    if isinstance(d, dict):
        for key, value in d.items():
            if isinstance(value, str) and old_domain in value:
                old_val = value
                d[key] = _replace_domain_in_string(value, old_domain, new_domain)
                if d[key] != old_val:
                    changes.append({
                        "node_name": node_name,
                        "node_type": node_type,
                        "change": f"deep.{key}",
                        "old": old_val[:100],
                        "new": d[key][:100]
                    })
            elif isinstance(value, (dict, list)):
                _deep_replace_in_dict(value, old_domain, new_domain, changes, node_name, node_type)
    elif isinstance(d, list):
        for i, item in enumerate(d):
            if isinstance(item, str) and old_domain in item:
                old_val = item
                d[i] = _replace_domain_in_string(item, old_domain, new_domain)
                if d[i] != old_val:
                    changes.append({
                        "node_name": node_name,
                        "node_type": node_type,
                        "change": f"deep[{i}]",
                        "old": old_val[:100],
                        "new": d[i][:100]
                    })
            elif isinstance(item, (dict, list)):
                _deep_replace_in_dict(item, old_domain, new_domain, changes, node_name, node_type)


def _update_connection_keys(workflow: dict, mapping: SiteMapping):
    """Update connection keys if node names changed (due to domain in name)."""
    connections = workflow.get("connections", {})
    new_connections = {}
    
    for node_name, node_conns in connections.items():
        new_name = _replace_domain_in_string(node_name, mapping.old_domain_clean, mapping.new_domain_clean)
        new_connections[new_name] = node_conns
    
    workflow["connections"] = new_connections
```

### 10.2 Node Type Coverage Matrix

| Node Type | What Gets Adapted | Complexity |
|-----------|-------------------|------------|
| `n8n-nodes-base.googleSheets` | documentId, sheetName, credentials | HIGH (resource locator pattern) |
| `n8n-nodes-base.wordpress` | credentials (via ID), any hardcoded URLs in params | MEDIUM |
| `n8n-nodes-base.httpRequest` | url field, headers, auth tokens | MEDIUM |
| `n8n-nodes-base.code` | jsCode/pythonCode (find-replace domain) | MEDIUM |
| `n8n-nodes-base.set` | assignment values (find-replace domain) | LOW |
| `n8n-nodes-base.if` | condition values (find-replace domain) | LOW |
| `n8n-nodes-base.emailSend` | credentials (SMTP), from address | LOW |
| `n8n-nodes-base.scheduleTrigger` | Nothing (generic) | NONE |
| `n8n-nodes-base.wait` | Nothing (generic) | NONE |
| `n8n-nodes-base.splitInBatches` | Nothing (generic) | NONE |
| `n8n-nodes-base.merge` | Nothing (generic) | NONE |
| `n8n-nodes-base.stickyNote` | Nothing (UI only) | NONE |
| `@n8n/n8n-nodes-langchain.*` | Check for domain in prompts/config | LOW |
| `n8n-nodes-base.firecrawl` | Nothing (shared API key) | NONE |

---

## 11. File Structure

```
webs-html-improvements-files/          (existing repo, add to it)
├── server.py                          (EXISTING — add cloner routes)
├── cloner_engine.py                   (NEW — core cloning logic)
├── cloner_sheet_creator.py            (NEW — Google Sheet creation)
├── cloner_excel_parser.py             (NEW — Excel parsing)
├── cloner_workflow_analyzer.py        (NEW — workflow analysis)
├── cloner_api.py                      (NEW — HTTP route handlers)
├── n8n_readonly_client.py             (EXISTING — extend with write methods)
├── n8n_full_client.py                 (NEW — read+write n8n client)
├── templates/
│   └── cloner.html                    (NEW — Hebrew RTL 5-step wizard)
├── static/
│   ├── cloner.js                      (NEW — frontend JS)
│   └── cloner.css                     (NEW — wizard styles)
├── tests/
│   ├── test_cloner_engine.py          (NEW — unit tests)
│   ├── test_sheet_creator.py          (NEW — sheet creation tests)
│   ├── test_excel_parser.py           (NEW — Excel parsing tests)
│   ├── test_workflow_analyzer.py      (NEW — analysis tests)
│   └── fixtures/
│       └── dtapet_workflow.json       (COPY from dtapet-project/original/)
├── supabase/
│   └── migrations/
│       └── 20260602_cloner_schema.sql (NEW — cloner tables)
└── requirements.txt                   (ADD: openpyxl, google-api-python-client)
```

---

## 12. Implementation Phases

### Phase 1: Core Engine — Workflow Analyzer + Cloner (3-4 hours)

**Files**: `cloner_workflow_analyzer.py`, `cloner_engine.py`

1. Implement `WorkflowAnalyzer.analyze()` — parse any workflow JSON
2. Implement `clone_workflow()` — deep copy + node adaptation
3. Implement all node adapters (Google Sheets, WordPress, HTTP, Code, Set, If, Email)
4. Implement `_update_resource_locator()` for `__rl` pattern
5. Implement `_deep_replace_in_dict()` for catch-all domain replacement
6. Implement `_update_connection_keys()` for renamed nodes
7. Unit tests with dtapet.com workflow fixture (3003 lines)

**Test cases**:
- Parse dtapet workflow → detect 3 Google Sheets nodes, 2 WordPress nodes, 2 HTTP nodes
- Clone with domain replace → verify all URLs updated
- Clone with sheet ID replace → verify `__rl` values updated
- Test Hebrew content in node parameters (UTF-8 safety)

### Phase 2: Google Sheet Creator (2-3 hours)

**Files**: `cloner_sheet_creator.py`, `cloner_excel_parser.py`

1. Implement `ExcelParser.parse()` — read .xlsx with openpyxl
2. Implement `SheetCreator.create_from_excel()` — create sheet, add tabs, write data, format
3. Implement `auto_map_excel_to_tabs()` — fuzzy match Excel sheets to workflow tabs
4. Implement `SheetCreator.read_existing_sheet_structure()` — read existing sheet for reference
5. Handle edge cases: empty sheets, very large sheets, special characters in tab names

**Test cases**:
- Parse real keyword research .xlsx → verify column detection
- Create sheet with 3 tabs → verify GIDs returned
- Write 500 rows → verify data integrity
- Hebrew tab names → verify encoding

### Phase 3: n8n Full Client + Credential Manager (1-2 hours)

**Files**: `n8n_full_client.py`

1. Extend `N8NReadOnlyClient` with `create_workflow()`, `activate_workflow()`
2. Implement `create_credential()` for WordPress
3. Implement `list_credentials()` to find existing Google Sheets OAuth2 creds
4. Add rate limiting (100ms between calls)
5. Add retry with exponential backoff

**Test cases**:
- Create workflow → verify returned ID
- Create credential → verify ID
- List credentials → verify Google Sheets OAuth2 creds present

### Phase 4: API Layer (2-3 hours)

**Files**: `cloner_api.py`

1. Implement all `/api/cloner/*` endpoints
2. Session management (30-min TTL, server-side)
3. File upload handling for .xlsx
4. Error handling and validation
5. Add routes to `server.py`

**Test cases**:
- Connect → browse → select → upload → configure → clone (end-to-end)
- Invalid API key → proper error
- Expired session → re-auth prompt
- Large workflow (50+ nodes) → timeout handling

### Phase 5: Frontend (3-4 hours)

**Files**: `templates/cloner.html`, `static/cloner.js`, `static/cloner.css`

1. Build 5-step wizard with Hebrew RTL layout
2. Step 1: n8n connection form + validation
3. Step 2: Workflow browser with search, filter, preview
4. Step 3: Excel upload with drag-and-drop, sheet mapping UI
5. Step 4: Site configuration form with validation
6. Step 5: Results display with change log
7. Progress indicators during clone operation
8. Responsive design (mobile-friendly)

**Test cases**:
- Full flow on desktop Chrome
- Full flow on mobile Safari
- Hebrew text rendering (RTL)
- Large file upload (10MB+)
- Error states (network failure, invalid credentials)

### Phase 6: Integration & Polish (1-2 hours)

1. Add navigation link from existing dashboard
2. Dockerfile updates (COPY new Python files, install openpyxl)
3. Deploy to Render
4. End-to-end test with real n8n instance
5. Error logging (Sentry)

### Total Estimate: 12-18 hours

| Phase | Hours | Priority |
|-------|-------|----------|
| Phase 1: Core Engine | 3-4 | P0 (MVP) |
| Phase 2: Sheet Creator | 2-3 | P0 (MVP) |
| Phase 3: n8n Client | 1-2 | P0 (MVP) |
| Phase 4: API Layer | 2-3 | P0 (MVP) |
| Phase 5: Frontend | 3-4 | P1 |
| Phase 6: Integration | 1-2 | P1 |

---

## 13. Edge Cases & Testing Strategy

### 13.1 Edge Cases

| Edge Case | Mitigation |
|-----------|------------|
| **Multiple Google Sheets in one workflow** (different documentIds) | Show all detected sheets, let user map each one separately |
| **Same sheet, multiple tabs** (workflow reads from 3 tabs of same sheet) | Map all tabs from same sheet, create them all in the new sheet |
| **OAuth2 credentials can't be created via API** | Reuse existing OAuth2 creds from instance; sheet must be shared with the Google account behind the credential |
| **Code node has domain in regex/variable** | Use both literal replace AND regex-aware domain pattern matching; show warning for complex replacements |
| **Multiple domains in one workflow** (e.g., external APIs + client domain) | Show all detected domains, let user choose which to replace and which to keep |
| **n8n Cloud rate limiting** | 100ms delay between API calls, retry with exponential backoff (3 retries) |
| **Workflow name already exists** | Auto-append " - {new_domain}" suffix |
| **Node type not recognized** | Skip with warning, include in change report as "unmodified" |
| **Hebrew/Unicode in node parameters** | Ensure UTF-8 throughout, test with real Hebrew content (dtapet workflow has Hebrew) |
| **Large workflows (50+ nodes)** | Process in batches, show progress indicator |
| **Large Excel files (100K+ rows)** | Stream parsing with openpyxl read_only mode, limit to 10K rows per tab |
| **Excel sheet name conflicts with existing tab** | Rename with suffix (e.g., "מחקר (2)") |
| **Empty Excel sheets** | Skip empty sheets, show warning |
| **Workflow has Webhook nodes** | Webhook URLs are auto-generated by n8n — no adaptation needed, but note in report |
| **Workflow has Wait nodes with webhook resume** | Webhook IDs are auto-generated — no adaptation needed |
| **WordPress credentials with Application Password** | Standard format works with n8n WordPress node |
| **Sheet tab name contains special characters** (e.g., +, /) | URL-encode in n8n `cachedResultUrl`, use raw name in `cachedResultName` |
| **Source workflow uses n8n expressions referencing sheet columns** | Column references (e.g., `$json.Keyword`) are data-dependent, not sheet-dependent — no change needed as long as Excel columns match |
| **Credential belongs to different n8n user** | Credential IDs are instance-wide — any user's credential can be referenced |

### 13.2 Testing Strategy

**Unit Tests** (`test_cloner_engine.py`):
```python
def test_replace_domain_in_string():
    assert _replace_domain_in_string("https://dtapet.com/page", "dtapet.com", "new.com") == "https://new.com/page"

def test_update_resource_locator():
    params = {"documentId": {"__rl": True, "value": "old_id", "mode": "list"}}
    _update_resource_locator(params, "documentId", "new_id", cached_name="New Sheet")
    assert params["documentId"]["value"] == "new_id"
    assert params["documentId"]["cachedResultName"] == "New Sheet"

def test_clone_workflow_domain_replace():
    # Load dtapet fixture
    workflow = json.load(open("tests/fixtures/dtapet_workflow.json"))
    mapping = SiteMapping(old_domain="https://www.dtapet.com", new_domain="https://www.newsite.co.il", ...)
    cloned, changes = clone_workflow(workflow, mapping)
    assert "newsite.co.il" in cloned["name"]
    assert len(changes) > 0
    # Verify no dtapet references remain in node parameters
    params_json = json.dumps(cloned["nodes"])
    assert "dtapet.com" not in params_json
```

**Integration Tests**:
- Connect to n8n test instance → fetch real workflow → clone → verify
- Create real Google Sheet → write data → verify contents
- End-to-end: upload Excel → create sheet → clone workflow → activate

**Manual QA Checklist**:
- [ ] Clone dtapet.com → newsite.co.il (shop workflow, 23 nodes)
- [ ] Clone mshrclean.co.il → test.co.il (content workflow, 15 nodes)
- [ ] Verify all 405 workflows can be browsed and filtered
- [ ] Verify Hebrew tab names preserved in Google Sheet
- [ ] Verify cloned workflow runs successfully in n8n
- [ ] Verify Google Sheet data matches Excel source

---

## 14. Security Considerations

### 14.1 Credential Security

| Risk | Mitigation |
|------|------------|
| **n8n API key exposure** | Never stored on server — passed via headers per session, session encrypted in memory |
| **WordPress App Password** | Transmitted over HTTPS only, never logged, never stored in DB |
| **SMTP password** | Transmitted over HTTPS only, optional field |
| **Google OAuth2 token** | Used server-side only, stored at `~/.hermes/google_token.json` (file permissions 600) |
| **Session hijacking** | 30-min TTL, session ID regenerated on each request, HTTPS-only cookies |
| **Credential data in cloned workflow** | n8n credentials are referenced by ID only — actual secrets are encrypted at rest by n8n |

### 14.2 Data Security

| Risk | Mitigation |
|------|------------|
| **Excel file uploaded to server** | Parsed in memory, never written to disk, discarded after processing |
| **Workflow JSON in transit** | HTTPS only, no caching of workflow content |
| **Google Sheet created with wrong permissions** | Default: private to creator. Optional: share with specified email only |
| **SQL injection in Supabase** | Parameterized queries only, no string interpolation |
| **XSS in Hebrew content** | All user input HTML-escaped in frontend, Content-Security-Policy headers |

### 14.3 Operational Security

| Risk | Mitigation |
|------|------------|
| **Accidental workflow modification** | Clone only creates NEW workflows, never modifies existing ones |
| **Rate limiting abuse** | Per-session rate limit: max 10 clone operations per hour |
| **Large file upload DoS** | Max upload size: 50MB. Max rows per sheet: 10,000 |
| **n8n API key brute force** | After 5 failed connection attempts, lock session for 15 minutes |
| **Audit trail** | All clone operations logged in `cloner_jobs` table with full change details |

### 14.4 Network Security

```
Dashboard (Render HTTPS)
    ├──→ n8n Cloud API (HTTPS, X-N8N-API-KEY header)
    ├──→ Google Sheets API (HTTPS, OAuth2 bearer token)
    └──→ Supabase (HTTPS, service role key)
    
All traffic encrypted in transit. No HTTP fallback.
No client-side API keys. All secrets server-side only.
```

---

## Appendix A: n8n Resource Locator (__rl) Pattern

The `__rl` pattern is n8n's way of making fields selectable from a dropdown vs. free-text. Found in Google Sheets, Airtable, Notion, and other integration nodes.

```json
{
  "__rl": true,              // Always true for resource locator mode
  "value": "SHEET_ID",      // The actual value (ID, URL, etc.)
  "mode": "list",            // "list" = selected from dropdown, "id" = entered manually
  "cachedResultName": "...", // Display name (not used by n8n runtime, only UI)
  "cachedResultUrl": "..."   // Display URL (not used by n8n runtime, only UI)
}
```

**Important**: `cachedResultName` and `cachedResultUrl` are UI-only hints. The n8n runtime uses `value` exclusively. However, it's best practice to update all fields for consistency.

**For `sheetName`**: The `value` is the GID (numeric), not the tab name. The `cachedResultName` is the human-readable tab name.

```json
{
  "sheetName": {
    "__rl": true,
    "value": 683869339,           // ← This is the GID
    "mode": "list",
    "cachedResultName": "מחקר + כתבות",  // ← This is the display name
    "cachedResultUrl": "...#gid=683869339"
  }
}
```

---

## Appendix B: Real Workflow Node Inventory (dtapet.com)

From the 3003-line dtapet workflow JSON:

| # | Node Name | Type | Domain Refs | Notes |
|---|-----------|------|-------------|-------|
| 1 | Grab New Cluster | googleSheets | dtapet.com (sheet title) | documentId + sheetName |
| 2 | Fix Links | set | — | Data transformation |
| 3 | Article Saving | googleSheets | bloklive.com (sheet title) | Different sheet! |
| 4 | Create Post | wordpress | bloklive.com | Credential: bloklive.com |
| 5 | Create Page | wordpress | dtapet.com | Credential: dtapet.com |
| 6 | Update Post | httpRequest | bloklive.com/wp-json | URL with domain |
| 7 | Cleaning Image Prompts | code | — | Complex JS, no domain |
| 8 | Image Generation | httpRequest | api.kie.ai | External API (keep as-is) |
| 9 | Getting URLS | code | — | JSON parsing |
| 10 | Loop Over Items | splitInBatches | — | Generic |
| 11 | Wait | wait | — | Generic |
| ... | ... | ... | ... | ... |

**Key insight**: This workflow references TWO different domains (dtapet.com and bloklive.com) and TWO different Google Sheets. The cloner must handle multi-domain, multi-sheet workflows.

---

## Appendix C: Supabase Migration SQL

```sql
-- Migration: 20260602_cloner_schema.sql

-- Clone jobs tracking
CREATE TABLE IF NOT EXISTS cloner_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  source_workflow_id VARCHAR(50) NOT NULL,
  source_workflow_name VARCHAR(500),
  source_instance_url VARCHAR(500),
  source_domain VARCHAR(255),
  new_spreadsheet_id VARCHAR(100),
  new_spreadsheet_url VARCHAR(1000),
  sheet_title VARCHAR(500),
  tabs_created TEXT[],
  rows_written INTEGER DEFAULT 0,
  excel_file_name VARCHAR(255),
  new_workflow_id VARCHAR(50),
  new_workflow_name VARCHAR(500),
  new_workflow_url VARCHAR(1000),
  new_domain VARCHAR(255),
  is_active BOOLEAN DEFAULT false,
  wp_url VARCHAR(500),
  wp_credential_id VARCHAR(50),
  total_changes INTEGER DEFAULT 0,
  changes_json JSONB,
  node_summary JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET
);

CREATE TABLE IF NOT EXISTS cloner_node_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES cloner_jobs(id) ON DELETE CASCADE,
  node_name VARCHAR(500),
  node_type VARCHAR(100),
  change_type VARCHAR(50),
  field_path VARCHAR(255),
  old_value TEXT,
  new_value TEXT,
  status VARCHAR(20) DEFAULT 'ok',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloner_excel_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  file_name VARCHAR(255),
  file_size_bytes INTEGER,
  sheet_structure JSONB,
  data_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_cloner_jobs_session ON cloner_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_cloner_jobs_status ON cloner_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloner_jobs_domain ON cloner_jobs(new_domain);
CREATE INDEX IF NOT EXISTS idx_cloner_node_changes_job ON cloner_node_changes(job_id);
CREATE INDEX IF NOT EXISTS idx_cloner_excel_session ON cloner_excel_uploads(session_id, expires_at);

-- Auto-cleanup expired Excel uploads
CREATE OR REPLACE FUNCTION cleanup_expired_excel_uploads()
RETURNS void AS $$
BEGIN
  DELETE FROM cloner_excel_uploads WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

---

## Appendix D: n8n Full Client (extends read-only)

```python
# n8n_full_client.py — extends N8NReadOnlyClient with write capabilities

import json
import urllib.request
import urllib.parse
import time


class N8NFullClient:
    """n8n API client with read + write capabilities."""
    
    def __init__(self, base_url, api_key, timeout=30):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._last_request_time = 0
    
    def _headers(self):
        return {
            "X-N8N-API-KEY": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    
    def _rate_limit(self):
        """Ensure 100ms between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < 0.1:
            time.sleep(0.1 - elapsed)
        self._last_request_time = time.time()
    
    def _request(self, method, path, body=None, query=None, retries=3):
        self._rate_limit()
        url = self.base_url + "/" + path.lstrip("/")
        if query:
            url += "?" + urllib.parse.urlencode(query)
        
        data = json.dumps(body).encode("utf-8") if body else None
        
        for attempt in range(retries):
            try:
                req = urllib.request.Request(
                    url, headers=self._headers(), 
                    data=data, method=method
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return json.loads(resp.read().decode("utf-8") or "{}")
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                    continue
                raise
            except urllib.error.URLError:
                if attempt < retries - 1:
                    time.sleep(1)
                    continue
                raise
    
    # Read methods (same as ReadOnlyClient)
    def get_all_workflows(self, limit=100):
        workflows = []
        cursor = None
        while True:
            query = {"limit": int(limit)}
            if cursor:
                query["cursor"] = cursor
            data = self._request("GET", "/api/v1/workflows", query=query)
            workflows.extend(data.get("data") or [])
            cursor = data.get("nextCursor")
            if not cursor:
                return workflows
    
    def get_workflow_detail(self, workflow_id):
        return self._request("GET", f"/api/v1/workflows/{workflow_id}")
    
    def get_credentials(self):
        return self._request("GET", "/api/v1/credentials")
    
    # Write methods (NEW)
    def create_workflow(self, workflow_json):
        """Create a new workflow. Returns the created workflow."""
        # Remove fields that n8n doesn't accept on create
        clean = {k: v for k, v in workflow_json.items() 
                 if k not in ("id", "createdAt", "updatedAt", "versionId")}
        return self._request("POST", "/api/v1/workflows", body=clean)
    
    def activate_workflow(self, workflow_id):
        """Activate a workflow."""
        return self._request("POST", f"/api/v1/workflows/{workflow_id}/activate")
    
    def deactivate_workflow(self, workflow_id):
        """Deactivate a workflow."""
        return self._request("POST", f"/api/v1/workflows/{workflow_id}/deactivate")
    
    def create_credential(self, name, cred_type, data):
        """Create a new credential on the instance."""
        return self._request("POST", "/api/v1/credentials", body={
            "name": name,
            "type": cred_type,
            "data": data
        })
    
    def clean_workflow_for_create(self, workflow_json):
        """Remove read-only fields from workflow JSON before creating."""
        clean = dict(workflow_json)
        for field in ["id", "createdAt", "updatedAt", "versionId", "sharedWith", 
                       "active", "tags"]:
            clean.pop(field, None)
        
        # Remove node IDs (n8n will generate new ones)
        for node in clean.get("nodes", []):
            node.pop("id", None)
            # Remove webhookId (auto-generated)
            node.pop("webhookId", None)
        
        return clean
```

---

*This plan was generated on 2026-06-02 by analyzing the existing codebase, real workflow JSON from dtapet.com (3003 lines), the Google Workspace skill, and the n8n-workflow-sync skill.*
