type DbRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: any;
};

export async function dbRequest(path: string, query: Record<string, string> = {}, options: DbRequestOptions = {}) {
  const { method = 'GET', body } = options;
  const queryString = new URLSearchParams(query).toString();
  const url = `/api/db/${path}${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Database request failed');
  }

  return response.json();
}

export const db = {
  get: (path: string, query?: Record<string, string>) => 
    dbRequest(path, query, { method: 'GET' }),
  
  post: (path: string, body: any, query?: Record<string, string>) => 
    dbRequest(path, query, { method: 'POST', body }),
  
  patch: (path: string, body: any, query?: Record<string, string>) => 
    dbRequest(path, query, { method: 'PATCH', body }),
  
  delete: (path: string, query?: Record<string, string>) => 
    dbRequest(path, query, { method: 'DELETE' }),
};
