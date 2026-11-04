// Basisklasse für erwartete, fachliche Fehler. `userMessage` ist sicher genug,
// um direkt an den Client ausgegeben zu werden - anders als `message`/`cause`,
// die auch technische Details enthalten dürfen und nur serverseitig geloggt werden.
export class AppError extends Error {
  public readonly userMessage: string;

  constructor(userMessage: string, options?: { cause?: unknown }) {
    super(userMessage, options);
    this.userMessage = userMessage;
    this.name = this.constructor.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(userMessage = "Bitte melde dich an, um fortzufahren.") {
    super(userMessage);
  }
}

export class ForbiddenError extends AppError {
  constructor(userMessage = "Dir fehlt die Berechtigung für diese Aktion.") {
    super(userMessage);
  }
}

export class NotFoundError extends AppError {
  constructor(userMessage = "Der angeforderte Datensatz wurde nicht gefunden.") {
    super(userMessage);
  }
}

export class ValidationError extends AppError {
  constructor(userMessage = "Die eingegebenen Daten sind ungültig.") {
    super(userMessage);
  }
}
