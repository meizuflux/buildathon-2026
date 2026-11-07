import React from 'react';
import { View } from 'react-native';
import { Card, Row, Icon, Title, Body, Badge, Attribution, Metadata, type IconName } from '../common/ui';
import type { Assignment } from '../../types/models';
export function AssignmentCard({ assignment, title, icon, stale }: { assignment: Assignment | null; title: string; icon: IconName; stale?: boolean }) {
  return <Card style={{ flex: 1 }}><Row style={{ justifyContent: 'space-between' }}><Icon name={icon} /><Metadata>{title}</Metadata></Row>{assignment ? <><Badge value={assignment.status} /><Title small>{assignment.name}</Title><Body muted>{assignment.description}</Body>{assignment.address && <Body>{assignment.address}</Body>}<View><Body muted>{assignment.organization}</Body><Attribution source={assignment.source} /></View>{stale && <Body muted>Saved assignment, current availability has not been verified.</Body>}</> : <><Title small>No assignment yet</Title><Body muted>Details will appear when the coordination team provides an assignment.</Body></>}</Card>;
}
