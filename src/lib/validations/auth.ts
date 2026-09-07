import { z } from "zod"

import { isValidPhone, normalizePhone } from "@/lib/phone"

/** A single sign-in identifier: normalized email or normalized phone. */
export const loginSchema = z.object({
  identifier: z.string()
    .trim()
    .min(1, "required")
    .transform((value) => value.includes("@") ? value.toLowerCase() : normalizePhone(value))
    .refine((value) => z.email().safeParse(value).success || isValidPhone(value), "invalid"),
  password: z.string().min(1, "required"),
})

export type LoginInput = z.input<typeof loginSchema>
export type LoginParsed = z.output<typeof loginSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "min").max(72, "max"),
  confirmPassword: z.string().min(1, "required"),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "mismatch",
})

export type ResetPasswordInput = z.input<typeof resetPasswordSchema>
