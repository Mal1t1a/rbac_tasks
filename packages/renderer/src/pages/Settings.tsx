import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface SettingsProps
{
	port: number | null;
}

export function Settings({ port }: SettingsProps)
{
	const auth = useAuth();
	const [settings, setSettings] = useState<Record<string, string>>({});
	const [systemKeys, setSystemKeys] = useState<string[]>([]);
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [envFilePath, setEnvFilePath] = useState<string | null>(null);
	const [reveal, setReveal] = useState<Record<string, boolean>>({});
	const [manualSensitive, setManualSensitive] = useState<Record<string, boolean>>(() =>
	{
		try
		{
			const raw = localStorage.getItem('settings.manualSensitive');
			return raw ? JSON.parse(raw) : {};
		} catch
		{
			return {};
		}
	});

	const canPersist = useMemo(() => !pending, [pending]);

	useEffect(() =>
	{
		// Load settings from backend (requires auth, Owner/Admin)
		async function loadSettings()
		{
			try
			{
				const response = await auth.apiFetch('/api/settings');
				if (!response.ok)
				{
					const text = await response.text();
					throw new Error(text || 'Unable to load settings');
				}
				const data = (await response.json()) as { settings: Record<string, string>; systemKeys?: string[]; filePath?: string };
				setSettings(data.settings ?? {});
				setSystemKeys(data.systemKeys || []);
				setEnvFilePath(data.filePath || null);
			} catch (error)
			{
				setMessage((error as Error).message || 'Failed to load settings');
			}
		}
		loadSettings();
	}, [auth]);

	const update = (key: string, value: string) =>
	{
		setSettings((prev) => ({ ...prev, [key]: value }));
	};

	const handleSubmit = async (event: FormEvent) =>
	{
		event.preventDefault();
		setPending(true);
		setMessage(null);
		try
		{
			const response = await auth.apiFetch('/api/settings', {
				method: 'PUT',
				body: JSON.stringify({ settings, replace: true })
			});
			if (!response.ok)
			{
				throw new Error(await response.text());
			}
			const data = await response.json();
			setSettings(data.settings ?? settings);
			setSystemKeys(data.systemKeys || systemKeys);
			setEnvFilePath(data.filePath || envFilePath);
			setMessage('Settings saved.');
		} catch (error)
		{
			setMessage((error as Error).message);
		} finally
		{
			setPending(false);
		}
	};

	const isSensitiveKey = (key: string) =>
	{
		if (manualSensitive[key]) return true;
		return /SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE|ACCESS|CLIENT_SECRET|JWT|OAUTH|KEY/i.test(key);
	};
	const toggleReveal = (key: string) => setReveal((prev) => ({ ...prev, [key]: !prev[key] }));

	const removeKey = (key: string) =>
	{
		if (systemKeys.includes(key)) return; // cannot remove system vars
		setSettings((prev) =>
		{
			const copy = { ...prev };
			delete copy[key];
			return copy;
		});
		// Also clear any manual sensitivity flag so it doesn't stick on re-add
		if (manualSensitive[key])
		{
			const next = { ...manualSensitive };
			delete next[key];
			setManualSensitive(next);
			try
			{
				localStorage.setItem('settings.manualSensitive', JSON.stringify(next));
			} catch { }
		}
	};

	const onAddSetting = (key: string, value: string, sensitive?: boolean) =>
	{
		setSettings((prev) => ({ ...prev, [key]: value }));
		const next = { ...manualSensitive };
		if (sensitive)
		{
			next[key] = true;
		} else if (next[key])
		{
			delete next[key];
		}
		setManualSensitive(next);
		try
		{
			localStorage.setItem('settings.manualSensitive', JSON.stringify(next));
		} catch { }
	};

	return (
		<section className="bg-surface-token backdrop-blur rounded-3xl p-8 shadow-glow border border-subtle">
			<header className="mb-6">
				<h1 className="text-3xl font-semibold">Environment Settings</h1>
				<p className="text-fg-muted">Edit local .env variables. System variables come from .env.example and cannot be deleted. Sensitive values are masked.</p>
				<p className="text-xs text-fg-subtle mt-1">{envFilePath ? `File: ${envFilePath}` : 'File: .env (path unavailable yet)'}</p>
			</header>
			<form className="space-y-6" onSubmit={handleSubmit}>
				<div className="space-y-3">
					{Object.keys(settings).length === 0 ? (
						<p className="text-fg-subtle text-sm">No variables yet. Add your first item below.</p>
					) : (
						Object.entries(settings).map(([key, value]) =>
						{
							const isSystem = systemKeys.includes(key);
							return (
								<label key={key} className="block">
									<div className="flex items-center justify-between">
										<span className="text-xs uppercase tracking-wide text-fg-subtle">
											{key}
											{isSystem ? (
												<span className="ml-2 rounded-full border border-subtle px-2 py-0.5 text-[10px] text-fg-muted">SYSTEM</span>
											) : null}
										</span>
										{!isSystem ? (
											<button
												type="button"
												className="text-xs text-fg-muted hover:underline hover:text-fg"
												onClick={() => removeKey(key)}
												aria-label={`Delete ${key}`}
											>
												Delete
											</button>
										) : null}
									</div>
									<div className="mt-2 flex items-stretch gap-2">
										<input
											className="flex-1 rounded-2xl border border-subtle bg-white/5 px-4 py-3 text-fg focus:border-primary focus:outline-none"
											value={value ?? ''}
											type={isSensitiveKey(key) && !reveal[key] ? 'password' : 'text'}
											onChange={(event) => update(key, event.target.value)}
										/>
										{isSensitiveKey(key) && (
											<button
												type="button"
												className="rounded-xl px-3 py-2 text-xs border border-subtle bg-white/5 text-fg-muted hover:bg-white/10"
												onClick={() => toggleReveal(key)}
											>
												{reveal[key] ? 'Hide' : 'Show'}
											</button>
										)}
									</div>
								</label>
							);
						})
					)}
				</div>
				<div className="rounded-2xl border border-dashed border-subtle p-4">
					<AddSetting onAdd={onAddSetting} />
				</div>
				<div className="flex items-center gap-3">
					<button
						type="submit"
						className="inline-flex items-center gap-2 rounded-full px-6 py-3 bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
						disabled={!canPersist}
					>
						Save Changes
					</button>
					{pending && <span className="text-sm text-fg-muted">Saving…</span>}
				</div>
			</form>
			{message && <p className="mt-6 text-sm text-fg-muted">{message}</p>}
		</section>
	);
}

interface AddSettingProps
{
	onAdd: (key: string, value: string, sensitive?: boolean) => void;
}

function AddSetting({ onAdd }: AddSettingProps)
{
	const [key, setKey] = useState('');
	const [value, setValue] = useState('');
	const [sensitive, setSensitive] = useState(false);

	const disabled = !key || key.includes(' ') || key.includes('.') || /[^A-Z0-9_]/i.test(key);

	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-end">
			<label className="flex-1">
				<span className="text-xs uppercase tracking-wider text-fg-subtle">Variable Name</span>
				<input
					className="mt-1 w-full rounded-2xl border border-subtle bg-white/5 px-4 py-3 text-fg focus:border-accent focus:outline-none"
					placeholder="e.g. JWT_SECRET"
					value={key}
					onChange={(event) => setKey(event.target.value)}
				/>
			</label>
			<label className="flex-1">
				<span className="text-xs uppercase tracking-wider text-fg-subtle">Value</span>
				<div className="mt-1 relative">
					<input
						className="w-full rounded-2xl border border-subtle bg-white/5 pr-16 pl-4 py-3 text-fg focus:border-accent focus:outline-none"
						placeholder="e.g. midnight"
						value={value}
						type={sensitive ? 'password' : 'text'}
						onChange={(event) => setValue(event.target.value)}
					/>
					<button
						type="button"
						onClick={() => setSensitive(!sensitive)}
						className={`absolute top-1/2 -translate-y-1/2 right-2 rounded-xl px-3 py-1 text-xs border border-subtle bg-white/5 hover:bg-white/10 transition-colors ${sensitive ? 'text-accent' : 'text-fg-muted'}`}
						title={sensitive ? 'Sensitive (click to show as plain text)' : 'Plain (click to mask when saved)'}
						aria-pressed={sensitive}
					>
						{sensitive ? 'Sensitive' : 'Plain'}
					</button>
				</div>
			</label>
			<button
				type="button"
				className="rounded-full bg-white/10 px-5 py-3 text-fg hover:bg-white/20 disabled:opacity-40"
				disabled={disabled}
				onClick={() =>
				{
					if (disabled) return;
					onAdd(key, value, sensitive);
					setKey('');
					setValue('');
					setSensitive(false);
				}}
			>
				Add
			</button>
		</div>
	);
}
