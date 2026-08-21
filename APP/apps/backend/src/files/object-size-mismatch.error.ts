export class ObjectSizeMismatchError extends Error {
  constructor(
    readonly expectedSize: number,
    readonly actualSize: number | null,
  ) {
    super(
      actualSize === null
        ? `Object size is unavailable; expected ${expectedSize} bytes.`
        : `Object size mismatch: expected ${expectedSize} bytes, got ${actualSize} bytes.`,
    );
    this.name = ObjectSizeMismatchError.name;
  }
}
