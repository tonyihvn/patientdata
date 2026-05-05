/**
 * Care Card Form Page — Carbon Design System implementation.
 *
 * The page renders the form schema (`careCradFormSchema`) directly as
 * Carbon components — Tabs/TabList/Tab/TabPanels/TabPanel for the pages,
 * Carbon inputs for each question, and Stack/Tile/Layer for layout.
 *
 * State is held in a single `values` object keyed by question id. On
 * submit, that map is converted into the OpenMRS encounter payload
 * (obs + identifiers).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ButtonSet,
  DatePicker,
  DatePickerInput,
  Form,
  FormGroup,
  InlineLoading,
  InlineNotification,
  Layer,
  NumberInput,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react';
import { openmrsFetch, showSnackbar, useSession } from '@openmrs/esm-framework';
import { careCradFormSchema } from '../carecard-form';
import styles from './carecard-form-page.scss';

const ENCOUNTER_ROLE_UUID = 'a0b03050-c99b-11e0-9572-0800200c9a66';

export interface CarecardFormDef {
  uuid: string;
  encounterType: string;
  name?: string;
  pages: Page[];
}

type Values = Record<string, string>;

interface Validator {
  type: string;
  allowFutureDates?: string | boolean;
  failureMessage?: string;
  message?: string;
  failsWhenExpression?: string;
}

interface Question {
  id?: string;
  label: string;
  type?: string;
  required?: boolean;
  readonly?: boolean;
  hide?: { hideWhenExpression?: string };
  validators?: Validator[];
  datePickerFormat?: string;
  questionOptions?: {
    rendering?: string;
    concept?: string;
    identifierType?: string;
    answers?: Array<{ concept: string; label?: string }>;
    min?: string | number;
    max?: string | number;
    step?: string | number;
    calculate?: { calculateExpression?: string };
    initialValue?: string;
    /**
     * Per-question grid layout (Bootstrap-style 12-column grid). Use
     * `columnSpan` to set the same span on every breakpoint, or override
     * per breakpoint with `sm`/`md`/`lg`. Values are clamped to 1..12.
     * Defaults: `sm = 12` (full width on phones), `md`/`lg = columnSpan ?? 3`.
     */
    layout?: {
      columnSpan?: number;
      sm?: number;
      md?: number;
      lg?: number;
    };
  };
}

/** Maximum grid column span (Bootstrap-style 12-column grid). */
const MAX_GRID_COLUMNS = 12;

/**
 * Resolve the per-breakpoint grid spans for a question. Reads
 * `questionOptions.layout` and clamps each value to 1..12; falls back to
 * a sensible default (3) so existing schemas keep their current layout
 * (= 4 fields per row on `lg`).
 */
function resolveColumnSpans(q: Question): { sm: number; md: number; lg: number } {
  const layout = q.questionOptions?.layout ?? {};
  const clamp = (n: unknown, fallback: number): number => {
    const v = typeof n === 'string' ? Number(n) : (n as number | undefined);
    if (v === undefined || v === null || Number.isNaN(v)) return fallback;
    return Math.max(1, Math.min(MAX_GRID_COLUMNS, Math.floor(v)));
  };
  const base = clamp(layout.columnSpan, 3);
  return {
    sm: clamp(layout.sm, MAX_GRID_COLUMNS),
    md: clamp(layout.md, base),
    lg: clamp(layout.lg, base),
  };
}

interface Section {
  label?: string;
  questions?: Question[];
}

interface Page {
  label?: string;
  sections?: Section[];
}

interface FhirPatient {
  id?: string;
  gender?: string;
  birthDate?: string;
  telecom?: Array<{ value?: string; system?: string }>;
  name?: Array<{ given?: string[]; family?: string }>;
}

interface NormalizedObs {
  valueText?: string;
  valueNumeric?: number;
  valueDateTime?: string;
  valueCodeableConcept?: { uuid?: string; display?: string };
}

function normalizeRestObs(raw: unknown): NormalizedObs | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { value?: unknown; obsDatetime?: string };
  const value = r.value;
  const out: NormalizedObs = {};
  if (value == null) return null;
  if (typeof value === 'string') {
    out.valueText = value;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) out.valueDateTime = value;
    const n = Number(value);
    if (!Number.isNaN(n) && value.trim() !== '') out.valueNumeric = n;
  } else if (typeof value === 'number') {
    out.valueNumeric = value;
    out.valueText = String(value);
  } else if (typeof value === 'boolean') {
    out.valueText = value ? 'true' : 'false';
  } else if (typeof value === 'object') {
    const v = value as { uuid?: string; display?: string };
    if (v.uuid) {
      out.valueCodeableConcept = { uuid: v.uuid, display: v.display };
      out.valueText = v.uuid;
    }
  }
  return out;
}

function calcBMI(height: unknown, weight: unknown): string {
  const h = parseFloat(String(height)) / 100;
  const w = parseFloat(String(weight));
  if (!h || !w || Number.isNaN(h) || Number.isNaN(w)) return '';
  return (w / (h * h)).toFixed(1);
}

function coerceForRendering(rendering: string | undefined, raw: unknown): string {
  if (raw == null) return '';
  if (rendering === 'date') {
    const s = String(raw);
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
  return String(raw);
}

function parseDateLoose(s: string): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function noFutureDates(q: Question): boolean {
  return (q.validators ?? []).some(
    (v) => v.type === 'date' && (v.allowFutureDates === 'false' || v.allowFutureDates === false),
  );
}

function isRequired(q: Question): boolean {
  if (q.required === true) return true;
  return (q.validators ?? []).some((v) => v.type === 'required');
}

/**
 * Validate a single field against the schema's `validators` array and any
 * implicit numeric min/max from `questionOptions`. Returns an error message
 * or `null` when the value is acceptable.
 *
 * Supports:
 *   - required         (top-level `required: true` or validator `required`)
 *   - date             (allowFutureDates)
 *   - range            (uses questionOptions.min / max)
 *   - js_expression    (failsWhenExpression evaluated against form values)
 */
function validateField(q: Question, value: string, values: Values): string | null {
  const opts = q.questionOptions ?? {};
  const validators = q.validators ?? [];
  const trimmed = (value ?? '').toString().trim();
  const empty = trimmed === '';

  if (isRequired(q) && empty) {
    const v = validators.find((x) => x.type === 'required');
    return v?.message || v?.failureMessage || 'This field is required';
  }
  if (empty) return null;

  for (const v of validators) {
    switch (v.type) {
      case 'date': {
        const d = parseDateLoose(trimmed);
        if (!d) return v.failureMessage || 'Invalid date';
        if (v.allowFutureDates === 'false' || v.allowFutureDates === false) {
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          if (d.getTime() > today.getTime()) {
            return v.failureMessage || 'Date cannot be in the future';
          }
        }
        break;
      }
      case 'range': {
        const n = Number(trimmed);
        if (Number.isNaN(n)) return v.failureMessage || 'Must be a number';
        const min = opts.min !== undefined ? Number(opts.min) : undefined;
        const max = opts.max !== undefined ? Number(opts.max) : undefined;
        if (min !== undefined && n < min) {
          return v.failureMessage || `Value must be \u2265 ${min}`;
        }
        if (max !== undefined && n > max) {
          return v.failureMessage || `Value must be \u2264 ${max}`;
        }
        break;
      }
      case 'js_expression': {
        const expr = v.failsWhenExpression;
        if (!expr) break;
        try {
          const keys = Object.keys(values);
          const vals = keys.map((k) => values[k]);
          // eslint-disable-next-line no-new-func
          const fn = new Function(...keys, 'isEmpty', 'value', `return (${expr});`);
          const fails = Boolean(fn(...vals, (x: unknown) => x == null || x === '', trimmed));
          if (fails) return v.failureMessage || 'Invalid value';
        } catch {
          /* ignore broken expressions */
        }
        break;
      }
      default:
        break;
    }
  }

  // Implicit numeric bounds when rendering=number even without a 'range'
  // validator (e.g. weight 0-400, height 130-250).
  if (opts.rendering === 'number' && (opts.min !== undefined || opts.max !== undefined)) {
    const n = Number(trimmed);
    if (!Number.isNaN(n)) {
      if (opts.min !== undefined && n < Number(opts.min)) {
        return `Value must be \u2265 ${opts.min}`;
      }
      if (opts.max !== undefined && n > Number(opts.max)) {
        return `Value must be \u2264 ${opts.max}`;
      }
    }
  }

  return null;
}

function getPatientUuidFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const m = window.location.pathname.match(/\/patient\/([^/]+)\/chart\//);
  if (m?.[1]) return m[1];
  return new URLSearchParams(window.location.search).get('patientUuid') ?? undefined;
}

function evalHideWhen(expr: string | undefined, values: Values): boolean {
  if (!expr) return false;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(values), 'isEmpty', `return (${expr});`);
    return Boolean(fn(...Object.values(values), (v: unknown) => v == null || v === ''));
  } catch {
    return false;
  }
}

interface FieldProps {
  q: Question;
  value: string;
  error?: string | null;
  dynamicAnswers?: Array<{ concept: string; label?: string }>;
  onChange: (id: string, next: string) => void;
}

const Field: React.FC<FieldProps> = ({ q, value, error, dynamicAnswers, onChange }) => {
  const id = q.id || '';
  const inputId = `cc-${id}`;
  const opts = q.questionOptions ?? {};
  const rendering = opts.rendering ?? 'text';
  const labelText = q.label;
  const invalid = Boolean(error);
  const answers = dynamicAnswers ?? opts.answers ?? [];

  // Carbon shows the message inline by default; we want a tooltip-style
  // popup instead. Pass `invalid` for red styling, but feed an empty
  // `invalidText` so the inline text is suppressed in favour of the popup
  // rendered by `renderField`.
  const inner = (() => {
    switch (rendering) {
      case 'select':
      case 'ui-select-extended': {
        return (
          <Select
            id={inputId}
            labelText={labelText}
            value={value}
            onChange={(e) => onChange(id, (e.target as HTMLSelectElement).value)}
            disabled={q.readonly}
            invalid={invalid}
            invalidText=""
          >
            <SelectItem value="" text="-- Select --" />
            {answers.map((a) => (
              <SelectItem key={a.concept} value={a.concept} text={a.label ?? a.concept} />
            ))}
          </Select>
        );
      }
      case 'radio': {
        return (
          <FormGroup legendText={labelText} invalid={invalid} message={false} messageText="">
            <RadioButtonGroup
              name={inputId}
              valueSelected={value}
              onChange={(next) => onChange(id, String(next ?? ''))}
              orientation="horizontal"
            >
              {answers.map((a) => (
                <RadioButton
                  key={a.concept}
                  id={`${inputId}-${a.concept}`}
                  value={a.concept}
                  labelText={a.label ?? a.concept}
                />
              ))}
            </RadioButtonGroup>
          </FormGroup>
        );
      }
      case 'date': {
        const parsed = parseDateLoose(value);
        const maxDate = noFutureDates(q) ? new Date() : undefined;
        return (
          <DatePicker
            datePickerType="single"
            dateFormat="Y-m-d"
            value={parsed ?? undefined}
            maxDate={maxDate}
            onChange={(dates: Date[]) => {
              const d = dates?.[0];
              if (!d || Number.isNaN(d.getTime())) {
                onChange(id, '');
                return;
              }
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              onChange(id, `${yyyy}-${mm}-${dd}`);
            }}
          >
            <DatePickerInput
              id={inputId}
              labelText={labelText}
              placeholder="yyyy-mm-dd"
              disabled={q.readonly}
              invalid={invalid}
              invalidText=""
            />
          </DatePicker>
        );
      }
      case 'number': {
        return (
          <NumberInput
            id={inputId}
            label={labelText}
            value={value === '' ? '' : Number(value)}
            onChange={(_e, { value: next }) => onChange(id, next === undefined || next === null ? '' : String(next))}
            min={opts.min !== undefined ? Number(opts.min) : undefined}
            max={opts.max !== undefined ? Number(opts.max) : undefined}
            step={opts.step !== undefined ? Number(opts.step) : 1}
            disabled={q.readonly}
            invalid={invalid}
            invalidText=""
            allowEmpty
          />
        );
      }
      case 'textarea': {
        return (
          <TextArea
            id={inputId}
            labelText={labelText}
            value={value}
            onChange={(e) => onChange(id, e.target.value)}
            rows={3}
            disabled={q.readonly}
            invalid={invalid}
            invalidText=""
          />
        );
      }
      default: {
        return (
          <TextInput
            id={inputId}
            labelText={labelText}
            value={value}
            onChange={(e) => onChange(id, e.target.value)}
            disabled={q.readonly}
            invalid={invalid}
            invalidText=""
          />
        );
      }
    }
  })();

  return (
    <div className={styles.fieldWrapper} title={error || undefined} aria-invalid={invalid || undefined}>
      {inner}
      {invalid && (
        <span role="tooltip" id={`${inputId}-error`} className={styles.tooltipError} aria-live="polite">
          {error}
        </span>
      )}
    </div>
  );
};

interface CarecardFormPageProps {
  patientUuid?: string;
  /** Form definition to render. Defaults to the full careCradFormSchema. */
  formDef?: CarecardFormDef;
  /** When provided, the form loads the existing encounter and PUTs back
   *  to it on save ("edit mode"). When omitted, save creates a new
   *  encounter ("create mode"). */
  encounterUuid?: string;
  /** Whether the form is read-only (view existing encounter without
   *  editing). The Save button is hidden in this mode. */
  readOnly?: boolean;
  /** Called after a successful save with the persisted encounter UUID. */
  onSaved?: (encounterUuid: string) => void;
  /** Called when the user clicks Cancel / back. Defaults to history.back(). */
  onCancel?: () => void;
}

const CarecardFormPage: React.FC<CarecardFormPageProps> = ({
  patientUuid: propPatientUuid,
  formDef,
  encounterUuid,
  readOnly = false,
  onSaved,
  onCancel,
}) => {
  const { t } = useTranslation();
  const session = useSession?.();
  const activeFormDef: CarecardFormDef = useMemo(
    () => formDef ?? (careCradFormSchema as unknown as CarecardFormDef),
    [formDef],
  );
  const PAGES = useMemo(() => activeFormDef.pages ?? [], [activeFormDef]);
  const ENCOUNTER_TYPE = activeFormDef.encounterType;
  const FORM_UUID = activeFormDef.uuid;
  const [manualPatientUuid, setManualPatientUuid] = useState('');
  const [activePatientUuid, setActivePatientUuid] = useState<string | undefined>(
    propPatientUuid || getPatientUuidFromUrl(),
  );
  const [values, setValues] = useState<Values>({});
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preloading, setPreloading] = useState(false);
  const [preloadedFor, setPreloadedFor] = useState<string | null>(null);
  /** concept UUID -> existing obs UUID, used in edit mode so updates
   *  patch the original obs instead of creating duplicates. */
  const [existingObsByConcept, setExistingObsByConcept] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [providerOptions, setProviderOptions] = useState<Array<{ concept: string; label?: string }>>([]);
  const [locationOptions, setLocationOptions] = useState<Array<{ concept: string; label?: string }>>([]);

  // Load provider and location lists once so dropdowns of type
  // `encounterProvider` / `encounterLocation` (which carry no `answers` in
  // the schema) can render their options. Retired entries are excluded
  // by the REST defaults; the current session's provider/location are
  // always merged in as a safety net so the dropdowns are never empty.
  const sessionProvider = session?.currentProvider;
  const sessionLocation = session?.sessionLocation;
  useEffect(() => {
    let cancelled = false;

    const sortByLabel = (list: Array<{ concept: string; label?: string }>) =>
      [...list].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));

    const mergeSessionOption = (
      list: Array<{ concept: string; label?: string }>,
      sessionOpt?: { concept?: string; label?: string },
    ) => {
      if (!sessionOpt?.concept) return sortByLabel(list);
      if (list.some((o) => o.concept === sessionOpt.concept)) return sortByLabel(list);
      return sortByLabel([...list, { concept: sessionOpt.concept, label: sessionOpt.label ?? sessionOpt.concept }]);
    };

    const sessionProviderOpt = sessionProvider?.uuid
      ? {
          concept: sessionProvider.uuid,
          label:
            (sessionProvider as { person?: { display?: string }; display?: string })?.person?.display ??
            (sessionProvider as { display?: string }).display,
        }
      : undefined;
    const sessionLocationOpt = sessionLocation?.uuid
      ? {
          concept: sessionLocation.uuid,
          label: (sessionLocation as { display?: string }).display,
        }
      : undefined;

    (async () => {
      try {
        const res = await openmrsFetch('/ws/rest/v1/provider?v=custom:(uuid,display,person:(display))&limit=500');
        if (cancelled) return;
        const list =
          (
            res?.data as
              | { results?: Array<{ uuid?: string; display?: string; person?: { display?: string } }> }
              | undefined
          )?.results ?? [];
        const opts = list
          .filter((p) => !!p.uuid)
          .map((p) => ({ concept: p.uuid as string, label: p.person?.display ?? p.display }));
        setProviderOptions(mergeSessionOption(opts, sessionProviderOpt));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[Care Card] Failed to load provider list', e);
        if (!cancelled && sessionProviderOpt) {
          setProviderOptions([sessionProviderOpt]);
        }
      }
    })();
    (async () => {
      try {
        const res = await openmrsFetch('/ws/rest/v1/location?v=custom:(uuid,display)&limit=500');
        if (cancelled) return;
        const list = (res?.data as { results?: Array<{ uuid?: string; display?: string }> } | undefined)?.results ?? [];
        const opts = list.filter((l) => !!l.uuid).map((l) => ({ concept: l.uuid as string, label: l.display }));
        setLocationOptions(mergeSessionOption(opts, sessionLocationOpt));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[Care Card] Failed to load location list', e);
        if (!cancelled && sessionLocationOpt) {
          setLocationOptions([sessionLocationOpt]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionProvider, sessionLocation]);

  const dynamicAnswersFor = useCallback(
    (q: Question): Array<{ concept: string; label?: string }> | undefined => {
      if (q.type === 'encounterProvider') return providerOptions;
      if (q.type === 'encounterLocation') return locationOptions;
      return undefined;
    },
    [providerOptions, locationOptions],
  );

  // Prefer the prop (extension framework) over URL-derived UUID, and react
  // to single-spa / popstate URL changes after mount.
  useEffect(() => {
    if (propPatientUuid) {
      setActivePatientUuid(propPatientUuid);
      return;
    }
    const sync = () => {
      const next = getPatientUuidFromUrl();
      if (next) setActivePatientUuid(next);
    };
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('single-spa:routing-event', sync as EventListener);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('single-spa:routing-event', sync as EventListener);
    };
  }, [propPatientUuid]);

  const handleFieldChange = useCallback((id: string, next: string) => {
    setValues((prev) => ({ ...prev, [id]: next }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  useEffect(() => {
    setActivePageIndex(0);
  }, [activePatientUuid]);

  // Preload patient-derived fields (sex, age, phone, etc.) and previously
  // recorded obs values (marital status, occupation, ...) when a patient
  // is selected.
  useEffect(() => {
    if (!activePatientUuid) return;
    if (preloadedFor === activePatientUuid) return;

    let cancelled = false;
    setPreloading(true);

    const obsCache = new Map<string, Promise<NormalizedObs | null>>();
    const fetchLatestObs = (conceptUuid: string): Promise<NormalizedObs | null> => {
      if (!conceptUuid) return Promise.resolve(null);
      const cached = obsCache.get(conceptUuid);
      if (cached) return cached;
      const p = openmrsFetch(
        `/ws/rest/v1/obs?patient=${activePatientUuid}&concept=${conceptUuid}&v=custom:(uuid,obsDatetime,value)`,
      )
        .then((res) => {
          const results = (res?.data as { results?: unknown[] } | undefined)?.results ?? [];
          if (!results.length) return null;
          // Pick the most recent by obsDatetime.
          const sorted = [...results].sort((a, b) => {
            const ad = (a as { obsDatetime?: string }).obsDatetime ?? '';
            const bd = (b as { obsDatetime?: string }).obsDatetime ?? '';
            return bd.localeCompare(ad);
          });
          return normalizeRestObs(sorted[0]);
        })
        .catch(() => null);
      obsCache.set(conceptUuid, p);
      return p;
    };

    const getProgramEnrollmentDate = async (_patientId: string, programUuid: string): Promise<string | null> => {
      try {
        const res = await openmrsFetch(
          `/ws/rest/v1/programenrollment?patient=${activePatientUuid}&v=custom:(dateEnrolled,program:(uuid))`,
        );
        const list =
          (res?.data as { results?: Array<{ dateEnrolled?: string; program?: { uuid?: string } }> } | undefined)
            ?.results ?? [];
        const match = list.find((r) => r?.program?.uuid === programUuid) ?? list[0];
        return match?.dateEnrolled ? match.dateEnrolled.slice(0, 10) : null;
      } catch {
        return null;
      }
    };

    const evalExpression = async (expr: string, patient: FhirPatient): Promise<unknown> => {
      const api = {
        getLatestObs: (_pid: string, conceptUuid: string) => fetchLatestObs(conceptUuid),
      };
      const resolve = <T,>(v: T | Promise<T>) => Promise.resolve(v);
      // Provide named values from the current form state so expressions can
      // reference sibling fields (e.g. calcBMI(height,Weight), sex, age).
      const ctxKeys = Object.keys(values);
      const ctxVals = ctxKeys.map((k) => values[k]);
      // eslint-disable-next-line no-new-func
      const fn = new Function(
        'patient',
        'api',
        'resolve',
        'calcBMI',
        'getProgramEnrollmentDate',
        ...ctxKeys,
        `return (${expr});`,
      );
      const out = fn(patient, api, resolve, calcBMI, getProgramEnrollmentDate, ...ctxVals);
      return await Promise.resolve(out);
    };

    const flattenQuestions = (): Question[] => {
      const out: Question[] = [];
      PAGES.forEach((page) =>
        (page.sections ?? []).forEach((section) => (section.questions ?? []).forEach((q) => out.push(q))),
      );
      return out;
    };

    (async () => {
      try {
        const patientRes = await openmrsFetch(`/ws/fhir2/R4/Patient/${activePatientUuid}`);
        if (cancelled) return;
        const patient = (patientRes?.data ?? {}) as FhirPatient;

        const next: Values = {};
        const questions = flattenQuestions();

        await Promise.all(
          questions.map(async (q) => {
            const id = q.id;
            if (!id) return;
            const opts = q.questionOptions ?? {};
            const rendering = opts.rendering;

            // 1) Calculated/initial-value expressions from the schema.
            const expr = opts.calculate?.calculateExpression || opts.initialValue;
            if (expr) {
              try {
                const result = await evalExpression(expr, patient);
                const str = coerceForRendering(rendering, result);
                if (str !== '' && str !== 'null' && str !== 'undefined') {
                  next[id] = str;
                  return;
                }
              } catch {
                /* fall through to obs fallback */
              }
            }

            // 2) For obs questions without an explicit expression, prefill
            //    from the patient's latest obs for the same concept.
            if (q.type === 'obs' && opts.concept) {
              try {
                const obs = await fetchLatestObs(opts.concept);
                if (!obs) return;
                let v: unknown;
                if (rendering === 'select' || rendering === 'radio') {
                  v = obs.valueCodeableConcept?.uuid ?? obs.valueText;
                } else if (rendering === 'date') {
                  v = obs.valueDateTime ?? obs.valueText;
                } else if (rendering === 'number') {
                  v = obs.valueNumeric ?? obs.valueText;
                } else {
                  v = obs.valueText ?? obs.valueNumeric ?? obs.valueDateTime;
                }
                const str = coerceForRendering(rendering, v);
                if (str !== '') next[id] = str;
              } catch {
                /* ignore */
              }
            }
          }),
        );

        if (cancelled) return;
        // Default encounterProvider / encounterLocation from session when
        // the schema doesn't compute them.
        questions.forEach((q) => {
          if (!q.id) return;
          if (next[q.id]) return;
          if (q.type === 'encounterProvider' && session?.currentProvider?.uuid) {
            next[q.id] = session.currentProvider.uuid;
          } else if (q.type === 'encounterLocation' && session?.sessionLocation?.uuid) {
            next[q.id] = session.sessionLocation.uuid;
          }
        });
        // Merge: existing user-entered values win over preloads.
        setValues((prev) => {
          const merged: Values = { ...next };
          for (const k of Object.keys(prev)) {
            if (prev[k] !== undefined && prev[k] !== '') merged[k] = prev[k];
          }
          return merged;
        });
        setPreloadedFor(activePatientUuid);
      } catch {
        // Patient fetch failed; leave the form empty.
      } finally {
        if (!cancelled) setPreloading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // values is intentionally omitted: preload runs once per patient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatientUuid, preloadedFor]);

  // When `encounterUuid` is supplied (view/edit mode), load that specific
  // encounter and overwrite the form values from its observations. We
  // also remember each obs UUID by concept so save can update them in
  // place rather than creating duplicates.
  useEffect(() => {
    if (!encounterUuid) {
      setExistingObsByConcept({});
      return;
    }
    let cancelled = false;
    setPreloading(true);
    (async () => {
      try {
        const res = await openmrsFetch(
          `/ws/rest/v1/encounter/${encounterUuid}?v=custom:(uuid,encounterDatetime,obs:(uuid,concept:(uuid),value))`,
        );
        if (cancelled) return;
        const data = (res?.data ?? {}) as {
          obs?: Array<{ uuid?: string; concept?: { uuid?: string }; value?: unknown }>;
        };
        const obsByConcept: Record<string, string> = {};
        const conceptToValue = new Map<string, unknown>();
        (data.obs ?? []).forEach((o) => {
          const cu = o.concept?.uuid;
          if (!cu) return;
          if (o.uuid) obsByConcept[cu] = o.uuid;
          conceptToValue.set(cu, o.value);
        });
        setExistingObsByConcept(obsByConcept);
        // Map back to form values keyed by question id.
        const next: Values = {};
        PAGES.forEach((page) =>
          (page.sections ?? []).forEach((section) =>
            (section.questions ?? []).forEach((q) => {
              if (!q.id) return;
              const cu = q.questionOptions?.concept;
              if (!cu || !conceptToValue.has(cu)) return;
              const normalized = normalizeRestObs({ value: conceptToValue.get(cu) });
              if (!normalized) return;
              const rendering = q.questionOptions?.rendering;
              let v: unknown;
              if (rendering === 'select' || rendering === 'radio') {
                v = normalized.valueCodeableConcept?.uuid ?? normalized.valueText;
              } else if (rendering === 'date') {
                v = normalized.valueDateTime ?? normalized.valueText;
              } else if (rendering === 'number') {
                v = normalized.valueNumeric ?? normalized.valueText;
              } else {
                v = normalized.valueText ?? normalized.valueNumeric ?? normalized.valueDateTime;
              }
              const str = coerceForRendering(rendering, v);
              if (str !== '') next[q.id] = str;
            }),
          ),
        );
        setValues((prev) => ({ ...prev, ...next }));
      } catch {
        /* leave form empty */
      } finally {
        if (!cancelled) setPreloading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterUuid, activeFormDef]);

  // Reset transient state when the form definition or encounter changes
  // so we don't leak values from a previously selected form.
  useEffect(() => {
    setActivePageIndex(0);
    setError(null);
    setErrors({});
    if (!encounterUuid) {
      setValues({});
      setPreloadedFor(null);
    }
  }, [activeFormDef, encounterUuid]);

  const collectedPayload = useMemo(() => {
    const obs: Array<{ uuid?: string; concept: string; value: unknown }> = [];
    const identifiers: Array<{ identifierType: string; identifier: string }> = [];
    PAGES.forEach((page) => {
      (page.sections ?? []).forEach((section) => {
        (section.questions ?? []).forEach((q) => {
          const id = q.id || '';
          const raw = (values[id] ?? '').toString().trim();
          if (!raw) return;
          if (evalHideWhen(q.hide?.hideWhenExpression, values)) return;
          const opts = q.questionOptions ?? {};
          if (q.type === 'patientIdentifier' && opts.identifierType) {
            identifiers.push({ identifierType: opts.identifierType, identifier: raw });
          } else if (q.type === 'obs' && opts.concept) {
            // Coerce raw string into the shape OpenMRS REST expects so we
            // don't get a 400 from the encounter endpoint.
            let value: unknown = raw;
            const rendering = opts.rendering;
            if (raw === 'true' || raw === 'false') {
              value = raw === 'true';
            } else if (rendering === 'number') {
              const n = Number(raw);
              if (!Number.isNaN(n)) value = n;
            } else if (rendering === 'date') {
              // OpenMRS expects an ISO datetime; pad date-only values.
              const d = parseDateLoose(raw);
              if (d) value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
            }
            obs.push({
              uuid: existingObsByConcept[opts.concept],
              concept: opts.concept,
              value,
            });
          }
        });
      });
    });
    return { obs, identifiers };
  }, [values, PAGES, existingObsByConcept]);

  const validateAll = useCallback((): Record<string, string> => {
    const errs: Record<string, string> = {};
    PAGES.forEach((page) => {
      (page.sections ?? []).forEach((section) => {
        (section.questions ?? []).forEach((q) => {
          const id = q.id || '';
          if (!id) return;
          if (evalHideWhen(q.hide?.hideWhenExpression, values)) return;
          const msg = validateField(q, values[id] ?? '', values);
          if (msg) errs[id] = msg;
        });
      });
    });
    return errs;
  }, [values, PAGES]);

  const findFirstInvalidPage = useCallback(
    (errs: Record<string, string>): number => {
      const ids = new Set(Object.keys(errs));
      for (let i = 0; i < PAGES.length; i++) {
        const page = PAGES[i];
        for (const section of page.sections ?? []) {
          for (const q of section.questions ?? []) {
            if (q.id && ids.has(q.id)) return i;
          }
        }
      }
      return 0;
    },
    [PAGES],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!activePatientUuid) return;
      setError(null);

      const errs = validateAll();
      setErrors(errs);
      if (Object.keys(errs).length > 0) {
        setActivePageIndex(findFirstInvalidPage(errs));
        setError(t('careCradForm.validationError', 'Please fix the highlighted fields before saving.'));
        return;
      }

      setSubmitting(true);
      try {
        const { obs, identifiers } = collectedPayload;

        // Pull encounterProvider / encounterLocation values from the form
        // when the schema provides them; otherwise fall back to session.
        let formProviderUuid: string | undefined;
        let formLocationUuid: string | undefined;
        PAGES.forEach((page) =>
          (page.sections ?? []).forEach((section) =>
            (section.questions ?? []).forEach((q) => {
              const v = (values[q.id || ''] ?? '').toString().trim();
              if (!v) return;
              if (q.type === 'encounterProvider') formProviderUuid = v;
              else if (q.type === 'encounterLocation') formLocationUuid = v;
            }),
          ),
        );

        const payload: Record<string, unknown> = {
          patient: activePatientUuid,
          encounterType: ENCOUNTER_TYPE,
          form: FORM_UUID,
          encounterDatetime: new Date().toISOString(),
          obs: obs.map((o) =>
            o.uuid ? { uuid: o.uuid, concept: o.concept, value: o.value } : { concept: o.concept, value: o.value },
          ),
          location: formLocationUuid ?? session?.sessionLocation?.uuid,
        };
        const providerUuid = formProviderUuid ?? session?.currentProvider?.uuid;
        if (providerUuid) {
          payload.encounterProviders = [{ provider: providerUuid, encounterRole: ENCOUNTER_ROLE_UUID }];
        }

        const url = encounterUuid ? `/ws/rest/v1/encounter/${encounterUuid}` : '/ws/rest/v1/encounter';
        const res = await openmrsFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });

        for (const idEntry of identifiers) {
          try {
            await openmrsFetch(`/ws/rest/v1/patient/${activePatientUuid}/identifier`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: idEntry,
            });
          } catch {
            /* non-fatal */
          }
        }

        showSnackbar({
          kind: 'success',
          title: t('careCradForm.savedTitle', 'Care Card saved'),
          subtitle: t('careCradForm.savedSubtitle', 'Encounter created successfully.'),
          isLowContrast: true,
        });
        const savedUuid = (res?.data as { uuid?: string } | undefined)?.uuid ?? encounterUuid ?? '';
        if (onSaved && savedUuid) onSaved(savedUuid);
        // eslint-disable-next-line no-console
        console.log('Care Card encounter created:', res?.data);
      } catch (err) {
        // Try to extract the server's actual error message so the user
        // sees something more useful than "400 Bad Request".
        let message = err instanceof Error ? err.message : 'Submission failed';
        const anyErr = err as {
          responseBody?: { error?: { message?: string; detail?: string } } | string;
          response?: { data?: { error?: { message?: string; detail?: string } } };
        };
        const body = anyErr?.responseBody ?? anyErr?.response?.data;
        if (body) {
          if (typeof body === 'string') {
            message = body;
          } else if (body.error) {
            message = body.error.message || body.error.detail || message;
          }
        }
        setError(message);
        showSnackbar({
          kind: 'error',
          title: t('careCradForm.saveErrorTitle', 'Could not save Care Card'),
          subtitle: message,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      activePatientUuid,
      collectedPayload,
      session,
      t,
      validateAll,
      findFirstInvalidPage,
      values,
      ENCOUNTER_TYPE,
      FORM_UUID,
      encounterUuid,
      onSaved,
      PAGES,
    ],
  );

  const goToPage = useCallback(
    (idx: number) => {
      const next = Math.max(0, Math.min(PAGES.length - 1, idx));
      setActivePageIndex(next);
    },
    [PAGES],
  );

  const handleCancel = useCallback(() => {
    if (onCancel) onCancel();
    else window.history.back();
  }, [onCancel]);

  if (!activePatientUuid) {
    return (
      <div className={styles.pageContainer}>
        <Layer>
          <Tile className={styles.patientPicker}>
            <InlineNotification
              kind="info"
              title={t('careCradForm.patientUuid', 'Patient UUID')}
              subtitle={t(
                'careCradForm.patientRequiredHelp',
                'Enter a patient UUID to load the Care Card form, or open the form from a patient chart.',
              )}
              hideCloseButton
              lowContrast
            />
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualPatientUuid.trim()) setActivePatientUuid(manualPatientUuid.trim());
              }}
            >
              <Stack gap={5}>
                <TextInput
                  id="patient-uuid-input"
                  labelText={t('careCradForm.patientUuid', 'Patient UUID')}
                  placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                  value={manualPatientUuid}
                  onChange={(e) => setManualPatientUuid(e.target.value)}
                />
                <Button kind="primary" type="submit" disabled={!manualPatientUuid.trim()}>
                  {t('careCradForm.loadForm', 'Load form')}
                </Button>
              </Stack>
            </Form>
          </Tile>
        </Layer>
      </div>
    );
  }

  const isLastPage = activePageIndex === PAGES.length - 1;

  return (
    <div className={styles.pageContainer}>
      <Form onSubmit={handleSubmit} noValidate aria-label="Care Card form">
        {preloading && (
          <InlineLoading
            description={t('careCradForm.preloading', 'Loading patient data...')}
            className={styles.notification}
          />
        )}
        {error && (
          <InlineNotification
            kind="error"
            title={t('careCradForm.saveErrorTitle', 'Could not save Care Card')}
            subtitle={error}
            onCloseButtonClick={() => setError(null)}
            lowContrast
            className={styles.notification}
          />
        )}

        <Tabs selectedIndex={activePageIndex} onChange={({ selectedIndex }) => goToPage(selectedIndex)}>
          {PAGES.length > 1 && (
            <TabList aria-label="Care Card pages" contained>
              {PAGES.map((page, i) => (
                <Tab key={page.label || i}>{page.label || `Page ${i + 1}`}</Tab>
              ))}
            </TabList>
          )}
          <TabPanels>
            {PAGES.map((page, pageIdx) => (
              <TabPanel key={page.label || pageIdx}>
                <Stack gap={7} className={styles.pageStack}>
                  {(page.sections ?? []).map((section, secIdx) => (
                    <Tile key={section.label || secIdx} className={styles.section}>
                      <h2 className={styles.sectionTitle}>{section.label}</h2>
                      <div className={styles.row}>
                        {(section.questions ?? []).map((q) => {
                          const id = q.id || '';
                          if (evalHideWhen(q.hide?.hideWhenExpression, values)) return null;
                          const span = resolveColumnSpans(q);
                          return (
                            <div
                              key={id}
                              className={styles.col}
                              data-col-sm={span.sm}
                              data-col-md={span.md}
                              data-col-lg={span.lg}
                              style={
                                {
                                  '--cc-col-sm': span.sm,
                                  '--cc-col-md': span.md,
                                  '--cc-col-lg': span.lg,
                                } as React.CSSProperties
                              }
                            >
                              <Field
                                q={q}
                                value={values[id] ?? ''}
                                error={errors[id]}
                                dynamicAnswers={dynamicAnswersFor(q)}
                                onChange={handleFieldChange}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </Tile>
                  ))}

                  <ButtonSet className={styles.tabActions}>
                    <Button
                      kind="secondary"
                      type="button"
                      onClick={() => goToPage(activePageIndex - 1)}
                      disabled={activePageIndex === 0}
                    >
                      {t('careCradForm.previous', 'Previous')}
                    </Button>
                    {isLastPage ? (
                      readOnly ? null : (
                        <Button kind="primary" type="submit" disabled={submitting}>
                          {submitting ? (
                            <InlineLoading description={t('careCradForm.saving', 'Saving...')} />
                          ) : encounterUuid ? (
                            t('careCradForm.update', 'Update Care Card')
                          ) : (
                            t('careCradForm.save', 'Save Care Card')
                          )}
                        </Button>
                      )
                    ) : (
                      <Button kind="primary" type="button" onClick={() => goToPage(activePageIndex + 1)}>
                        {t('careCradForm.next', 'Next')}
                      </Button>
                    )}
                  </ButtonSet>
                </Stack>
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>

        <ButtonSet className={styles.footerActions}>
          <Button kind="ghost" type="button" onClick={handleCancel}>
            {t('careCradForm.cancel', 'Cancel')}
          </Button>
        </ButtonSet>
      </Form>
    </div>
  );
};

export default CarecardFormPage;
