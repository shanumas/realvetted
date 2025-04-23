import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Mail, Phone, Award } from "lucide-react";
import { User } from "@shared/schema";
import { UserProfilePhoto } from "@/components/user-profile-photo";

interface AgentCardProps {
  agent: User;
  onSelectAgent?: (agentId: number) => void;
  selected?: boolean;
  disabled?: boolean;
}

export function AgentCard({ agent, onSelectAgent, selected = false, disabled = false }: AgentCardProps) {
  const handleSelectAgent = () => {
    if (!disabled && onSelectAgent) {
      onSelectAgent(agent.id);
    }
  };

  return (
    <Card 
      className={`overflow-hidden transition-all ${selected ? 'border-primary border-2' : ''} ${!disabled && onSelectAgent ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={!disabled && onSelectAgent ? handleSelectAgent : undefined}
    >
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <UserProfilePhoto 
              user={agent} 
              size="lg" 
              className="border-2 border-primary/20"
            />
            <div>
              <CardTitle>
                {agent.firstName} {agent.lastName}
              </CardTitle>
              <CardDescription className="flex items-center mt-1">
                <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                {agent.state || "Location not specified"}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        <div className="space-y-2">
          <div className="flex items-center">
            <Mail className="h-4 w-4 mr-2 text-muted-foreground" />
            <span>{agent.email}</span>
          </div>
          {agent.phone && (
            <div className="flex items-center">
              <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
              <span>{agent.phone}</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        {onSelectAgent && (
          <Button 
            onClick={(e) => {
              e.stopPropagation(); // Prevent the card's onClick from firing
              handleSelectAgent();
            }} 
            className="w-full"
            variant={selected ? "default" : "outline"}
            disabled={disabled}
          >
            {selected ? "Selected" : "Select Agent"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}