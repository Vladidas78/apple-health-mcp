// @types/react-dom is not installed; the preview script needs only this one
// signature. Remove once @types/react-dom is added.
declare module "react-dom/server" {
  import type { ReactNode } from "react";
  export function renderToStaticMarkup(node: ReactNode): string;
}
