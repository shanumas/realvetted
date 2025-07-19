import React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { EmailList } from '@/components/email-outbox/email-list';

export default function AgentEmailOutbox() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  // Redirect if not authenticated or not an agent
  React.useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (user.role !== 'agent') {
      navigate('/');
      return;
    }
  }, [user, navigate]);

  if (!user || user.role !== 'agent') {
    return null;
  }

  return <EmailList userId={user.id} />;
}