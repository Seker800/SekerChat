import { CreateMessageDto } from './dto/create-message.dto';

export class SendMessageUseCase {
  constructor(
    private readonly createMessage: (
      userId: string,
      groupId: string,
      dto: CreateMessageDto,
    ) => ReturnType<{
      createMessage(userId: string, groupId: string, dto: CreateMessageDto): unknown;
    }['createMessage']>,
  ) {}

  execute(userId: string, groupId: string, dto: CreateMessageDto) {
    return this.createMessage(userId, groupId, dto);
  }
}
