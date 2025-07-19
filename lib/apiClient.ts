// API client utility for making authenticated requests

// Get API key from environment (client-side will need to be provided differently)
function getApiKey(): string | null {
  if (typeof window === 'undefined') {
    // Server-side
    return process.env.API_KEY || null;
  } else {
    // Client-side - for now, return null to bypass auth in development
    // In production, this would come from a secure storage or context
    return null;
  }
}

// Authenticated fetch wrapper
export async function apiCall(url: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = getApiKey();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add API key if available
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

// Convenience methods
export const apiClient = {
  get: (url: string) => apiCall(url, { method: 'GET' }),
  post: (url: string, data: unknown) => apiCall(url, { 
    method: 'POST', 
    body: JSON.stringify(data) 
  }),
  put: (url: string, data: unknown) => apiCall(url, { 
    method: 'PUT', 
    body: JSON.stringify(data) 
  }),
  delete: (url: string) => apiCall(url, { method: 'DELETE' }),
};