export class GroupMessageActivityDayResponseDto {
  date!: string;
  count!: number;
}

export class GroupMessageActivityResponseDto {
  days!: GroupMessageActivityDayResponseDto[];
}
