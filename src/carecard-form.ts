/**
 * HIV Care Initiation and Discontinuation Form (ESM)
 *
 * The schema is sourced directly from the canonical `carecard-schema.json`
 * (which mirrors the Care Card JSON). This guarantees that every page
 * defined in the JSON (HIV Enrollment, ART Commencement, Followup Visits,
 * Discontinuations & Interruptions, Initial Clinical Evaluation) is
 * available to the dashboard registry without having to maintain a parallel
 * TypeScript copy.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
import schema from './carecard-schema.json';

export const careCradFormSchema = schema as unknown as {
  name: string;
  description?: string;
  version?: string;
  uuid: string;
  encounterType: string;
  processor?: string;
  published?: boolean;
  retired?: boolean;
  meta?: Record<string, unknown>;
  pages: Array<{
    label?: string;
    sections?: Array<{
      label?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questions?: any[];
    }>;
  }>;
};

export default careCradFormSchema;
