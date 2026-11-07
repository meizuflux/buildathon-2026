import React from 'react';
import { Page, QueryState } from '../../components/common/ui';
import { HouseholdWizard } from '../../components/household/HouseholdWizard';
import { useHousehold } from '../../hooks/queries';
export default function Onboarding() { const query = useHousehold(); return <Page eyebrow="LET’S START WITH YOUR PEOPLE" title={query.data ? 'Update your household.' : 'A place for your whole household.'} subtitle="A few details help your coordination team understand what you need."><QueryState query={query}>{query.data !== undefined && <HouseholdWizard initial={query.data} />}</QueryState></Page>; }
