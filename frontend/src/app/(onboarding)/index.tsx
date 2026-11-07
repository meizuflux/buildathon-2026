import React from 'react';
import { Page, QueryState } from '../../components/common/ui';
import { HouseholdWizard } from '../../components/household/HouseholdWizard';
import { useHousehold } from '../../hooks/queries';
export default function Onboarding() { const query = useHousehold(); return <Page title={query.data ? 'Edit household' : 'Set up household'} subtitle="Add household members, support needs, resources, and location."><QueryState query={query}>{query.data !== undefined && <HouseholdWizard initial={query.data} />}</QueryState></Page>; }
