import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes } from 'react';
export const cn = (...v: Parameters<typeof clsx>) => twMerge(clsx(v));
const variants = cva('button', {
  variants: {
    variant: { default: 'primary', outline: 'outline', ghost: 'ghost', destructive: 'danger' },
  },
  defaultVariants: { variant: 'default' },
});
export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>) {
  return <button className={cn(variants({ variant }), className)} {...props} />;
}
