import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPresenceLogsQueryDto } from './presence-log-query.dto';

for (const input of [{ offset: 'abc' }, { offset: '-1' }, { limit: '0' }, { limit: '201' }, { offset: '1.5' }]) {
  test(`invalid presence pagination is rejected: ${JSON.stringify(input)}`, async () => {
    assert((await validate(plainToInstance(ListPresenceLogsQueryDto, input))).length > 0);
  });
}
test('presence pagination accepts bounded integers', async () => {
  const query = plainToInstance(ListPresenceLogsQueryDto, { limit: '50', offset: '100' });
  assert.equal((await validate(query)).length, 0);
  assert.equal(query.offset, 100);
});
