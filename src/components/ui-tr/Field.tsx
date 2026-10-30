// src/components/ui-tr/Field.tsx
//
// Wraps a `.field` (label + hint + control + error). The control can
// be a `.input`, `.select`, or `.textarea`. This file exports all
// three: `Field`, `Input`, `Select`, `Textarea`.
//
// Server-component friendly (no 'use client'); these are pure markup
// over the CSS classes in components.css §7.2.

import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export interface FieldProps {
  label?: ReactNode;
  /** Visible helper text below the label. */
  hint?: ReactNode;
  /** Error text — when set, the input renders with `aria-invalid`. */
  error?: ReactNode;
  /** The control element (Input, Select, Textarea, or custom). */
  children: ReactNode;
  /** id of the control; the label's `htmlFor` should match. */
  htmlFor?: string;
  className?: string;
}

export function Field({ label, hint, error, children, htmlFor, className }: FieldProps) {
  return (
    <div className={cn("field", className)}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && !error && <div className="field__hint">{hint}</div>}
      {error && <div className="field__error" role="alert">{error}</div>}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ className, invalid, ...rest }: InputProps) {
  return (
    <input
      className={cn("input", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn("textarea", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ className, invalid, children, ...rest }: SelectProps) {
  return (
    <select
      className={cn("select", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

export function FieldLabel({ className, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("field__label", className)} {...rest}>
      {children}
    </label>
  );
}
