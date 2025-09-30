 
const path = require('path');
const { createBackendServer } = require('..');

async function wait(ms)
{
	return new Promise((r) => setTimeout(r, ms));
}

async function main()
{
	process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
	const cwd = path.resolve(__dirname, '..', '..', '..');
	const backend = createBackendServer({ cwd, dataDir: path.join(cwd, 'data'), port: 0, envPath: path.join(cwd, '.env') });

	let port = backend.getPort();
	for (let i = 0; i < 50 && !port; i++)
	{
		await wait(100);
		port = backend.getPort();
	}
	if (!port) throw new Error('Backend did not start');
	const base = `http://localhost:${port}`;

	console.log('Health:', await (await fetch(`${base}/system/health`)).json());

	// Login as owner
	const loginRes = await fetch(`${base}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: 'owner@acme.test', password: 'Owner123!' })
	});
	if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`);
	const login = await loginRes.json();
	console.log('Login user:', login.user);
	const token = login.token;

	// List tasks
	const list1 = await fetch(`${base}/api/tasks`, { headers: { Authorization: `Bearer ${token}` } });
	const tasksA = await list1.json();
	console.log('Tasks count:', tasksA.tasks.length);

	// Create task
	const createRes = await fetch(`${base}/api/tasks`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ title: 'Smoke Task', category: 'Work' })
	});
	if (!createRes.ok) throw new Error(`Create failed: ${await createRes.text()}`);
	const created = await createRes.json();
	console.log('Created task id:', created.task.id);

	// Update task
	const updateRes = await fetch(`${base}/api/tasks/${created.task.id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({ status: 'in_progress' })
	});
	if (!updateRes.ok) throw new Error(`Update failed: ${await updateRes.text()}`);
	const updated = await updateRes.json();
	console.log('Updated status:', updated.task.status);

	// Delete task
	const deleteRes = await fetch(`${base}/api/tasks/${created.task.id}`, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!deleteRes.ok && deleteRes.status !== 204) throw new Error(`Delete failed: ${await deleteRes.text()}`);
	console.log('Deleted.');

	// Audit log
	const auditRes = await fetch(`${base}/api/audit-log`, { headers: { Authorization: `Bearer ${token}` } });
	if (!auditRes.ok) throw new Error(`Audit failed: ${await auditRes.text()}`);
	const audit = await auditRes.json();
	console.log('Audit events:', audit.events.length);

	await backend.stop();
}

main().catch((err) =>
{
	console.error(err);
	process.exit(1);
});
