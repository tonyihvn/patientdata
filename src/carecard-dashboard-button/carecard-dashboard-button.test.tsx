/**
 * Tests for CarecardDashboardButton component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { usePatient, navigate } from '@openmrs/esm-framework';
import CarecardDashboardButton from './carecard-dashboard-button.component';

// Mock dependencies
jest.mock('@openmrs/esm-framework', () => ({
  ...jest.requireActual('@openmrs/esm-framework'),
  usePatient: jest.fn(),
  navigate: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string) => defaultValue,
  }),
}));

describe('CarecardDashboardButton', () => {
  const mockPatientUuid = 'test-patient-uuid-123';
  const mockPatient = {
    resourceType: 'Patient' as const,
    id: mockPatientUuid,
    name: [{ given: ['John'], family: 'Doe' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render button when patient data is available', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: mockPatient,
      isLoading: false,
      error: null,
    });

    render(<CarecardDashboardButton patientUuid={mockPatientUuid} />);

    const button = screen.getByRole('button', { name: /Care Card/i });
    expect(button).toBeInTheDocument();
  });

  it('should not render when patientUuid is not provided', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: mockPatient,
      isLoading: false,
      error: null,
    });

    const { container } = render(<CarecardDashboardButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should not render when patient data is not available', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(<CarecardDashboardButton patientUuid={mockPatientUuid} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should navigate to care card form when button is clicked', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: mockPatient,
      isLoading: false,
      error: null,
    });

    // Mock window.getOpenmrsSpaBase
    (window as any).getOpenmrsSpaBase = jest.fn(() => '/openmrs/spa/');

    render(<CarecardDashboardButton patientUuid={mockPatientUuid} />);

    const button = screen.getByRole('button', { name: /Care Card/i });
    fireEvent.click(button);

    expect(navigate).toHaveBeenCalledWith({
      to: `/openmrs/spa/patientdata?patientUuid=${encodeURIComponent(mockPatientUuid)}`,
    });
  });

  it('should have correct tooltip text', () => {
    (usePatient as jest.Mock).mockReturnValue({
      patient: mockPatient,
      isLoading: false,
      error: null,
    });

    render(<CarecardDashboardButton patientUuid={mockPatientUuid} />);

    const button = screen.getByRole('button', { name: /Care Card/i });
    expect(button).toHaveAttribute('title', 'Open HIV Care Initiation and Discontinuation Form');
  });
});
