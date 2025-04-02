import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Fetch previous messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const response = await fetch(`/api/messages/property/${propertyId}/user/${receiverId}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to load messages");
        }

        const data = await response.json();
        setMessages(data);
      } catch (error) {
        console.error("Error fetching messages:", error);
        toast({
          title: "Error",
          description: "Could not load previous messages",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
  }, [propertyId, receiverId, toast]);

  // Connect to WebSocket
  useEffect(() => {
    websocketClient.connect();

    const unsubscribe = websocketClient.onMessage((message: ChatMessage) => {
      // Only add the message if it's relevant to this chat (same property and either sender or receiver matches)
      if (
        message.propertyId === propertyId &&
        ((message.senderId === receiverId && message.receiverId === user?.id) || 
         (message.senderId === user?.id && message.receiverId === receiverId))
      ) {
        setMessages(prev => [...prev, message]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [propertyId, receiverId, user?.id]);

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

  return (
    <div className="flex flex-col h-full">
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
          messages.map((msg, index) => (
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
                    ? 'bg-primary-100 text-gray-900' 
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="text-sm">{msg.content}</p>
                <p className="text-xs text-gray-500 mt-1">
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
                </p>
              </div>
              
              {msg.senderId === user?.id && (
                <div className="flex-shrink-0 ml-3">
                  <div className="h-8 w-8 rounded-full bg-primary-200 flex items-center justify-center text-primary-700">
                    {user?.firstName?.charAt(0).toUpperCase() || user?.email.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
            </div>
          ))
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
          />
          <Button type="submit" className="ml-3" disabled={!message.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
