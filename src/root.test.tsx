import React from 'react';
import { render, screen } from '@testing-library/react';
import Root from './root.component';

jest.mock('@openmrs/esm-form-engine-lib', () => ({
  FormEngine: () => <div data-testid="form-engine" />,
}));

jest.mock('@openmrs/esm-framework', () => ({
  ...jest.requireActual('@openmrs/esm-framework'),
  usePatient: () => ({ patient: undefined, isLoading: false }),
  useSession: () => ({ sessionLocation: { uuid: '', display: '' } }),
  openmrsFetch: jest.fn().mockResolvedValue({ data: { results: [] } }),
  showSnackbar: jest.fn(),
  navigate: jest.fn(),
}));

it('renders the Care Card dashboard at the patientdata route', () => {
  render(<Root />);
  expect(screen.getByText(/care card/i)).toBeInTheDocument();
});
