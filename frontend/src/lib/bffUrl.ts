// BFF base URL 統一前綴。
// dev：VITE_BFF_URL 為空 → 回傳相對路徑，由 vite proxy 轉到 localhost:3100。
// prod：VITE_BFF_URL 為完整 BFF URL（如 https://surveysui-bff.wrangler-gaser.workers.dev）。
// 切勿用裸相對路徑直接 fetch /auth、/api：上線後會打到 Pages SPA 而非 BFF。
export const bffUrl = (path: string): string =>
  `${import.meta.env.VITE_BFF_URL ?? ''}${path}`
