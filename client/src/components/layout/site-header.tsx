import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, Home, User, LogOut, Menu, X } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function SiteHeader() {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const getNavLinks = () => {
    if (user?.role === "buyer") {
      return [
        { href: "/buyer/dashboard", label: "Dashboard", active: location === "/buyer/dashboard" },
        { href: "#", label: "My Properties", active: location.startsWith("/buyer/property") },
        { href: "#", label: "Messages", active: false },
      ];
    } else if (user?.role === "agent") {
      return [
        { href: "/agent/dashboard", label: "Dashboard", active: location === "/agent/dashboard" },
        { href: "#", label: "My Clients", active: false },
        { href: "#", label: "Available Leads", active: location.includes("leads") },
      ];
    } else if (user?.role === "seller") {
      return [
        { href: "/seller/dashboard", label: "Dashboard", active: location === "/seller/dashboard" },
        { href: "#", label: "My Properties", active: false },
        { href: "#", label: "Messages", active: false },
      ];
    } else if (user?.role === "admin") {
      return [
        { href: "/admin/dashboard", label: "Dashboard", active: location === "/admin/dashboard" },
        { href: "#", label: "Users", active: location.includes("users") },
        { href: "#", label: "Properties", active: location.includes("properties") },
      ];
    }
    return [];
  };

  const navLinks = getNavLinks();
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    } else if (user?.firstName) {
      return user.firstName[0].toUpperCase();
    } else if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const getRoleColor = () => {
    if (user?.role === "buyer") return "bg-primary-200 text-primary-700";
    if (user?.role === "agent") return "bg-secondary-200 text-secondary-700";
    if (user?.role === "seller") return "bg-accent-200 text-accent-700";
    if (user?.role === "admin") return "bg-purple-200 text-purple-700";
    return "bg-gray-200 text-gray-700";
  };

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href={`/${user?.role}/dashboard`}>
                <h1 className="text-xl font-bold text-primary cursor-pointer">PropertyMatch</h1>
              </Link>
            </div>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
              {navLinks.map((link, i) => (
                <Link key={i} href={link.href}>
                  <a
                    className={`${
                      link.active
                        ? "border-primary text-gray-900 font-medium"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    } inline-flex items-center px-3 pt-1 border-b-2 text-sm h-full transition-colors duration-150`}
                  >
                    {link.label}
                  </a>
                </Link>
              ))}
            </div>
          </div>
          <div className="hidden sm:ml-6 sm:flex sm:items-center space-x-3">
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-500 rounded-full w-9 h-9">
              <Bell className="h-5 w-5" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-2 rounded-full pl-2 pr-3 py-1.5 border border-gray-200 hover:bg-gray-50">
                  <Avatar className={`h-7 w-7 border border-gray-200 ${getRoleColor()}`}>
                    <AvatarFallback className="text-sm">{getInitials()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-gray-700">
                    {user?.firstName || user?.email?.split('@')[0] || "User"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">
                    {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {user?.email}
                  </p>
                  <div className="mt-2 flex items-center">
                    <span className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-800 capitalize">
                      {user?.role}
                    </span>
                    
                    {user?.profileStatus === "verified" && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Verified
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="py-1">
                  <DropdownMenuItem asChild>
                    <Link href={`/${user?.role}/dashboard`}>
                      <div className="flex items-center cursor-pointer w-full text-gray-700">
                        <Home className="mr-2 h-4 w-4" />
                        <span>Dashboard</span>
                      </div>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <div className="flex items-center cursor-pointer text-gray-700">
                      <User className="mr-2 h-4 w-4" />
                      <span>My Profile</span>
                    </div>
                  </DropdownMenuItem>
                </div>
                
                <div className="py-1 border-t border-gray-100">
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="sm:max-w-sm p-0">
                <div className="flex flex-col h-full">
                  <div className="p-4 border-b flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-primary">PropertyMatch</h2>
                    <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(false)} className="rounded-full h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="p-4 border-b bg-gray-50">
                    <div className="flex items-center">
                      <Avatar className={`h-12 w-12 mr-3 border ${getRoleColor()}`}>
                        <AvatarFallback>{getInitials()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold text-gray-900">{user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email?.split('@')[0]}</div>
                        <div className="text-sm text-gray-500">{user?.email}</div>
                        
                        <div className="mt-2 flex items-center space-x-2">
                          <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 capitalize">
                            {user?.role}
                          </span>
                          
                          {user?.profileStatus === "verified" && (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                              Verified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <nav className="flex-1 p-4">
                    <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">Navigation</p>
                    <div className="space-y-1">
                      {navLinks.map((link, i) => (
                        <Link key={i} href={link.href}>
                          <a
                            className={`${
                              link.active
                                ? "bg-gray-100 text-primary font-medium"
                                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                            } group flex items-center px-4 py-2 text-sm rounded-md transition-colors duration-150`}
                            onClick={() => setMobileNavOpen(false)}
                          >
                            {link.label}
                          </a>
                        </Link>
                      ))}
                    </div>
                  </nav>
                  
                  <div className="p-4 border-t border-gray-200">
                    <Button
                      onClick={handleLogout}
                      className="w-full justify-center text-red-600 border border-red-200 hover:bg-red-50"
                      variant="outline"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}
