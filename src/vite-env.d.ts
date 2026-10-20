/// <reference types="vite/client" />

interface Window {
  Cypress?: unknown;
  umami?: {
    track: (eventName: string, data?: Record<string, unknown>) => void;
  };
}
