import { WebSocketMessage, ChatMessage, SupportChatMessage } from "@shared/types";

type MessageHandler = (msg: ChatMessage | SupportChatMessage) => void;
type NotificationHandler = (data: any) => void;
type SupportMessageHandler = (msg: SupportChatMessage) => void;
type ConnectionHandler = () => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private notificationHandlers: NotificationHandler[] = [];
  private connectedHandlers: ConnectionHandler[] = [];
  private disconnectedHandlers: ConnectionHandler[] = [];
  private reconnectInterval: number = 3000;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private pingInterval: number | null = null;
  private userId: number | null = null;
  private pendingMessages: WebSocketMessage[] = [];

  connect(userId?: number) {
    if (userId) {
      this.userId = userId;
    }
    
    if (this.socket?.readyState === WebSocket.OPEN) {
      // If already connected and we just got a userId, send auth message
      if (userId && this.userId) {
        this.sendAuth();
      }
      
      // Send any pending messages
      this.processPendingMessages();
      return;
    }
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    console.log("Connecting to WebSocket server...");
    this.socket = new WebSocket(wsUrl);
    
    this.socket.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;
      this.connectedHandlers.forEach(handler => handler());
      
      // Authenticate if we have a user ID
      if (this.userId) {
        this.sendAuth();
      }
      
      // Send any pending messages
      this.processPendingMessages();
      
      // Send ping every 30 seconds to keep connection alive
      this.pingInterval = window.setInterval(() => {
        this.send({ type: 'ping', data: {} });
      }, 30000);
    };
    
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        console.log("Received WebSocket message:", message.type);
        
        if (message.type === 'message') {
          console.log("Received chat message:", message.data);
          this.messageHandlers.forEach(handler => handler(message.data));
        } else if (message.type === 'support') {
          console.log("Received support chat message:", message.data);
          this.messageHandlers.forEach(handler => handler(message.data));
        } else if (message.type === 'notification') {
          console.log("Received notification:", message.data);
          this.notificationHandlers.forEach(handler => handler(message.data));
        } else if (message.type === 'pong') {
          // Server responded to ping, connection is alive
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };
    
    this.socket.onclose = () => {
      console.log("WebSocket disconnected");
      this.disconnectedHandlers.forEach(handler => handler());
      
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      
      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    };
    
    this.socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }
  
  setUserId(userId: number) {
    this.userId = userId;
    if (this.isConnected()) {
      this.sendAuth();
    } else {
      this.connect();
    }
  }
  
  private sendAuth() {
    if (this.userId) {
      this.send({
        type: 'auth',
        data: { userId: this.userId }
      });
    }
  }
  
  private processPendingMessages() {
    while (this.pendingMessages.length > 0 && this.isConnected()) {
      const message = this.pendingMessages.shift();
      if (message) {
        this.directSend(message);
      }
    }
  }
  
  disconnect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  private directSend(message: WebSocketMessage): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
  
  send(message: WebSocketMessage): boolean {
    if (this.isConnected()) {
      return this.directSend(message);
    } else {
      // Queue message to send when connection is established
      this.pendingMessages.push(message);
      this.connect();
      return true; // Optimistically return true since we'll try to send it
    }
  }
  
  sendChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>) {
    const timestamp = new Date().toISOString();
    const chatMsg = {
      ...message,
      timestamp
    };
    
    // Immediately call message handlers with a temporary message ID
    // This allows the message to appear in the UI right away
    const tempMessage: ChatMessage = {
      ...chatMsg,
      id: `temp-${Date.now()}`,
      senderName: message.senderName
    };
    
    // Notify local handlers (UI) immediately
    setTimeout(() => {
      this.messageHandlers.forEach(handler => handler(tempMessage));
    }, 0);
    
    // Send to server
    return this.send({
      type: 'message',
      data: chatMsg
    });
  }
  
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }
  
  onNotification(handler: NotificationHandler) {
    this.notificationHandlers.push(handler);
    return () => {
      this.notificationHandlers = this.notificationHandlers.filter(h => h !== handler);
    };
  }
  
  onConnected(handler: ConnectionHandler) {
    this.connectedHandlers.push(handler);
    return () => {
      this.connectedHandlers = this.connectedHandlers.filter(h => h !== handler);
    };
  }
  
  onDisconnected(handler: ConnectionHandler) {
    this.disconnectedHandlers.push(handler);
    return () => {
      this.disconnectedHandlers = this.disconnectedHandlers.filter(h => h !== handler);
    };
  }
  
  isConnected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const websocketClient = new WebSocketClient();

export default websocketClient;
