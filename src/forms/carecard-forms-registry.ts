/**
 * Care Card forms registry.
 *
 * Each page of the Care Card schema (`carecard-schema.json`) is exposed
 * as an independent "form" with its own encounter type, form UUID and
 * single-page sub-schema. The dashboard renders one tab per entry.
 */
import { careCradFormSchema } from '../carecard-form';

export interface CareCardFormSection {
  label?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  questions?: any[];
}

export interface CareCardFormSchemaSubset {
  name: string;
  uuid: string;
  encounterType: string;
  pages: Array<{
    label?: string;
    sections?: CareCardFormSection[];
  }>;
}

export interface CareCardFormDefinition {
  id: string;
  label: string;
  encounterType: string;
  formUuid: string;
  schema: CareCardFormSchemaSubset;
}

/**
 * Map of Care Card page label -> encounter type UUID. Variants are kept
 * to tolerate small spelling differences between the source JSON and
 * deployed concept dictionaries.
 */
const ENCOUNTER_TYPE_BY_PAGE_LABEL: Record<string, string> = {
  'HIV ENROLLMENT': 'd5b54bb3-a2bb-4b3a-9d0e-7f6f4a4e0b0a',
  'ART COMMENCEMENT': 'a8c3a1b8-8a3b-4d3a-9e3a-9b1f1e1c1a1a',
  'FOLLOWUP VISITS': 'b5b54bb3-a2bb-4b3a-9d0e-7f6f4a4e0b0b',
  'DISCONTINUATION AND INTERRUPTIONS': 'c5b54bb3-a2bb-4b3a-9d0e-7f6f4a4e0b0c',
  'INITIAL CLINICAL EVALUATION': 'd5b54bb3-a2bb-4b3a-9d0e-7f6f4a4e0b0d',
};

/**
 * Map of Care Card page label -> form UUID, mirroring the encounter type
 * map above. These UUIDs identify the deployed OpenMRS form definitions
 * for each Care Card page. Variants are listed to tolerate small spelling
 * differences between the source JSON and the deployed forms.
 */
const FORM_UUID_BY_PAGE_LABEL: Record<string, string> = {
  'HIV ENROLLMENT': 'c2df5a7d-05ac-4ae3-bcd0-39969f17dbab',
  'ART COMMENCEMENT': '38d688ed-a569-4868-b5b2-a2f204a2e572',
  'FOLLOWUP VISITS': '5d522e63-463e-4a9f-a2c1-7ebbe4069a49',
  'DISCONTINUATION AND INTERRUPTIONS': '5fbc99be-9aeb-4f94-85b0-b2fae88a0ced',
  'INITIAL CLINICAL EVALUATION': '2b8e038b-9b8d-4e73-b4ad-5f1d39499ff6',
};

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function lookupEncounterType(label: string, fallback: string): string {
  const key = label?.trim().toUpperCase();
  return ENCOUNTER_TYPE_BY_PAGE_LABEL[key] ?? fallback;
}

function lookupFormUuid(label: string, fallback: string): string {
  const key = label?.trim().toUpperCase();
  return FORM_UUID_BY_PAGE_LABEL[key] ?? fallback;
}

export function buildCareCardForms(): CareCardFormDefinition[] {
  const baseUuid = careCradFormSchema.uuid;
  const baseEncounterType = careCradFormSchema.encounterType;
  const pages = careCradFormSchema.pages ?? [];

  return pages
    .map((page, index) => {
      const label = page.label?.trim() || `Page ${index + 1}`;
      const id = slugify(label) || `page-${index + 1}`;
      const encounterType = lookupEncounterType(label, baseEncounterType);
      const formUuid = lookupFormUuid(label, `${baseUuid}-${id}`);

      const schema: CareCardFormSchemaSubset = {
        name: label,
        uuid: formUuid,
        encounterType,
        pages: [
          {
            label,
            sections: (page.sections ?? []) as CareCardFormSection[],
          },
        ],
      };

      return {
        id,
        label,
        encounterType,
        formUuid,
        schema,
      };
    })
    .filter((f) => f.schema.pages[0].sections && f.schema.pages[0].sections.length > 0);
}

export const CARE_CARD_FORMS: CareCardFormDefinition[] = buildCareCardForms();
