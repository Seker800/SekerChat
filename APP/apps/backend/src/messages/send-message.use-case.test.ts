import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CreateMessageType } from './dto/create-message.dto';
import { SendMessageUseCase } from './send-message.use-case';

test('SendMessageUseCase delegates message creation to MessagesService', async () => {
  const calls: Array<{ userId: string; groupId: string; dto: unknown }> = [];
  const expectedResult = { id: 'message-1' };
  const createMessage = async (userId: string, groupId: string, dto: unknown) => {
    calls.push({ userId, groupId, dto });
    return expectedResult;
  };
  const useCase = new SendMessageUseCase(createMessage);
  const dto = { type: CreateMessageType.TEXT, text: 'hello' };

  const result = await useCase.execute('user-1', 'group-1', dto);

  assert.equal(result, expectedResult);
  assert.deepEqual(calls, [{ userId: 'user-1', groupId: 'group-1', dto }]);
});
