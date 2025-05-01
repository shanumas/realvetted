import { ChatMessage, WebSocketMessage } from '@shared/types';

interface WebSocketEventHandlers {
  onOpen?: () => void;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onClose?: () => void;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private messageQueue: WebSocketMessage[] = [];
  private handlers: WebSocketEventHandlers = {};
  private pingInterval: NodeJS.Timeout | null = null;
  private userId: number | null = null;

  constructor() {
    // Initialize connection when class is instantiated
  }

  public connect(userId: number, handlers: WebSocketEventHandlers = {}) {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.userId = userId;
    this.handlers = handlers;
    this.isConnecting = true;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const path = '/ws';
    const url = `${protocol}://${window.location.host}${path}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('WebSocket connection established');
        this.isConnecting = false;
        this.reconnectAttempt = 0;
        
        // Send authentication message immediately after connection
        this.authenticate();
        
        // Set up ping interval to keep connection alive
        this.startPingInterval();
        
        // Send any queued messages
        this.flushQueue();
        
        if (this.handlers.onOpen) {
          this.handlers.onOpen();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle pong message internally
          if (data.type === 'pong') {
            console.log('Pong received from server');
            return;
          }
          
          // Dispatch the message to window so all components can listen to it
          window.dispatchEvent(new MessageEvent('message', { data: event.data }));
          
          // Also call the handler if provided
          if (this.handlers.onMessage) {
            this.handlers.onMessage(data);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (this.handlers.onError) {
          this.handlers.onError(error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket connection closed');
        this.isConnecting = false;
        this.clearPingInterval();
        
        if (this.handlers.onClose) {
          this.handlers.onClose();
        }
        
        // Attempt to reconnect if we haven't exceeded the limit
        if (this.reconnectAttempt < this.maxReconnectAttempts) {
          this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempt++;
            console.log(`Attempting to reconnect (${this.reconnectAttempt}/${this.maxReconnectAttempts})...`);
            this.connect(this.userId!, this.handlers);
          }, this.reconnectDelay);
        } else {
          console.log('Max reconnect attempts reached, giving up');
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
    }
  }

  public disconnect() {
    if (this.ws) {
      this.clearPingInterval();
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      this.ws.close();
      this.ws = null;
      this.userId = null;
    }
  }
  
  public setUserId(userId: number) {
    this.userId = userId;
    
    // If already connected, just authenticate with the new userId
    if (this.isConnected()) {
      this.authenticate();
    } else {
      // Otherwise, connect with the new userId
      this.connect(userId, this.handlers);
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public sendMessage(message: WebSocketMessage) {
    if (this.isConnected()) {
      this.ws!.send(JSON.stringify(message));
    } else {
      // Queue message to be sent when connection is established
      this.messageQueue.push(message);
    }
  }

  public sendChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>) {
    const chatMessage: WebSocketMessage = {
      type: 'message',
      data: {
        ...message,
        id: `temp-${Date.now()}`,  // Temporary ID, server will replace
        timestamp: new Date()
      }
    };
    this.sendMessage(chatMessage);
  }

  private authenticate() {
    if (this.userId) {
      this.sendMessage({
        type: 'auth',
        data: { userId: this.userId }
      });
    }
  }

  private startPingInterval() {
    this.clearPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendMessage({ type: 'ping', data: {} });
      }
    }, 30000); // Send ping every 30 seconds
  }

  private clearPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private flushQueue() {
    if (this.isConnected() && this.messageQueue.length > 0) {
      console.log(`Sending ${this.messageQueue.length} queued messages`);
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        if (message) {
          this.sendMessage(message);
        }
      }
    }
  }
}

// Singleton instance
export const websocketClient = new WebSocketClient();