import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, RefreshCw } from "lucide-react";
import { ChatMessage } from "@shared/types";
import websocketClient from "@/lib/websocket";

interface ChatWindowProps {
  propertyId: number;
  receiverId: number;
  receiverName: string;
}

export function ChatWindow({ propertyId, receiverId, receiverName }: ChatWindowProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Fetch previous messages
  const fetchMessages = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsRefreshing(true);
      const response = await fetch(`/api/messages/property/${propertyId}/user/${receiverId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load messages");
      }

      const data = await response.json();
      
      // Filter out any temporary messages
      const existingTempMessageIds = messages
        .filter(msg => typeof msg.id === 'string' && msg.id.startsWith('temp-'))
        .map(msg => msg.id);
      
      // Keep the messages that are from the server plus any pending temp messages
      // that haven't been received from the server yet
      const updatedMessages = [
        ...data,
        ...messages.filter(msg => 
          typeof msg.id === 'string' && 
          msg.id.startsWith('temp-') && 
          !data.some((serverMsg: ChatMessage) => 
            serverMsg.content === msg.content && 
            serverMsg.senderId === msg.senderId && 
            serverMsg.receiverId === msg.receiverId
          )
        )
      ];
      
      setMessages(updatedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast({
        title: "Error",
        description: "Could not load messages",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [propertyId, receiverId, toast, user, messages]);

  // Initial message fetch
  useEffect(() => {
    if (user) {
      fetchMessages();
      
      // Set user ID for WebSocket authentication
      websocketClient.setUserId(user.id);
    }
  }, [fetchMessages, user]);

  // Connect to WebSocket
  useEffect(() => {
    if (!user) return;
    
    // Ensure connection and authentication
    websocketClient.connect(user.id);

    const unsubscribe = websocketClient.onMessage((message: ChatMessage) => {
      console.log("Chat window received message:", message);
      
      // Only add the message if it's relevant to this chat (same property and either sender or receiver matches)
      if (
        message.propertyId === propertyId &&
        ((message.senderId === receiverId && message.receiverId === user.id) || 
         (message.senderId === user.id && message.receiverId === receiverId))
      ) {
        // Check if this is a new message or already in our list
        setMessages(prev => {
          // If this message is already in our list (by checking content, sender and timestamp), don't add it
          const isDuplicate = prev.some(m => 
            (m.id === message.id) || 
            (m.content === message.content && 
             m.senderId === message.senderId && 
             m.receiverId === message.receiverId &&
             // If it's a temp message that matches what we got from the server
             (typeof m.id === 'string' && m.id.startsWith('temp-')))
          );
          
          if (isDuplicate) {
            // Replace any temporary message with the server version
            return prev.map(m => 
              (typeof m.id === 'string' && m.id.startsWith('temp-') &&
               m.content === message.content && 
               m.senderId === message.senderId && 
               m.receiverId === message.receiverId)
                ? message 
                : m
            );
          } else {
            // Add as a new message
            return [...prev, message];
          }
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [propertyId, receiverId, user]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || !user) return;

    const success = websocketClient.sendChatMessage({
      propertyId,
      senderId: user.id,
      senderName: user.firstName || user.email,
      receiverId,
      content: message,
    });

    if (success) {
      setMessage("");
    } else {
      toast({
        title: "Error",
        description: "Could not send message. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleRefresh = () => {
    fetchMessages();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="p-2 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-sm font-medium">Chat with {receiverName}</h3>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh} 
          disabled={isRefreshing || isLoading}
          title="Refresh messages"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      
      {/* Chat Messages */}
      <div 
        ref={chatContainerRef}
        className="flex-1 p-4 space-y-4 overflow-y-auto"
        style={{ maxHeight: "350px" }}
      >
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center items-center h-full text-gray-500 text-sm">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isTemporary = typeof msg.id === 'string' && msg.id.startsWith('temp-');
            return (
              <div 
                key={`${msg.id}-${index}`}
                className={`flex items-start ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
              >
                {msg.senderId !== user?.id && (
                  <div className="flex-shrink-0 mr-3">
                    <div className="h-8 w-8 rounded-full bg-accent-200 flex items-center justify-center text-accent-700">
                      {receiverName.charAt(0).toUpperCase()}
                    </div>
                  </div>
                )}
                
                <div 
                  className={`py-2 px-3 rounded-lg max-w-[80%] ${
                    msg.senderId === user?.id 
                      ? isTemporary 
                        ? 'bg-primary-50 text-gray-700' // Lighter style for temporary messages
                        : 'bg-primary-100 text-gray-900' 
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                    <span>
                      {typeof msg.timestamp === 'string' 
                        ? new Date(msg.timestamp).toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            minute: '2-digit',
                            hour12: true 
                          }) 
                        : msg.timestamp.toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            minute: '2-digit',
                            hour12: true 
                          })
                      }
                    </span>
                    {isTemporary && (
                      <span className="ml-2">
                        <Loader2 className="h-3 w-3 inline-block animate-spin" />
                      </span>
                    )}
                  </div>
                </div>
                
                {msg.senderId === user?.id && (
                  <div className="flex-shrink-0 ml-3">
                    <div className="h-8 w-8 rounded-full bg-primary-200 flex items-center justify-center text-primary-700">
                      {user?.firstName?.charAt(0).toUpperCase() || user?.email.charAt(0).toUpperCase()}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="p-4 border-t border-gray-200">
        <form onSubmit={handleSendMessage} className="flex">
          <Input
            className="flex-1"
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!user}
          />
          <Button 
            type="submit" 
            className="ml-3" 
            disabled={!message.trim() || !user}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
