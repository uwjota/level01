'use client';
import { useLinkStatus } from 'next/link';
export function NavigationHint() {
  const { pending } = useLinkStatus();
  return <i className={`navigation-hint${pending ? ' is-pending' : ''}`} aria-hidden="true" />;
}
