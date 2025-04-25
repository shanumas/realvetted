import React, { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Mail, MailOpen, AlertCircle, Check, Search, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Email } from "@shared/schema";

interface EmailListProps {
  emails: Email[];
  isLoading: boolean;
}

export function EmailList({ emails, isLoading }: EmailListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [showEmailDetail, setShowEmailDetail] = useState(false);

  // Filter emails based on search term
  const filteredEmails = emails.filter((email) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      email.subject.toLowerCase().includes(searchLower) ||
      email.to.some((recipient) => recipient.toLowerCase().includes(searchLower)) ||
      email.body.toLowerCase().includes(searchLower)
    );
  });

  const handleViewEmail = (email: Email) => {
    setSelectedEmail(email);
    setShowEmailDetail(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Search className="text-gray-400 h-5 w-5" />
        <Input
          placeholder="Search emails by subject, recipient or content..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center text-gray-500">
            <Mail className="h-10 w-10 animate-pulse mb-2" />
            <p>Loading emails...</p>
          </div>
        </div>
      ) : filteredEmails.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center text-gray-500">
            <MailOpen className="h-10 w-10 mb-2" />
            <p>No emails found{searchTerm ? " matching your search" : ""}</p>
          </div>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">Status</TableHead>
                <TableHead className="w-[180px]">Date</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="w-[200px]">Recipients</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmails.map((email) => (
                <TableRow key={email.id}>
                  <TableCell>
                    {email.status === "sent" ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <Check className="h-3 w-3 mr-1" />
                        Sent
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Failed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {formatDistanceToNow(new Date(email.timestamp || new Date()), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="font-medium">{email.subject}</TableCell>
                  <TableCell className="text-sm">
                    {email.to.slice(0, 2).join(", ")}
                    {email.to.length > 2 && ` +${email.to.length - 2} more`}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewEmail(email)}
                      title="View email details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Email Detail Dialog */}
      <Dialog open={showEmailDetail} onOpenChange={setShowEmailDetail}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{selectedEmail?.subject}</DialogTitle>
            <DialogDescription>
              {selectedEmail?.timestamp && 
                formatDistanceToNow(new Date(selectedEmail.timestamp || new Date()), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col">
              <div className="text-sm text-gray-500">Status</div>
              <div>
                {selectedEmail?.status === "sent" ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <Check className="h-3 w-3 mr-1" />
                    Sent
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Failed
                  </Badge>
                )}
                {selectedEmail?.status === "failed" && selectedEmail.errorMessage && (
                  <div className="mt-1 text-sm text-red-600 bg-red-50 p-2 rounded">
                    {selectedEmail.errorMessage}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="text-sm text-gray-500">To</div>
              <div>{selectedEmail?.to.join(", ")}</div>
            </div>
            {selectedEmail?.cc && selectedEmail.cc.length > 0 && (
              <div className="flex flex-col">
                <div className="text-sm text-gray-500">CC</div>
                <div>{selectedEmail.cc.join(", ")}</div>
              </div>
            )}
            <div className="flex flex-col">
              <div className="text-sm text-gray-500">Email Content</div>
              <div className="border rounded-md p-4 whitespace-pre-wrap">
                {selectedEmail?.body}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}