# Care Card — Architecture, Technical & Flow Guide

> Definitive engineering reference for the Care Card microfrontend
> (`@openmrs/esm-template-app`, repo folder `patientdata`).
> This document explains **what** the app is, **how** it is wired into
> OpenMRS 3, **how** every module fits together, **how** data flows from
> the patient chart to the OpenMRS backend, and **how** to safely change
> any of it.
>
> Companion docs you may also want:
> [CARECARD-DEVELOPER-GUIDE.md](CARECARD-DEVELOPER-GUIDE.md) (extended dev guide),
> [README.md](../README.md), [README-CARECARD-ESM.md](../README-CARECARD-ESM.md),
> [CARECARD-SETUP-GUIDE.md](../CARECARD-SETUP-GUIDE.md),
> [CARECARD-DASHBOARD-INTEGRATION.md](../CARECARD-DASHBOARD-INTEGRATION.md),
> [CARECARD-ESM-MIGRATION.md](../CARECARD-ESM-MIGRATION.md),
> [TROUBLESHOOTING-GETIMPORTMAPOVERRIDEMAP.md](../TROUBLESHOOTING-GETIMPORTMAPOVERRIDEMAP.md).

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Repository Layout](#4-repository-layout)
5. [Microfrontend Contract — `index.ts` & `routes.json`](#5-microfrontend-contract--indexts--routesjson)
6. [Configuration System](#6-configuration-system)
7. [The Form Schema (`carecard-form.ts`)](#7-the-form-schema-carecard-formts)
8. [The Form Runtime (`carecard-form-page.component.tsx`)](#8-the-form-runtime-carecard-form-pagecomponenttsx)
9. [Patient-Chart Entry Points](#9-patient-chart-entry-points)
10. [End-to-End Flow Diagrams](#10-end-to-end-flow-diagrams)
11. [Patient UUID Resolution](#11-patient-uuid-resolution)
12. [Validation Subsystem](#12-validation-subsystem)
13. [Calculations, Initial Values & Prefill](#13-calculations-initial-values--prefill)
14. [Submission Pipeline & Backend Contract](#14-submission-pipeline--backend-contract)
15. [Internationalization (i18n)](#15-internationalization-i18n)
16. [Styling Conventions](#16-styling-conventions)
17. [Build, Run, Test](#17-build-run-test)
18. [Security & Threat Model](#18-security--threat-model)
19. [Performance Notes](#19-performance-notes)
20. [Extending the Application](#20-extending-the-application)
21. [Troubleshooting](#21-troubleshooting)
22. [File-by-File Quick Reference](#22-file-by-file-quick-reference)
23. [Glossary](#23-glossary)

---

## 1. Product Overview

The Care Card is an **OpenMRS 3 ESM (microfrontend) module** that delivers
the **HIV Care Initiation and Discontinuation form** as a first-class page
inside the OpenMRS Single-SPA shell.

It provides four user-visible capabilities:

1. A **standalone form page** mounted at `/openmrs/spa/patientdata` that
   renders the entire HIV Care Card schema using IBM Carbon Design System
   components.
2. **Patient-chart entry points** — a button extension and a sidebar link
   extension — that deep-link into the form for the currently selected
   patient.
3. A **TypeScript form schema** (`carecard-form.ts`), a 1:1 conversion of
   the original AMPATH-style [carecard.json](../carecard.json), used to
   drive rendering, validation, calculations, prefill, and submission.
4. A **custom form runtime** that replaces `@openmrs/esm-form-engine-lib`
   with a Carbon-native renderer tailored to the Care Card schema.

### 1.1 Form metadata

| Attribute      | Value                                          |
| -------------- | ---------------------------------------------- |
| Form name      | HIV Care Initiation and Discontinuation        |
| Form UUID      | `9083deaa-f37f-44b3-9046-b87b134711a1`         |
| Encounter type | `0b8d256c-e5df-4801-9653-b6ae5b6e906b`         |
| Encounter role | `a0b03050-c99b-11e0-9572-0800200c9a66`         |
| Processor      | `EncounterFormProcessor`                       |
| SPA route      | `${spaBase}patientdata`                        |

---

## 2. Tech Stack

| Layer            | Technology                                                          |
| ---------------- | ------------------------------------------------------------------- |
| Runtime shell    | OpenMRS 3 SPA (Single-SPA + import-map + app shell)                 |
| Module type      | ES Module microfrontend                                             |
| Language         | TypeScript 5.x                                                      |
| UI library       | React 18                                                            |
| Design system    | IBM Carbon (`@carbon/react`)                                        |
| Routing          | `react-router-dom` v6 + Single-SPA route mounting                   |
| Internationalization | `react-i18next` (dictionaries under [translations/](../translations)) |
| Data fetching    | `openmrsFetch` (REST + FHIR) from `@openmrs/esm-framework`          |
| Build            | Webpack via [webpack.config.js](../webpack.config.js) (`openmrs/default-webpack-config`) |
| Tests            | Jest (unit) + Playwright (E2E in [e2e/](../e2e/))                   |
| Lint / format    | ESLint + Prettier + Husky + lint-staged                             |
| Package manager  | Yarn 4 (Berry, configured in [package.json](../package.json))       |

### 2.1 Required OpenMRS backend modules

Declared in [src/routes.json](../src/routes.json):

- `fhir2 >= 1.2`
- `webservices.rest >= 2.2.0`

---

## 3. System Architecture

### 3.1 Conceptual diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     OpenMRS 3 App Shell                          │
│         (Single-SPA + import-map + ESM framework)                │
└──────────────────────────────────────────────────────────────────┘
                              │ loads via import-map
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│   @openmrs/esm-template-app   (THIS module — patientdata)        │
│                                                                  │
│   src/index.ts ── named lifecycle exports ────┐                  │
│   src/routes.json (declares pages/extensions) │                  │
│                                                ▼                 │
│   PAGES                            EXTENSIONS                    │
│   ─────                            ──────────                    │
│   • root  ─────► CarecardFormPage                                │
│                                                                  │
│   • careCradDashboardButton  → patient-chart-actions-slot        │
│   • careCradDashboardButton  → patient-chart-summary-dashboard…  │
│   • careCradSidebarLink      → patient-banner-extra-actions      │
│   • redBox / blueBox / brandBox → "Boxes" slot (demo)            │
└──────────────────────────────────────────────────────────────────┘
                              │
              openmrsFetch(...)│
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                 OpenMRS Backend (REST + FHIR)                    │
│   GET  /ws/fhir2/R4/Patient/{uuid}                               │
│   GET  /ws/rest/v1/obs?patient=&concept=                         │
│   GET  /ws/rest/v1/programenrollment?patient=                    │
│   GET  /ws/rest/v1/provider                                      │
│   GET  /ws/rest/v1/location                                      │
│   POST /ws/rest/v1/encounter                                     │
│   POST /ws/rest/v1/patient/{uuid}/identifier                     │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 How the shell discovers this module

1. [package.json](../package.json) declares `browser: dist/openmrs-esm-template-app.js`.
2. Webpack (`openmrs/default-webpack-config`) bundles
   [src/index.ts](../src/index.ts) and emits a Single-SPA-compatible ES
   module plus a `routes.json` sidecar.
3. The shell reads `routes.json` to learn:
   - **`pages[]`** — top-level routes the shell mounts
     (`route: "patientdata"` mounts `component: "root"` at
     `${spaBase}patientdata`).
   - **`extensions[]`** — named contributions the shell injects into
     **slots** owned by other microfrontends (the patient chart, the
     patient banner, etc.).
   - **`backendDependencies`** — required OpenMRS server modules.
4. Each named export in [src/index.ts](../src/index.ts) is wrapped in
   `getAsyncLifecycle(...)` so the shell lazy-loads the underlying React
   component on demand.

### 3.3 Runtime layering inside this module

```
┌──────────────────────────────────────────────────────┐
│ Presentation                                         │
│   • CarecardFormPage  (Tabs / Tile / Field)          │
│   • CarecardDashboardButton                          │
│   • CarecardSidebarLink                              │
└──────────────────────────────────────────────────────┘
                       │
┌──────────────────────────────────────────────────────┐
│ Form Engine (in carecard-form-page.component.tsx)    │
│   • Field renderer (rendering switch)                │
│   • validateField / validateAll                      │
│   • evalHideWhen (visibility)                        │
│   • Prefill / calculate (new Function evaluator)     │
│   • collectedPayload (memoized payload builder)      │
│   • handleSubmit (network orchestration)             │
└──────────────────────────────────────────────────────┘
                       │
┌──────────────────────────────────────────────────────┐
│ Schema                                               │
│   • careCradFormSchema (carecard-form.ts)            │
│   • carecard-form.utils.ts (pure helpers)            │
└──────────────────────────────────────────────────────┘
                       │
┌──────────────────────────────────────────────────────┐
│ Platform                                             │
│   • @openmrs/esm-framework (openmrsFetch, navigate,  │
│     usePatient, useSession, showSnackbar, config)    │
│   • @carbon/react primitives                         │
│   • react-i18next                                    │
└──────────────────────────────────────────────────────┘
```

---

## 4. Repository Layout

```
patientdata/
├── carecard.json                     # Original AMPATH form definition (reference)
├── package.json                      # Module manifest + scripts
├── webpack.config.js                 # Wraps openmrs/default-webpack-config
├── tsconfig.json
├── playwright.config.ts              # E2E config
├── jest.config.js                    # Unit-test config
├── translations/                     # i18n JSON (en, fr, es, am, he, km)
├── e2e/                              # Playwright suite (core/fixtures/pages/specs)
└── src/
    ├── index.ts                      # ESM entry: lifecycle exports
    ├── routes.json                   # Pages / extensions / backend deps
    ├── config-schema.ts              # defineConfigSchema input
    ├── declarations.d.ts             # *.scss & misc type shims
    ├── root.component.tsx            # Page wrapper → renders CarecardFormPage
    ├── root.scss
    ├── carecard-form.ts              # The HIV Care Card schema (TS)
    ├── carecard-form-page/           # Form runtime (custom Carbon renderer)
    │   ├── carecard-form-page.component.tsx
    │   ├── carecard-form-page.scss
    │   └── carecard-form-page.test.tsx
    ├── carecard-dashboard-button/    # Patient-chart action button extension
    ├── carecard-sidebar-link/        # Patient-banner sidebar link extension
    ├── boxes/                        # Demo Boxes slot + Red/Blue/Brand box extensions
    ├── greeter/                      # Reference component (config consumer demo)
    ├── patient-getter/               # Reference component (FHIR fetch demo)
    ├── resources/                    # Misc visual resources component
    └── forms/
        ├── carecard-form.utils.ts    # Pure helpers over careCradFormSchema
        └── index.ts
```

The `boxes/`, `greeter/`, `patient-getter/`, and `resources/` folders are
inherited from the upstream `openmrs-esm-template-app` and serve as
reference / scaffolding examples. The Care Card **production surface** is:

- [src/index.ts](../src/index.ts)
- [src/routes.json](../src/routes.json)
- [src/root.component.tsx](../src/root.component.tsx)
- [src/carecard-form.ts](../src/carecard-form.ts)
- [src/carecard-form-page/carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx)
- [src/carecard-dashboard-button/carecard-dashboard-button.component.tsx](../src/carecard-dashboard-button/carecard-dashboard-button.component.tsx)
- [src/carecard-sidebar-link/carecard-sidebar-link.component.tsx](../src/carecard-sidebar-link/carecard-sidebar-link.component.tsx)
- [src/forms/carecard-form.utils.ts](../src/forms/carecard-form.utils.ts)

---

## 5. Microfrontend Contract — `index.ts` & `routes.json`

[src/index.ts](../src/index.ts) is the single contract between the app shell
and this module. It does three things:

1. **Defines the config schema** in `startupApp()` via `defineConfigSchema`.
2. **Exports `importTranslation`** — a `require.context` over
   `../translations` that the shell uses to lazy-load language files.
3. **Exports lazy lifecycle functions** for every page and extension named
   in [src/routes.json](../src/routes.json).

### 5.1 Lifecycle export table

| Export                            | Backed by                                                                                                          | Used as          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `root`                            | [src/root.component.tsx](../src/root.component.tsx)                                                                | Page             |
| `careCradFormPage`                | [src/carecard-form-page/carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx) | (reserved page)  |
| `careCradDashboardButton`         | [src/carecard-dashboard-button/carecard-dashboard-button.component.tsx](../src/carecard-dashboard-button/carecard-dashboard-button.component.tsx) | Extension        |
| `careCradSidebarLink`             | [src/carecard-sidebar-link/carecard-sidebar-link.component.tsx](../src/carecard-sidebar-link/carecard-sidebar-link.component.tsx) | Extension        |
| `redBox` / `blueBox` / `brandBox` | [src/boxes/extensions/](../src/boxes/extensions)                                                                   | Demo extensions  |

> **Naming note:** `careCrad*` is a typo carried over from earlier work
> (intended as `careCard*`). The export name in `index.ts` and the
> `component` string in `routes.json` must match — do not rename one
> without the other.

### 5.2 `routes.json` page mount

```jsonc
"pages": [
  { "component": "root", "route": "patientdata" }
]
```

This mounts `Root` (which renders `<CarecardFormPage />`) at
`${spaBase}/patientdata`.

### 5.3 `routes.json` extensions

| Name                    | Component                 | Slot                                    | Order |
| ----------------------- | ------------------------- | --------------------------------------- | ----- |
| Care Card Button        | `careCradDashboardButton` | `patient-chart-actions-slot`            | 2     |
| Care Card Summary Button| `careCradDashboardButton` | `patient-chart-summary-dashboard-slot`  | 1     |
| Care Card Sidebar Link  | `careCradSidebarLink`     | `patient-banner-extra-actions`          | 1     |
| Red / Blue / Brand box  | `redBox` / `blueBox` / `brandBox` | `Boxes`                         | —     |

The two button mounts give the user two visible call-to-actions inside the
chart. The sidebar link appears in the patient banner.

---

## 6. Configuration System

[src/config-schema.ts](../src/config-schema.ts) is consumed by the
`@openmrs/esm-framework` config system. Today it carries inherited demo
keys (`casualGreeting`, `whoToGreet`) for the `Greeter` reference
component. Add new Care Card admin-tunables here so they are overridable
from the shell's config UI.

### 6.1 Pattern for adding a config key

```ts
import { Type, validator } from '@openmrs/esm-framework';

export const configSchema = {
  // existing keys...
  defaultEncounterType: {
    _type: Type.UUID,
    _default: '0b8d256c-e5df-4801-9653-b6ae5b6e906b',
    _description: 'Encounter type used when saving the Care Card.',
  },
};

export type Config = {
  casualGreeting: boolean;
  whoToGreet: string[];
  defaultEncounterType: string;
};
```

Consume with `useConfig<Config>()` from `@openmrs/esm-framework` inside any
React component.

---

## 7. The Form Schema (`carecard-form.ts`)

[src/carecard-form.ts](../src/carecard-form.ts) is the **single source of
truth** for the form's structure. It is a TypeScript object literal
exported as `careCradFormSchema` and is a faithful conversion of
[carecard.json](../carecard.json).

### 7.1 Top-level shape

```ts
{
  name, description, version, published, retired,
  processor: 'EncounterFormProcessor',
  encounterType: '<uuid>',
  uuid: '<form uuid>',
  meta: { programs: { uuid, isEnrollment } },
  pages: Page[]
}
```

### 7.2 Page → Section → Question hierarchy

```
pages[]
└─ sections[]
   └─ questions[]
      ├─ id
      ├─ label
      ├─ type:        'obs' | 'patientIdentifier' | 'control' |
      │                'encounterProvider' | 'encounterLocation' | ...
      ├─ required, readonly
      ├─ hide:        { hideWhenExpression: '<JS expr>' }
      ├─ validators:  [{ type, allowFutureDates, failureMessage,
      │                  failsWhenExpression, ... }]
      └─ questionOptions:
           ├─ rendering:      'text' | 'select' | 'radio' | 'date' |
           │                  'number' | 'textarea' | 'ui-select-extended'
           ├─ concept:        '<obs concept uuid>'        (when type='obs')
           ├─ identifierType: '<uuid>'                    (when type='patientIdentifier')
           ├─ answers:        [{ concept, label }]
           ├─ min / max / step
           ├─ calculate:      { calculateExpression: '<JS expr>' }
           └─ initialValue:   '<JS expr returning value or Promise>'
```

### 7.3 Question types → encounter payload mapping

| `type`              | Render                                      | Submit                                              |
| ------------------- | ------------------------------------------- | --------------------------------------------------- |
| `obs`               | Renders by `rendering` using `concept` + `answers` | Becomes `obs[]` entry on the encounter payload      |
| `patientIdentifier` | Text input; uses `identifierType`           | POSTed separately to `/patient/{uuid}/identifier`   |
| `control`           | Read-only / display field driven by `calculate` | Not submitted (UI-only)                         |
| `encounterProvider` | Select populated from `/provider` REST      | `encounterProviders[].provider`                     |
| `encounterLocation` | Select populated from `/location` REST      | `encounter.location`                                |

### 7.4 Schema helpers — [src/forms/carecard-form.utils.ts](../src/forms/carecard-form.utils.ts)

Pure functions over the schema (no React, no I/O):

- Walkers: `getAllQuestions`, `getQuestionById`, `getQuestionsByType`,
  `getQuestionsByConceptId`, `getQuestionsBySection`, `getSectionsByPage`.
- Filters: `getValidatedQuestions`, `getCalculatedFields`,
  `getConditionalFields`, `getSelectQuestions`, `getRequiredQuestions`,
  `getReadonlyQuestions`, `getQuestionsByRendering`,
  `getQuestionsWithInitialValues`.
- Counts / stats: `countTotalQuestions`, `countValidatedQuestions`,
  `countCalculatedFields`, `countConditionalFields`,
  `getFormStatistics`, `getFormMetadata`,
  `getAllAnswerConcepts`, `getUniqueConceptsInForm`.
- Diagnostics: `validateQuestionStructure`, `searchQuestionsByLabel`,
  `exportFormAsJSON`, `logFormStructure`.

Use them for reflection / debug tooling, schema unit tests, or admin
views. The runtime form page does **not** depend on them — it walks the
schema directly.

---

## 8. The Form Runtime (`carecard-form-page.component.tsx`)

[src/carecard-form-page/carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx)
is the largest and most important file. It is a self-contained Carbon
renderer for `careCradFormSchema` and deliberately does **not** use
`@openmrs/esm-form-engine-lib` so behavior is fully controlled here.

### 8.1 Internal modules at a glance

| Concern                  | Helpers / hooks                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Patient UUID resolution  | `getPatientUuidFromUrl`, `popstate` + `single-spa:routing-event` listeners, prop fallback                    |
| Reference-data load      | One-time `useEffect` fetches `/provider` and `/location` lists                                               |
| Patient prefill          | Per-patient `useEffect` running `evalExpression` for `calculate` / `initialValue`, falling back to latest obs |
| Field rendering          | `Field` subcomponent — switches on `rendering`                                                               |
| Validation               | `validateField`, `validateAll`, `findFirstInvalidPage`                                                       |
| Conditional visibility   | `evalHideWhen`                                                                                               |
| Payload assembly         | `collectedPayload` memo (`obs[]` + `identifiers[]`)                                                          |
| Submit                   | `handleSubmit` → POST `/encounter`, then POST identifiers                                                    |
| Feedback                 | Carbon `InlineNotification`, `InlineLoading`, framework `showSnackbar`                                       |

### 8.2 State model

```ts
const [activePatientUuid, setActivePatientUuid] = useState<string | undefined>(...);
const [manualPatientUuid, setManualPatientUuid] = useState<string>('');
const [values, setValues] = useState<Record<string, string>>({});  // form state
const [errors, setErrors] = useState<Record<string, string>>({});  // per-field error messages
const [activePageIndex, setActivePageIndex] = useState(0);
const [preloading, setPreloading] = useState(false);
const [preloadedFor, setPreloadedFor] = useState<string | null>(null); // guards re-prefill
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);              // form-level error
const [providerOptions, setProviderOptions] = useState<...>([]);
const [locationOptions, setLocationOptions] = useState<...>([]);
```

### 8.3 Field rendering switch

The `Field` subcomponent maps `questionOptions.rendering` to a Carbon
input:

| `rendering`                           | Component                          |
| ------------------------------------- | ---------------------------------- |
| `select` / `ui-select-extended`       | `<Select>` + `<SelectItem>`        |
| `radio`                               | `<RadioButtonGroup>` + `<RadioButton>` |
| `date`                                | `<DatePicker>` + `<DatePickerInput>` (honors `noFutureDates`) |
| `number`                              | `<NumberInput>` (honors `min` / `max` / `step`) |
| `textarea`                            | `<TextArea>`                       |
| (default)                             | `<TextInput>`                      |

Inline Carbon error text is suppressed in favor of a custom
`tooltipError` span so per-field errors render as a tooltip rather than
inline reflow.

### 8.4 Layout

```
<Form>
  <Tabs selectedIndex={activePageIndex}>
    <TabList>{ PAGES.map(page → <Tab>) }</TabList>
    <TabPanels>
      { PAGES.map(page →
        <TabPanel>
          <Stack>
            { page.sections.map(section →
              <Tile>
                <h2>{section.label}</h2>
                <Grid>
                  { section.questions.map(q → <Column><Field q .../></Column>) }
                </Grid>
              </Tile>
            ) }
            <ButtonSet> Previous / Next or Save </ButtonSet>
          </Stack>
        </TabPanel>
      ) }
    </TabPanels>
  </Tabs>
  <ButtonSet>Cancel</ButtonSet>
</Form>
```

---

## 9. Patient-Chart Entry Points

### 9.1 `CarecardDashboardButton`

[src/carecard-dashboard-button/carecard-dashboard-button.component.tsx](../src/carecard-dashboard-button/carecard-dashboard-button.component.tsx)

- Receives `patientUuid` from the slot's extension props.
- Uses `usePatient(patientUuid)` to confirm the patient is loaded.
- On click, calls
  `navigate({ to: '${spaBase}patientdata?patientUuid=...' })`.
- Renders nothing if `patientUuid` is missing — keeps the chart clean.
- Mounted into both `patient-chart-actions-slot` and
  `patient-chart-summary-dashboard-slot` (see [routes.json](../src/routes.json)).

### 9.2 `CarecardSidebarLink`

[src/carecard-sidebar-link/carecard-sidebar-link.component.tsx](../src/carecard-sidebar-link/carecard-sidebar-link.component.tsx)

Same idea but rendered as a `react-router-dom` `<Link>` inside the
patient banner extras slot, with a Carbon `Document` icon.

Both components target the **same URL**. The form page picks up
`patientUuid` from `?patientUuid=` or, when launched from inside a
patient chart, from `/patient/{uuid}/chart/...` in the URL path.

---

## 10. End-to-End Flow Diagrams

### 10.1 User journey: open the form from a patient chart

```
[User in Patient Chart]
        │  clicks "Care Card" button (extension)
        ▼
CarecardDashboardButton.onClick
        │  navigate({ to: `${spaBase}patientdata?patientUuid=<uuid>` })
        ▼
[Single-SPA route change]
        │  shell sees the new URL → mounts the page named "root"
        ▼
src/root.component.tsx
        │  renders <CarecardFormPage />
        ▼
CarecardFormPage (mount)
        │ 1. resolves patientUuid (prop → URL path → URL search)
        │ 2. fires reference-data fetches (providers, locations)
        │ 3. fires per-patient prefill
        │     (FHIR patient + latest obs + program enrollment)
        │ 4. evaluates calculate / initialValue expressions
        │ 5. merges into `values` (user input wins on subsequent renders)
        ▼
[User fills tabs]
        │  Field → onChange → setValues / clear field error
        ▼
[User clicks "Save Care Card" on last tab]
        │  validateAll → if errors: jump to first invalid page
        │  collectedPayload → POST /ws/rest/v1/encounter
        │  for each identifier → POST /ws/rest/v1/patient/{uuid}/identifier
        ▼
showSnackbar (success or error)
```

### 10.2 Component interaction sequence

```
Browser              ChartButton        Shell             FormPage           OpenMRS REST/FHIR
   │ click             │                  │                   │                    │
   │──────────────────►│ navigate(...)    │                   │                    │
   │                   │─────────────────►│ route change      │                    │
   │                   │                  │──────────────────►│ mount              │
   │                   │                  │                   │ GET /Patient/{u}   │
   │                   │                  │                   │───────────────────►│
   │                   │                  │                   │ GET /provider      │
   │                   │                  │                   │───────────────────►│
   │                   │                  │                   │ GET /location      │
   │                   │                  │                   │───────────────────►│
   │                   │                  │                   │ GET /obs (per Q)   │
   │                   │                  │                   │───────────────────►│
   │                   │                  │                   │ GET /programenroll │
   │                   │                  │                   │───────────────────►│
   │                   │                  │                   │◄─── responses ─────│
   │                   │                  │                   │ render tabs        │
   │ types / clicks ──►│                  │                   │ setValues          │
   │ click Save ──────►│                  │                   │ validateAll        │
   │                   │                  │                   │ POST /encounter    │
   │                   │                  │                   │───────────────────►│
   │                   │                  │                   │ POST /identifier   │
   │                   │                  │                   │───────────────────►│
   │                   │                  │                   │ showSnackbar       │
```

### 10.3 Submit-time data flow

```
values: Record<questionId, string>
        │
        │ memo: collectedPayload
        ▼
{ obs:         [{ concept, value }],
  identifiers: [{ identifierType, identifier }] }
        │
        │ + session.currentProvider / sessionLocation (fallbacks)
        ▼
POST /ws/rest/v1/encounter        ──► encounter created
        │
        ▼ for-each identifier
POST /ws/rest/v1/patient/{uuid}/identifier   (best-effort, non-fatal)
        │
        ▼
Carbon snackbar (success | error)
```

---

## 11. Patient UUID Resolution

The form page resolves the active patient with a **prioritized fallback
chain**:

1. `propPatientUuid` from the extension framework (when the page is
   rendered inside a slot that supplies it).
2. `/patient/<uuid>/chart/...` parsed from `window.location.pathname`.
3. `?patientUuid=<uuid>` query string.
4. Manual entry — when none of the above is available the page renders a
   `TextInput` that lets the user paste a patient UUID and load the form.

A `popstate` listener and a `single-spa:routing-event` listener keep the
active UUID in sync if the URL changes while the form is mounted.

---

## 12. Validation Subsystem

`validateField(q, value, values)` supports:

| Validator            | Behavior                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| **required**         | Top-level `required: true` or a `{ type: 'required' }` validator.                                       |
| **date**             | Parses the value; honors `allowFutureDates: 'false'` (string or boolean).                               |
| **range**            | Combined with `questionOptions.min` / `.max`.                                                           |
| **js_expression**    | `failsWhenExpression` evaluated against the current `values` map; each question id is a parameter, plus helpers `isEmpty(x)` and the field's own `value`. |
| **Implicit numeric** | When `rendering === 'number'` and `min` / `max` exist without an explicit `range` validator.            |

`validateAll()` runs `validateField` for every question on every page,
**skipping hidden fields** (those whose `hide.hideWhenExpression`
evaluates to `true`). If errors remain, `findFirstInvalidPage` returns
the first page index containing an invalid field, and the UI auto-jumps
to it.

Errors render as a tooltip-style popup (custom `tooltipError` span)
instead of the Carbon inline message — see the `Field` component for the
implementation.

---

## 13. Calculations, Initial Values & Prefill

When a patient becomes active, the page runs **one** async pass:

1. Fetches the FHIR patient record:
   `GET /ws/fhir2/R4/Patient/{uuid}`.
2. For each question, in parallel:
   - If `questionOptions.calculate.calculateExpression` or
     `initialValue` exists → evaluates it via `new Function(...)` with
     this evaluation context:

     ```
     parameters: patient, api, resolve, calcBMI,
                 getProgramEnrollmentDate,
                 ...all current form value keys
     ```

     Helpers exposed to expressions:
     - `api.getLatestObs(patientId, conceptUuid)` — memoized REST call to
       `/ws/rest/v1/obs?patient=&concept=&v=custom:(uuid,obsDatetime,value)`.
       Picks the most recent obs by `obsDatetime` and normalizes the
       value into `{ valueText, valueNumeric, valueDateTime,
       valueCodeableConcept }`.
     - `getProgramEnrollmentDate(patientId, programUuid)` — memoized
       call to `/ws/rest/v1/programenrollment`.
     - `calcBMI(height, weight)` — local helper (height in cm, weight in
       kg).
     - `resolve(...)` — wraps a value or Promise into a Promise. Lets
       schema authors write
       `resolve(getProgramEnrollmentDate(patient.id, '<uuid>'))`.

   - If `type === 'obs'` and no expression succeeded → fetches the
     latest obs for the question's concept and coerces the value into
     the right shape for the rendering (`select`/`radio` → concept uuid;
     `date` → ISO date; `number` → numeric; default → text).

3. Defaults `encounterProvider` to `session.currentProvider.uuid` and
   `encounterLocation` to `session.sessionLocation.uuid` when the schema
   leaves them blank.
4. Merges into `values` while **preserving anything the user already
   typed** (user input wins over preloads).

### 13.1 Memoization

- A per-patient `Map<conceptUuid, Promise<NormalizedObs | null>>` caches
  obs fetches so a question that asks for the same concept twice (or
  multiple expressions that reference it) only triggers one HTTP call.
- `preloadedFor` guards against the prefill effect re-running for the
  same patient on every re-render.

---

## 14. Submission Pipeline & Backend Contract

`handleSubmit` in [carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx):

1. `e.preventDefault()` and clears the form-level error.
2. Re-runs `validateAll`. If any errors:
   - `setErrors(errs)`,
   - `setActivePageIndex(findFirstInvalidPage(errs))`,
   - sets a top-level error message,
   - aborts.
3. Builds `collectedPayload` from `values`:
   - `type: 'obs'` → `{ concept, value }` with value coercion:
     - `'true'` / `'false'` → boolean.
     - `rendering === 'number'` → `Number(...)`.
     - `rendering === 'date'` → ISO datetime (timezone-corrected).
   - `type: 'patientIdentifier'` → `{ identifierType, identifier }`.
   - **Hidden** fields (per `hideWhenExpression`) are excluded.
4. Reads encounter provider / location from form values, falling back to
   session.
5. POSTs the encounter:

   ```json
   {
     "patient":            "<uuid>",
     "encounterType":      "0b8d256c-e5df-4801-9653-b6ae5b6e906b",
     "form":               "9083deaa-f37f-44b3-9046-b87b134711a1",
     "encounterDatetime":  "<now ISO>",
     "obs":                [{ "concept": "...", "value": ... }, ...],
     "location":           "<uuid>",
     "encounterProviders": [{ "provider": "<uuid>",
                              "encounterRole": "a0b03050-c99b-11e0-9572-0800200c9a66" }]
   }
   ```

6. POSTs each identifier to
   `/ws/rest/v1/patient/{uuid}/identifier`. Failures here are **logged
   but non-fatal** — the encounter is already saved.
7. Calls `showSnackbar` with success or error. Server error bodies are
   unwrapped via `responseBody.error.message` (or `.error.detail`) for
   human-friendly messages.

### 14.1 REST / FHIR endpoint inventory

| Method | URL                                                    | Purpose                                  |
| ------ | ------------------------------------------------------ | ---------------------------------------- |
| GET    | `/ws/fhir2/R4/Patient/{uuid}`                          | Patient demographics for prefill         |
| GET    | `/ws/rest/v1/obs?patient=&concept=&v=custom:(...)`     | Latest obs for a concept                 |
| GET    | `/ws/rest/v1/programenrollment?patient=&v=custom:(...)`| Program enrollment lookup                |
| GET    | `/ws/rest/v1/provider?v=custom:(uuid,display,person:(display))&limit=500` | Provider dropdown source |
| GET    | `/ws/rest/v1/location?v=custom:(uuid,display)&limit=500` | Location dropdown source              |
| POST   | `/ws/rest/v1/encounter`                                | Save encounter (obs included)            |
| POST   | `/ws/rest/v1/patient/{uuid}/identifier`                | Save patient identifiers (best-effort)   |

---

## 15. Internationalization (i18n)

- Translations live in [translations/](../translations) — `en.json`,
  `fr.json`, `es.json`, `am.json`, `he.json`, `km.json`.
- The shell loads the right dictionary via the
  `importTranslation = require.context('../translations', false, /.json$/, 'lazy')`
  exported from [src/index.ts](../src/index.ts).
- Components use `useTranslation()` and `t('key', 'fallback')` — the
  fallback is always the English source string, which doubles as the
  extraction key.
- New strings are extracted with `yarn extract-translations` (configured
  in [tools/i18next-parser.config.js](../tools/i18next-parser.config.js)).

---

## 16. Styling Conventions

- Each component owns a sibling `.scss` file imported as a CSS module:
  `import styles from './foo.scss'; <div className={styles.bar} />`.
- Type shims for `*.scss` live in [src/declarations.d.ts](../src/declarations.d.ts).
- The visual primitives come from `@carbon/react` — prefer Carbon
  components and tokens over custom CSS where possible.
- Global page styles live in [src/root.scss](../src/root.scss).

---

## 17. Build, Run, Test

| Command                    | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `yarn start`               | `openmrs develop` — runs the SPA shell with this module live-reloaded    |
| `yarn serve`               | `webpack serve --mode=development` — bare module dev server              |
| `yarn build`               | Production webpack build → `dist/openmrs-esm-template-app.js`            |
| `yarn analyze`             | Production build with bundle analyzer                                    |
| `yarn lint`                | ESLint over `src/**/*.{js,jsx,ts,tsx}` (zero warnings allowed)           |
| `yarn typescript`          | `tsc --noEmit` type check                                                |
| `yarn prettier`            | Prettier write over `src/**/*.{ts,tsx}`                                  |
| `yarn test`                | Jest unit tests (`--passWithNoTests`)                                    |
| `yarn coverage`            | Jest with coverage                                                       |
| `yarn test-e2e`            | Playwright suite (see [e2e/](../e2e/) and [playwright.config.ts](../playwright.config.ts)) |
| `yarn extract-translations`| Run i18next-parser to refresh the en/* dictionaries                      |
| `yarn verify`              | `turbo lint typescript coverage`                                         |

### 17.1 Webpack note

[webpack.config.js](../webpack.config.js) wraps the OpenMRS default
config and disables the `webpack-dev-server` runtime-error overlay so
unrelated host-shell errors (e.g. devtools' `getImportMapOverrideMap`
mismatch) don't cover this module's UI. Compile errors still surface.
See [TROUBLESHOOTING-GETIMPORTMAPOVERRIDEMAP.md](../TROUBLESHOOTING-GETIMPORTMAPOVERRIDEMAP.md).

---

## 18. Security & Threat Model

### 18.1 Trust boundaries

| Boundary               | Treated as                                                                |
| ---------------------- | ------------------------------------------------------------------------- |
| OpenMRS shell session  | Trusted (provides current user + provider + location)                     |
| `careCradFormSchema`   | Trusted, code-reviewed source — embedded at build time                    |
| OpenMRS REST / FHIR    | Trusted backend, but treat response shapes defensively (we do)            |
| URL / query string     | Untrusted input — only `patientUuid` is read, and is validated by the FHIR call |
| User form input        | Untrusted — never `eval`'d; only serialized into REST JSON                |

### 18.2 `new Function(...)` usage

The runtime evaluates schema expressions
(`calculateExpression`, `initialValue`, `failsWhenExpression`,
`hideWhenExpression`) via `new Function(...)`. This is safe **because
the expressions are part of the bundled schema**, not user input.

**Rule:** Never populate any expression field from user input or remote,
unverified data. If the schema is ever loaded dynamically in the future,
those expressions must be sandboxed (e.g. via a restricted expression
evaluator) before evaluation.

### 18.3 Other notes

- All HTTP traffic uses `openmrsFetch`, which inherits the shell's CSRF
  / session handling — do not bypass it with `fetch`.
- Identifiers and obs values are sent as JSON to the OpenMRS REST API;
  the backend is the source of truth for authorization (encounter
  privileges, identifier-type privileges).
- The form deliberately does not log PHI to the console in production
  paths; the only `console.log` is the post-save encounter id (review
  before shipping if the deployment is sensitive).

---

## 19. Performance Notes

- **Reference-data fetches** (`/provider`, `/location`) run **once per
  mount** and are independent of patient changes.
- **Per-patient prefill** is gated by `preloadedFor` so it runs at most
  once per patient even if React re-renders.
- **Obs prefill** is parallelized with `Promise.all` over questions,
  and shares a single `Map<conceptUuid, Promise<...>>` cache so multiple
  questions referencing the same concept only fetch it once.
- The renderer iterates the schema synchronously; complexity is
  O(pages × sections × questions) per render. This is fine for the
  current schema size (~tens of questions per page), but very large
  schemas should consider virtualization.
- Carbon's `<Tabs>` keeps all `<TabPanel>`s mounted unless told
  otherwise — current behavior is intentional so validation can jump to
  any tab without re-mounting state.

---

## 20. Extending the Application

### 20.1 Add a new question

1. Edit the appropriate `pages[].sections[].questions[]` array in
   [src/carecard-form.ts](../src/carecard-form.ts).
2. Pick `type` (`obs` / `control` / `patientIdentifier` /
   `encounterProvider` / `encounterLocation`) and
   `questionOptions.rendering`.
3. Add `validators` / `calculate` / `initialValue` / `hide` as needed.
4. The renderer picks it up automatically — no UI changes required.

### 20.2 Add a new page entry point in another slot

1. Add an entry to `extensions[]` in [src/routes.json](../src/routes.json)
   referencing an existing exported component (or add a new export to
   [src/index.ts](../src/index.ts) backed by a new component file).
2. Use the slot name from the host module's documentation.

### 20.3 Add a new admin-tunable config value

1. Add it to `configSchema` in
   [src/config-schema.ts](../src/config-schema.ts) and extend the
   `Config` type.
2. Read it in components via `useConfig<Config>()`.

### 20.4 Replace or augment the encounter submission

The submission pipeline is `handleSubmit` in
[carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx).
Keep the build of `payload` schema-driven — extend `collectedPayload`
rather than hard-coding fields at submit time.

### 20.5 Add a new rendering type

1. Add a `case '<your-rendering>':` branch in the `Field` switch.
2. Make sure it calls `onChange(id, stringValue)` so the rest of the
   pipeline (validation, payload assembly) keeps working unchanged.
3. If it needs dynamic options, add a loader in the
   `useEffect`-once block alongside the provider/location loaders, and
   surface it via `dynamicAnswersFor(q)`.

---

## 21. Troubleshooting

| Symptom                                         | Likely cause / fix                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| "Care Card" button not visible in chart         | Slot name in `routes.json` no longer matches the host. Confirm the host's `extensions` slot.                       |
| Form mounts but shows the UUID picker           | Patient UUID could not be resolved. Open from a patient chart, or pass `?patientUuid=`.                            |
| Calculated field stays empty                    | Inspect the network call to `/ws/rest/v1/obs` or FHIR; check the `calculateExpression` for typos. The expression runs through `new Function` — a thrown error silently falls back. |
| 400 on save                                     | The full server error is surfaced in the snackbar (extracted from `responseBody.error.message`). Common causes: missing required obs concept, wrong concept UUID for the rendering, or no provider/location available. |
| `getImportMapOverrideMap` overlay               | Unrelated devtools error from the host shell; suppressed in [webpack.config.js](../webpack.config.js). See [TROUBLESHOOTING-GETIMPORTMAPOVERRIDEMAP.md](../TROUBLESHOOTING-GETIMPORTMAPOVERRIDEMAP.md). |
| Provider / location dropdowns are empty         | `/ws/rest/v1/provider` or `/location` returned an empty list, errored, or the user lacks privileges. Try a privileged login. |
| Identifier silently not saved                   | Identifier POST is best-effort and non-fatal. Check the browser network tab for the `/identifier` response and confirm the identifier type uuid in the schema is correct for the deployment. |
| `careCrad*` typo                                | Intentional historical name. Don't rename without coordinating `routes.json` + `index.ts` together.                |

---

## 22. File-by-File Quick Reference

| File                                                                                                                                                                                                                                            | Responsibility                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| [src/index.ts](../src/index.ts)                                                                                                                                                                                                                  | ESM entry — lifecycle exports, config wiring, translations |
| [src/routes.json](../src/routes.json)                                                                                                                                                                                                            | Pages / extensions / backend deps manifest                 |
| [src/config-schema.ts](../src/config-schema.ts)                                                                                                                                                                                                  | Admin-tunable config schema + `Config` type                |
| [src/root.component.tsx](../src/root.component.tsx)                                                                                                                                                                                              | Page wrapper that mounts `CarecardFormPage`                |
| [src/carecard-form.ts](../src/carecard-form.ts)                                                                                                                                                                                                  | The HIV Care Card form schema (TS)                         |
| [src/forms/carecard-form.utils.ts](../src/forms/carecard-form.utils.ts)                                                                                                                                                                          | Pure helpers over the schema                               |
| [src/carecard-form-page/carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx)                                                                                                                            | Carbon-native form runtime — validation, prefill, submit   |
| [src/carecard-dashboard-button/carecard-dashboard-button.component.tsx](../src/carecard-dashboard-button/carecard-dashboard-button.component.tsx)                                                                                                | "Care Card" button extension                               |
| [src/carecard-sidebar-link/carecard-sidebar-link.component.tsx](../src/carecard-sidebar-link/carecard-sidebar-link.component.tsx)                                                                                                                | Patient banner sidebar link extension                      |
| [src/boxes/](../src/boxes)                                                                                                                                                                                                                       | Demo Boxes slot + Red/Blue/Brand box extensions            |
| [src/greeter/](../src/greeter)                                                                                                                                                                                                                   | Reference component (config consumer demo)                 |
| [src/patient-getter/](../src/patient-getter)                                                                                                                                                                                                     | Reference component (FHIR fetch demo with SWR)             |
| [translations/](../translations)                                                                                                                                                                                                                 | i18n JSON dictionaries                                     |
| [webpack.config.js](../webpack.config.js)                                                                                                                                                                                                        | Webpack — extends `openmrs/default-webpack-config`         |
| [package.json](../package.json)                                                                                                                                                                                                                  | Module manifest, scripts, peer deps                        |
| [carecard.json](../carecard.json)                                                                                                                                                                                                                | Original AMPATH form definition (reference, not loaded at runtime) |

---

## 23. Glossary

- **App shell** — the OpenMRS 3 host application that loads
  microfrontends from an import-map.
- **ESM (here)** — "Ecosystem of Single-page Modules" — OpenMRS's term
  for ES Module microfrontends; **not** a generic JavaScript module
  format reference.
- **Extension** — a named React component contributed to a slot owned by
  another microfrontend.
- **Slot** — an extension point exposed by a microfrontend (e.g.
  `patient-chart-actions-slot`).
- **Lifecycle** — Single-SPA's `bootstrap` / `mount` / `unmount` trio,
  produced here by `getAsyncLifecycle`.
- **Concept UUID** — OpenMRS dictionary identifier, the canonical key
  for an obs.
- **Encounter** — a clinical event grouping obs, providers, location,
  form, and patient.
- **Encounter role** — the role a provider plays on an encounter
  (the Care Card uses the default "Unknown" role uuid).
- **Form schema** — the structured object describing pages, sections,
  questions, validators, and expressions.
- **Calculate expression** — JS expression bundled with a question that
  computes its value from the patient context and other form values.
- **Hide-when expression** — JS expression that, when truthy, hides the
  question from the UI and excludes it from submission.

---

*End of guide.*
