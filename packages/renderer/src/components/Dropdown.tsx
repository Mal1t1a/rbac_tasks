import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type DropdownOption =
	{
		label: string;
		value: string;
	};

type Props =
	{
		value: string;
		onChange: (value: string) => void;
		options: Array<string | DropdownOption>;
		placeholder?: string;
		className?: string;
		disabled?: boolean;
		buttonClassName?: string;
		menuClassName?: string;
		itemClassName?: string;
		ariaLabel?: string;
		name?: string;
		usePortal?: boolean;
	};

export default function Dropdown({
	value,
	onChange,
	options,
	placeholder = 'Select…',
	className = '',
	disabled = false,
	buttonClassName = '',
	menuClassName = '',
	itemClassName = '',
	ariaLabel,
	usePortal = true,
}: Props)
{
	const normalized = useMemo<DropdownOption[]>(
		() =>
			options.map((o) =>
				typeof o === 'string' ? { label: o, value: o } : { label: o.label, value: o.value }
			),
		[options]
	);
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState<number>(() => 
	{
		const idx = normalized.findIndex((o) => o.value === value);
		return idx >= 0 ? idx : 0;
	});
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const listRef = useRef<HTMLUListElement | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

	useEffect(() => 
	{
		const idx = normalized.findIndex((o) => o.value === value);
		if (idx >= 0) setActiveIndex(idx);
	}, [value, normalized]);

	useEffect(() => 
	{
		function onDocClick(e: MouseEvent) 
		{
			if (!open) return;
			const r = rootRef.current;
			const l = listRef.current;
			if (!r) return;
			const t = e.target as Node | null;
			if (t && (r.contains(t) || (l && l.contains(t)))) return;
			setOpen(false);
		}
		function onKey(e: KeyboardEvent) 
		{
			if (!open) return;
			if (e.key === 'Escape') 
			{
				e.preventDefault();
				setOpen(false);
				buttonRef.current?.focus();
			}
		}
		document.addEventListener('mousedown', onDocClick);
		document.addEventListener('keydown', onKey);
		return () => 
		{
			document.removeEventListener('mousedown', onDocClick);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	useEffect(() => 
	{
		if (!open || !usePortal) return;
		function updatePosition() 
		{
			const btn = buttonRef.current;
			if (!btn) return;
			const rect = btn.getBoundingClientRect();
			const top = Math.round(rect.bottom + 4); // mimic mt-1 (4px)
			const left = Math.round(rect.left);
			const width = Math.round(rect.width);
			setMenuStyle({ position: 'fixed', top, left, width });
		}
		updatePosition();
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', updatePosition, true);
		return () => 
		{
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
		};
	}, [open, usePortal]);

	function selectAt(index: number) 
	{
		const opt = normalized[index];
		if (!opt) return;
		onChange(opt.value);
		setOpen(false);
		buttonRef.current?.focus();
	}

	function onButtonKeyDown(e: React.KeyboardEvent) 
	{
		if (disabled) return;
		if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') 
		{
			e.preventDefault();
			setOpen(true);
			requestAnimationFrame(() => 
			{
				listRef.current?.focus();
			});
		}
	}

	function onListKeyDown(e: React.KeyboardEvent) 
	{
		if (e.key === 'Escape') 
		{
			e.preventDefault();
			setOpen(false);
			buttonRef.current?.focus();
			return;
		}
		if (e.key === 'ArrowDown') 
		{
			e.preventDefault();
			setActiveIndex((i) => Math.min(i + 1, normalized.length - 1));
			return;
		}
		if (e.key === 'ArrowUp') 
		{
			e.preventDefault();
			setActiveIndex((i) => Math.max(i - 1, 0));
			return;
		}
		if (e.key === 'Home') 
		{
			e.preventDefault();
			setActiveIndex(0);
			return;
		}
		if (e.key === 'End') 
		{
			e.preventDefault();
			setActiveIndex(normalized.length - 1);
			return;
		}
		if (e.key === 'Enter' || e.key === ' ') 
		{
			e.preventDefault();
			selectAt(activeIndex);
		}
	}

	const selected = normalized.find((o) => o.value === value) || null;

	return (
		<div ref={rootRef} className={["relative inline-block", className].join(' ')} data-actionable="true">
			<button
				ref={buttonRef}
				type="button"
				className={[
					"w-full rounded-2xl border border-subtle bg-white/5 px-3 py-3 text-left text-sm",
					disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/8',
					buttonClassName,
				].join(' ')}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={ariaLabel}
				onClick={() => !disabled && setOpen((o) => !o)}
				onKeyDown={onButtonKeyDown}
			>
				<span className="flex items-center justify-between gap-2">
					<span className={selected ? '' : 'text-fg-subtle'}>
						{selected ? selected.label : placeholder}
					</span>
					<svg width="14" height="14" viewBox="0 0 24 24" className="text-fg-subtle" aria-hidden>
						<path d="M7 10l5 5 5-5z" fill="currentColor" />
					</svg>
				</span>
			</button>
			{open && (
				usePortal
					? createPortal(
						<ul
							ref={listRef}
							role="listbox"
							tabIndex={-1}
							className={[
								"z-50 max-h-60 overflow-auto rounded-2xl border border-subtle bg-app p-1 shadow-lg",
								menuClassName,
							].join(' ')}
							style={menuStyle}
							onKeyDown={onListKeyDown}
						>
							{normalized.map((opt, i) => 
							{
								const isSelected = opt.value === value;
								const isActive = i === activeIndex;
								return (
									<li
										key={opt.value}
										role="option"
										aria-selected={isSelected}
										className={[
											"flex cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors",
											isActive ? 'bg-black/5 dark:bg-white/10' : '',
											'hover:bg-black/5 dark:hover:bg-white/10',
											itemClassName,
										].join(' ')}
										onMouseEnter={() => setActiveIndex(i)}
										onClick={() => selectAt(i)}
									>
										<span>{opt.label}</span>
										{isSelected && (
											<svg width="14" height="14" viewBox="0 0 24 24" className="text-primary" aria-hidden>
												<path d="M9 16.2l-3.5-3.5 1.4-1.4L9 13.4l7.7-7.7 1.4 1.4z" fill="currentColor" />
											</svg>
										)}
									</li>
								);
							})}
						</ul>,
						document.body
					)
					: (
						<ul
							ref={listRef}
							role="listbox"
							tabIndex={-1}
							className={[
								"absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-subtle bg-app p-1 shadow-lg",
								menuClassName,
							].join(' ')}
							onKeyDown={onListKeyDown}
						>
							{normalized.map((opt, i) => 
							{
								const isSelected = opt.value === value;
								const isActive = i === activeIndex;
								return (
									<li
										key={opt.value}
										role="option"
										aria-selected={isSelected}
										className={[
											"flex cursor-pointer select-none items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors",
											isActive ? 'bg-black/5 dark:bg-white/10' : '',
											'hover:bg-black/5 dark:hover:bg-white/10',
											itemClassName,
										].join(' ')}
										onMouseEnter={() => setActiveIndex(i)}
										onClick={() => selectAt(i)}
									>
										<span>{opt.label}</span>
										{isSelected && (
											<svg width="14" height="14" viewBox="0 0 24 24" className="text-primary" aria-hidden>
												<path d="M9 16.2l-3.5-3.5 1.4-1.4L9 13.4l7.7-7.7 1.4 1.4z" fill="currentColor" />
											</svg>
										)}
									</li>
								);
							})}
						</ul>
					)
			)}
		</div>
	);
}
