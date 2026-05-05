# Care Card — Developer Architecture, Technical & Flow Guide

> A complete reference for engineers maintaining or extending the Care Card
> microfrontend (`@openmrs/esm-template-app` / `patientdata`). It explains
> what the app is, how it plugs into OpenMRS 3, the runtime architecture,
> module-by-module responsibilities, the data and control flow, the form
> engine internals, and the conventions you must follow when changing it.

---

## 1. What is the Care Card?

The Care Card is an **OpenMRS 3 ESM (microfrontend) module** that delivers the
**HIV Care Initiation and Discontinuation form** as a first-class page inside
the OpenMRS Single-SPA shell.

It provides:

1. A **standalone form page** (`/openmrs/spa/patientdata`) that renders the
   entire HIV Care Card schema as Carbon Design System UI.
2. **Patient-chart entry points** (a button and a sidebar link) that deep-link
   into the form for the currently selected patient.
3. A **TypeScript form schema** (`carecard-form.ts`) — a 1:1 conversion of the
   original `carecard.json` — used to drive rendering, validation,
   calculations, prefill, and submission.
4. A **custom form runtime** (in `carecard-form-page.component.tsx`) that
   replaces `@openmrs/esm-form-engine-lib` with a Carbon-native renderer
   tailored to this schema.

Form metadata:

| Attribute       | Value                                  |
| --------------- | -------------------------------------- |
| Form name       | HIV Care Initiation and Discontinuation |
| Form UUID       | `9083deaa-f37f-44b3-9046-b87b134711a1` |
| Encounter type  | `0b8d256c-e5df-4801-9653-b6ae5b6e906b` |
| Encounter role  | `a0b03050-c99b-11e0-9572-0800200c9a66` (Unknown / default clinician role) |
| Processor       | `EncounterFormProcessor`               |

---

## 2. Tech Stack & Dependencies

| Layer            | Technology                                                |
| ---------------- | --------------------------------------------------------- |
| Runtime shell    | OpenMRS 3 SPA (Single-SPA + import-map + app shell)       |
| Module type      | ES Module microfrontend (ESM)                             |
| Language         | TypeScript 5.x                                            |
| UI library       | React 18                                                  |
| Design system    | IBM Carbon (`@carbon/react`)                              |
| Routing          | `react-router-dom` v6 + Single-SPA route mounting         |
| i18n             | `react-i18next` (translations under [translations/](../translations))      |
| Data fetching    | `openmrsFetch` (REST + FHIR) from `@openmrs/esm-framework` |
| Build            | Webpack via [webpack.config.js](../webpack.config.js) (`openmrs/default-webpack-config`) |
| Tests            | Jest (unit) + Playwright (E2E in [e2e/](../e2e))          |
| Lint / format    | ESLint + Prettier + Husky + lint-staged                   |

Required OpenMRS backend modules (declared in [src/routes.json](../src/routes.json)):

- `fhir2 >= 1.2`
- `webservices.rest >= 2.2.0`

---

## 3. Repository Layout

```
patientdata/
├── carecard.json                     # Original AMPATH-style form definition (reference only)
├── package.json                      # Module manifest + scripts
├── webpack.config.js                 # Wraps the OpenMRS default config
├── tsconfig.json
├── playwright.config.ts              # E2E config
├── jest.config.js                    # Unit test config
├── translations/                     # i18n JSON files (en, fr, es, am, he, km)
└── src/
    ├── index.ts                      # ESM entrypoint — exposes named exports to the app shell
    ├── routes.json                   # Declares pages, extensions, and backend deps
    ├── config-schema.ts              # Runtime configuration schema (defineConfigSchema)
    ├── declarations.d.ts             # Module type shims (e.g. *.scss)
    ├── root.component.tsx            # Page route component → renders CarecardFormPage
    ├── root.scss
    ├── carecard-form.ts              # The HIV Care Card schema (TS, exported as careCradFormSchema)
    ├── carecard-form-page/           # The form runtime (custom Carbon renderer)
    │   ├── carecard-form-page.component.tsx
    │   ├── carecard-form-page.scss
    │   └── carecard-form-page.test.tsx
    ├── carecard-dashboard-button/    # Patient chart action button extension
    ├── carecard-sidebar-link/        # Patient banner sidebar link extension
    ├── boxes/                        # Demo Boxes slot + Red/Blue/Brand box extensions
    ├── greeter/                      # Reference component (config consumer demo)
    ├── patient-getter/               # Reference component (FHIR fetch demo)
    ├── resources/                    # Misc visual resources component
    └── forms/
        ├── carecard-form.utils.ts    # Pure helpers over careCradFormSchema (queries, counts)
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

## 4. High-Level Architecture

```
                    ┌───────────────────────────────────────────────┐
                    │              OpenMRS 3 App Shell              │
                    │  (Single-SPA + import-map + ESM framework)    │
                    └───────────────────────────────────────────────┘
                                    │ loads via import-map
                                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │  @openmrs/esm-template-app  (THIS module — patientdata)   │
        │                                                           │
        │   src/index.ts  ── named exports (lifecycles) ──┐         │
        │   src/routes.json (declares pages + extensions) │         │
        │                                                  ▼        │
        │   PAGES                EXTENSIONS                         │
        │   ─────                ──────────                         │
        │   • root  ───► CarecardFormPage                            │
        │                                                           │
        │   • careCradDashboardButton  → patient-chart-actions-slot │
        │   • careCradDashboardButton  → patient-chart-summary-...  │
        │   • careCradSidebarLink      → patient-banner-extra-...   │
        │   • redBox / blueBox / brandBox → "Boxes" slot (demo)     │
        └───────────────────────────────────────────────────────────┘
                                    │
            calls openmrsFetch(...) │
                                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │              OpenMRS Backend (REST + FHIR)                │
        │   /ws/fhir2/R4/Patient/{uuid}                             │
        │   /ws/rest/v1/obs?patient=&concept=                       │
        │   /ws/rest/v1/programenrollment                           │
        │   /ws/rest/v1/provider, /location                         │
        │   /ws/rest/v1/encounter      (POST on save)               │
        │   /ws/rest/v1/patient/{uuid}/identifier  (POST on save)   │
        └───────────────────────────────────────────────────────────┘
```

### How the shell discovers this module

1. `package.json` declares `browser: dist/openmrs-esm-template-app.js`.
2. Webpack (`openmrs/default-webpack-config`) bundles `src/index.ts` and emits
   a Single-SPA-compatible ES module plus a `routes.json` sidecar.
3. The shell reads `routes.json` to learn:
   - **`pages[]`** — top-level routes the shell should mount (`route: "patientdata"`
     mounts `component: "root"` at `/openmrs/spa/patientdata`).
   - **`extensions[]`** — named contributions to **slots** owned by other
     microfrontends (the patient chart, the patient banner, etc.).
   - **`backendDependencies`** — required OpenMRS server modules.
4. Each named export from [src/index.ts](../src/index.ts) is wrapped in
   `getAsyncLifecycle(...)` so the shell can lazy-load the underlying React
   component on demand.

---

## 5. Module Entrypoint — `src/index.ts`

[src/index.ts](../src/index.ts) is the single contract between the app shell
and this microfrontend. It does three things:

1. **Defines the config schema** in `startupApp()` via `defineConfigSchema`
   (consumed by the shell's config system; see [src/config-schema.ts](../src/config-schema.ts)).
2. **Exports `importTranslation`** — a `require.context` over `../translations`
   that the shell uses to lazy-load language files.
3. **Exports lazy lifecycle functions** for every page and extension declared
   in [src/routes.json](../src/routes.json):

| Export                     | Backed by component                                         | Used as |
| -------------------------- | ----------------------------------------------------------- | ------- |
| `root`                     | [root.component.tsx](../src/root.component.tsx)             | Page    |
| `careCradFormPage`         | [carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx) | (reserved — alternate page mount) |
| `careCradDashboardButton`  | [carecard-dashboard-button.component.tsx](../src/carecard-dashboard-button/carecard-dashboard-button.component.tsx) | Extension |
| `careCradSidebarLink`      | [carecard-sidebar-link.component.tsx](../src/carecard-sidebar-link/carecard-sidebar-link.component.tsx) | Extension |
| `redBox` / `blueBox` / `brandBox` | [boxes/extensions/](../src/boxes/extensions)         | Demo extensions |

> **Naming note:** `careCrad*` is a typo carried over from earlier work
> (should be `careCard*`). Both the export name and the route component
> string in `routes.json` must match — do not rename one without the other.

---

## 6. Routing & Slot Contributions — `routes.json`

[src/routes.json](../src/routes.json) is the declarative manifest the shell
reads at boot.

### 6.1 The page mount

```jsonc
"pages": [
  { "component": "root", "route": "patientdata" }
]
```

This mounts `Root` (which renders `<CarecardFormPage />`) at
`${spaBase}/patientdata`. The shell will navigate here when a user clicks the
button or the sidebar link in the patient chart.

### 6.2 The extensions

| Extension name             | Component                  | Slot                                     | Order |
| -------------------------- | -------------------------- | ---------------------------------------- | ----- |
| Care Card Button           | `careCradDashboardButton`  | `patient-chart-actions-slot`             | 2     |
| Care Card Summary Button   | `careCradDashboardButton`  | `patient-chart-summary-dashboard-slot`   | 1     |
| Care Card Sidebar Link     | `careCradSidebarLink`      | `patient-banner-extra-actions`           | 1     |
| Red / Blue / Brand box     | `redBox` / `blueBox` / `brandBox` | `Boxes`                          | —     |

The two button mounts give the user two visible call-to-actions inside the
chart: one in the chart actions toolbar and one on the patient summary
dashboard. The sidebar link appears in the patient banner.

---

## 7. Configuration System — `config-schema.ts`

The schema in [src/config-schema.ts](../src/config-schema.ts) is consumed by
`@openmrs/esm-framework`'s config system. Today it carries inherited demo
keys (`casualGreeting`, `whoToGreet`) used by the `Greeter` reference
component. Add new Care Card config (e.g. encounter type override, default
location) here so it is admin-overridable through the shell's config UI.

Pattern for adding a config key:

```ts
export const configSchema = {
  // existing keys...
  defaultEncounterType: {
    _type: Type.UUID,
    _default: '0b8d256c-e5df-4801-9653-b6ae5b6e906b',
    _description: 'Encounter type used when saving the Care Card.',
  },
};

export type Config = {
  // ...
  defaultEncounterType: string;
};
```

Consume with `useConfig<Config>()` from `@openmrs/esm-framework` inside any
React component.

---

## 8. The Form Schema — `carecard-form.ts`

[src/carecard-form.ts](../src/carecard-form.ts) is the **single source of
truth** for the form's structure. It is a TypeScript object literal exported
as `careCradFormSchema` and is a faithful conversion of [carecard.json](../carecard.json).

### 8.1 Top-level shape

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

### 8.2 Page → Section → Question hierarchy

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
           ├─ concept:        '<obs concept uuid>' (when type='obs')
           ├─ identifierType: '<uuid>' (when type='patientIdentifier')
           ├─ answers:        [{ concept, label }]
           ├─ min / max / step
           └─ calculate:      { calculateExpression: '<JS expr>' }
           └─ initialValue:   '<JS expr returning value or Promise>'
```

### 8.3 Question types and how they map to the encounter payload

| `type`               | Render path                                | Submit path                                       |
| -------------------- | ------------------------------------------ | ------------------------------------------------- |
| `obs`                | Renders by `rendering`; uses `concept` + `answers` | Becomes `obs[]` entry on the encounter payload    |
| `patientIdentifier`  | Text input; uses `identifierType`          | POSTed separately to `/patient/{uuid}/identifier` |
| `control`            | Read-only / display field driven by `calculate` | Not submitted (UI-only)                       |
| `encounterProvider`  | Select populated from `/provider` REST     | Becomes `encounterProviders[].provider`           |
| `encounterLocation`  | Select populated from `/location` REST     | Becomes `encounter.location`                      |

### 8.4 Helpers — `forms/carecard-form.utils.ts`

[src/forms/carecard-form.utils.ts](../src/forms/carecard-form.utils.ts) is a
small library of pure functions over the schema:

- `getAllQuestions`, `getQuestionById`, `getQuestionsByType`,
  `getQuestionsByConceptId`, `getQuestionsBySection`, `getSectionsByPage`
- `getValidatedQuestions`, `getCalculatedFields`, `getConditionalFields`,
  `getSelectQuestions`
- `getAnswerOptions`, `countTotalQuestions`

Use these for reflection/debug tooling, schema unit tests, or building admin
views. The runtime form page does **not** depend on them — it walks the
schema directly.

---

## 9. The Form Page — `carecard-form-page.component.tsx`

This is the largest and most important file. It is a self-contained Carbon
renderer for `careCradFormSchema`. It deliberately does **not** use
`@openmrs/esm-form-engine-lib` so behavior is fully controlled here.

### 9.1 Internal modules at a glance

| Concern                  | Helpers / hooks                                                                |
| ------------------------ | ------------------------------------------------------------------------------ |
| Patient UUID resolution  | `getPatientUuidFromUrl`, `popstate` + `single-spa:routing-event` listeners     |
| Reference data load      | One-time `useEffect` fetches providers (`/provider`) and locations (`/location`) |
| Patient prefill          | Per-patient `useEffect` running `evalExpression` for `calculate` / `initialValue` and falling back to latest obs |
| Field rendering          | `Field` subcomponent — switches on `rendering`                                 |
| Validation               | `validateField`, `validateAll`, `findFirstInvalidPage`                         |
| Conditional visibility   | `evalHideWhen`                                                                 |
| Payload assembly         | `collectedPayload` memo (obs[] + identifiers[])                                |
| Submit                   | `handleSubmit` → POST `/encounter`, then POST identifiers                      |
| Feedback                 | Carbon `InlineNotification`, `InlineLoading`, framework `showSnackbar`         |

### 9.2 State model

```ts
const [activePatientUuid, setActivePatientUuid] = useState<string | undefined>(...);
const [manualPatientUuid, setManualPatientUuid] = useState<string>('');
const [values,  setValues]  = useState<Record<string, string>>({});  // form state, keyed by question.id
const [errors,  setErrors]  = useState<Record<string, string>>({});  // per-field error messages
const [activePageIndex, setActivePageIndex] = useState(0);
const [preloading, setPreloading] = useState(false);
const [preloadedFor, setPreloadedFor] = useState<string | null>(null); // guards re-prefill
const [submitting, setSubmitting] = useState(false);
const [error,    setError]   = useState<string | null>(null);          // form-level error
const [providerOptions, setProviderOptions] = useState<...>([]);
const [locationOptions, setLocationOptions] = useState<...>([]);
```

### 9.3 Validation

`validateField(q, value, values)` supports:

- **required** — top-level `required: true` or a `{ type: 'required' }` validator.
- **date** — parses the value; honors `allowFutureDates: 'false'`.
- **range** — combined with `questionOptions.min` / `.max`.
- **js_expression** — `failsWhenExpression` evaluated against the current
  `values` map (each question id is injected as a parameter), plus helpers
  `isEmpty(x)` and the field's own `value`.
- **Implicit numeric bounds** — when `rendering === 'number'` and
  `min`/`max` are present without a `range` validator.

Errors render as a tooltip-style popup (custom `tooltipError` span) instead
of the Carbon inline message — see the `Field` component for details.

### 9.4 Calculated fields & prefill

When a patient becomes active, the page runs a single async pass:

1. Fetches the FHIR patient record: `/ws/fhir2/R4/Patient/{uuid}`.
2. For each question, in parallel:
   - If `questionOptions.calculate.calculateExpression` or `initialValue`
     exists → evaluates it via `new Function(...)` with this context:

     ```
     parameters: patient, api, resolve, calcBMI, getProgramEnrollmentDate,
                 ...all current form value keys
     ```

     - `api.getLatestObs(patientId, conceptUuid)` → memoized REST call to
       `/ws/rest/v1/obs?patient=&concept=&v=custom:(uuid,obsDatetime,value)`.
     - `getProgramEnrollmentDate(patientId, programUuid)` → memoized call to
       `/ws/rest/v1/programenrollment`.
     - `calcBMI(height, weight)` → local helper.
     - `resolve(...)` → wraps a value/Promise into a Promise (lets schema
       authors write `resolve(getProgramEnrollmentDate(...))`).
   - If `type === 'obs'` and no expression succeeded → fetches the latest
     obs for the question's concept and coerces the value into the right
     shape for the rendering.
3. Defaults `encounterProvider` to `session.currentProvider.uuid` and
   `encounterLocation` to `session.sessionLocation.uuid` when the schema
   leaves them blank.
4. Merges into `values` while **preserving anything the user already typed**.

> **Security note:** `new Function(...)` is used to evaluate schema
> expressions. Treat the schema as trusted, code-reviewed source. Never
> populate `calculateExpression` / `failsWhenExpression` from user input or
> remote, unverified data.

### 9.5 Submit pipeline

`handleSubmit`:

1. Re-runs `validateAll`. If any errors, sets them, jumps to the first
   invalid page, sets a top-level error message, and aborts.
2. Builds `collectedPayload` from `values`:
   - `type: 'obs'`        → `{ concept, value }` (coerced: boolean / number /
     ISO datetime as appropriate).
   - `type: 'patientIdentifier'` → `{ identifierType, identifier }`.
3. Reads encounter provider / location from form values (or session fallback).
4. POSTs `/ws/rest/v1/encounter`:

   ```json
   {
     "patient":           "<uuid>",
     "encounterType":     "0b8d256c-e5df-4801-9653-b6ae5b6e906b",
     "form":              "9083deaa-f37f-44b3-9046-b87b134711a1",
     "encounterDatetime": "<now ISO>",
     "obs":               [{ "concept": "...", "value": ... }, ...],
     "location":          "<uuid>",
     "encounterProviders":[{ "provider": "<uuid>",
                             "encounterRole": "a0b03050-...-9a66" }]
   }
   ```
5. POSTs each identifier to `/ws/rest/v1/patient/{uuid}/identifier`
   (failures are logged but non-fatal — encounter is already saved).
6. Shows a success or error `showSnackbar`. Server error bodies are
   unwrapped via `responseBody.error.message` for human-friendly messages.

### 9.6 Rendering

Layout: `Tabs` (one per `page`) → `Stack` of `Tile` sections → Carbon `Grid`
with one `Column` per question. Field switching lives in the `Field`
subcomponent and covers: `select` / `ui-select-extended`, `radio`, `date`,
`number`, `textarea`, default `text`. `dynamicAnswers` is supplied by the
parent for `encounterProvider` / `encounterLocation`.

Page footer:

- **Previous** / **Next** for navigation (auto-disabled at edges).
- **Save Care Card** appears only on the last tab; shows `InlineLoading`
  while submitting.
- **Cancel** in the footer calls `window.history.back()`.

---

## 10. Patient-Chart Entry Points

### 10.1 `CarecardDashboardButton`

[src/carecard-dashboard-button/carecard-dashboard-button.component.tsx](../src/carecard-dashboard-button/carecard-dashboard-button.component.tsx)

- Receives `patientUuid` from the slot's extension props.
- Uses `usePatient(patientUuid)` to confirm patient is loaded.
- On click, calls `navigate({ to: '${spaBase}patientdata?patientUuid=...' })`.
- Renders nothing if `patientUuid` is missing — keeps the chart clean.

### 10.2 `CarecardSidebarLink`

[src/carecard-sidebar-link/carecard-sidebar-link.component.tsx](../src/carecard-sidebar-link/carecard-sidebar-link.component.tsx)

Same idea but rendered as a `react-router-dom` `<Link>` inside the patient
banner extras slot, with a Carbon `Document` icon.

Both components target the same URL — the form page picks up `patientUuid`
from `?patientUuid=` or, when launched from inside a patient chart, from
`/patient/{uuid}/chart/...` in the path.

---

## 11. End-to-End Flow

### 11.1 User journey: open the form from a patient chart

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
        │ 1. resolves patientUuid (prop → URL → URL search)
        │ 2. fires reference-data fetches (providers, locations)
        │ 3. fires per-patient prefill (FHIR patient + obs + program enrollment)
        │ 4. evaluates calculate / initialValue expressions
        │ 5. merges into `values` (user input wins on subsequent renders)
        ▼
[User fills tabs]
        │  Field → onChange → setValues / clear field error
        ▼
[User clicks Save on last tab]
        │  validateAll → if errors: jump to first invalid page
        │  collectedPayload → POST /ws/rest/v1/encounter
        │  for each identifier → POST /ws/rest/v1/patient/{uuid}/identifier
        ▼
showSnackbar (success or error) → user stays on form (currently no auto-redirect)
```

### 11.2 Data flow at submit time

```
values: Record<questionId, string>
        │
        │ memo: collectedPayload
        ▼
{ obs: [{concept, value}],
  identifiers: [{identifierType, identifier}] }
        │
        │ + session.currentProvider / sessionLocation
        ▼
POST /ws/rest/v1/encounter   ←── encounter created, returns saved entity
        │
        ▼ for-each identifier
POST /ws/rest/v1/patient/{uuid}/identifier   ←── best-effort, non-fatal
        │
        ▼
Carbon snackbar (success | error)
```

### 11.3 Patient UUID resolution order

1. `propPatientUuid` from the extension framework (when the page is rendered
   inside a slot that supplies it).
2. `/patient/<uuid>/chart/...` parsed from `window.location.pathname`.
3. `?patientUuid=<uuid>` query string.
4. Manual entry — when none of the above is available the page renders a
   `TextInput` for the user to paste a patient UUID and load the form.

A `popstate` + `single-spa:routing-event` listener keeps the active UUID in
sync if the URL changes while the form is mounted.

---

## 12. Build, Run, Test

| Command                | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `yarn start`           | `openmrs develop` — runs the SPA shell with this module live-reloaded |
| `yarn serve`           | `webpack serve --mode=development` — bare module dev server |
| `yarn build`           | Production webpack build → `dist/openmrs-esm-template-app.js` |
| `yarn analyze`         | Production build with bundle analyzer                    |
| `yarn lint`            | ESLint over `src/**/*.{js,jsx,ts,tsx}` (zero warnings)   |
| `yarn typescript`      | `tsc --noEmit` type-check                                |
| `yarn test`            | Jest unit tests                                          |
| `yarn coverage`        | Jest with coverage                                       |
| `yarn test-e2e`        | Playwright E2E (see [e2e/](../e2e))                      |
| `yarn extract-translations` | Refresh `translations/*.json` from the source     |
| `yarn verify`          | Turbo: lint + typescript + coverage                      |

The dev server overlay is configured in [webpack.config.js](../webpack.config.js)
to suppress runtime errors from unrelated host shell apps so the Care Card UI
isn't blocked by them; compile errors still surface.

---

## 13. Internationalization

- Translation files live under [translations/](../translations) (`en`, `fr`,
  `es`, `am`, `he`, `km`).
- All user-facing strings call `t('key', 'Default English')`.
- Translation keys are namespaced by `careCradForm.*` (e.g.
  `careCradForm.formTitle`, `careCradForm.save`, `careCradForm.validationError`).
- The shell discovers files via `importTranslation` in [src/index.ts](../src/index.ts).
- Run `yarn extract-translations` after editing string defaults.

---

## 14. Conventions & Best Practices

1. **Schema is the contract.** Don't hard-code question metadata in the
   renderer; extend `careCradFormSchema` and keep the renderer generic.
2. **Use `openmrsFetch`** for every backend call so you inherit the shell's
   credentials, base URL, and error envelope.
3. **Never block on optional REST data.** Reference fetches (providers,
   locations, latest obs) all swallow errors and let fields fall back to
   empty.
4. **Preserve user input.** Prefill merges so existing `values` keys win.
5. **Don't mix `@openmrs/esm-form-engine-lib`** into this page. The custom
   renderer is intentional. If a feature is missing, add it here.
6. **Treat schema expressions as code.** Expressions execute via
   `new Function(...)`; only commit reviewed schema changes.
7. **Keep patient UUID resolution centralized** in `getPatientUuidFromUrl` +
   the prop/listener `useEffect`. Don't read `window.location` ad-hoc.
8. **Translations:** always call `t(key, default)`; avoid string templates
   that hide the default text from the extractor.
9. **Type imports** for OpenMRS types come from `@openmrs/esm-framework`;
   FHIR shapes are declared inline as needed (see `FhirPatient` in the form
   page) — keep them minimal and local.
10. **Naming:** the legacy `careCrad*` spelling is load-bearing — the shell
    matches names in `routes.json` to exports in `index.ts`. Renaming
    requires changing both atomically and re-deploying.

---

## 15. Extending the Application

### Add a new question

1. Edit the appropriate `pages[].sections[].questions[]` array in
   [src/carecard-form.ts](../src/carecard-form.ts).
2. Pick `type` (`obs` / `control` / `patientIdentifier` / `encounterProvider`
   / `encounterLocation`) and `questionOptions.rendering`.
3. Add validators / `calculateExpression` / `initialValue` / `hide` as needed.
4. The renderer picks it up automatically — no UI changes required.

### Add a new page entry point in another slot

1. Add an entry to `extensions[]` in [src/routes.json](../src/routes.json)
   referencing an existing exported component (or add a new export to
   [src/index.ts](../src/index.ts) backed by a new component file).
2. Use the slot name from the host module's documentation.

### Add a new admin-tunable config value

1. Add it to `configSchema` in [src/config-schema.ts](../src/config-schema.ts)
   and extend the `Config` type.
2. Read it in components via `useConfig<Config>()`.

### Replace or augment the encounter submission

The submission pipeline is `handleSubmit` in
[carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx).
Keep the build of `payload` schema-driven — extend `collectedPayload` rather
than hard-coding fields at submit time.

---

## 16. Troubleshooting

| Symptom                                      | Likely cause / fix                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| "Care Card" button not visible in chart      | Slot name in `routes.json` no longer matches the host. Confirm the host's `extensions` slot. |
| Form mounts but shows the UUID picker        | Patient UUID could not be resolved. Open from a patient chart, or pass `?patientUuid=`. |
| Calculated field stays empty                 | Inspect the network call to `/ws/rest/v1/obs` or FHIR; check the `calculateExpression` for typos. The expression runs through `new Function` — a thrown error silently falls back. |
| 400 on save                                  | The full server error is surfaced in the snackbar (extracted from `responseBody.error.message`). Common causes: missing required obs concept, wrong concept UUID for the rendering, or no provider/location available. |
| `getImportMapOverrideMap` overlay            | Unrelated devtools error from the host shell; suppressed in [webpack.config.js](../webpack.config.js). See [TROUBLESHOOTING-GETIMPORTMAPOVERRIDEMAP.md](../TROUBLESHOOTING-GETIMPORTMAPOVERRIDEMAP.md). |
| "careCrad" typo                              | Intentional historical name. Don't rename without coordinating `routes.json` + `index.ts`. |

For deeper context see the existing top-level docs:

- [README.md](../README.md)
- [README-CARECARD-ESM.md](../README-CARECARD-ESM.md)
- [CARECARD-SETUP-GUIDE.md](../CARECARD-SETUP-GUIDE.md)
- [CARECARD-DASHBOARD-INTEGRATION.md](../CARECARD-DASHBOARD-INTEGRATION.md)
- [CARECARD-DASHBOARD-QUICK-START.md](../CARECARD-DASHBOARD-QUICK-START.md)
- [CARECARD-ESM-MIGRATION.md](../CARECARD-ESM-MIGRATION.md)
- [CARECARD-ESM-QUICK-START.md](../CARECARD-ESM-QUICK-START.md)
- [PATIENT_LIST_IMPLEMENTATION.md](../PATIENT_LIST_IMPLEMENTATION.md)
- [COMPILATION-FIXES.md](../COMPILATION-FIXES.md)
- [CONVERSION-SUMMARY.md](../CONVERSION-SUMMARY.md)

---

## 17. Quick Reference — File → Responsibility

| File                                                                                                                                  | Responsibility                                            |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [src/index.ts](../src/index.ts)                                                                                                       | ESM entry; lifecycle exports + config + translations      |
| [src/routes.json](../src/routes.json)                                                                                                 | Pages / extensions / backend deps manifest                |
| [src/config-schema.ts](../src/config-schema.ts)                                                                                       | Admin-tunable config                                      |
| [src/root.component.tsx](../src/root.component.tsx)                                                                                   | Page wrapper that mounts `CarecardFormPage`               |
| [src/carecard-form.ts](../src/carecard-form.ts)                                                                                       | The HIV Care Card form schema (TS)                        |
| [src/forms/carecard-form.utils.ts](../src/forms/carecard-form.utils.ts)                                                               | Pure helpers over the schema                              |
| [src/carecard-form-page/carecard-form-page.component.tsx](../src/carecard-form-page/carecard-form-page.component.tsx)                 | Carbon-native form runtime (validation, prefill, submit)  |
| [src/carecard-dashboard-button/carecard-dashboard-button.component.tsx](../src/carecard-dashboard-button/carecard-dashboard-button.component.tsx) | "Care Card" button extension                            |
| [src/carecard-sidebar-link/carecard-sidebar-link.component.tsx](../src/carecard-sidebar-link/carecard-sidebar-link.component.tsx)     | Patient banner sidebar link extension                     |
| [translations/](../translations)                                                                                                      | i18n JSON dictionaries                                    |
| [webpack.config.js](../webpack.config.js)                                                                                             | Webpack — extends `openmrs/default-webpack-config`        |
| [package.json](../package.json)                                                                                                       | Module manifest, scripts, peer deps                       |

---

*End of guide.*
