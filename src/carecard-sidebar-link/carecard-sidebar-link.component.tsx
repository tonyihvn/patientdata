/**
 * Care Card Sidebar Link Component
 *
 * This component renders a link in the patient dashboard sidebar that allows
 * users to quickly access the Care Card form from the Patient Summary page.
 *
 * This can be added as an extension to the patient-banner-actions-slot or
 * similar sidebar slot depending on your OpenMRS configuration.
 */

import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePatient } from '@openmrs/esm-framework';
import { Document } from '@carbon/react/icons';
import styles from './carecard-sidebar-link.scss';

interface CarecardSidebarLinkProps {
  patientUuid?: string;
  basePath?: string;
}

/**
 * Care Card Sidebar Link Component
 *
 * Renders a sidebar link to the Care Card form for the current patient.
 *
 * @component
 * @example
 * // Used as an extension in the patient summary sidebar
 * <CarecardSidebarLink patientUuid="patient-uuid" />
 */
const CarecardSidebarLink: React.FC<CarecardSidebarLinkProps> = ({ patientUuid, basePath }) => {
  const { t } = useTranslation();

  // The patient-chart-dashboard-slot passes a `basePath` like
  // `/openmrs/spa/patient/<uuid>/chart`. When rendered from there we
  // don't get a `patientUuid` prop, so derive it from the URL.
  const resolvedPatientUuid = useMemo(() => {
    if (patientUuid) return patientUuid;
    const source = basePath ?? (typeof window !== 'undefined' ? window.location.pathname : '');
    const match = source.match(/\/patient\/([^/]+)\/chart/);
    return match?.[1];
  }, [patientUuid, basePath]);

  const { patient } = usePatient(resolvedPatientUuid);

  // Build the link URL — point to the standalone Care Card page with the
  // patient UUID in the query string so the form loads in that context.
  const linkUrl = useMemo(() => {
    if (!resolvedPatientUuid) return null;
    return `${window.getOpenmrsSpaBase()}patientdata?patientUuid=${encodeURIComponent(resolvedPatientUuid)}`;
  }, [resolvedPatientUuid]);

  if (!patient || !resolvedPatientUuid || !linkUrl) {
    return null;
  }

  return (
    <div className={styles.sidebarLink}>
      <Link to={linkUrl} className={styles.link}>
        <span className={styles.icon}>
          <Document size={16} />
        </span>
        <span className={styles.label}>{t('careCradForm.sidebarLabel', 'Care Card')}</span>
      </Link>
    </div>
  );
};

export default CarecardSidebarLink;
