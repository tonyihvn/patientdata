# Care Card ESM — Architecture & Component Communication Guide

**Module:** `@openmrs/esm-template-app` (Care Card / `patientdata` ESM)
**Type:** OpenMRS 3.x Single-SPA microfrontend
**Entry route:** `/openmrs/spa/patientdata`

This document describes the technical architecture of the Care Card module:
how each file is wired, how data flows between components, and how the
module talks to the OpenMRS backend and the rest of the SPA shell.

---

## 1. High-Level Picture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       OpenMRS App Shell (Single-SPA)                 │
│                                                                      │
│  ┌──────────────────┐         ┌─────────────────────────────────┐    │
│  │ Patient Chart    │ slots ──▶│  Care Card extensions:         │    │
│  │  (other ESM)     │         │   • CarecardDashboardButton    │    │
│  │                  │         │   • CarecardSidebarLink        │    │
│  └──────────────────┘         └─────────────────────────────────┘    │
│           │ navigate(`/patientdata?patientUuid=…`)                   │
│           ▼                                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Page route: patientdata  →  Root  →  CarecardDashboard         │  │
│  │                                       │                        │  │
│  │                                       ├─ Patient banner        │  │
│  │                                       ├─ Sidebar (history)     │  │
│  │                                       └─ Tabs (one per page)   │  │
│  │                                            │                   │  │
│  │                                            ▼                   │  │
│  │                                   CarecardFormPage             │  │
│  │                                   (Carbon form renderer)       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                            │                         │
│                                            ▼                         │
│        OpenMRS REST + FHIR APIs (encounters, patients)               │
└──────────────────────────────────────────────────────────────────────┘
```

The module exposes **one page** (`patientdata`) and **six extensions** to
the rest of the SPA. Inside the page, the `CarecardDashboard` orchestrates
five tabbed sub-forms, each backed by its own encounter type but sharing a
single, unified Carbon form renderer.

---

## 2. File Map (post-cleanup)

```
patientdata/
├─ src/
│  ├─ index.ts                          ← microfrontend entry (lifecycles)
│  ├─ routes.json                       ← page + extension wiring
│  ├─ config-schema.ts                  ← runtime config schema
│  ├─ declarations.d.ts                 ← TS ambient module decls
│  ├─ root.component.tsx                ← page root → renders Dashboard
│  ├─ root.scss
│  ├─ root.test.tsx
│  │
│  ├─ carecard-schema.json              ← canonical Care Card form JSON
│  ├─ carecard-form.ts                  ← typed wrapper around the JSON
│  │
│  ├─ forms/
│  │  └─ carecard-forms-registry.ts     ← splits JSON pages into 5 forms
│  │
│  ├─ carecard-dashboard/
│  │  ├─ carecard-dashboard.component.tsx   ← orchestrator (tabs + history)
│  │  ├─ carecard-dashboard.resource.ts     ← encounter REST queries
│  │  └─ carecard-dashboard.scss
│  │
│  ├─ carecard-form-page/
│  │  ├─ carecard-form-page.component.tsx   ← Carbon form renderer
│  │  └─ carecard-form-page.scss
│  │
│  ├─ carecard-dashboard-button/
│  │  └─ carecard-dashboard-button.component.tsx
│  │
│  ├─ carecard-sidebar-link/
│  │  └─ carecard-sidebar-link.component.tsx
│  │
│  └─ boxes/extensions/                 ← demo extensions for `Boxes` slot
│
├─ translations/                        ← i18n JSON
├─ e2e/                                 ← Playwright tests
├─ tools/                               ← dev tooling
├─ webpack.config.js
├─ package.json
└─ tsconfig.json
```

---

## 3. Module Lifecycle & Registration

### 3.1 [src/index.ts](src/index.ts) — entry point

The app shell loads this file first. It does three things:

1. Calls `defineConfigSchema(moduleName, configSchema)` once at startup
   (`startupApp`).
2. Declares **lazy lifecycle exports** with `getAsyncLifecycle(...)` for
   each component that the shell may mount. Each exported name maps 1:1
   to a `component` field in `routes.json`.
3. Exposes `importTranslation` so the shell can lazy-load i18n bundles
   from `../translations/*.json`.

Exported lifecycles:

| Export                  | Component file                                                  | Mounted as |
| ----------------------- | --------------------------------------------------------------- | ---------- |
| `root`                  | `root.component.tsx`                                            | Page       |
| `careCradDashboard`     | `carecard-dashboard/carecard-dashboard.component.tsx`           | (reserved) |
| `careCradFormPage`      | `carecard-form-page/carecard-form-page.component.tsx`           | (reserved) |
| `careCradDashboardButton` | `carecard-dashboard-button/...component.tsx`                  | Extension  |
| `careCradSidebarLink`   | `carecard-sidebar-link/...component.tsx`                        | Extension  |
| `redBox`/`blueBox`/`brandBox` | `boxes/extensions/*.tsx`                                  | Extension  |

### 3.2 [src/routes.json](src/routes.json) — shell contract

Tells the OpenMRS shell **where** each export plugs in:

- `pages[]`: registers `root` at the URL segment `patientdata`. Any
  visit to `/openmrs/spa/patientdata` mounts `Root`.
- `extensions[]`: registers buttons/links into shell-defined slots:
  - `patient-chart-actions-slot` and `patient-chart-summary-dashboard-slot` ← `careCradDashboardButton`
  - `patient-banner-extra-actions` ← `careCradSidebarLink`
  - `Boxes` (internal demo slot) ← red/blue/brand boxes
- `backendDependencies`: declares minimum versions of the OpenMRS
  backend modules this ESM relies on (`fhir2`, `webservices.rest`).

### 3.3 [src/config-schema.ts](src/config-schema.ts)

Defines configurable values (validated by `@openmrs/esm-framework`'s
config system) so deployments can override behaviour without a rebuild.

---

## 4. The Form Schema Pipeline

The Care Card historically shipped as a single OpenMRS Form Engine JSON
with **five logical pages**. We turn that into five independent
tabs/forms while keeping a single source of truth.

```
carecard-schema.json   ──import──▶  carecard-form.ts
        (raw JSON)                   (typed wrapper, default export)
                                              │
                                              ▼
                                  forms/carecard-forms-registry.ts
                                  buildCareCardForms() splits pages:
                                  ┌─ HIV ENROLLMENT
                                  ├─ ART COMMENCEMENT
                                  ├─ FOLLOWUP VISITS
                                  ├─ DISCONTINUATION & INTERRUPTIONS
                                  └─ INITIAL CLINICAL EVALUATION
                                              │
                                  exports CARE_CARD_FORMS: CareCardFormDefinition[]
                                              │
                       ┌──────────────────────┴──────────────────────┐
                       ▼                                              ▼
       carecard-dashboard.component.tsx              (read-only metadata for UI)
       (renders one Tab per definition)
```

### 4.1 [src/carecard-schema.json](src/carecard-schema.json)
The canonical JSON is loaded via `resolveJsonModule` (see
`tsconfig.json`) — no runtime fetch is required, the schema is bundled
into the JS chunk.

### 4.2 [src/carecard-form.ts](src/carecard-form.ts)
A thin TypeScript wrapper that re-exports the JSON as
`careCradFormSchema` typed as `{ name; uuid; encounterType; pages[]; … }`.
This is the **only** file that imports the JSON directly.

### 4.3 [src/forms/carecard-forms-registry.ts](src/forms/carecard-forms-registry.ts)
- `buildCareCardForms()` iterates `careCradFormSchema.pages`, creates
  one `CareCardFormDefinition` per page, slugs the label into a stable
  `id`, mints a derived `formUuid` (`<baseUuid>-<slug>`), and looks the
  encounter type up in `ENCOUNTER_TYPE_BY_PAGE_LABEL` (falling back to
  the schema-level `encounterType`).
- The result is exported as the immutable array `CARE_CARD_FORMS`.
- Pages without sections are filtered out.

Consumers only ever see `CareCardFormDefinition` — they never reach
back into the raw JSON.

---

## 5. Page Composition

### 5.1 [src/root.component.tsx](src/root.component.tsx)
A trivial wrapper:

```tsx
<Root>
  <CarecardDashboard />   // no props → patient UUID resolved internally
</Root>
```

It exists so the page-level lifecycle in `index.ts` can be swapped
later (e.g. wrap in a router, error boundary, or layout) without
touching the dashboard.

### 5.2 [src/carecard-dashboard/carecard-dashboard.component.tsx](src/carecard-dashboard/carecard-dashboard.component.tsx)

The orchestrator. It owns all interaction state and connects four
moving parts: URL → patient context → tabs → form renderer.

State (all `useState`):

| State                | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| `activePatientUuid`  | Resolved from prop or URL `?patientUuid=` query string          |
| `manualPatientUuid`  | Free-text fallback when no patient is in context                |
| `activeFormId`       | Slug of the currently selected tab (`CARE_CARD_FORMS[i].id`)    |
| `mode`               | `'create' \| 'edit' \| 'view'`                                  |
| `activeEncounterUuid`| When editing/viewing, which historical encounter is loaded     |
| `encountersByType`   | Map<encounterTypeUuid, CareCardEncounterRecord[]> for sidebar  |
| `loadingHistory` / `historyError` | UI flags for the history fetch                     |

Hooks & effects:

- `usePatient(activePatientUuid)` (from `@openmrs/esm-framework`) →
  drives the **patient banner** at the top (Name, Sex, Age, DOB, UUID,
  phone, address — all derived from the FHIR `Patient` resource).
- `useEffect` listens to `popstate` and `single-spa:routing-event` so
  the dashboard reacts to navigation changes from outside the ESM
  (e.g. clicking another patient).
- `refreshHistory()` calls
  `fetchCareCardEncountersByType(...)` ([carecard-dashboard.resource.ts](src/carecard-dashboard/carecard-dashboard.resource.ts))
  for every distinct encounter type in `CARE_CARD_FORMS`, runs the
  requests in parallel, and groups them by encounter-type UUID.

Rendered structure:

```
<aside> Sidebar
   └─ "Previous records" — for each form with encounters:
         <Button View>  → setMode('view')  + setActiveEncounterUuid(r.uuid)
         <Button Edit>  → setMode('edit')  + setActiveEncounterUuid(r.uuid)

<section> Main panel
   ├─ Patient banner (usePatient → Name / Sex / Age / DOB / UUID / Phone / Addr)
   └─ <Tabs selectedIndex onChange>
        └─ <TabList contained>  one <Tab> per CARE_CARD_FORMS entry
        └─ <TabPanels> active panel only renders its body, others are stubs
              ├─ Form metadata block: page name + Form UUID + Encounter Type
              ├─ Header bar: mode tag + "Start new entry" button
              └─ <CarecardFormPage>
                    key={`${activeForm.id}-${activeEncounterUuid ?? 'new'}`}
                    patientUuid={activePatientUuid}
                    formDef={activeForm.schema}
                    encounterUuid={mode === 'create' ? undefined : activeEncounterUuid}
                    readOnly={mode === 'view'}
                    onSaved={...} onCancel={...}
```

The `key` prop on `CarecardFormPage` forces a remount whenever the
user switches tabs **or** swaps between historical encounters — this
guarantees clean local state inside the renderer.

### 5.3 [src/carecard-dashboard/carecard-dashboard.resource.ts](src/carecard-dashboard/carecard-dashboard.resource.ts)

Pure data layer. Wraps `openmrsFetch` against
`/ws/rest/v1/encounter?patient=...&encounterType=...&v=custom:(uuid,display,encounterDatetime,encounterType:(uuid,display))&limit=50`
and returns a typed grouped result. The dashboard imports both the
function and the `CareCardEncounterRecord` type — no other component
talks to this file.

### 5.4 [src/carecard-form-page/carecard-form-page.component.tsx](src/carecard-form-page/carecard-form-page.component.tsx)

A self-contained, schema-driven Carbon renderer. It is intentionally
**dumb about which form** it is rendering — the dashboard hands it a
`formDef` (one `CareCardFormSchemaSubset`) and the renderer simply walks
`pages → sections → questions` and emits the matching Carbon control
based on `question.questionOptions.rendering`:

| `rendering`                                | Control                       |
| ------------------------------------------ | ----------------------------- |
| `text`, `textarea`                         | `TextInput` / `TextArea`      |
| `number`                                   | `NumberInput`                 |
| `date`, `datetime`                         | `DatePicker` + `DatePickerInput` |
| `radio`                                    | `RadioButtonGroup` / `RadioButton` |
| `select`, `ui-select-extended`             | `Select` + `SelectItem`       |

Other inputs of the schema:

- `type: 'encounterDatetime'` → DatePicker bound to `encounterDatetime`.
- `type: 'encounterProvider'` → uses `useSession()` → current provider.
- `type: 'encounterLocation'` → uses `useSession().sessionLocation`.
- Patient demographic shortcuts (`gender`, `age`, `name`) preload from
  the FHIR patient when fetched at mount.

Internal state:

- `values: Record<string, string>` — single map keyed by question id.
- `activePageIndex` for nested Tabs (only relevant when a `formDef`
  contains more than one page; in this app each form is single-page,
  so the inner Tabs typically render one tab).
- `preloading`, `error`, validation flags.

Lifecycle:

1. **Mount**:
   - Fetch FHIR `Patient` to preload demographic answers.
   - If `encounterUuid` was given, fetch the encounter via
     `openmrsFetch` and hydrate `values` from its `obs` array using
     `normalizeRestObs(...)`.
2. **Edit**: every Carbon control writes back to `values` via a single
   setter. `hideWhenExpression` strings from the schema are evaluated
   against the current values to dynamically hide questions.
3. **Submit**:
   - Build an OpenMRS REST encounter payload:
     ```ts
     {
       patient: activePatientUuid,
       encounterType: formDef.encounterType,
       encounterDatetime: <from values | now>,
       location: useSession().sessionLocation.uuid,
       encounterProviders: [{ provider, encounterRole: ENCOUNTER_ROLE_UUID }],
       obs: Object.entries(values).map(...) // skip empties + non-obs fields
     }
     ```
   - `POST /ws/rest/v1/encounter` (or `POST /encounter/{uuid}` for
     edits) via `openmrsFetch`.
   - On success, calls `showSnackbar(...)` and the parent's `onSaved(uuid)`
     callback. The dashboard then refreshes history and switches to
     `edit` mode on the saved encounter.

### 5.5 Patient-context extensions

These are tiny:

- [src/carecard-dashboard-button/carecard-dashboard-button.component.tsx](src/carecard-dashboard-button/carecard-dashboard-button.component.tsx)
  — receives `patientUuid` from the slot, calls
  `usePatient(patientUuid)` to confirm the patient exists, then
  `navigate({ to: '/openmrs/spa/patientdata?patientUuid=...' })` on
  click. Rendered into two patient-chart slots (see `routes.json`).
- [src/carecard-sidebar-link/carecard-sidebar-link.component.tsx](src/carecard-sidebar-link/carecard-sidebar-link.component.tsx)
  — same idea but uses `<Link>` for the patient-banner action area.
- [src/boxes/extensions/](src/boxes/extensions/) — three coloured tiles
  registered into the `Boxes` slot. They are used as a smoke-test
  surface for the extension system and share `box.scss`.

---

## 6. Communication Pathways (who talks to whom)

```
URL (?patientUuid=…)
        │
        ▼
CarecardDashboard ────────────────────────────────────────┐
   │                                                      │
   ├─ usePatient (FHIR) ──────────────────► Patient banner│
   │                                                      │
   ├─ fetchCareCardEncountersByType (REST) ─► Sidebar list│
   │                                                      │
   ├─ CARE_CARD_FORMS (forms-registry) ────► Tabs         │
   │                                                      │
   └─ <CarecardFormPage formDef encounterUuid readOnly    │
                         onSaved onCancel />              │
              │                                           │
              ├─ openmrsFetch GET encounter (when editing)│
              ├─ openmrsFetch GET Patient (FHIR preload)  │
              ├─ useSession() (provider + location)       │
              └─ openmrsFetch POST encounter              │
                                                          │
                  onSaved(encounterUuid) ─────────────────┘
                                            (dashboard refreshes history)

Patient chart (other ESM)
        │ extension slots:
        │   patient-chart-actions-slot      → CarecardDashboardButton
        │   patient-chart-summary-dashboard → CarecardDashboardButton
        │   patient-banner-extra-actions    → CarecardSidebarLink
        ▼
CarecardDashboardButton / Link
        │  navigate(/patientdata?patientUuid=…)
        ▼
   (App shell routes to `root` page)
```

### Key contracts between components

| From → To                                  | Mechanism                                                     |
| ------------------------------------------ | ------------------------------------------------------------- |
| Shell → Page (`root`)                      | `routes.json` `pages[]` + `index.ts` lifecycle export         |
| Shell → Extension                          | `routes.json` `extensions[]` + slot props (`patientUuid`)     |
| Button/Link → Dashboard                    | URL param `?patientUuid=…` (read by `getPatientUuidFromUrl`)  |
| forms-registry → Dashboard                 | Imported array `CARE_CARD_FORMS`                              |
| Dashboard → FormPage                       | Props (`formDef`, `encounterUuid`, `readOnly`, callbacks, `key`) |
| FormPage → Dashboard                       | `onSaved(encounterUuid)` / `onCancel()` callbacks             |
| FormPage / Dashboard → OpenMRS backend     | `openmrsFetch` (REST) + `usePatient` (FHIR via shell)         |
| Any component → i18n                       | `useTranslation()` from `react-i18next`, keys under `careCradForm.*` |

---

## 7. Data & Type Boundaries

- **JSON → TS:** `carecard-schema.json` is the only untyped boundary;
  it is widened to a typed shape exactly once in `carecard-form.ts`.
- **Registry shape:** `CareCardFormDefinition` and `CareCardFormSchemaSubset`
  in `forms/carecard-forms-registry.ts` are the **only** types
  consumed by the dashboard. The renderer accepts a structurally-equal
  shape via its own local `CarecardFormDef` interface — keeping the
  renderer importable in isolation (it doesn't depend on the registry).
- **REST response shape:** `RawEncounter` (resource layer, internal),
  normalised to `CareCardEncounterRecord` for the dashboard.
- **FHIR Patient:** typed loosely (`FhirPatient = any`-ish) where used,
  because `@openmrs/esm-framework` returns a structural shape that
  varies by deployment. Demographic helpers in the dashboard guard
  every access with optional chaining.

---

## 8. Build, Test, Run

| Task              | Command                  | Notes                                            |
| ----------------- | ------------------------ | ------------------------------------------------ |
| Dev server        | `npm start`              | `openmrs develop` — proxies to `dev3.openmrs.org` |
| Production bundle | `npm run build`          | Webpack → `dist/`                                 |
| Unit tests        | `npm test`               | Jest + React Testing Library                     |
| E2E               | `npm run test:e2e`       | Playwright (`e2e/`)                              |
| Type-check        | `npm run typescript`     | `tsc --noEmit`                                   |
| Lint              | `npm run lint`           | ESLint                                            |

---

## 9. Extending the Module

- **Add a new tab:** add a new `pages[]` entry to
  `carecard-schema.json`, then add its label → encounter-type mapping
  to `ENCOUNTER_TYPE_BY_PAGE_LABEL` in `forms/carecard-forms-registry.ts`.
  No dashboard code changes are needed — the tab list is generated
  from `CARE_CARD_FORMS`.
- **Add a new question rendering:** extend the `switch` on
  `question.questionOptions.rendering` inside
  `carecard-form-page.component.tsx` and (if needed) the value
  serialiser in `buildEncounterPayload(...)`.
- **Add a new extension slot:** export a new lifecycle in `index.ts`
  and register it under `extensions[]` in `routes.json`.
- **Change history query:** edit
  `carecard-dashboard.resource.ts` — every consumer goes through that
  single function.

---

## 10. Important Conventions

- All translation keys live under `careCradForm.*` (legacy spelling
  preserved for backward compatibility — do not rename without
  migrating `translations/*.json`).
- All hard-coded encounter-type / form UUIDs live in **one** place
  (`forms/carecard-forms-registry.ts`). Don't re-introduce them
  elsewhere.
- Components never import the raw schema JSON — they go through
  `carecard-form.ts` or `CARE_CARD_FORMS`.
- The form renderer is stateless w.r.t. the dashboard: a fresh
  `CarecardFormPage` is mounted per `(formId, encounterUuid)` pair via
  the React `key` trick.
