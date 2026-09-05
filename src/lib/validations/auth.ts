import { z } from "zod"

/**
 * Login schema — email + password only. No phone-identifier path (see
 * carstockpro's `loginWithIdentifier`; that lookup path is dropped here on
 * purpose, plan §11 Phase 2).
 *
 * Zod v4: use the top-level `z.email()` validator, not the deprecated
 * `.email()` chain method.
 */
export const loginSchema = z.object({
  email: z.email("invalid").trim().min(1, "required"),
  password: z.string().min(1, "required"),
})

export type LoginInput = z.input<typeof loginSchema>
export type LoginParsed = z.output<typeof loginSchema>

export const signupSchema = z.object({
  fullname: z.string().trim().min(1, "required").max(120),
  email: z.email("invalid").trim().toLowerCase(),
  password: z.string().min(8, "min").max(72, "max"),
  confirmPassword: z.string().min(1, "required"),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "mismatch",
})

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "min").max(72, "max"),
  confirmPassword: z.string().min(1, "required"),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "mismatch",
})

export type SignupInput = z.input<typeof signupSchema>
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>
