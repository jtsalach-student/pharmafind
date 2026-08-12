export const tokenKey = 'pharmafind_token';

export const getToken = (): string | null => localStorage.getItem(tokenKey);
export const setToken = (token: string): void => localStorage.setItem(tokenKey, token);
export const clearToken = (): void => localStorage.removeItem(tokenKey);
