import { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { websocketClient } from '@/lib/websocket';
import { SupportChatMessage } from '@shared/types';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid'; // Using nanoid instead of uuid for smaller bundle size

const MAX_HEIGHT = 400; // Max height of the expanded chat window

export default function SupportChatBubble() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [showInitialForm, setShowInitialForm] = useState(true);
  
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Initialize with a unique session ID
  useEffect(() => {
    if (!sessionId) {
      setSessionId(nanoid());
    }
  }, [sessionId]);
  
  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
    }
  }, [messages]);
  
  // Listen for support chat messages
  useEffect(() => {
    // Handle support chat messages from WebSocket
    const handleSupportMessage = (data: any) => {
      if (data.sessionId === sessionId) {
        setMessages(prev => [...prev, data]);
      }
    };
    
    // Connect WebSocket if not already connected
    if (!websocketClient.isConnected()) {
      websocketClient.connect();
    }
    
    // Subscribe to support messages
    const unsubscribe = websocketClient.onMessage((message: any) => {
      if (message.type === 'support') {
        handleSupportMessage(message.data);
      }
    });
    
    return () => unsubscribe();
  }, [sessionId]);
  
  // Submit initial form
  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!customerName.trim()) {
      toast({
        title: "Name required",
        description: "Please provide your name so we can assist you better.",
        variant: "destructive"
      });
      return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      toast({
        title: "Valid email required",
        description: "Please provide a valid email address so we can follow up with you.",
        variant: "destructive"
      });
      return;
    }
    
    setShowInitialForm(false);
    
    // Add welcome message
    const welcomeMessage: SupportChatMessage = {
      id: `system-${Date.now()}`,
      sessionId,
      senderId: null,
      senderName: 'REALVetted Support',
      content: `Hello ${customerName}! How can we help you today?`,
      timestamp: new Date().toISOString(),
      isAdmin: true
    };
    
    setMessages([welcomeMessage]);
  };
  
  // Send a message
  const sendMessage = () => {
    if (!input.trim()) return;
    
    const timestamp = new Date().toISOString();
    
    // Create message object
    const newMessage: SupportChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId,
      senderId: user?.id || null,
      senderName: user?.firstName ? `${user.firstName} ${user.lastName || ''}` : customerName,
      content: input.trim(),
      timestamp,
      isAdmin: user?.role === 'admin',
      customerEmail: !user?.id ? customerEmail : undefined
    };
    
    // Add to local state immediately
    setMessages(prev => [...prev, newMessage]);
    
    // Send to server
    websocketClient.send({
      type: 'support',
      data: newMessage
    });
    
    // Handle first message notification to admin
    if (isFirstMessage && !user?.role?.includes('admin')) {
      // The server will handle sending the notification email
      setIsFirstMessage(false);
    }
    
    // Clear input
    setInput('');
  };
  
  // Handle keyboard input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Toggle chat open/closed
  const toggleChat = () => {
    setIsOpen(!isOpen);
  };
  
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {isOpen ? (
        <Card className="mb-2 w-80 md:w-96 shadow-lg border border-primary/20 overflow-hidden transition-all duration-300 ease-in-out">
          <CardHeader className="bg-primary text-primary-foreground p-3 flex flex-row justify-between items-center">
            <h3 className="font-medium">Customer Support</h3>
            <Button variant="ghost" size="icon" onClick={toggleChat} className="h-6 w-6 text-primary-foreground">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          
          <CardContent className="p-0">
            {showInitialForm ? (
              <form onSubmit={handleInitialSubmit} className="p-4 space-y-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input 
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input 
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="Your email address"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">Start Chat</Button>
              </form>
            ) : (
              <div 
                ref={messageContainerRef}
                className="overflow-y-auto p-3 space-y-3"
                style={{ maxHeight: MAX_HEIGHT }}
              >
                {messages.map((msg) => (
                  <div
                    key={String(msg.id)}
                    className={`flex ${msg.isAdmin || msg.senderId !== (user?.id || null) ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg ${
                        msg.isAdmin || msg.senderId !== (user?.id || null)
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-primary text-primary-foreground'
                      }`}
                    >
                      {(msg.isAdmin || msg.senderId !== (user?.id || null)) && (
                        <div className="text-xs font-medium mb-1">{msg.senderName}</div>
                      )}
                      <p className="text-sm break-words">{msg.content}</p>
                      <div className="text-xs opacity-70 text-right mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && !showInitialForm && (
                  <div className="text-center text-muted-foreground py-8">
                    Start the conversation by sending a message below.
                  </div>
                )}
              </div>
            )}
          </CardContent>
          
          {!showInitialForm && (
            <CardFooter className="p-3 border-t">
              <div className="flex w-full items-center space-x-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  className="flex-1"
                />
                <Button onClick={sendMessage} size="icon" className="shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      ) : (
        <Button
          onClick={toggleChat}
          size="icon"
          className="h-[60px] w-[60px] rounded-full shadow-lg bg-primary hover:bg-primary/90 transition-all duration-200"
        >
          <MessageSquare className="h-6 w-6 text-primary-foreground" />
          <span className="sr-only">Open support chat</span>
        </Button>
      )}
    </div>
  );
}