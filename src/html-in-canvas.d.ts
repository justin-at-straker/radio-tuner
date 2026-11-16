import "react"

declare module "react" {
  interface CanvasHTMLAttributes<T> extends HTMLAttributes<T> {
    content?: "drawable" | "fallback"
  }
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    drawable?: ""
  }
}
