# Config Export/Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add config export/import to Settings UI so users can sync configuration across multiple machines via a single JSON file.

**Architecture:** Backend provides two new endpoints (`GET /api/config/export`, `POST /api/config/import`) that read/write `config.json`, `profiles.json`, and `credentials.json`. Frontend adds Export/Import dialogs invoked from a new card in GeneralSettings. UI preferences (Zustand store) are handled entirely client-side.

**Tech Stack:** Rust/Axum (backend), React/TypeScript (frontend), Zustand (UI state), NiceModal (dialogs), i18next (translations)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `crates/server/src/routes/config_transfer.rs` | Export/import API handlers |
| Modify | `crates/server/src/routes/mod.rs` | Register config_transfer module and merge router |
| Modify | `frontend/src/lib/api.ts` | Add `configTransferApi` with export/import calls |
| Create | `frontend/src/components/dialogs/settings/ExportConfigDialog.tsx` | Export dialog with section checkboxes |
| Create | `frontend/src/components/dialogs/settings/ImportConfigDialog.tsx` | Import dialog with file picker + section checkboxes |
| Modify | `frontend/src/pages/settings/GeneralSettings.tsx` | Add "Configuration Transfer" card |
| Modify | `frontend/src/i18n/locales/en/settings.json` | English translation keys |
| Modify | `frontend/src/i18n/locales/zh-Hans/settings.json` | Chinese (Simplified) translation keys |
| Modify | `frontend/src/i18n/locales/zh-Hant/settings.json` | Chinese (Traditional) translation keys |
| Modify | `frontend/src/i18n/locales/ja/settings.json` | Japanese translation keys |
| Modify | `frontend/src/i18n/locales/ko/settings.json` | Korean translation keys |
| Modify | `frontend/src/i18n/locales/es/settings.json` | Spanish translation keys |
| Modify | `frontend/src/i18n/locales/fr/settings.json` | French translation keys |

---

### Task 1: Backend — Config Export/Import Endpoints

**Files:**
- Create: `crates/server/src/routes/config_transfer.rs`
- Modify: `crates/server/src/routes/mod.rs`

- [ ] **Step 1: Create `config_transfer.rs` with export handler**

```rust
// crates/server/src/routes/config_transfer.rs
use std::collections::HashMap;

use axum::{Router, response::Json as ResponseJson, routing::{get, post}};
use serde::{Deserialize, Serialize};
use utils::{
    assets::{config_path, credentials_path, profiles_path},
    response::ApiResponse,
    version::APP_VERSION_WITH_SHA,
};

use crate::{DeploymentImpl, error::ApiError};

#[derive(Serialize)]
struct ExportEnvelope {
    export_version: u32,
    exported_at: String,
    source_app_version: String,
    sections: HashMap<String, serde_json::Value>,
}

#[derive(Deserialize)]
struct ImportEnvelope {
    sections: HashMap<String, serde_json::Value>,
}

#[derive(Serialize)]
struct ImportResult {
    results: HashMap<String, ImportSectionResult>,
}

#[derive(Serialize)]
#[serde(tag = "status")]
enum ImportSectionResult {
    #[serde(rename = "ok")]
    Ok,
    #[serde(rename = "error")]
    Error { message: String },
}

async fn export_config() -> Result<ResponseJson<ApiResponse<ExportEnvelope>>, ApiError> {
    let mut sections = HashMap::new();

    // config.json
    let config_content = std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    if let Some(v) = config_content {
        sections.insert("config".to_string(), v);
    }

    // profiles.json
    let profiles_content = std::fs::read_to_string(profiles_path())
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    if let Some(v) = profiles_content {
        sections.insert("profiles".to_string(), v);
    }

    // credentials.json (gateway)
    let credentials_content = std::fs::read_to_string(credentials_path())
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    if let Some(v) = credentials_content {
        sections.insert("gateway_credentials".to_string(), v);
    }

    let envelope = ExportEnvelope {
        export_version: 1,
        exported_at: chrono::Utc::now().to_rfc3339(),
        source_app_version: APP_VERSION_WITH_SHA.to_string(),
        sections,
    };

    Ok(ResponseJson(ApiResponse::success(envelope)))
}

async fn import_config(
    axum::extract::Json(envelope): axum::extract::Json<ImportEnvelope>,
) -> Result<ResponseJson<ApiResponse<ImportResult>>, ApiError> {
    let mut results = HashMap::new();

    // config
    if let Some(config_value) = envelope.sections.get("config") {
        let result = match serde_json::to_string_pretty(config_value) {
            Ok(content) => {
                // Atomic write: tmp + rename
                let path = config_path();
                let tmp_path = path.with_extension("json.tmp");
                match std::fs::write(&tmp_path, &content)
                    .and_then(|_| {
                        let file = std::fs::File::open(&tmp_path)?;
                        file.sync_all()?;
                        drop(file);
                        std::fs::rename(&tmp_path, &path)
                    })
                {
                    Ok(_) => ImportSectionResult::Ok,
                    Err(e) => ImportSectionResult::Error {
                        message: format!("Failed to write config: {e}"),
                    },
                }
            }
            Err(e) => ImportSectionResult::Error {
                message: format!("Failed to serialize config: {e}"),
            },
        };
        results.insert("config".to_string(), result);
    }

    // profiles
    if let Some(profiles_value) = envelope.sections.get("profiles") {
        let result = match serde_json::to_string_pretty(profiles_value) {
            Ok(content) => match std::fs::write(profiles_path(), &content) {
                Ok(_) => {
                    executors::profile::ExecutorConfigs::reload();
                    ImportSectionResult::Ok
                }
                Err(e) => ImportSectionResult::Error {
                    message: format!("Failed to write profiles: {e}"),
                },
            },
            Err(e) => ImportSectionResult::Error {
                message: format!("Failed to serialize profiles: {e}"),
            },
        };
        results.insert("profiles".to_string(), result);
    }

    // gateway_credentials
    if let Some(creds_value) = envelope.sections.get("gateway_credentials") {
        let result = match serde_json::to_string_pretty(creds_value) {
            Ok(content) => match std::fs::write(credentials_path(), &content) {
                // BridgeManager file watcher auto-detects and reconnects
                Ok(_) => ImportSectionResult::Ok,
                Err(e) => ImportSectionResult::Error {
                    message: format!("Failed to write credentials: {e}"),
                },
            },
            Err(e) => ImportSectionResult::Error {
                message: format!("Failed to serialize credentials: {e}"),
            },
        };
        results.insert("gateway_credentials".to_string(), result);
    }

    Ok(ResponseJson(ApiResponse::success(ImportResult { results })))
}

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/config/export", get(export_config))
        .route("/config/import", post(import_config))
}
```

- [ ] **Step 2: Register the new module in `mod.rs`**

Add `pub mod config_transfer;` to the module list in `crates/server/src/routes/mod.rs` (after the `config` line), and add `.merge(config_transfer::router())` to the router chain (after `.merge(config::router())`).

In `crates/server/src/routes/mod.rs`, add the module declaration:

```rust
pub mod config;
pub mod config_transfer;  // <-- add this line
```

And in the `router()` function, add the merge:

```rust
.merge(config::router())
.merge(config_transfer::router())  // <-- add this line
```

- [ ] **Step 3: Verify backend compiles**

Run: `cargo check -p server`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add crates/server/src/routes/config_transfer.rs crates/server/src/routes/mod.rs
git commit -m "feat(api): add config export/import endpoints"
```

---

### Task 2: Frontend — API Functions

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add `configTransferApi` to `api.ts`**

Add the following after the `profilesApi` object (around line 1166) in `frontend/src/lib/api.ts`:

```typescript
// Config Transfer APIs
export interface ConfigExportEnvelope {
  export_version: number;
  exported_at: string;
  source_app_version: string;
  sections: Record<string, unknown>;
}

export interface ConfigImportResult {
  results: Record<string, { status: string; message?: string }>;
}

export const configTransferApi = {
  exportConfig: async (): Promise<ConfigExportEnvelope> => {
    const response = await makeRequest('/api/config/export');
    return handleApiResponse<ConfigExportEnvelope>(response);
  },
  importConfig: async (
    sections: Record<string, unknown>
  ): Promise<ConfigImportResult> => {
    const response = await makeRequest('/api/config/import', {
      method: 'POST',
      body: JSON.stringify({ sections }),
    });
    return handleApiResponse<ConfigImportResult>(response);
  },
};
```

- [ ] **Step 2: Verify frontend compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): add config transfer API client functions"
```

---

### Task 3: Frontend — i18n Translation Keys

**Files:**
- Modify: `frontend/src/i18n/locales/en/settings.json`
- Modify: `frontend/src/i18n/locales/zh-Hans/settings.json`
- Modify: `frontend/src/i18n/locales/zh-Hant/settings.json`
- Modify: `frontend/src/i18n/locales/ja/settings.json`
- Modify: `frontend/src/i18n/locales/ko/settings.json`
- Modify: `frontend/src/i18n/locales/es/settings.json`
- Modify: `frontend/src/i18n/locales/fr/settings.json`

- [ ] **Step 1: Add English translations**

In `frontend/src/i18n/locales/en/settings.json`, add the following block inside `settings.general`, after the `safety` block (after line 302, before `"beta"`):

```json
"configTransfer": {
  "title": "Configuration Transfer",
  "description": "Export or import your settings to sync across machines.",
  "exportButton": "Export",
  "importButton": "Import",
  "export": {
    "title": "Export Configuration",
    "selectLabel": "Select what to export:",
    "button": "Export",
    "sections": {
      "config": "General Settings",
      "configDesc": "Theme, language, editor, git settings...",
      "profiles": "Agent Profiles",
      "profilesDesc": "Executor configs, MCP servers",
      "gateway_credentials": "Gateway Credentials",
      "gateway_credentialsDesc": "E2EE connection credentials",
      "ui_preferences": "UI Preferences",
      "ui_preferencesDesc": "Layout, panel states, filters"
    }
  },
  "import": {
    "title": "Import Configuration",
    "selectFile": "Select file...",
    "selectLabel": "Select what to import:",
    "button": "Import",
    "warning": "This will overwrite your current settings for selected sections.",
    "invalidFile": "Invalid configuration file.",
    "unsupportedVersion": "This file was created by a newer version and cannot be imported.",
    "success": "Configuration imported successfully.",
    "partialSuccess": "Some sections failed to import:",
    "error": "Failed to import configuration."
  }
}
```

- [ ] **Step 2: Add Chinese (Simplified) translations**

In `frontend/src/i18n/locales/zh-Hans/settings.json`, add the equivalent block inside `settings.general`, after the `safety` block:

```json
"configTransfer": {
  "title": "配置迁移",
  "description": "导出或导入设置，以在多台机器之间同步。",
  "exportButton": "导出",
  "importButton": "导入",
  "export": {
    "title": "导出配置",
    "selectLabel": "选择要导出的内容：",
    "button": "导出",
    "sections": {
      "config": "常规设置",
      "configDesc": "主题、语言、编辑器、Git 设置...",
      "profiles": "Agent 配置",
      "profilesDesc": "执行器配置、MCP 服务器",
      "gateway_credentials": "网关凭据",
      "gateway_credentialsDesc": "E2EE 连接凭据",
      "ui_preferences": "界面偏好",
      "ui_preferencesDesc": "布局、面板状态、过滤器"
    }
  },
  "import": {
    "title": "导入配置",
    "selectFile": "选择文件...",
    "selectLabel": "选择要导入的内容：",
    "button": "导入",
    "warning": "这将覆盖所选部分的当前设置。",
    "invalidFile": "配置文件无效。",
    "unsupportedVersion": "此文件由更新版本创建，无法导入。",
    "success": "配置导入成功。",
    "partialSuccess": "部分配置导入失败：",
    "error": "配置导入失败。"
  }
}
```

- [ ] **Step 3: Add remaining language translations**

For `zh-Hant`, `ja`, `ko`, `es`, `fr` — add the same structure in each `settings.json`. Use the English keys as values (the community or maintainer can refine later). The key structure must match exactly.

`frontend/src/i18n/locales/zh-Hant/settings.json`:
```json
"configTransfer": {
  "title": "設定遷移",
  "description": "匯出或匯入設定，以在多台機器之間同步。",
  "exportButton": "匯出",
  "importButton": "匯入",
  "export": {
    "title": "匯出設定",
    "selectLabel": "選擇要匯出的內容：",
    "button": "匯出",
    "sections": {
      "config": "一般設定",
      "configDesc": "主題、語言、編輯器、Git 設定...",
      "profiles": "Agent 設定",
      "profilesDesc": "執行器設定、MCP 伺服器",
      "gateway_credentials": "閘道憑證",
      "gateway_credentialsDesc": "E2EE 連線憑證",
      "ui_preferences": "介面偏好",
      "ui_preferencesDesc": "佈局、面板狀態、篩選器"
    }
  },
  "import": {
    "title": "匯入設定",
    "selectFile": "選擇檔案...",
    "selectLabel": "選擇要匯入的內容：",
    "button": "匯入",
    "warning": "這將覆蓋所選部分的當前設定。",
    "invalidFile": "設定檔無效。",
    "unsupportedVersion": "此檔案由更新版本建立，無法匯入。",
    "success": "設定匯入成功。",
    "partialSuccess": "部分設定匯入失敗：",
    "error": "設定匯入失敗。"
  }
}
```

`frontend/src/i18n/locales/ja/settings.json`:
```json
"configTransfer": {
  "title": "設定の移行",
  "description": "設定をエクスポートまたはインポートして、複数のマシン間で同期します。",
  "exportButton": "エクスポート",
  "importButton": "インポート",
  "export": {
    "title": "設定のエクスポート",
    "selectLabel": "エクスポートする項目を選択：",
    "button": "エクスポート",
    "sections": {
      "config": "一般設定",
      "configDesc": "テーマ、言語、エディタ、Git設定...",
      "profiles": "エージェント設定",
      "profilesDesc": "エクゼキューター設定、MCPサーバー",
      "gateway_credentials": "ゲートウェイ認証情報",
      "gateway_credentialsDesc": "E2EE接続認証情報",
      "ui_preferences": "UI設定",
      "ui_preferencesDesc": "レイアウト、パネル状態、フィルター"
    }
  },
  "import": {
    "title": "設定のインポート",
    "selectFile": "ファイルを選択...",
    "selectLabel": "インポートする項目を選択：",
    "button": "インポート",
    "warning": "選択したセクションの現在の設定が上書きされます。",
    "invalidFile": "設定ファイルが無効です。",
    "unsupportedVersion": "このファイルは新しいバージョンで作成されたため、インポートできません。",
    "success": "設定のインポートが完了しました。",
    "partialSuccess": "一部のセクションのインポートに失敗しました：",
    "error": "設定のインポートに失敗しました。"
  }
}
```

`frontend/src/i18n/locales/ko/settings.json`:
```json
"configTransfer": {
  "title": "설정 이전",
  "description": "설정을 내보내거나 가져와서 여러 기기 간에 동기화합니다.",
  "exportButton": "내보내기",
  "importButton": "가져오기",
  "export": {
    "title": "설정 내보내기",
    "selectLabel": "내보낼 항목 선택:",
    "button": "내보내기",
    "sections": {
      "config": "일반 설정",
      "configDesc": "테마, 언어, 편집기, Git 설정...",
      "profiles": "에이전트 프로필",
      "profilesDesc": "실행기 설정, MCP 서버",
      "gateway_credentials": "게이트웨이 자격 증명",
      "gateway_credentialsDesc": "E2EE 연결 자격 증명",
      "ui_preferences": "UI 환경설정",
      "ui_preferencesDesc": "레이아웃, 패널 상태, 필터"
    }
  },
  "import": {
    "title": "설정 가져오기",
    "selectFile": "파일 선택...",
    "selectLabel": "가져올 항목 선택:",
    "button": "가져오기",
    "warning": "선택한 섹션의 현재 설정을 덮어씁니다.",
    "invalidFile": "잘못된 설정 파일입니다.",
    "unsupportedVersion": "이 파일은 최신 버전에서 생성되어 가져올 수 없습니다.",
    "success": "설정을 성공적으로 가져왔습니다.",
    "partialSuccess": "일부 섹션 가져오기에 실패했습니다:",
    "error": "설정 가져오기에 실패했습니다."
  }
}
```

`frontend/src/i18n/locales/es/settings.json`:
```json
"configTransfer": {
  "title": "Transferencia de configuración",
  "description": "Exporta o importa tu configuración para sincronizar entre máquinas.",
  "exportButton": "Exportar",
  "importButton": "Importar",
  "export": {
    "title": "Exportar configuración",
    "selectLabel": "Selecciona qué exportar:",
    "button": "Exportar",
    "sections": {
      "config": "Configuración general",
      "configDesc": "Tema, idioma, editor, configuración de Git...",
      "profiles": "Perfiles de agente",
      "profilesDesc": "Configuraciones de ejecutor, servidores MCP",
      "gateway_credentials": "Credenciales del gateway",
      "gateway_credentialsDesc": "Credenciales de conexión E2EE",
      "ui_preferences": "Preferencias de interfaz",
      "ui_preferencesDesc": "Diseño, estados de panel, filtros"
    }
  },
  "import": {
    "title": "Importar configuración",
    "selectFile": "Seleccionar archivo...",
    "selectLabel": "Selecciona qué importar:",
    "button": "Importar",
    "warning": "Esto sobrescribirá tu configuración actual para las secciones seleccionadas.",
    "invalidFile": "Archivo de configuración inválido.",
    "unsupportedVersion": "Este archivo fue creado por una versión más nueva y no se puede importar.",
    "success": "Configuración importada exitosamente.",
    "partialSuccess": "Algunas secciones no se pudieron importar:",
    "error": "Error al importar la configuración."
  }
}
```

`frontend/src/i18n/locales/fr/settings.json`:
```json
"configTransfer": {
  "title": "Transfert de configuration",
  "description": "Exportez ou importez vos paramètres pour les synchroniser entre machines.",
  "exportButton": "Exporter",
  "importButton": "Importer",
  "export": {
    "title": "Exporter la configuration",
    "selectLabel": "Sélectionnez ce que vous souhaitez exporter :",
    "button": "Exporter",
    "sections": {
      "config": "Paramètres généraux",
      "configDesc": "Thème, langue, éditeur, paramètres Git...",
      "profiles": "Profils d'agent",
      "profilesDesc": "Configurations d'exécuteur, serveurs MCP",
      "gateway_credentials": "Identifiants de passerelle",
      "gateway_credentialsDesc": "Identifiants de connexion E2EE",
      "ui_preferences": "Préférences d'interface",
      "ui_preferencesDesc": "Disposition, états des panneaux, filtres"
    }
  },
  "import": {
    "title": "Importer la configuration",
    "selectFile": "Sélectionner un fichier...",
    "selectLabel": "Sélectionnez ce que vous souhaitez importer :",
    "button": "Importer",
    "warning": "Cela écrasera vos paramètres actuels pour les sections sélectionnées.",
    "invalidFile": "Fichier de configuration invalide.",
    "unsupportedVersion": "Ce fichier a été créé par une version plus récente et ne peut pas être importé.",
    "success": "Configuration importée avec succès.",
    "partialSuccess": "Certaines sections n'ont pas pu être importées :",
    "error": "Échec de l'importation de la configuration."
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/*/settings.json
git commit -m "feat(i18n): add config transfer translation keys for all languages"
```

---

### Task 4: Frontend — Export Config Dialog

**Files:**
- Create: `frontend/src/components/dialogs/settings/ExportConfigDialog.tsx`

- [ ] **Step 1: Create the Export dialog**

```tsx
// frontend/src/components/dialogs/settings/ExportConfigDialog.tsx
import { useEffect, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';

import { defineModal } from '@/lib/modals';
import {
  configTransferApi,
  type ConfigExportEnvelope,
} from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';

const CURRENT_EXPORT_VERSION = 1;

const SECTION_KEYS = [
  'config',
  'profiles',
  'gateway_credentials',
  'ui_preferences',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

// Data-only fields from useUiPreferencesStore to export
const UI_PREFERENCE_FIELDS = [
  'repoActions',
  'expanded',
  'contextBarPosition',
  'paneSizes',
  'collapsedPaths',
  'fileSearchRepoId',
  'layoutMode',
  'isLeftSidebarVisible',
  'isRightSidebarVisible',
  'isTerminalVisible',
  'workspacePanelStates',
  'kanbanProjectViewSelections',
  'kanbanProjectViewPreferences',
  'workspaceFilters',
  'kanbanViewMode',
  'listViewStatusFilter',
] as const;

function getUiPreferencesData(): Record<string, unknown> {
  const state = useUiPreferencesStore.getState();
  const data: Record<string, unknown> = {};
  for (const field of UI_PREFERENCE_FIELDS) {
    data[field] = state[field];
  }
  return data;
}

const ExportConfigDialogImpl = NiceModal.create(() => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const [backendData, setBackendData] =
    useState<ConfigExportEnvelope | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<SectionKey, boolean>>({
    config: true,
    profiles: true,
    gateway_credentials: true,
    ui_preferences: true,
  });

  useEffect(() => {
    if (modal.visible) {
      setLoading(true);
      configTransferApi
        .exportConfig()
        .then((data) => {
          setBackendData(data);
          // If gateway_credentials not in response, uncheck it
          if (!data.sections.gateway_credentials) {
            setSelected((s) => ({ ...s, gateway_credentials: false }));
          }
        })
        .catch(() => setBackendData(null))
        .finally(() => setLoading(false));
    }
  }, [modal.visible]);

  const availableSections = SECTION_KEYS.filter((key) => {
    if (key === 'ui_preferences') return true;
    return backendData?.sections[key] != null;
  });

  const hasSelection = availableSections.some((key) => selected[key]);

  const handleExport = () => {
    if (!backendData) return;

    const envelope: ConfigExportEnvelope = {
      export_version: CURRENT_EXPORT_VERSION,
      exported_at: backendData.exported_at,
      source_app_version: backendData.source_app_version,
      sections: {},
    };

    for (const key of availableSections) {
      if (!selected[key]) continue;
      if (key === 'ui_preferences') {
        envelope.sections[key] = getUiPreferencesData();
      } else {
        envelope.sections[key] = backendData.sections[key];
      }
    }

    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibe-board-config-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);

    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) modal.hide();
  };

  const tSection = (key: SectionKey) =>
    t(`settings.general.configTransfer.export.sections.${key}`);
  const tSectionDesc = (key: SectionKey) =>
    t(`settings.general.configTransfer.export.sections.${key}Desc`);

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('settings.general.configTransfer.export.title')}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('settings.general.configTransfer.export.selectLabel')}
            </p>
            <div className="space-y-3">
              {availableSections.map((key) => (
                <div key={key} className="flex items-start space-x-3">
                  <Checkbox
                    id={`export-${key}`}
                    checked={selected[key]}
                    onCheckedChange={(checked: boolean) =>
                      setSelected((s) => ({ ...s, [key]: checked }))
                    }
                  />
                  <div className="space-y-0.5">
                    <Label
                      htmlFor={`export-${key}`}
                      className="cursor-pointer"
                    >
                      {tSection(key)}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {tSectionDesc(key)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => modal.hide()}>
            {t('common:buttons.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleExport}
            disabled={loading || !hasSelection}
          >
            <Download className="mr-2 h-4 w-4" />
            {t('settings.general.configTransfer.export.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ExportConfigDialog = defineModal<
  Record<string, never>,
  void
>(ExportConfigDialogImpl);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dialogs/settings/ExportConfigDialog.tsx
git commit -m "feat(ui): add export config dialog"
```

---

### Task 5: Frontend — Import Config Dialog

**Files:**
- Create: `frontend/src/components/dialogs/settings/ImportConfigDialog.tsx`

- [ ] **Step 1: Create the Import dialog**

```tsx
// frontend/src/components/dialogs/settings/ImportConfigDialog.tsx
import { useRef, useState } from 'react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, FileUp, Loader2, Upload } from 'lucide-react';

import { defineModal } from '@/lib/modals';
import { configTransferApi, type ConfigExportEnvelope } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUserSystem } from '@/components/ConfigProvider';
import { useUiPreferencesStore } from '@/stores/useUiPreferencesStore';

const CURRENT_EXPORT_VERSION = 1;

const SECTION_KEYS = [
  'config',
  'profiles',
  'gateway_credentials',
  'ui_preferences',
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

export type ImportConfigResult =
  | { action: 'imported' }
  | { action: 'canceled' };

const ImportConfigDialogImpl = NiceModal.create(() => {
  const modal = useModal();
  const { t } = useTranslation('settings');
  const { reloadSystem } = useUserSystem();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileData, setFileData] = useState<ConfigExportEnvelope | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    type: 'success' | 'partial' | 'error';
    message: string;
  } | null>(null);
  const [selected, setSelected] = useState<Record<SectionKey, boolean>>({
    config: true,
    profiles: true,
    gateway_credentials: false,
    ui_preferences: true,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (
          !data.export_version ||
          !data.sections ||
          typeof data.sections !== 'object'
        ) {
          setParseError(
            t('settings.general.configTransfer.import.invalidFile')
          );
          setFileData(null);
          return;
        }
        if (data.export_version > CURRENT_EXPORT_VERSION) {
          setParseError(
            t('settings.general.configTransfer.import.unsupportedVersion')
          );
          setFileData(null);
          return;
        }
        setFileData(data as ConfigExportEnvelope);
        // Set selection defaults: all checked except gateway_credentials
        const newSelected: Record<SectionKey, boolean> = {
          config: false,
          profiles: false,
          gateway_credentials: false,
          ui_preferences: false,
        };
        for (const key of SECTION_KEYS) {
          if (data.sections[key] != null) {
            newSelected[key] = key !== 'gateway_credentials';
          }
        }
        setSelected(newSelected);
      } catch {
        setParseError(
          t('settings.general.configTransfer.import.invalidFile')
        );
        setFileData(null);
      }
    };
    reader.readAsText(file);
  };

  const availableSections = fileData
    ? SECTION_KEYS.filter((key) => fileData.sections[key] != null)
    : [];

  const hasSelection = availableSections.some((key) => selected[key]);

  const handleImport = async () => {
    if (!fileData) return;
    setImporting(true);
    setResult(null);

    try {
      // Separate backend and frontend sections
      const backendSections: Record<string, unknown> = {};
      let importUiPrefs = false;

      for (const key of availableSections) {
        if (!selected[key]) continue;
        if (key === 'ui_preferences') {
          importUiPrefs = true;
        } else {
          backendSections[key] = fileData.sections[key];
        }
      }

      // Import backend sections
      const errors: string[] = [];
      if (Object.keys(backendSections).length > 0) {
        const importResult =
          await configTransferApi.importConfig(backendSections);
        for (const [section, res] of Object.entries(importResult.results)) {
          if (res.status === 'error') {
            errors.push(`${section}: ${res.message}`);
          }
        }
      }

      // Import UI preferences
      if (importUiPrefs && fileData.sections.ui_preferences) {
        const prefs = fileData.sections.ui_preferences as Record<
          string,
          unknown
        >;
        useUiPreferencesStore.setState(prefs);
      }

      // Reload system config
      await reloadSystem();

      if (errors.length > 0) {
        setResult({
          type: 'partial',
          message: `${t('settings.general.configTransfer.import.partialSuccess')} ${errors.join('; ')}`,
        });
      } else {
        setResult({
          type: 'success',
          message: t('settings.general.configTransfer.import.success'),
        });
        setTimeout(() => modal.resolve({ action: 'imported' }), 1500);
        setTimeout(() => modal.hide(), 1500);
      }
    } catch {
      setResult({
        type: 'error',
        message: t('settings.general.configTransfer.import.error'),
      });
    } finally {
      setImporting(false);
    }
  };

  const handleCancel = () => {
    modal.resolve({ action: 'canceled' } as ImportConfigResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) handleCancel();
  };

  const tSection = (key: SectionKey) =>
    t(`settings.general.configTransfer.export.sections.${key}`);

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('settings.general.configTransfer.import.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="mr-2 h-4 w-4" />
              {fileName ??
                t('settings.general.configTransfer.import.selectFile')}
            </Button>
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Section checkboxes */}
          {fileData && !parseError && (
            <>
              <p className="text-sm text-muted-foreground">
                {t('settings.general.configTransfer.import.selectLabel')}
              </p>
              <div className="space-y-3">
                {availableSections.map((key) => (
                  <div key={key} className="flex items-center space-x-3">
                    <Checkbox
                      id={`import-${key}`}
                      checked={selected[key]}
                      onCheckedChange={(checked: boolean) =>
                        setSelected((s) => ({ ...s, [key]: checked }))
                      }
                    />
                    <Label
                      htmlFor={`import-${key}`}
                      className="cursor-pointer"
                    >
                      {tSection(key)}
                    </Label>
                  </div>
                ))}
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('settings.general.configTransfer.import.warning')}
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* Result feedback */}
          {result && (
            <Alert
              variant={result.type === 'error' ? 'destructive' : 'default'}
            >
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t('common:buttons.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!fileData || !hasSelection || importing || parseError != null}
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {t('settings.general.configTransfer.import.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const ImportConfigDialog = defineModal<
  Record<string, never>,
  ImportConfigResult
>(ImportConfigDialogImpl);
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dialogs/settings/ImportConfigDialog.tsx
git commit -m "feat(ui): add import config dialog"
```

---

### Task 6: Frontend — Configuration Transfer Card in GeneralSettings

**Files:**
- Modify: `frontend/src/pages/settings/GeneralSettings.tsx`

- [ ] **Step 1: Add imports and card**

At the top of `GeneralSettings.tsx`, add the dialog imports alongside existing imports:

```typescript
import { ExportConfigDialog } from '@/components/dialogs/settings/ExportConfigDialog';
import { ImportConfigDialog } from '@/components/dialogs/settings/ImportConfigDialog';
```

Also add the `Download` and `Upload` icons to the existing `lucide-react` import line in the file.

- [ ] **Step 2: Insert the Configuration Transfer card**

In `GeneralSettings.tsx`, between the Safety card (ending at line 980 `</Card>`) and the About card (starting at line 982 `<Card>`), insert:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>
            {t('settings.general.configTransfer.title')}
          </CardTitle>
          <CardDescription>
            {t('settings.general.configTransfer.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => ExportConfigDialog.show({})}
            >
              <Download className="mr-2 h-4 w-4" />
              {t('settings.general.configTransfer.exportButton')}
            </Button>
            <Button
              variant="outline"
              onClick={() => ImportConfigDialog.show({})}
            >
              <Upload className="mr-2 h-4 w-4" />
              {t('settings.general.configTransfer.importButton')}
            </Button>
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && pnpm run check`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings/GeneralSettings.tsx
git commit -m "feat(ui): add configuration transfer card to general settings"
```

---

### Task 7: Verification — End-to-End Check

**Files:** None (verification only)

- [ ] **Step 1: Verify backend compiles**

Run: `cargo check --workspace`
Expected: Compiles without errors.

- [ ] **Step 2: Verify frontend compiles and lints**

Run: `cd frontend && pnpm run check && pnpm run lint`
Expected: No type errors or lint issues.

- [ ] **Step 3: Verify type generation still works**

Run: `pnpm run generate-types:check`
Expected: Passes (no changes to shared types needed since export/import types are frontend-only).

- [ ] **Step 4: Commit any remaining fixes**

If Steps 1-3 produced errors, fix them and commit:

```bash
git add -A
git commit -m "fix: address compilation/lint issues from config transfer feature"
```
