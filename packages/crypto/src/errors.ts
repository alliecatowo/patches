/** Base class for deliberately coarse E2EE protocol failures. */
export class E2eeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class MalformedInputError extends E2eeProtocolError {}
export class AuthenticationError extends E2eeProtocolError {
  constructor() {
    super('Cryptographic authentication failed.');
  }
}
export class CertificateError extends E2eeProtocolError {}
export class PreKeyError extends E2eeProtocolError {}
export class RatchetStateError extends E2eeProtocolError {}
export class TooManySkippedMessagesError extends E2eeProtocolError {}
export class ReplayedMessageError extends E2eeProtocolError {}
export class FrankingError extends E2eeProtocolError {}
