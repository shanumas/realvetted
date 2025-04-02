import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserProfilePhotoProps {
  user: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    profilePhotoUrl?: string | null;
  };
  size?: "sm" | "md" | "lg" | "xl"; // Different size options
  className?: string;
}

export function UserProfilePhoto({ user, size = "md", className }: UserProfilePhotoProps) {
  // Get initials from name or email
  const getInitials = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.firstName) {
      return user.firstName[0].toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "";
  };

  // Determine the size class
  const sizeClass = {
    sm: "h-8 w-8 text-sm",
    md: "h-12 w-12 text-base",
    lg: "h-16 w-16 text-lg",
    xl: "h-24 w-24 text-xl"
  }[size];

  return (
    <Avatar className={cn(sizeClass, className)}>
      <AvatarImage 
        src={user.profilePhotoUrl || ""} 
        alt={`${user.firstName || ""} ${user.lastName || ""}`} 
      />
      <AvatarFallback className="bg-primary text-primary-foreground">
        {user.profilePhotoUrl ? (
          <UserIcon className="h-4 w-4" />
        ) : (
          getInitials()
        )}
      </AvatarFallback>
    </Avatar>
  );
}