/**
 * Tests for the Care Card dashboard.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// Replace the heavy real schema with a tiny one so we can test the
// dashboard wiring without dragging the full HIV form into the test.
jest.mock('../carecard-form', () => ({
  careCradFormSchema: {
    name: 'Care Card',
    uuid: 'form-uuid',
    encounterType: 'fallback-encounter-type',
    pages: [
      {
        label: 'HIV ENROLLMENT',
        sections: [
          {
            label: 'Initial Visit',
            questions: [
              {
                id: 'occupation',
                label: 'Occupation',
                type: 'obs',
                questionOptions: {
                  rendering: 'select',
                  concept: 'CONCEPT-OCC',
                  answers: [
                    { concept: 'EMPLOYED', label: 'Employed' },
                    { concept: 'UNEMPLOYED', label: 'Unemployed' },
                  ],
                },
              },
            ],
          },
        ],
      },
      {
        label: 'ART COMMENCEMENT',
        sections: [
          {
            label: 'Start of ART',
            questions: [
              {
                id: 'startDate',
                label: 'ART Start Date',
                type: 'obs',
                questionOptions: { rendering: 'text', concept: 'CONCEPT-START' },
              },
            ],
          },
        ],
      },
    ],
  },
}));

const mockFetch = jest.fn();
const mockSnackbar = jest.fn();

jest.mock('@openmrs/esm-framework', () => ({
  openmrsFetch: (...args: unknown[]) => mockFetch(...args),
  showSnackbar: (...args: unknown[]) => mockSnackbar(...args),
  useSession: () => ({
    sessionLocation: { uuid: 'loc-1' },
    currentProvider: { uuid: 'prov-1' },
  }),
  usePatient: (uuid?: string) => ({
    patient: uuid ? { id: uuid } : null,
    isLoading: false,
    error: null,
    patientUuid: uuid,
  }),
}));

import CarecardDashboard from './carecard-dashboard.component';

const originalLocation = window.location;
function setLocation(search: string, pathname = '/') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, pathname, search, href: `http://localhost${pathname}${search}` },
  });
}

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  mockFetch.mockReset();
  mockSnackbar.mockReset();
});

describe('CarecardDashboard', () => {
  it('shows the patient picker when no patient is supplied', () => {
    setLocation('');
    render(<CarecardDashboard />);
    expect(screen.getByLabelText(/Patient UUID/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load dashboard/i })).toBeInTheDocument();
  });

  it('renders the default form when a patient UUID is supplied', async () => {
    setLocation('?patientUuid=patient-1');
    mockFetch.mockResolvedValue({ data: { results: [] } });

    render(<CarecardDashboard />);

    // The default-selected form's renderer should be visible.
    await waitFor(() => expect(screen.getByLabelText(/Occupation/i)).toBeInTheDocument());
  });

  it('shows an empty-history message when the patient has no prior records', async () => {
    setLocation('?patientUuid=patient-1');
    mockFetch.mockResolvedValue({ data: { results: [] } });

    render(<CarecardDashboard />);

    await waitFor(() => expect(screen.getByText(/No saved Care Card records yet/i)).toBeInTheDocument());
  });

  it('renders a previous record per encounter type with View / Edit actions', async () => {
    setLocation('?patientUuid=patient-1');
    // encounter type for 'HIV ENROLLMENT' from the forms registry
    const hivEnrollmentEncounterType = 'd5b54bb3-a2bb-4b3a-9d0e-7f6f4a4e0b0a';
    mockFetch.mockImplementation((url: string) => {
      if (url.includes(`encounterType=${hivEnrollmentEncounterType}`)) {
        return Promise.resolve({
          data: {
            results: [
              {
                uuid: 'enc-old-1',
                encounterDatetime: '2024-01-15T09:00:00.000Z',
                encounterType: { uuid: hivEnrollmentEncounterType, display: 'HIV Enrollment' },
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: { results: [] } });
    });

    render(<CarecardDashboard />);

    const viewButtons = await screen.findAllByRole('button', { name: /^View$/i });
    expect(viewButtons.length).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: /^Edit$/i })).toBeInTheDocument();
  });
});
