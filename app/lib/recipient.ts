// Where emailed takes go: an address he confirmed with a code, kept on the
// phone along with the server's proof that it was confirmed.

export interface Recipient {
  email: string;
  token: string;
}

export interface Pending {
  email: string;
  expires: number;
  challenge: string;
}

const KEY = "catch:recipient";

export function loadRecipient(): Recipient | null {
  try {
    const raw = localStorage.getItem(KEY);
    const r = raw ? JSON.parse(raw) : null;
    return r && typeof r.email === "string" && typeof r.token === "string" ? r : null;
  } catch {
    return null;
  }
}

export function storeRecipient(r: Recipient | null) {
  try {
    if (r) localStorage.setItem(KEY, JSON.stringify(r));
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("No connection. Try again when you've got signal.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data as T;
}

export function sendCode(email: string): Promise<Pending> {
  return post<Pending>("/api/recipient/start", { email });
}

export function confirmCode(p: Pending, code: string): Promise<Recipient> {
  return post<Recipient>("/api/recipient/confirm", { ...p, code });
}
