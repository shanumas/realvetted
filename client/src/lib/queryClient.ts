import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  retries = 1
): Promise<Response> {
  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include", // Always include credentials for session cookies
      cache: "no-cache", // Prevent caching issues with authentication state
    });
    
    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    // Only retry for network errors or 5xx server errors, but not for 4xx client errors
    if (retries > 0 && (error instanceof TypeError || 
        (error instanceof Error && error.message.includes("5")))) {
      console.log(`Retrying request to ${url}. Retries left: ${retries - 1}`);
      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return apiRequest(method, url, data, retries - 1);
    }
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      // Use the URL without timestamp to prevent excessive refreshing
      const url = queryKey[0] as string;
      
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-cache", // Prevent caching of authentication state
        headers: {
          // Add cache-busting headers
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Expires': '0'
        }
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error("Query error:", error, "on query key:", queryKey[0]);
      
      // For auth endpoints, retry up to 2 times on network errors
      // Safe way to convert queryKey to string for comparison
      const queryKeyString = typeof queryKey[0] === 'string' ? queryKey[0] : '';
      if (queryKeyString.includes('auth') && 
          (error instanceof TypeError || error instanceof Error && error.message.includes('5'))) {
        console.log("Retrying auth query...");
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          const retryRes = await fetch(queryKey[0] as string, {
            credentials: "include",
            cache: "no-cache",
            headers: {
              'Pragma': 'no-cache',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Expires': '0'
            }
          });
          
          if (unauthorizedBehavior === "returnNull" && retryRes.status === 401) {
            return null;
          }
          
          await throwIfResNotOk(retryRes);
          return await retryRes.json();
        } catch (retryError) {
          console.error("Retry failed:", retryError);
        }
      }
      
      // Rethrow 401 errors (or return null depending on options)
      if (error instanceof Error && error.message.includes("401")) {
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
      }
      
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true, // Enable refetching on window focus for better sync
      refetchOnReconnect: true,   // Refetch when internet reconnects
      staleTime: 5 * 60 * 1000,   // 5 minutes before data is considered stale
      // Removed gcTime property - using default value instead
      retry: 2,                   // Retry twice for better reliability
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
    },
    mutations: {
      retry: 1,                   // Retry mutations once by default
      // Use a function for retryDelay instead of a constant value to match type expectations
      retryDelay: () => 1000,     // Wait 1 second between mutation retries
    },
  },
});
