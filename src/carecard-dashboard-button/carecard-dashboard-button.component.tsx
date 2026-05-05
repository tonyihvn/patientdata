/**
 * Care Card Dashboard Button Component
 *
 * This component renders a button on the OpenMRS 3 Patient Dashboard that allows users
 * to open the HIV Care Initiation and Discontinuation form (Care Card form) for the
 * currently selected patient.
 *
 * The button is positioned in the patient-chart-actions-slot and uses the OpenMRS
 * framework for navigation and patient context.
 */

import React, { useCallback, useMemo } from 'react';
import { Button } from '@carbon/react';
import { useTranslation } from 'react-i18next';
import { usePatient, navigate } from '@openmrs/esm-framework';
import styles from './carecard-dashboard-button.scss';

interface CarecardDashboardButtonProps {
  patientUuid?: string;
}

/**
 * Care Card Dashboard Button Component
 *
 * Opens the Care Card form (HIV Care Initiation and Discontinuation form) for
 * the currently selected patient when clicked.
 *
 * @component
 * @example
 * // Used as an extension in OpenMRS dashboard
 * <CarecardDashboardButton />
 */
const CarecardDashboardButton: React.FC<CarecardDashboardButtonProps> = ({ patientUuid }) => {
  const { t } = useTranslation();

  // The patient-actions-slot does not always pass `patientUuid`, so fall
  // back to extracting it from the patient-chart URL.
  const resolvedPatientUuid = useMemo(() => {
    if (patientUuid) return patientUuid;
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    const match = path.match(/\/patient\/([^/]+)\/chart/);
    return match?.[1];
  }, [patientUuid]);

  const { patient } = usePatient(resolvedPatientUuid);

  /**
   * Navigate to the Care Card form
   * Uses the OpenMRS navigate function to route to the form with patient context
   */
  const openCarecardForm = useCallback(() => {
    if (resolvedPatientUuid) {
      // Navigate to the standalone Care Card form page, passing the
      // patient UUID via query parameter so the form loads for them.
      navigate({
        to: `${window.getOpenmrsSpaBase()}patientdata?patientUuid=${encodeURIComponent(resolvedPatientUuid)}`,
      });
    }
  }, [resolvedPatientUuid]);

  if (!patient || !resolvedPatientUuid) {
    return null;
  }

  return (
    <div className={styles.container}>
      <Button
        kind="primary"
        onClick={openCarecardForm}
        className={styles.button}
        title={t('careCradForm.tooltipText', 'Open HIV Care Initiation and Discontinuation Form')}
      >
        {t('careCradForm.buttonLabel', 'Care Card')}
      </Button>
    </div>
  );
};

export default CarecardDashboardButton;
