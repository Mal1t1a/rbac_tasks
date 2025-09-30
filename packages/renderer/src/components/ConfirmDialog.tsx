import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Button, Card } from './UI';

interface ConfirmDialogProps
{
	open: boolean;
	title?: string;
	body?: React.ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
	open,
	title = 'Confirm',
	body,
	confirmLabel = 'Confirm',
	cancelLabel = 'Cancel',
	destructive,
	onConfirm,
	onCancel
}) =>
{
	const previouslyFocused = useRef<HTMLElement | null>(null);
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const titleId = useRef(`dialog-${Math.random().toString(36).slice(2)}`);

	useEffect(() =>
	{
		if (open)
		{
			previouslyFocused.current = document.activeElement as HTMLElement;
			// focus first button after mount
			setTimeout(() =>
			{
				dialogRef.current?.querySelector<HTMLElement>('button:last-of-type')?.focus();
			}, 0);
		} else if (previouslyFocused.current)
		{
			previouslyFocused.current.focus();
		}
	}, [open]);

	useEffect(() =>
	{
		if (!open) return;
		const handler = (e: KeyboardEvent) =>
		{
			if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
			if (e.key === 'Tab')
			{
				// Simple focus trap
				const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
				if (!focusables || focusables.length === 0) return;
				const list = Array.from(focusables).filter(el => !el.hasAttribute('disabled'));
				const first = list[0];
				const last = list[list.length - 1];
				if (e.shiftKey && document.activeElement === first)
				{
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last)
				{
					e.preventDefault();
					first.focus();
				}
			}
			if (e.key === 'Enter')
			{
				// Only trigger confirm if not inside a nested element that might handle Enter differently
				if ((e.target as HTMLElement).tagName !== 'TEXTAREA') onConfirm();
			}
		};
		window.addEventListener('keydown', handler, true);
		return () => window.removeEventListener('keydown', handler, true);
	}, [open, onCancel, onConfirm]);

	if (!open) return null;

	const content = (
		<div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation">
			<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
			<div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId.current} className="relative z-10 w-full max-w-sm animate-in fade-in zoom-in">
				<Card className="p-5 shadow-xl">
					<h4 id={titleId.current} className="text-lg font-semibold text-fg mb-2">{title}</h4>
					{body && <div className="text-sm text-fg-subtle mb-4">{body}</div>}
					<div className="flex justify-end gap-2">
						<Button variant="pill" size="sm" onClick={onCancel}>{cancelLabel}</Button>
						<Button variant={destructive ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
					</div>
				</Card>
			</div>
		</div>
	);

	return ReactDOM.createPortal(content, document.body);
};

export default ConfirmDialog;
