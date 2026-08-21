import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMessageDto, CreateMessageType } from './dto/create-message.dto';

test('CreateMessageDto accepts a UUID clientMessageId', async () => {
  const dto = plainToInstance(CreateMessageDto, {
    type: CreateMessageType.TEXT,
    text: 'hello',
    clientMessageId: '018f1170-6a20-7ad5-88c4-54f14c895e31',
  });

  assert.equal((await validate(dto)).length, 0);
});

test('CreateMessageDto rejects a non-UUID clientMessageId', async () => {
  const dto = plainToInstance(CreateMessageDto, {
    type: CreateMessageType.TEXT,
    text: 'hello',
    clientMessageId: 'retry-me',
  });

  const errors = await validate(dto);
  assert.equal(errors.some((error) => error.property === 'clientMessageId'), true);
});
