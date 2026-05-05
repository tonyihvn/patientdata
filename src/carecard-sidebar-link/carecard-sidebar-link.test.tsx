/**
 * Tests for CarecardSidebarLink component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter as Router } from 'react-router-dom';
import { usePatient } from '@openmrs/esm-framework';
import CarecardSidebarLink from './carecard-sidebar-link.component';

// Mock dependencies
jest.mock('@openmrs/esm-framework', () => ({
  usePatient: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string) => defaultValue,
  }),
}));

describe('CarecardSidebarLink', () => {
  const mockPatientUuid = 'test-patient-uuid-123';
  const mockPatient = {
    resourceType: 'Patient' as const,
    id: mockPatientUuid,
    name: [{ given: ['John'], family: 'Doe' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (window as any).getOpenmrsSpaBase = jest.fn(() => '/openmrs/spa/');
  });

  it('should render sidebar link when patient data is available', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: mockPatient,
      isLoading: false,
      error: null,
    });

    render(
      <Router>
        <CarecardSidebarLink patientUuid={mockPatientUuid} />
      </Router>,
    );

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('Care Card');
  });

  it('should not render when patientUuid is not provided', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: mockPatient,
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <Router>
        <CarecardSidebarLink />
      </Router>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('should not render when patient data is not available', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(
      <Router>
        <CarecardSidebarLink patientUuid={mockPatientUuid} />
      </Router>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('should have correct link URL', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: mockPatient,
      isLoading: false,
      error: null,
    });

    render(
      <Router>
        <CarecardSidebarLink patientUuid={mockPatientUuid} />
      </Router>,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', `/openmrs/spa/patientdata?patientUuid=${encodeURIComponent(mockPatientUuid)}`);
  });

  it('should display description text', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: mockPatient,
      isLoading: false,
      error: null,
    });

    render(
      <Router>
        <CarecardSidebarLink patientUuid={mockPatientUuid} />
      </Router>,
    );

    expect(screen.getByText('Care Card')).toBeInTheDocument();
  });
});
