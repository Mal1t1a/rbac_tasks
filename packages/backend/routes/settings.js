const express = require('express');
const fs = require('fs');
const path = require('path');

function createSettingsRouter({ envPath, auditLogger })
{
	const router = express.Router();

	// Owner/Admin only
	router.use((req, res, next) =>
	{
		const role = req.auth?.user?.role;
		if (role !== 'owner' && role !== 'admin')
		{
			res.status(403).json({ error: 'Forbidden' });
			return;
		}
		next();
	});

	router.get('/', async (req, res, next) =>
	{
		try
		{
			const file = ensureEnvFile(envPath);
			const text = fs.readFileSync(file, 'utf8');
			const settings = parseDotEnv(text);
			// Load system keys from .env.example residing alongside envPath
			const examplePath = path.join(path.dirname(file), '.env.example');
			let systemKeys = [];
			try
			{
				if (fs.existsSync(examplePath))
				{
					const exampleText = fs.readFileSync(examplePath, 'utf8');
					const exampleSettings = parseDotEnv(exampleText);
					systemKeys = Object.keys(exampleSettings);
				}
			} catch (_)
			{
				systemKeys = [];
			}
			// Ensure all system keys appear in the returned settings (non-removable) with empty string if missing
			const mergedForView = { ...Object.fromEntries(systemKeys.map(k => [k, settings[k] != null ? settings[k] : ''])), ...settings };
			res.json({ settings: mergedForView, systemKeys, filePath: file });
		} catch (err)
		{
			next(err);
		}
	});

	router.put('/', async (req, res, next) =>
	{
		try
		{
			const file = ensureEnvFile(envPath);
			const incoming = req.body?.settings || {};
			const replace = Boolean(req.body?.replace);
			if (typeof incoming !== 'object')
			{
				res.status(400).json({ error: 'Invalid settings payload' });
				return;
			}
			const normalized = {};
			for (const [k, v] of Object.entries(incoming))
			{
				if (!isValidKey(k)) continue;
				normalized[String(k).trim()] = v == null ? '' : String(v);
			}

			const before = fs.existsSync(file) ? parseDotEnv(fs.readFileSync(file, 'utf8')) : {};

			// Load system keys
			const examplePath = path.join(path.dirname(file), '.env.example');
			let systemKeys = [];
			try
			{
				if (fs.existsSync(examplePath))
				{
					const exampleText = fs.readFileSync(examplePath, 'utf8');
					const exampleSettings = parseDotEnv(exampleText);
					systemKeys = Object.keys(exampleSettings);
				}
			} catch (_)
			{
				systemKeys = [];
			}

			// Base merge logic (replace vs additive)
			let merged = replace ? { ...normalized } : { ...before, ...normalized };

			// Ensure system keys cannot be deleted: if a system key existed before (or is defined in example) but is missing, re-add (empty if never had value)
			for (const k of systemKeys)
			{
				if (!(k in merged))
				{
					// If it existed before keep its old value, else set empty string
					merged[k] = before[k] != null ? before[k] : '';
				}
			}

			const content = serializeDotEnv(merged);
			fs.writeFileSync(file, content, 'utf8');

			const actor = req.auth?.user;
			await auditLogger({
				action: 'settings.updated',
				entity: 'settings',
				entityId: path.basename(file),
				actorId: actor?.id || null,
				organizationId: actor?.organization_id || null,
				before: maskSensitive(before),
				after: maskSensitive(merged)
			}).catch(() => null);

			// Also include systemKeys to keep UI in sync post-save
			res.json({ settings: merged, systemKeys, filePath: file });
		} catch (err)
		{
			next(err);
		}
	});

	return router;
}

function ensureEnvFile(p)
{
	const file = p || path.join(process.cwd(), '.env');
	if (!fs.existsSync(file))
	{
		fs.writeFileSync(file, '', 'utf8');
	}
	return file;
}

function parseDotEnv(text)
{
	const out = {};
	const lines = String(text || '').split(/\r?\n/);
	for (const line of lines)
	{
		if (!line || /^\s*#/.test(line)) continue;
		const idx = line.indexOf('=');
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		let value = line.slice(idx + 1);
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\'')))
		{
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

function serializeDotEnv(obj)
{
	const keys = Object.keys(obj).sort();
	return keys.map((k) => `${k}=${escapeValue(obj[k])}`).join('\n') + '\n';
}

function escapeValue(v)
{
	if (v == null) return '';
	if (/\s/.test(String(v))) return JSON.stringify(String(v));
	return String(v);
}

function isSensitiveKey(key)
{
	const k = String(key).toUpperCase();
	return /(SECRET|PASSWORD|TOKEN|API_KEY|API-KEY|AUTH|JWT|CLIENT_SECRET|ACCESS_KEY|PRIVATE_KEY)/.test(k);
}

function maskSensitive(obj)
{
	const out = {};
	for (const [k, v] of Object.entries(obj || {}))
	{
		out[k] = isSensitiveKey(k) && v ? '****' : v;
	}
	return out;
}

function isValidKey(key)
{
	return /^[A-Z0-9_\.\-]+$/i.test(String(key));
}

module.exports = { createSettingsRouter };
