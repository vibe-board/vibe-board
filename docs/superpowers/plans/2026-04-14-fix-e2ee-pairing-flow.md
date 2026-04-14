# Fix E2EE Pairing Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken E2EE pairing flow so users can pair machines and load projects from the Home tab.

**Architecture:** The MachineNodeView's `handlePair` currently only stores the master secret in localStorage. We need to add device registration (gateway API) and backend credentials notification (local daemon) before the localStorage save. We also delete the unused E2EESettingsDialog and its hook.

**Tech Stack:** React, TypeScript, E2EE crypto (deriveAuthKeyPair), fetch API

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/components/tabs/HomeTab.tsx` | Modify | Rewrite `handlePair` with full 3-step flow, add re-pair button, add help text |
| `frontend/src/components/dialogs/E2EESettingsDialog.tsx` | Delete | Unused dialog with complete pairing logic (source of truth for the flow we're porting) |
| `frontend/src/hooks/useE2ee.ts` | Delete | Only used by E2EESettingsDialog |
| `frontend/src/pages/settings/GeneralSettings.tsx` | Modify | Remove E2EE card and import |

---

### Task 1: Rewrite MachineNodeView handlePair with full pairing flow

**Files:**
- Modify: `frontend/src/components/tabs/HomeTab.tsx:349-488`

- [ ] **Step 1: Add the `deriveAuthKeyPair` import**

At the top of `HomeTab.tsx`, add the import:

```tsx
import { deriveAuthKeyPair } from '@/lib/e2ee';
```

- [ ] **Step 2: Add `unpairMachine` to the destructured store actions**

Change line 358 from:

```tsx
const { openProjectTab, pairMachine } = useConnectionStore();
```

to:

```tsx
const { openProjectTab, pairMachine, unpairMachine } = useConnectionStore();
```

- [ ] **Step 3: Add `pairLoading` state**

After the existing state declarations (line 364), add:

```tsx
const [pairLoading, setPairLoading] = useState(false);
```

- [ ] **Step 4: Rewrite `handlePair` as async with full 3-step flow**

Replace the entire `handlePair` function (lines 403-411) with:

```tsx
const handlePair = async () => {
  const secret = pairSecret.trim();
  if (!secret) return;
  setPairLoading(true);
  setPairError('');
  try {
    // Step 1: Derive auth keypair from secret
    const secretBytes = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
    const authKp = await deriveAuthKeyPair(secretBytes);
    const pubKeyB64 = btoa(String.fromCharCode(...authKp.publicKey));

    // Step 2: Register device with gateway
    const session = gatewayNode.session;
    if (!session) throw new Error('Not logged in');
    const regResp = await fetch(
      `${gatewayNode.gatewayUrl}/api/auth/device/register`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.sessionToken}`,
        },
        body: JSON.stringify({
          public_key: pubKeyB64,
          device_name: 'WebUI',
        }),
      }
    );
    if (!regResp.ok) {
      const text = await regResp.text();
      throw new Error(
        `Device registration failed (${regResp.status}): ${text}`
      );
    }

    // Step 3: Notify local backend of credentials
    const credResp = await fetch('/api/e2ee/credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        master_secret: secret,
        gateway_url: gatewayNode.gatewayUrl,
        session_token: session.sessionToken,
        user_id: session.userId,
      }),
    });
    if (!credResp.ok) {
      const text = await credResp.text();
      throw new Error(`Backend credentials failed (${credResp.status}): ${text}`);
    }

    // Step 4: Local pair (localStorage)
    pairMachine(connectionId, machine.machine_id, secret);
    setPairSecret('');
  } catch (e) {
    setPairError(e instanceof Error ? e.message : 'Pairing failed');
  } finally {
    setPairLoading(false);
  }
};
```

- [ ] **Step 5: Add `handleUnpair` for re-pairing**

After `handlePair`, add:

```tsx
const handleUnpair = () => {
  unpairMachine(connectionId, machine.machine_id);
  setLoadError(null);
  setProjects([]);
};
```

- [ ] **Step 6: Update the not-paired UI block with help text and loading state**

Replace the `!isPaired` branch (lines 437-454) with:

```tsx
{!isPaired ? (
  <div className="space-y-1">
    <input
      className="w-full px-2 py-1 text-xs bg-muted border border-border rounded"
      placeholder="Paste master secret from bridge terminal (base64)"
      value={pairSecret}
      onChange={(e) => setPairSecret(e.target.value)}
      disabled={pairLoading}
    />
    <p className="text-[10px] text-foreground/40">
      Copy the master secret from the bridge terminal output.
    </p>
    {pairError && (
      <p className="text-[10px] text-destructive">{pairError}</p>
    )}
    <button
      className="px-2 py-0.5 text-xs bg-foreground text-background rounded hover:opacity-85 disabled:opacity-50"
      onClick={handlePair}
      disabled={!pairSecret.trim() || pairLoading}
    >
      {pairLoading ? 'Registering...' : 'Pair'}
    </button>
  </div>
)
```

- [ ] **Step 7: Update the `loadError` display to include a re-pair button**

Replace the `loadError` branch (line 457-458) with:

```tsx
) : loadError ? (
  <div className="space-y-1">
    <p className="text-xs text-destructive">{loadError}</p>
    {(loadError.includes('timeout') ||
      loadError.includes('unwrap') ||
      loadError.includes('public key')) && (
      <button
        className="px-2 py-0.5 text-xs border border-border rounded text-foreground/70 hover:text-foreground"
        onClick={handleUnpair}
      >
        Re-pair
      </button>
    )}
  </div>
)
```

- [ ] **Step 8: Run lint and type check**

Run: `pnpm run check && pnpm run lint`

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/tabs/HomeTab.tsx
git commit -m "fix: complete E2EE pairing flow in MachineNodeView with device registration and backend credentials"
```

---

### Task 2: Delete E2EESettingsDialog and useE2ee hook

**Files:**
- Delete: `frontend/src/components/dialogs/E2EESettingsDialog.tsx`
- Delete: `frontend/src/hooks/useE2ee.ts`

- [ ] **Step 1: Delete E2EESettingsDialog.tsx**

```bash
rm frontend/src/components/dialogs/E2EESettingsDialog.tsx
```

- [ ] **Step 2: Delete useE2ee.ts hook**

```bash
rm frontend/src/hooks/useE2ee.ts
```

- [ ] **Step 3: Run lint and type check to see remaining references**

Run: `pnpm run check`

Expected: Compile errors in `GeneralSettings.tsx` pointing to removed imports. We fix this in Task 3.

---

### Task 3: Remove E2EE card from GeneralSettings

**Files:**
- Modify: `frontend/src/pages/settings/GeneralSettings.tsx:52,29,911-935`

- [ ] **Step 1: Remove the E2EESettingsDialog import**

Delete line 52:

```tsx
import { E2EESettingsDialog } from '@/components/dialogs/E2EESettingsDialog';
```

- [ ] **Step 2: Remove `Shield` from the lucide-react import**

At line 29, remove `Shield` from the icon import list. (Only remove `Shield` if no other usage remains — we confirmed it's only used in the E2EE card.)

- [ ] **Step 3: Delete the entire E2EE Card block**

Delete lines 911-935 (the `<Card>` block that contains `e2ee.cardTitle`, `e2ee.cardDescription`, `e2ee.cardHelper`, `e2ee.configure`, and the `E2EESettingsDialog.show()` button):

```tsx
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.general.e2ee.cardTitle')}</CardTitle>
          <CardDescription>
            {t('settings.general.e2ee.cardDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t('settings.general.e2ee.cardHelper')}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => E2EESettingsDialog.show()}
            >
              {t('settings.general.e2ee.configure')}
            </Button>
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 4: Run lint and type check**

Run: `pnpm run check && pnpm run lint`

Expected: No errors. All references to E2EESettingsDialog and useE2ee are gone.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: delete E2EESettingsDialog, useE2ee hook, and settings E2EE card"
```

---

### Task 4: Push and trigger CI build

- [ ] **Step 1: Push changes**

```bash
git push
```

- [ ] **Step 2: Trigger macOS ARM64 build**

```bash
gh workflow run tauri-build.yml --ref vb/8421-enhance-connecti --repo vibe-board/vibe-board
```

- [ ] **Step 3: Share workflow URL**

The `gh workflow run` command outputs the run URL. Share it with the user.
