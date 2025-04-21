import React, { useState } from 'react';
import { Phone, Mail, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CopyableContactProps {
  label: string;
  value: string | undefined | null;
  type: 'phone' | 'email' | 'text';
  className?: string;
}

/**
 * A component for displaying contact information that can be clicked (to call/email)
 * and copied to clipboard.
 * 
 * @param label The label for the contact information (e.g., "Phone:", "Email:")
 * @param value The actual contact information (phone number, email, or text)
 * @param type The type of contact information ('phone', 'email', or 'text')
 * @param className Optional additional CSS classes
 */
export function CopyableContact({ label, value, type, className }: CopyableContactProps) {
  const [copied, setCopied] = useState(false);
  
  if (!value) return null;
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };
  
  let href = '';
  let icon = null;
  
  if (type === 'phone') {
    href = `tel:${value.replace(/\D/g, '')}`;
    icon = <Phone className="h-3.5 w-3.5 text-primary" />;
  } else if (type === 'email') {
    href = `mailto:${value}`;
    icon = <Mail className="h-3.5 w-3.5 text-primary" />;
  }
  
  return (
    <div className={`flex items-center justify-between ${className || ''}`}>
      <div className="flex items-center">
        {icon && <span className="mr-1.5">{icon}</span>}
        <span className="text-gray-500 mr-1.5">{label}</span>
        {href ? (
          <a 
            href={href} 
            className="font-medium text-primary hover:underline"
            target={type === 'email' ? '_blank' : undefined}
            rel={type === 'email' ? 'noopener noreferrer' : undefined}
          >
            {value}
          </a>
        ) : (
          <span className="font-medium">{value}</span>
        )}
      </div>
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6" 
              onClick={handleCopy}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{copied ? 'Copied!' : 'Copy to clipboard'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}