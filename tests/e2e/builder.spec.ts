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
  await page.goto('/builder-e2e.html?minimap'); await page.getByRole('button', { name: 'Kumo AI' }).click();
  await expect(page.getByRole('img', { name: 'Board minimap' })).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'AI chat' });
  await expect(panel.getByLabel('Reasoning effort').locator('option')).toHaveText(['Low', 'Medium', 'High', 'Very high', 'Maximum']);
  await panel.getByLabel('Reasoning effort').selectOption('medium');
  await panel.getByLabel('Message AI').fill('Build a green card below the existing objects.');
  await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Completed');
  expect(started).toEqual(['create', 'patch']);
  await page.getByRole('button', { name: 'Close AI' }).click();
  await expect(page.getByRole('button', { name: 'Built by Astra', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ochre card', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kumo AI' }).click();
  await expect(panel.getByLabel('Reasoning effort')).toHaveValue('medium');
  await page.screenshot({ path: testInfo.outputPath('astra-builder.png') });
});

test('hosted Astra remains unavailable without configuration', async ({ page }) => {
  await page.route('**/api/builder', route => route.fulfill({ json: { enabled: false, remainingMicros: 1000000 } }));
  await page.goto('/builder-e2e.html'); await page.getByRole('button', { name: 'Kumo AI' }).click();
  const panel = page.getByRole('complementary', { name: 'AI chat' });
  await expect(panel.getByText(/AI is currently unavailable/)).toBeVisible();
  await panel.getByLabel('Message AI').fill('Build a card');
  await expect(panel.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
});

test('Kumo AI formats streamed conversation and carries follow-ups across closing the sidebar', async ({ page }) => {
  let messages = 0;
  let currentId = '';
  const histories: unknown[] = [];
  const reply = (text: string) => `data: ${JSON.stringify({ type: 'text_delta', delta: text })}\n\ndata: ${JSON.stringify({ type: 'run', run: { id: currentId, board_id: 'e2e-board', state: 'completed', effort: 'low', steps: 1, spent_micros: 1, pending: [], message: text } })}\n\n`;
  await page.route('**/api/builder', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true, remainingMicros: 0, unmetered: true } });
    const body = route.request().postDataJSON();
    if (body.action === 'create') {
      messages++; currentId = body.runId; histories.push(body.conversation);
      return route.fulfill({ json: { run: { id: currentId, board_id: 'e2e-board', state: 'preparing', effort: 'low', steps: 0, spent_micros: 0, pending: [], message: '' } } });
    }
    return route.fulfill({ contentType: 'text/event-stream', body: reply(messages === 1 ? '### Your board\n\n- **Two** editable cards\n- Use `Selection` to refine one.' : 'Yes, I remember the two cards.') });
  });
  await page.goto('/builder-e2e.html'); await page.getByRole('button', { name: 'Kumo AI', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'AI chat' });
  await panel.getByLabel('Message AI').fill('Summarize this board.');
  await panel.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Completed');
  await expect(panel.getByRole('heading', { name: 'Your board' })).toBeVisible();
  await expect(panel.locator('strong').filter({ hasText: /^Two$/ })).toBeVisible();
  await expect(panel.locator('code')).toHaveText('Selection');
  await panel.getByRole('button', { name: 'Close AI', exact: true }).click();
  await page.getByRole('button', { name: 'Kumo AI', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Your board' })).toBeVisible();
  await panel.getByLabel('Message AI').fill('Do you remember them?');
  await panel.getByLabel('Message AI').press('Enter');
  await expect(panel.getByText('Yes, I remember the two cards.', { exact: true })).toBeVisible();
  expect(histories[0]).toEqual([]);
  expect(histories[1]).toEqual([{ role: 'user', content: 'Summarize this board.' }, { role: 'assistant', content: '### Your board\n\n- **Two** editable cards\n- Use `Selection` to refine one.' }]);
});
