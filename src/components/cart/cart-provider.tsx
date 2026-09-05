"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

const STORAGE_KEY = "clothshop.cart.v1"

export type CartItem = {
  key: string
  productId: string
  productVariantId: string | null
  productCode: string
  productName: string
  color: string | null
  size: string | null
  sellPrice: string
  imageUrl: string | null
  quantity: number
}

type CartContextValue = {
  items: CartItem[]
  count: number
  subtotal: number
  hydrated: boolean
  addItem: (item: Omit<CartItem, "key" | "quantity">, quantity?: number) => void
  updateQuantity: (key: string, quantity: number) => void
  removeItem: (key: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function itemKey(productId: string, productVariantId: string | null) {
  return `${productId}:${productVariantId ?? "default"}`
}

function clampQuantity(quantity: number) {
  return Math.max(1, Math.min(99, Math.trunc(quantity) || 1))
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let storedItems: CartItem[] = []
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as CartItem[]
      if (Array.isArray(stored)) storedItems = stored.map((item) => ({ ...item, quantity: clampQuantity(item.quantity) }))
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
    const frame = window.requestAnimationFrame(() => {
      setItems(storedItems)
      setHydrated(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [hydrated, items])

  const value = useMemo<CartContextValue>(() => ({
    items,
    hydrated,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.reduce((sum, item) => sum + Number(item.sellPrice) * item.quantity, 0),
    addItem(item, quantity = 1) {
      const key = itemKey(item.productId, item.productVariantId)
      setItems((current) => {
        const existing = current.find((row) => row.key === key)
        if (!existing) return [...current, { ...item, key, quantity: clampQuantity(quantity) }]
        return current.map((row) => row.key === key
          ? { ...row, quantity: clampQuantity(row.quantity + quantity) }
          : row)
      })
    },
    updateQuantity(key, quantity) {
      setItems((current) => current.map((item) => item.key === key
        ? { ...item, quantity: clampQuantity(quantity) }
        : item))
    },
    removeItem(key) {
      setItems((current) => current.filter((item) => item.key !== key))
    },
    clear() {
      setItems([])
    },
  }), [hydrated, items])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error("useCart must be used inside CartProvider")
  return value
}
