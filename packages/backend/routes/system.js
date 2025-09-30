const express = require('express');

function createSystemRouter({ envConfig, getPort })
{
	const router = express.Router();

	router.get('/health', (req, res) =>
	{
		res.json({ status: 'ok', port: getPort?.() ?? null, timestamp: Date.now() });
	});

	router.get('/env', (req, res) =>
	{
		res.json({ env: envConfig });
	});

	return router;
}

module.exports = {
	createSystemRouter
};
