import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Email } from '@shared/schema';
import { Loader2 } from 'lucide-react';

interface EmailListProps {
  userId: number;
}

export function EmailList({ userId }: EmailListProps) {
  // Fetch user's emails
  const { data: emails, isLoading } = useQuery<Email[]>({
    queryKey: ['/api/emails/user', userId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/emails/user/${userId}`);
      return response.json();
    },
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2">Loading emails...</p>
      </div>
    );
  }

  if (!emails || emails.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        No emails found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {emails.map((email) => (
        <div
          key={email.id}
          className="p-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium">{email.subject}</h3>
              <p className="text-sm text-gray-500">{email.to.join(', ')}</p>
            </div>
            <span className={`text-sm px-2 py-1 rounded ${
              email.status === 'sent' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {email.status}
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-600">{email.body}</p>
          <div className="mt-2 text-xs text-gray-400">
            {email.timestamp ? new Date(email.timestamp).toLocaleString() : 'No timestamp'}
          </div>
        </div>
      ))}
    </div>
  );
}