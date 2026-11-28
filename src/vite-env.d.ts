/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL when the frontend is hosted separately, e.g. https://shop-the-look.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
