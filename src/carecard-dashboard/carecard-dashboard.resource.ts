/**
 * Resources for the Care Card dashboard sidebar history.
 *
 * Encounters for the current patient are pulled from the OpenMRS REST
 * API, filtered to the encounter types that back the Care Card forms,
 * and grouped by encounter type so the dashboard can surface a
 * "previous records" list under each form.
 */

import { openmrsFetch } from '@openmrs/esm-framework';

export interface CareCardEncounterRecord {
  uuid: string;
  encounterDatetime: string;
  encounterTypeUuid?: string;
  encounterTypeName?: string;
  display?: string;
}

interface RawEncounter {
  uuid?: string;
  display?: string;
  encounterDatetime?: string;
  encounterType?: { uuid?: string; display?: string };
}

/**
 * Fetch all Care Card encounters for the patient and return them
 * grouped by encounter type UUID.
 */
export async function fetchCareCardEncountersByType(
  patientUuid: string,
  encounterTypeUuids: string[],
): Promise<Record<string, CareCardEncounterRecord[]>> {
  if (!patientUuid || encounterTypeUuids.length === 0) return {};
  const grouped: Record<string, CareCardEncounterRecord[]> = {};
  encounterTypeUuids.forEach((u) => {
    grouped[u] = [];
  });

  const v = 'custom:(uuid,display,encounterDatetime,encounterType:(uuid,display))';
  await Promise.all(
    encounterTypeUuids.map(async (encounterTypeUuid) => {
      try {
        const res = await openmrsFetch(
          `/ws/rest/v1/encounter?patient=${encodeURIComponent(patientUuid)}&encounterType=${encodeURIComponent(
            encounterTypeUuid,
          )}&v=${v}&limit=50`,
        );
        const list = (res?.data as { results?: RawEncounter[] } | undefined)?.results ?? [];
        const mapped: CareCardEncounterRecord[] = list
          .filter((e): e is RawEncounter & { uuid: string } => Boolean(e?.uuid))
          .map((e) => ({
            uuid: e.uuid as string,
            encounterDatetime: e.encounterDatetime ?? '',
            encounterTypeUuid: e.encounterType?.uuid,
            encounterTypeName: e.encounterType?.display,
            display: e.display,
          }))
          .sort((a, b) => (b.encounterDatetime || '').localeCompare(a.encounterDatetime || ''));
        grouped[encounterTypeUuid] = mapped;
      } catch {
        grouped[encounterTypeUuid] = [];
      }
    }),
  );

  return grouped;
}
