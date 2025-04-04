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
      const res = await fetch(queryKey[0] as string, {
        credentials: "include",
        cache: "no-cache", // Prevent caching of authentication state
        headers: {
          // Add a cache-busting header
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache'
        }
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error("Query error:", error);
      
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
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes instead of Infinity
      retry: 1, // Default retry once for all queries
    },
    mutations: {
      retry: 1, // Retry mutations once by default
    },
  },
});
