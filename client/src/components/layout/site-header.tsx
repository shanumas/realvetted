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
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href={`/${user?.role}/dashboard`}>
                <h1 className="text-xl font-bold text-primary-600 cursor-pointer">PropertyMatch</h1>
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navLinks.map((link, i) => (
                <Link key={i} href={link.href}>
                  <a
                    className={`${
                      link.active
                        ? "border-primary-500 text-gray-900"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full`}
                  >
                    {link.label}
                  </a>
                </Link>
              ))}
            </div>
          </div>
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-500">
              <Bell className="h-5 w-5" />
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ml-3">
                  <Avatar className={`h-8 w-8 ${getRoleColor()}`}>
                    <AvatarFallback>{getInitials()}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5 text-sm font-medium">
                  {user?.email}
                  <div className="text-xs text-muted-foreground">
                    Role: <span className="capitalize">{user?.role}</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/${user?.role}/dashboard`}>
                    <div className="flex items-center cursor-pointer w-full">
                      <Home className="mr-2 h-4 w-4" />
                      <span>Dashboard</span>
                    </div>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <div className="flex items-center cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
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
              <SheetContent side="right" className="sm:max-w-sm">
                <div className="px-4 pt-5 pb-6 flex flex-col h-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-medium">Menu</h2>
                      <p className="text-sm text-gray-500">PropertyMatch</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(false)}>
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                  
                  <div className="mt-6 flex flex-col space-y-1">
                    <div className="flex items-center p-3 rounded-md">
                      <Avatar className={`h-10 w-10 mr-3 ${getRoleColor()}`}>
                        <AvatarFallback>{getInitials()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{user?.firstName || user?.email}</div>
                        <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
                      </div>
                    </div>
                  </div>
                  
                  <nav className="mt-6 flex-1">
                    <div className="space-y-1">
                      {navLinks.map((link, i) => (
                        <Link key={i} href={link.href}>
                          <a
                            className={`${
                              link.active
                                ? "bg-gray-100 text-gray-900"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            } group flex items-center px-3 py-2 text-base font-medium rounded-md`}
                            onClick={() => setMobileNavOpen(false)}
                          >
                            {link.label}
                          </a>
                        </Link>
                      ))}
                    </div>
                  </nav>
                  
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <Button
                      onClick={handleLogout}
                      className="w-full justify-start text-red-600"
                      variant="ghost"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
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
