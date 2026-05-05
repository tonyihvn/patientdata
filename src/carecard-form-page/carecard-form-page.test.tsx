import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Minimal schema that exercises the Carbon-driven renderer.
jest.mock('../carecard-form', () => ({
  careCradFormSchema: {
    uuid: 'form-uuid',
    encounterType: 'encounter-type-uuid',
    pages: [
      {
        label: 'Page 1',
        sections: [
          {
            label: 'Demographics',
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
}));

import CarecardFormPage from './carecard-form-page.component';

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

describe('CarecardFormPage (Carbon)', () => {
  it('shows the patient UUID picker when no patient is in the URL', () => {
    setLocation('');
    render(<CarecardFormPage />);
    expect(screen.getByLabelText(/Patient UUID/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Load form/i })).toBeInTheDocument();
  });

  it('renders the Carbon-driven form when a patient UUID is supplied via query', () => {
    setLocation('?patientUuid=patient-1');
    render(<CarecardFormPage />);
    expect(screen.getByLabelText(/Occupation/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Care Card/i })).toBeInTheDocument();
  });

  it('submits collected obs to /ws/rest/v1/encounter', async () => {
    setLocation('?patientUuid=patient-1');
    mockFetch.mockResolvedValue({ data: { uuid: 'enc-1' } });

    render(<CarecardFormPage />);

    const select = screen.getByLabelText(/Occupation/i) as HTMLSelectElement;
    await userEvent.selectOptions(select, 'EMPLOYED');

    await userEvent.click(screen.getByRole('button', { name: /Save Care Card/i }));

    await waitFor(() => expect(mockFetch.mock.calls.some((c) => c[0] === '/ws/rest/v1/encounter')).toBe(true));
    const encounterCall = mockFetch.mock.calls.find((c) => c[0] === '/ws/rest/v1/encounter');
    expect(encounterCall).toBeDefined();
    const [url, init] = encounterCall!;
    expect(url).toBe('/ws/rest/v1/encounter');
    expect(init.method).toBe('POST');
    expect(init.body.patient).toBe('patient-1');
    expect(init.body.encounterType).toBe('encounter-type-uuid');
    expect(init.body.form).toBe('form-uuid');
    expect(init.body.obs).toEqual([{ concept: 'CONCEPT-OCC', value: 'EMPLOYED' }]);
  });
});
