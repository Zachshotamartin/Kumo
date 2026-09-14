import { expect, test } from '@playwright/test';

test('Astra builds through typed actions, preserves order and exposes all effort levels', async ({ page }, testInfo) => {
  let runId = '';
  const run = (patch: Record<string, unknown> = {}) => ({ id: runId, board_id: 'e2e-board', state: 'preparing', effort: 'low', steps: 0, spent_micros: 0, pending: [], message: '', ...patch });
  const created = { id: 'astra-card', type: 'rectangle', name: 'Astra card', x1: 220, y1: 320, x2: 440, y2: 440, width: 220, height: 120, zIndex: 3, level: 0, backgroundColor: '#8dc7a5' };
  const operations = [
    { id: 'create', capability: 'canvas.create', args: [[created]], summary: 'Create the card' },
    { id: 'patch', capability: 'canvas.patch', args: [[{ id: 'astra-card', expected: { name: 'Astra card' }, patch: { name: 'Built by Astra' } }]], summary: 'Name the card' },
  ];
  const started: string[] = [];
  await page.route('**/api/builder', async route => {
    const request = route.request();
    if (request.method() === 'GET') { await route.fulfill({ json: { enabled: true, remainingMicros: 1000000 } }); return; }
    const body = request.postDataJSON(); runId = body.runId;
    if (body.action === 'create') { await route.fulfill({ json: { run: run() } }); return; }
    if (body.action === 'step') { await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ type: 'progress', message: 'Building the card' })}\n\ndata: ${JSON.stringify({ type: 'run', run: run({ state: 'awaiting_apply', pending: operations }) })}\n\n` }); return; }
    if (body.action === 'start') { started.push(body.operationId); await route.fulfill({ json: { run: run({ state: 'awaiting_apply' }), operation: { status: 'started' } } }); return; }
    await route.fulfill({ json: { run: run({ state: body.operationId === 'patch' ? 'completed' : 'awaiting_apply', spent_micros: 20000 }) } });
  });
  await page.goto('/builder-e2e.html'); await page.getByRole('button', { name: 'Build with Astra' }).click();
  const panel = page.getByRole('complementary', { name: 'Astra builder' });
  await expect(panel.getByLabel('Reasoning effort').locator('option')).toHaveText(['low', 'medium', 'high', 'xhigh', 'max']);
  await panel.getByLabel('Reasoning effort').selectOption('medium');
  await panel.getByLabel('What should Astra do?').fill('Build a green card below the existing objects.');
  await panel.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Completed');
  expect(started).toEqual(['create', 'patch']);
  await page.getByRole('button', { name: 'Minimize Astra' }).click();
  await expect(page.getByRole('button', { name: 'Built by Astra', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ochre card', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Build with Astra' }).click();
  await expect(panel.getByLabel('Reasoning effort')).toHaveValue('medium');
  await page.screenshot({ path: testInfo.outputPath('astra-builder.png') });
});

test('hosted Astra remains unavailable without configuration', async ({ page }) => {
  await page.route('**/api/builder', route => route.fulfill({ json: { enabled: false, remainingMicros: 1000000 } }));
  await page.goto('/builder-e2e.html'); await page.getByRole('button', { name: 'Build with Astra' }).click();
  const panel = page.getByRole('complementary', { name: 'Astra builder' });
  await expect(panel.getByText(/Hosted Astra is not enabled/)).toBeVisible();
  await panel.getByLabel('What should Astra do?').fill('Build a card');
  await expect(panel.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
});
