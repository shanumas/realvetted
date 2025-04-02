import { WebSocketMessage, ChatMessage } from "@shared/types";

type MessageHandler = (msg: ChatMessage) => void;
type ConnectionHandler = () => void;

class WebSocketClient {
  private socket: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private connectedHandlers: ConnectionHandler[] = [];
  private disconnectedHandlers: ConnectionHandler[] = [];
  private reconnectInterval: number = 3000;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private pingInterval: number | null = null;

  connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.socket = new WebSocket(wsUrl);
    
    this.socket.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;
      this.connectedHandlers.forEach(handler => handler());
      
      // Send ping every 30 seconds to keep connection alive
      this.pingInterval = window.setInterval(() => {
        this.send({ type: 'ping', data: {} });
      }, 30000);
    };
    
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        
        if (message.type === 'message') {
          this.messageHandlers.forEach(handler => handler(message.data));
        } else if (message.type === 'notification') {
          // Handle notifications
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
  
  disconnect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  send(message: WebSocketMessage) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
  
  sendChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>) {
    return this.send({
      type: 'message',
      data: {
        ...message,
        timestamp: new Date().toISOString()
      }
    });
  }
  
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
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
