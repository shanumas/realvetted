import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { storage } from "./storage";
import { ChatMessage, WebSocketMessage } from "@shared/types";

interface Client {
  socket: WebSocket;
  userId?: number;
  lastPing: number;
}

export function setupWebSocketServer(server: Server, supportChatHandler?: Function) {
  // Create WebSocket server on a specific path
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  // Store connected clients
  const clients = new Map<WebSocket, Client>();
  
  wss.on('connection', (socket) => {
    console.log('New WebSocket connection established');
    
    // Add client to connected clients
    clients.set(socket, { 
      socket, 
      lastPing: Date.now() 
    });
    
    // Handle messages
    socket.on('message', async (message) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.toString());
        const client = clients.get(socket);
        
        switch (data.type) {
          case 'message':
            await handleChatMessage(data.data, client);
            break;
          
          case 'support':
            // Handle support chat messages
            if (supportChatHandler) {
              const result = await supportChatHandler(data.data, client);
              if (result) {
                // Broadcast support message to admins
                broadcastToAdmins({
                  type: 'support',
                  data: result
                });
                
                // Send back to the original sender
                socket.send(JSON.stringify({
                  type: 'support',
                  data: result
                }));
              }
            }
            break;
            
          case 'ping':
            // Update last ping time
            if (client) {
              client.lastPing = Date.now();
              socket.send(JSON.stringify({ type: 'pong', data: {} }));
            }
            break;
            
          case 'auth':
            // Authenticate client
            if (client && data.data?.userId) {
              client.userId = data.data.userId;
              console.log(`Client authenticated: User ID ${data.data.userId}`);
              socket.send(JSON.stringify({ type: 'notification', data: { message: 'Authentication successful' } }));
            }
            break;
            
          default:
            console.log(`Unknown message type: ${data.type}`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    // Handle disconnection
    socket.on('close', () => {
      console.log('WebSocket connection closed');
      clients.delete(socket);
    });
  });
  
  // Ping clients every 30 seconds to keep connections alive
  setInterval(() => {
    const now = Date.now();
    clients.forEach((client, socket) => {
      // If no ping received in last 60 seconds, close connection
      if (now - client.lastPing > 60000) {
        console.log('Closing inactive connection');
        socket.terminate();
        clients.delete(socket);
        return;
      }
      
      // Send ping if socket is open
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', data: {} }));
      }
    });
  }, 30000);
  
  // Handle chat messages
  async function handleChatMessage(message: ChatMessage, client?: Client) {
    try {
      // Validate message
      if (!message.propertyId || !message.senderId || !message.receiverId || !message.content) {
        return;
      }
      
      // Optional: Verify sender ID matches authenticated user
      if (client?.userId && client.userId !== message.senderId) {
        console.log(`User ID mismatch: ${client.userId} vs ${message.senderId}`);
        return;
      }
      
      // Store message in database
      const newMessage = await storage.createMessage({
        propertyId: message.propertyId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        content: message.content
      });
      
      // Format message for broadcast
      const formattedMessage: ChatMessage = {
        id: newMessage.id,
        propertyId: newMessage.propertyId,
        senderId: newMessage.senderId,
        senderName: message.senderName || "User",
        receiverId: newMessage.receiverId,
        content: newMessage.content,
        timestamp: newMessage.timestamp || new Date().toISOString()
      };
      
      // Broadcast to sender and receiver
      broadcastToUsers([message.senderId, message.receiverId], {
        type: 'message',
        data: formattedMessage
      });
    } catch (error) {
      console.error('Error handling chat message:', error);
    }
  }
  
  // Broadcast message to specific users
  function broadcastToUsers(userIds: number[], message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    
    clients.forEach((client) => {
      if (client.userId && userIds.includes(client.userId) && 
          client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(messageStr);
      }
    });
  }
  
  // Broadcast message to all clients
  function broadcast(message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    
    clients.forEach((client) => {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(messageStr);
      }
    });
  }
  
  // Broadcast message to all admin users
  async function broadcastToAdmins(message: WebSocketMessage) {
    const messageStr = JSON.stringify(message);
    
    // Get all admin users
    const adminUsers = await storage.getUsersByRole('admin');
    const adminIds = adminUsers.map(user => user.id);
    
    // Send to all connected admin users
    clients.forEach((client) => {
      if (client.userId && adminIds.includes(client.userId) && 
          client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(messageStr);
      }
    });
  }
  
  return {
    broadcastToUsers,
    broadcast,
    broadcastToAdmins
  };
}
