# Care Card Sidebar Link

## Overview

The Care Card Sidebar Link is a sidebar navigation component that appears on the Patient Summary/Dashboard page. It provides quick access to the Care Card form with a single click.

## Features

- ✅ Displays on patient dashboard sidebar
- ✅ One-click access to Care Card form
- ✅ Contextual to current patient
- ✅ Icon and description text
- ✅ Responsive design
- ✅ Fully tested

## File Structure

```
carecard-sidebar-link/
├── carecard-sidebar-link.component.tsx    Main component (link)
├── carecard-sidebar-link.scss             Styling
├── carecard-sidebar-link.test.tsx        Unit tests
└── README.md                              This file
```

## Component Props

### `CarecardSidebarLinkProps`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `patientUuid` | `string` | No | UUID of the patient. If not provided, uses context from `usePatient()` |

## Usage

### As an OpenMRS Extension

Register in `routes.json`:

```json
{
  "name": "Care Card Sidebar Link",
  "component": "careCradSidebarLink",
  "slot": "patient-banner-extra-actions" 
}
```

### Importing in Code

```typescript
import CarecardSidebarLink from './carecard-sidebar-link';

// Use it in a component
<CarecardSidebarLink patientUuid="patient-uuid-123" />
```

## Appearance

The component displays as a clickable link with:
- 📋 Chart icon
- "Care Card" label
- "HIV Care Initiation and Discontinuation" description

```
┌─────────────────────────────────┐
│ 📋 Care Card                    │
│    HIV Care Initiation and      │
│    Discontinuation              │
└─────────────────────────────────┘
```

## Integration

### 1. Export from index.ts

Add to `src/index.ts`:

```typescript
export const careCradSidebarLink = getAsyncLifecycle(
  () => import('./carecard-sidebar-link/carecard-sidebar-link.component'),
  options
);
```

### 2. Register in routes.json

Add extension to appropriate sidebar slot:

```json
{
  "name": "Care Card Sidebar Link",
  "component": "careCradSidebarLink",
  "slot": "patient-banner-extra-actions",
  "order": 1
}
```

### 3. Update Translations

Add to `translations/en.json`:

```json
{
  "careCradForm": {
    "sidebarLabel": "Care Card",
    "sidebarDescription": "HIV Care Initiation and Discontinuation"
  }
}
```

## Styling

The component uses:
- ✅ Carbon Layout system (`@carbon/layout`)
- ✅ Responsive spacing
- ✅ Hover effects
- ✅ Accessibility-friendly colors

## Testing

Run tests:

```bash
npm test carecard-sidebar-link
```

### Test Coverage

- ✅ Renders link when patient data available
- ✅ Hides link when patient data missing
- ✅ Has correct link URL
- ✅ Displays description text

## Accessibility

- ✅ Semantic HTML (`<a>` tag)
- ✅ Keyboard navigation support
- ✅ Screen reader friendly
- ✅ High contrast colors

## Performance

- ✅ Lazy loaded as ESM extension
- ✅ Minimal re-renders
- ✅ No external API calls

## Related Files

- [carecard-dashboard-button](../carecard-dashboard-button) - Dashboard action button
- [carecard-form-page](../carecard-form-page) - Form page component
- [src/carecard-form.ts](../carecard-form.ts) - Form schema
- [routes.json](../routes.json) - Extension registration

---

**Component Version:** 1.0  
**Last Updated:** 2024  
**Status:** ✅ Production Ready
