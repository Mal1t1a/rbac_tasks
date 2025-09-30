import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: 'primary' | 'pill' | 'danger' | 'neutral' | 'outline';
	size?: 'sm' | 'md';
};

export function Button({ variant = 'pill', size = 'md', className = '', ...props }: ButtonProps)
{
	const base = 'inline-flex items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-primary/40';
	const sizes = size === 'sm' ? 'px-4 py-2 text-sm' : 'px-5 py-2.5';
	const variants: Record<string, string> = {
		primary: 'bg-primary text-white shadow-glow',
		pill: 'bg-pill text-fg hover-bg-pill',
		neutral: 'bg-surface-token border border-subtle text-fg hover:bg-surface',
		danger: 'bg-red-600 text-white hover:bg-red-500',
		outline: 'border border-primary/60 text-primary-token bg-transparent hover:bg-primary/10'
	};
	return <button className={[base, sizes, variants[variant], className].join(' ')} {...props} />;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string };
export function Input({ label, hint, className = '', ...props }: InputProps)
{
	return (
		<label className="flex flex-col gap-1 text-sm">
			{label && <span className="form-label">{label}</span>}
			<input
				className={[
					'rounded-xl border border-subtle bg-surface-token text-fg placeholder:text-fg-muted px-3 py-2',
					'focus:outline-none focus:ring-2 focus:ring-primary/40'
				].join(' ')}
				{...props}
			/>
			{hint && <span className="text-xs text-fg-muted">{hint}</span>}
		</label>
	);
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string };
export function Select({ label, className = '', children, ...props }: SelectProps)
{
	return (
		<label className="flex flex-col gap-1 text-sm">
			{label && <span className="text-fg-subtle">{label}</span>}
			<select
				className={[
					'rounded-xl border border-subtle bg-surface-token text-fg px-3 py-2',
					'focus:outline-none focus:ring-2 focus:ring-primary/40'
				].join(' ')}
				{...props}
			>
				{children}
			</select>
		</label>
	);
}

type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };
export function Checkbox({ label, className = '', ...props }: CheckboxProps)
{
	return (
		<label className="inline-flex items-center gap-2 text-sm text-fg">
			<input type="checkbox" className="h-4 w-4 rounded border-subtle bg-surface-token" {...props} />
			{label && <span className="text-fg-subtle">{label}</span>}
		</label>
	);
}

export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>)
{
	return <div className={["rounded-2xl border border-subtle bg-surface-token", className].join(' ')} {...props} />;
}

export function FormRow({ children }: { children: React.ReactNode })
{
	return <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">{children}</div>;
}

export function SectionHeader({ title, actions }: { title: string; actions?: React.ReactNode })
{
	return (
		<div className="flex items-center justify-between">
			<h3 className="text-xl font-semibold text-fg">{title}</h3>
			<div className="flex items-center gap-2">{actions}</div>
		</div>
	);
}

type ToggleProps = {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	label?: string;
};

export function Toggle({ checked, onChange, disabled, label }: ToggleProps)
{
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={() => !disabled && onChange(!checked)}
			className={[
				'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border border-subtle transition',
				checked ? 'bg-primary' : 'bg-pill',
				disabled ? 'opacity-60 cursor-not-allowed' : ''
			].join(' ')}
		>
			<span
				className={[
					'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition translate-y-[1px]',
					checked ? 'translate-x-[20px]' : 'translate-x-0.5'
				].join(' ')}
			/>
			{label && <span className="ml-2 text-sm text-fg-subtle">{label}</span>}
		</button>
	);
}
