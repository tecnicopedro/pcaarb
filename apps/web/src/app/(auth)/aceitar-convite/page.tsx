import { Suspense } from 'react';
import { AcceptInviteForm } from './accept-invite-form';

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}
