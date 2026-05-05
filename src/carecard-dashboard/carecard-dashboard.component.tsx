/**
 * Care Card Dashboard
 *
 * Replaces the previous single-form Care Card page with a dashboard:
 *   - Left sidebar: list of available Care Card forms (one per page in
 *     the parent schema, each with its own encounter type), and below
 *     each form a list of the patient's previously saved encounters of
 *     that type with View / Edit actions.
 *   - Right panel: the renderer for the currently selected form,
 *     either in "create new" mode or loaded against a previous
 *     encounter for view / edit.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Form,
  InlineLoading,
  InlineNotification,
  SkeletonText,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react';
import { Add, Edit, View } from '@carbon/react/icons';
import { usePatient } from '@openmrs/esm-framework';
import CarecardFormPage from '../carecard-form-page/carecard-form-page.component';
import { CARE_CARD_FORMS, type CareCardFormDefinition } from '../forms/carecard-forms-registry';
import { type CareCardEncounterRecord, fetchCareCardEncountersByType } from './carecard-dashboard.resource';
import styles from './carecard-dashboard.scss';

type Mode = 'create' | 'edit' | 'view';

interface CarecardDashboardProps {
  patientUuid?: string;
}

function getPatientUuidFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const m = window.location.pathname.match(/\/patient\/([^/]+)\/chart\//);
  if (m?.[1]) return m[1];
  return new URLSearchParams(window.location.search).get('patientUuid') ?? undefined;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function computeAge(birthDate?: string): string {
  if (!birthDate) return '—';
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return '—';
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years -= 1;
  return `${years}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FhirPatient = any;

function getPatientDisplayName(patient: FhirPatient): string {
  if (!patient?.name?.length) return '—';
  const n = patient.name[0];
  const given = (n.given ?? []).join(' ').trim();
  const family = n.family ?? '';
  return [given, family].filter(Boolean).join(' ') || '—';
}

function getPatientPhone(patient: FhirPatient): string | undefined {
  return patient?.telecom?.find((t: { value?: string }) => t.value)?.value;
}

function getPatientAddress(patient: FhirPatient): string | undefined {
  const addr = patient?.address?.[0];
  if (!addr) return undefined;
  const parts = [...(addr.line ?? []), addr.city, addr.district, addr.state, addr.postalCode, addr.country].filter(
    Boolean,
  );
  return parts.length ? parts.join(', ') : undefined;
}

const CarecardDashboard: React.FC<CarecardDashboardProps> = ({ patientUuid: propPatientUuid }) => {
  const { t } = useTranslation();
  const [activePatientUuid, setActivePatientUuid] = useState<string | undefined>(
    propPatientUuid || getPatientUuidFromUrl(),
  );
  const [manualPatientUuid, setManualPatientUuid] = useState('');

  const [activeFormId, setActiveFormId] = useState<string>(CARE_CARD_FORMS[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('create');
  const [activeEncounterUuid, setActiveEncounterUuid] = useState<string | undefined>(undefined);

  const [encountersByType, setEncountersByType] = useState<Record<string, CareCardEncounterRecord[]>>({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const { patient, isLoading: isLoadingPatient } = usePatient(activePatientUuid);

  const activeForm: CareCardFormDefinition | undefined = useMemo(
    () => CARE_CARD_FORMS.find((f) => f.id === activeFormId) ?? CARE_CARD_FORMS[0],
    [activeFormId],
  );

  // Re-sync the active patient UUID with the URL so external navigation
  // (e.g. patient chart) keeps the dashboard in context.
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

  const refreshHistory = useCallback(async () => {
    if (!activePatientUuid) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const types = Array.from(new Set(CARE_CARD_FORMS.map((f) => f.encounterType)));
      const grouped = await fetchCareCardEncountersByType(activePatientUuid, types);
      setEncountersByType(grouped);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  }, [activePatientUuid]);

  useEffect(() => {
    if (activePatientUuid) refreshHistory();
  }, [activePatientUuid, refreshHistory]);

  const handleSelectForm = useCallback((formId: string) => {
    setActiveFormId(formId);
    setMode('create');
    setActiveEncounterUuid(undefined);
  }, []);

  const handleViewEncounter = useCallback((formId: string, encounterUuid: string) => {
    setActiveFormId(formId);
    setActiveEncounterUuid(encounterUuid);
    setMode('view');
  }, []);

  const handleEditEncounter = useCallback((formId: string, encounterUuid: string) => {
    setActiveFormId(formId);
    setActiveEncounterUuid(encounterUuid);
    setMode('edit');
  }, []);

  const handleStartNew = useCallback(() => {
    setActiveEncounterUuid(undefined);
    setMode('create');
  }, []);

  const handleSaved = useCallback(
    (encounterUuid: string) => {
      // After a successful save, refresh history and switch to edit mode
      // on the new/updated encounter so the user can continue working.
      setActiveEncounterUuid(encounterUuid);
      setMode('edit');
      void refreshHistory();
    },
    [refreshHistory],
  );

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  if (!activePatientUuid) {
    return (
      <div className={styles.dashboardContainer}>
        <Tile>
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={t('careCradForm.patientUuid', 'Patient UUID')}
            subtitle={t(
              'careCradForm.patientRequiredHelp',
              'Enter a patient UUID to load the Care Card dashboard, or open it from a patient chart.',
            )}
          />
          <Form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualPatientUuid.trim()) setActivePatientUuid(manualPatientUuid.trim());
            }}
          >
            <Stack gap={5}>
              <TextInput
                id="cc-patient-uuid"
                labelText={t('careCradForm.patientUuid', 'Patient UUID')}
                placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                value={manualPatientUuid}
                onChange={(e) => setManualPatientUuid(e.target.value)}
              />
              <Button kind="primary" type="submit" disabled={!manualPatientUuid.trim()}>
                {t('careCradForm.loadDashboard', 'Load dashboard')}
              </Button>
            </Stack>
          </Form>
        </Tile>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>
      <aside className={styles.sidebar} aria-label={t('careCradForm.sidebarLabel', 'Care Card forms')}>
        <h2 className={styles.sidebarTitle}>{t('careCradForm.dashboardTitle', 'Care Card')}</h2>

        <h3 className={styles.sidebarSubtitle}>{t('careCradForm.historyHeading', 'Previous records')}</h3>
        {loadingHistory && <SkeletonText paragraph lineCount={3} />}
        {historyError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t('careCradForm.historyErrorTitle', 'Could not load history')}
            subtitle={historyError}
          />
        )}
        {!loadingHistory && !historyError && (
          <>
            {CARE_CARD_FORMS.map((f) => {
              const records = encountersByType[f.encounterType] ?? [];
              if (records.length === 0) return null;
              return (
                <div key={`history-${f.id}`}>
                  <h4 className={styles.sidebarSubtitle}>{f.label}</h4>
                  <ul className={styles.historyList}>
                    {records.map((r) => {
                      const isActive = activeEncounterUuid === r.uuid && activeFormId === f.id;
                      return (
                        <li key={r.uuid} className={styles.historyItem}>
                          <div className={`${styles.historyEntry} ${isActive ? styles.activeHistoryEntry : ''}`}>
                            <span className={styles.historyDate}>{formatDate(r.encounterDatetime)}</span>
                            <div className={styles.historyActions}>
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={View}
                                onClick={() => handleViewEncounter(f.id, r.uuid)}
                              >
                                {t('careCradForm.view', 'View')}
                              </Button>
                              <Button
                                kind="ghost"
                                size="sm"
                                renderIcon={Edit}
                                onClick={() => handleEditEncounter(f.id, r.uuid)}
                              >
                                {t('careCradForm.edit', 'Edit')}
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
            {CARE_CARD_FORMS.every((f) => (encountersByType[f.encounterType] ?? []).length === 0) && (
              <p className={styles.historyEmpty}>
                {t('careCradForm.noHistory', 'No saved Care Card records yet for this patient.')}
              </p>
            )}
          </>
        )}
      </aside>

      <section className={styles.mainPanel} aria-label={activeForm?.label}>
        <div className={styles.patientBanner} aria-label={t('careCradForm.patientBanner', 'Patient details')}>
          {isLoadingPatient ? (
            <SkeletonText paragraph lineCount={2} />
          ) : (
            <>
              <div className={styles.patientBannerPrimary}>
                <span className={styles.patientName}>{getPatientDisplayName(patient)}</span>
                <span className={styles.patientMeta}>
                  <Tag type="cool-gray">
                    {t('careCradForm.sex', 'Sex')}: {patient?.gender?.toUpperCase() ?? '—'}
                  </Tag>
                  <Tag type="cool-gray">
                    {t('careCradForm.age', 'Age')}: {computeAge(patient?.birthDate)}
                  </Tag>
                  {patient?.birthDate && (
                    <Tag type="cool-gray">
                      {t('careCradForm.dob', 'DOB')}: {patient.birthDate}
                    </Tag>
                  )}
                </span>
              </div>
              <div className={styles.patientBannerSecondary}>
                <span>
                  <strong>{t('careCradForm.uuid', 'UUID')}:</strong> {activePatientUuid}
                </span>
                {getPatientPhone(patient) && (
                  <span>
                    <strong>{t('careCradForm.phone', 'Phone')}:</strong> {getPatientPhone(patient)}
                  </span>
                )}
                {getPatientAddress(patient) && (
                  <span>
                    <strong>{t('careCradForm.address', 'Address')}:</strong> {getPatientAddress(patient)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <Tabs
          selectedIndex={Math.max(
            0,
            CARE_CARD_FORMS.findIndex((f) => f.id === activeFormId),
          )}
          onChange={({ selectedIndex }: { selectedIndex: number }) => {
            const next = CARE_CARD_FORMS[selectedIndex];
            if (next) handleSelectForm(next.id);
          }}
        >
          <TabList aria-label={t('careCradForm.formTabs', 'Care Card pages')} contained>
            {CARE_CARD_FORMS.map((f) => (
              <Tab key={f.id}>{f.label}</Tab>
            ))}
          </TabList>
          <TabPanels>
            {CARE_CARD_FORMS.map((f) => (
              <TabPanel key={f.id}>
                {activeForm?.id === f.id ? (
                  <>
                    <div className={styles.formMeta}>
                      <h3 className={styles.formMetaTitle}>{f.label}</h3>
                      <div className={styles.formMetaRow}>
                        <span>
                          <strong>{t('careCradForm.formUuid', 'Form UUID')}:</strong> <code>{f.formUuid}</code>
                        </span>
                        <span>
                          <strong>{t('careCradForm.encounterType', 'Encounter type')}:</strong>{' '}
                          <code>{f.encounterType}</code>
                        </span>
                      </div>
                    </div>
                    <div className={styles.headerBar}>
                      <Tag type={mode === 'create' ? 'green' : mode === 'edit' ? 'blue' : 'gray'}>
                        {mode === 'create'
                          ? t('careCradForm.modeCreate', 'New entry')
                          : mode === 'edit'
                            ? t('careCradForm.modeEdit', 'Editing record')
                            : t('careCradForm.modeView', 'Viewing record')}
                      </Tag>
                      <div className={styles.headerActions}>
                        {(mode === 'edit' || mode === 'view') && (
                          <Button kind="tertiary" renderIcon={Add} onClick={handleStartNew}>
                            {t('careCradForm.startNew', 'Start new entry')}
                          </Button>
                        )}
                      </div>
                    </div>
                    <CarecardFormPage
                      key={`${activeForm.id}-${activeEncounterUuid ?? 'new'}`}
                      patientUuid={activePatientUuid}
                      formDef={activeForm.schema}
                      encounterUuid={mode === 'create' ? undefined : activeEncounterUuid}
                      readOnly={mode === 'view'}
                      onSaved={handleSaved}
                      onCancel={handleStartNew}
                    />
                  </>
                ) : (
                  <InlineLoading description={t('careCradForm.loading', 'Loading...')} />
                )}
              </TabPanel>
            ))}
          </TabPanels>
        </Tabs>
      </section>
    </div>
  );
};

export default CarecardDashboard;
