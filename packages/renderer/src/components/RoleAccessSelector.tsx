import { useState, useEffect } from 'react';
import { Checkbox } from './UI';

interface RoleAccessSelectorProps
{
	roles: string[]; // includes owner, admin, viewer etc.
	value: string[]; // roles (excluding owner) that currently have access (restricted mode). Empty array means open.
	onChange: (roles: string[]) => void; // emits roles excluding owner; empty array => open
	disabled?: boolean;
	className?: string;
	label?: string;
	descriptionOpen?: string;
	descriptionRestricted?: string;
	hideModeToggle?: boolean; // when true, do not show the Restricted/Close master button; always show selection UI
}

/*
 * UX Model
 *  - Two modes: Open (all roles) or Restricted (explicit list)
 *  - If value.length === 0 => Open
 *  - Toggle switches to Restricted; selecting roles (pills) updates value
 *  - Owner is implicitly always allowed and not toggleable
 */
export function RoleAccessSelector({
	roles,
	value,
	onChange,
	disabled,
	className,
	label = 'Access Control',
	descriptionOpen = 'Select which roles may view this category',
	descriptionRestricted = 'Select which roles may view this category',
	hideModeToggle
}: RoleAccessSelectorProps)
{
	// independent restricted toggle (power on/off): true => restricted, false => open
	const [restricted, setRestricted] = useState<boolean>(value.length > 0);
	const selectableRoles = roles.filter(r => r !== 'owner');

	useEffect(() =>
	{
		// If an external change adds roles while not restricted, sync to restricted.
		if (value.length > 0 && !restricted)
		{
			setRestricted(true);
		}
	}, [value, restricted]);

	const toggleMaster = () =>
	{
		if (disabled || hideModeToggle) return;
		if (restricted)
		{
			onChange([]);
			setRestricted(false);
		} else
		{
			onChange(selectableRoles);
			setRestricted(true);
		}
	};

	const toggleRole = (role: string) =>
	{
		if (disabled || !restricted) return;
		if (value.includes(role))
		{
			const next = value.filter(r => r !== role);
			// Allow empty list while staying in restricted mode (acts like open until roles re-added)
			onChange(next);
		} else
		{
			onChange([...value, role]);
		}
	};

	return (
		<div className={className}>
			<div className="flex flex-col gap-3">
				<div className="flex items-center gap-3 flex-wrap">
					{!hideModeToggle && (
						<button
							type="button"
							onClick={toggleMaster}
							disabled={disabled}
							className={[
								'text-xs font-medium rounded-full px-4 py-1.5 border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40',
								restricted
									? 'bg-primary text-white border-primary shadow-sm dark:shadow'
									: 'bg-surface-token text-fg border-subtle hover:bg-primary/10 hover:border-primary/40 dark:bg-surface dark:hover:bg-primary/15'
							].join(' ')}
						>
							{restricted ? 'Close' : 'Restricted'}
						</button>
					)}
					<div className="text-xs font-medium text-fg-subtle">{label}</div>
					{(hideModeToggle ? true : restricted) && (
						<div className="flex items-center gap-2 text-[11px] font-medium">
							<button
								type="button"
								className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-sm"
								onClick={() => { if (!disabled) onChange(selectableRoles); }}
								disabled={disabled}
							>
								Yes all
							</button>
							<span className="text-fg-muted">/</span>
							<button
								type="button"
								className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-sm"
								onClick={() => { if (!disabled) onChange([]); }}
								disabled={disabled}
							>
								No all
							</button>
						</div>
					)}
				</div>
				<div className="text-[11px] leading-snug text-fg-muted max-w-prose pl-1">{descriptionRestricted}</div>
			</div>
			{(hideModeToggle ? true : restricted) && (
				<div className="mt-3 flex flex-wrap gap-3">
					{selectableRoles.map(role =>
					{
						const active = value.includes(role);
						return (
							<div key={role} className="flex flex-col gap-1">
								<div className="text-[11px] font-medium tracking-wide text-fg dark:text-fg pl-1 capitalize">
									{role}
								</div>
								<div
									className={[
										'relative inline-flex w-full max-w-[9rem] rounded-full bg-pill p-1 items-stretch select-none gap-2',
										disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
									].join(' ')}
									role="group"
									aria-label={`${role} access toggle`}
								>
									<div
										className="u-tabs-chip-slider transition-all duration-300"
										style={{
											left: active ? '0' : 'calc((100% + 0.5rem)/2)',
											width: 'calc((100% - 0.5rem)/2)',
											transform: 'none'
										}}
										aria-hidden
									/>
									<button
										type="button"
										disabled={disabled || !restricted}
										onClick={() => { if (!(disabled || !restricted)) toggleRole(role); }}
										className={[
											'relative z-10 flex-1 px-3 py-1.5 text-xs font-medium rounded-full u-tabs-chip-btn transition-colors',
											active ? 'u-tabs-chip-btn--active' : 'text-fg-subtle hover:text-fg'
										].join(' ')}
										aria-pressed={active}
									>
										Yes
									</button>
									<button
										type="button"
										disabled={disabled || !restricted}
										onClick={() => { if (!(disabled || !restricted)) toggleRole(role); }}
										className={[
											'relative z-10 flex-1 px-3 py-1.5 text-xs font-medium rounded-full u-tabs-chip-btn transition-colors',
											!active ? 'u-tabs-chip-btn--active' : 'text-fg-subtle hover:text-fg'
										].join(' ')}
										aria-pressed={!active}
									>
										No
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}
			<div className="mt-4 flex items-center gap-2 text-[11px] text-fg-muted text-fg-subtle">
				<span>Owner always has access</span>
			</div>
		</div>
	);
}

export default RoleAccessSelector;
