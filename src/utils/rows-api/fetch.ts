type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

async function makeRequest(method: 'GET' | 'POST', url = '', data: Record<string, unknown> = {}): Promise<JsonValue | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const apiKey = import.meta.env.VITE_ROWS_API_KEY as string | undefined;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method,
      credentials: 'omit',
      headers,
      body: method !== 'GET' ? JSON.stringify(data) : null,
    });

    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text) as JsonValue;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export default {
  post: function (url: string, data: Record<string, unknown> = {}): Promise<JsonValue | null> {
    return makeRequest('POST', url, data);
  }
}
